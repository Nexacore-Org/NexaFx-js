import { Injectable } from '@nestjs/common';
import { DEFAULT_ORDER_BOOK_DEPTH } from '../../../web-sockets/market-feed.constants';

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookDepth {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

@Injectable()
export class OrderBookService {
  generateDepth(pair: string, midPrice: number, depth = DEFAULT_ORDER_BOOK_DEPTH): OrderBookDepth {
    const [base] = pair.split('/');
    const precision = midPrice >= 100 ? 4 : 6;
    const tickSize = midPrice * 0.0005;

    const bids = Array.from({ length: depth }, (_, index) => ({
      price: this.round(midPrice - tickSize * (index + 1), precision),
      size: this.round((depth - index) * 10000 * this.symbolLiquidityFactor(base), 2),
    }));

    const asks = Array.from({ length: depth }, (_, index) => ({
      price: this.round(midPrice + tickSize * (index + 1), precision),
      size: this.round((depth - index) * 9600 * this.symbolLiquidityFactor(base), 2),
    }));

    return { bids, asks };
  }

  private symbolLiquidityFactor(symbol: string): number {
    const liquidSymbols = ['EUR', 'USD', 'GBP', 'JPY'];
    return liquidSymbols.includes(symbol.toUpperCase()) ? 1 : 0.72;
  }

  private round(value: number, decimals: number): number {
    return Number.parseFloat(value.toFixed(decimals));
  }
}
