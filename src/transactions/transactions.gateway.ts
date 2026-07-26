import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

interface TransactionStatusEvent {
  transactionId: string;
  userId?: string;
  senderId?: string;
  receiverId?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  reversalTransactionId?: string;
  reversedBy?: string;
  reason?: string;
}

@WebSocketGateway({ namespace: '/transactions', cors: true })
@Injectable()
export class TransactionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TransactionsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Transaction client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Transaction client disconnected: ${client.id}`);
  }

  @OnEvent('transactions.completed')
  handleTransactionCompleted(payload: TransactionStatusEvent): void {
    this.server?.emit('transaction.status', { ...payload, status: 'completed' });
  }

  @OnEvent('transactions.deposit.completed')
  handleDepositCompleted(payload: TransactionStatusEvent): void {
    this.server?.emit('transaction.status', { ...payload, status: 'completed' });
  }

  @OnEvent('transactions.withdrawal.completed')
  handleWithdrawalCompleted(payload: TransactionStatusEvent): void {
    this.server?.emit('transaction.status', { ...payload, status: 'completed' });
  }

  @OnEvent('transactions.swap.completed')
  handleSwapCompleted(payload: TransactionStatusEvent): void {
    this.server?.emit('transaction.status', { ...payload, status: 'completed' });
  }

  @OnEvent('transactions.swap.failed')
  handleSwapFailed(payload: TransactionStatusEvent): void {
    this.server?.emit('transaction.status', { ...payload, status: 'failed' });
  }

  @OnEvent('transactions.reversed')
  handleTransactionReversed(payload: TransactionStatusEvent): void {
    this.server?.emit('transaction.status', { ...payload, status: 'reversed' });
  }

  broadcastTransactionStatus(payload: TransactionStatusEvent & { status: string }): void {
    this.server?.emit('transaction.status', payload);
  }
}
