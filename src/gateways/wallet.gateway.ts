import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface BalanceUpdatedPayload {
  accountId: string;
  currency: string;
  newBalance: number;
  transactionId: string;
}

/**
 * WebSocket gateway that pushes real-time balance updates to connected clients.
 * Clients authenticate by passing userId in handshake.auth and are joined to
 * a private room `user:<userId>`.
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/wallet' })
export class WalletGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WalletGateway.name);

  handleConnection(client: Socket): void {
    const userId = client.handshake.auth?.userId as string | undefined;
    if (userId) {
      client.join(`user:${userId}`);
      this.logger.debug(`Client ${client.id} joined room user:${userId}`);
    }
  }

  /**
   * Emits a balance_updated event to the given user's private WebSocket room.
   * Call this after any transaction that affects a user's wallet balance.
   */
  emitBalanceUpdate(userId: string, payload: BalanceUpdatedPayload): void {
    this.server.to(`user:${userId}`).emit('balance_updated', payload);
    this.logger.debug(`Emitted balance_updated to user:${userId}`);
  }
}
