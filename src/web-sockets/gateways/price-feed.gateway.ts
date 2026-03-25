import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_PRICE_FEED_INTERVAL_MS,
  MARKET_EVENTS,
  MARKET_WS_NAMESPACE,
} from '../market-feed.constants';
import {
  SubscribePriceFeedDto,
  UnsubscribePriceFeedDto,
} from '../dto/market-feed.dto';
import { MarketDataService } from '../services/market-data.service';

@WebSocketGateway({
  namespace: MARKET_WS_NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PriceFeedGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PriceFeedGateway.name);

  constructor(private readonly marketDataService: MarketDataService) {}

  handleConnection(client: Socket): void {
    this.logger.debug(`Price feed client connected ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.marketDataService.removeAllSocketSubscriptions(client.id);
    this.logger.debug(`Price feed client disconnected ${client.id}`);
  }

  @SubscribeMessage('subscribe_prices')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SubscribePriceFeedDto,
  ) {
    const subscriptions = dto.pairs.map((pair) =>
      this.marketDataService.upsertPriceSubscription({
        socketId: client.id,
        pair,
        intervalMs: dto.intervalMs ?? DEFAULT_PRICE_FEED_INTERVAL_MS,
        minIntervalMs: dto.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      }),
    );

    return {
      success: true,
      event: MARKET_EVENTS.SUBSCRIBED,
      subscriptions: subscriptions.map((subscription) => ({
        pair: subscription.pair,
        intervalMs: subscription.intervalMs,
        minIntervalMs: subscription.minIntervalMs,
      })),
    };
  }

  @SubscribeMessage('unsubscribe_prices')
  async unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: UnsubscribePriceFeedDto,
  ) {
    this.marketDataService.removePriceSubscriptions(client.id, dto.pairs);

    return {
      success: true,
      event: MARKET_EVENTS.UNSUBSCRIBED,
      pairs: dto.pairs.map((pair) => pair.toUpperCase()),
    };
  }

  async broadcastDuePrices(): Promise<void> {
    const pairs = this.marketDataService.getSubscribedPairs();
    const now = Date.now();

    for (const pair of pairs) {
      const subscribers = this.marketDataService
        .getSubscribersForPair(pair)
        .filter((subscription) => this.marketDataService.shouldSend(subscription, now));

      if (subscribers.length === 0) {
        continue;
      }

      const message = await this.marketDataService.buildPriceMessage(pair);

      for (const subscription of subscribers) {
        this.server.to(subscription.socketId).emit(MARKET_EVENTS.PRICE_UPDATE, message);
        this.marketDataService.markPriceSent(subscription.socketId, pair, now);
      }
    }
  }

  getActiveSubscriptionCount(): number {
    return this.marketDataService.getSubscriptionCount();
  }
}
