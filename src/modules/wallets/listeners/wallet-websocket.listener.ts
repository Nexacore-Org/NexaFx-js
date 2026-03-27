import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsGateway } from '../../../web-sockets/notifications.gateway';

export const WALLET_BALANCE_UPDATED = 'wallet.balance_updated';

export interface WalletBalanceUpdatedPayload {
  walletId: string;
  userId: string;
  newBalance: number;
  previousBalance: number;
  currency: string;
  timestamp: Date;
}

/**
 * Broadcasts wallet balance update events to the wallet:{id} WebSocket room.
 * Events are debounced (100ms) at the gateway level to prevent flooding.
 */
@Injectable()
export class WalletWebsocketListener {
  private readonly logger = new Logger(WalletWebsocketListener.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  @OnEvent(WALLET_BALANCE_UPDATED)
  onBalanceUpdated(payload: WalletBalanceUpdatedPayload): void {
    this.gateway.emitToWalletRoom(payload.walletId, WALLET_BALANCE_UPDATED, {
      walletId: payload.walletId,
      newBalance: payload.newBalance,
      previousBalance: payload.previousBalance,
      currency: payload.currency,
      timestamp: payload.timestamp,
    });
    this.logger.debug(`WS broadcast: wallet.balance_updated for wallet ${payload.walletId}`);
  }
}
