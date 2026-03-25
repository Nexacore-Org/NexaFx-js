import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import { WsAuthenticatedSocket, WsJwtGuard } from '../ws-jwt.guard';
import {
  DEFAULT_MIN_INTERVAL_MS,
  MARKET_EVENTS,
  MARKET_WS_NAMESPACE,
  POSITION_SIGNIFICANT_CHANGE_EVENT,
} from '../market-feed.constants';
import { SubscribePositionFeedDto } from '../dto/market-feed.dto';

export interface SignificantPositionChangePayload {
  userId: string;
  totalExposure: number;
  previousTotalExposure: number;
  changeRatio: number;
  positions: Array<{
    id: string;
    symbol: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    leverage: number;
    side: 'BUY' | 'SELL';
    assetType: 'FOREX' | 'CRYPTO' | 'STOCK';
  }>;
  timestamp: string;
}

@WebSocketGateway({
  namespace: MARKET_WS_NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PositionFeedGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PositionFeedGateway.name);
  private readonly subscriptions = new Map<string, { userId: string; minIntervalMs: number; lastSentAt?: number }>();

  handleConnection(client: WsAuthenticatedSocket): void {
    this.logger.debug(`Position feed client connected ${client.id}`);
  }

  handleDisconnect(client: WsAuthenticatedSocket): void {
    this.subscriptions.delete(client.id);
    this.logger.debug(`Position feed client disconnected ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe_positions')
  async subscribe(
    @ConnectedSocket() client: WsAuthenticatedSocket,
    @MessageBody() dto: SubscribePositionFeedDto,
  ) {
    this.subscriptions.set(client.id, {
      userId: client.user.sub,
      minIntervalMs: dto.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    });

    return {
      success: true,
      event: MARKET_EVENTS.SUBSCRIBED,
      channel: 'positions',
      minIntervalMs: dto.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe_positions')
  async unsubscribe(@ConnectedSocket() client: WsAuthenticatedSocket) {
    this.subscriptions.delete(client.id);
    return {
      success: true,
      event: MARKET_EVENTS.UNSUBSCRIBED,
      channel: 'positions',
    };
  }

  @OnEvent(POSITION_SIGNIFICANT_CHANGE_EVENT)
  handleSignificantPositionChange(payload: SignificantPositionChangePayload): void {
    const now = Date.now();

    for (const [socketId, subscription] of this.subscriptions.entries()) {
      if (subscription.userId !== payload.userId) {
        continue;
      }

      if (subscription.lastSentAt && now - subscription.lastSentAt < subscription.minIntervalMs) {
        continue;
      }

      this.server.to(socketId).emit(MARKET_EVENTS.POSITION_UPDATE, payload);
      subscription.lastSentAt = now;
      this.subscriptions.set(socketId, subscription);
    }
  }

  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  resetSubscriptions(): void {
    this.subscriptions.clear();
  }
}
