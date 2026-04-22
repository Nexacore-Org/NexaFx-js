import type { NexaFxClient } from '../client';

export interface WalletBalance {
  walletId: string;
  currency: string;
  balance: number;
  availableBalance: number;
  updatedAt: string;
}

export interface WalletListResponse {
  wallets: WalletBalance[];
  total: number;
}

export interface StatementQuery {
  from: string;
  to: string;
}

export interface StatementResponse {
  walletId: string;
  currency: string;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  transactions: unknown[];
  checksum: string;
}

export class WalletsResource {
  constructor(private readonly client: NexaFxClient) {}

  async list(): Promise<WalletListResponse> {
    return this.client.request<WalletListResponse>('GET', '/v1/wallets');
  }

  async getBalance(walletId: string): Promise<WalletBalance> {
    return this.client.request<WalletBalance>(
      'GET',
      `/v1/wallets/${encodeURIComponent(walletId)}/balance`,
    );
  }

  async getStatement(walletId: string, query: StatementQuery): Promise<StatementResponse> {
    return this.client.request<StatementResponse>(
      'GET',
      `/v1/wallets/${encodeURIComponent(walletId)}/statement`,
      { query: query as Record<string, unknown> },
    );
  }
}
