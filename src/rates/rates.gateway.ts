import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface BufferedEvent {
  timestamp: number;
  currencyPair: string;
  rate: number;
}

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000;

@WebSocketGateway({ namespace: '/rates', cors: true })
@Injectable()
export class RatesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RatesGateway.name);
  private eventBuffer: BufferedEvent[] = [];
  private currentRates: Map<string, number> = new Map();
  private readonly maxBufferSize = 1000;

  constructor(private readonly config: ConfigService) {}

  handleConnection(client: Socket): void {
    const clientId = client.id;
    this.logger.log(`Client connected: ${clientId}`);

    const currentRates = Array.from(this.currentRates.entries()).map(([currencyPair, rate]) => ({
      currencyPair, rate, timestamp: Date.now(),
    }));
    client.emit('rates.current', currentRates);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('requestReplay')
  handleReplay(client: Socket, lastReceivedAt: number): void {
    const replayWindowMs = this.config.get<number>('RATE_REPLAY_WINDOW_MS') ?? DEFAULT_REPLAY_WINDOW_MS;
    const since = Math.max(Date.now() - replayWindowMs, lastReceivedAt || 0);

    const missed = this.eventBuffer.filter(e => e.timestamp > since);
    if (missed.length > 0) {
      client.emit('rates.replay', missed);
    }
  }

  broadcastRateUpdate(currencyPair: string, rate: number): void {
    const event: BufferedEvent = { currencyPair, rate, timestamp: Date.now() };

    this.currentRates.set(currencyPair, rate);
    this.eventBuffer.push(event);

    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }

    this.server?.emit('rates.updated', event);
  }
}
