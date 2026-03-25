export const MARKET_WS_NAMESPACE = '/market';
export const DEFAULT_PRICE_FEED_INTERVAL_MS = 1000;
export const DEFAULT_MIN_INTERVAL_MS = 250;
export const DEFAULT_ORDER_BOOK_DEPTH = 5;
export const POSITION_CHANGE_THRESHOLD = 0.01;

export const MARKET_EVENTS = {
  PRICE_UPDATE: 'market.price_update',
  POSITION_UPDATE: 'market.position_update',
  SUBSCRIBED: 'market.subscribed',
  UNSUBSCRIBED: 'market.unsubscribed',
} as const;

export const POSITION_SIGNIFICANT_CHANGE_EVENT = 'risk.position.significant_change';
