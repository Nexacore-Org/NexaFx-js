export class PositionDto {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  side: 'BUY' | 'SELL';
  assetType: 'FOREX' | 'CRYPTO' | 'STOCK';
}

export class TradeRequestDto {
  symbol: string;
  quantity: number;
  price: number;
  side: 'BUY' | 'SELL';
  leverage: number;
  assetType: 'FOREX' | 'CRYPTO' | 'STOCK';
  userId: string;
}

export class RiskCheckResult {
  isAllowed: boolean;
  reason?: string;
  currentMetrics?: {
    leverage: number;
    marginUtilization: number;
    projectedDrawdown: number;
  };
}
