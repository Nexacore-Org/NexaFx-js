import type { NexaFxClient } from '../client';
import type { ExchangeRateResponseDto } from '../types';

export interface FxQuoteRequest {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
}

export interface FxQuoteResponse {
  quoteId: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  convertedAmount: number;
  rate: number;
  fee: number;
  expiresAt: string;
}

export class FxResource {
  constructor(private readonly client: NexaFxClient) {}

  async getQuote(params: FxQuoteRequest): Promise<FxQuoteResponse> {
    return this.client.request<FxQuoteResponse>('POST', '/v1/fx/quote', {
      body: params,
    });
  }

  async getRates(baseCurrency?: string): Promise<ExchangeRateResponseDto[]> {
    return this.client.request<ExchangeRateResponseDto[]>('GET', '/v1/fx/rates', {
      query: baseCurrency ? { base: baseCurrency } : undefined,
    });
  }
}
