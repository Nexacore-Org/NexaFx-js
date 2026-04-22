export { NexaFxClient, type NexaFxClientOptions, type TokenState, type TokenStore } from './client';
export {
  NexaFxAuthError,
  NexaFxError,
  NexaFxRateLimitError,
  NexaFxValidationError,
} from './errors';
export { NexaFxWebSocketClient, type WebSocketFactory, type WebSocketLike } from './websocket';
export { WalletsResource, type WalletBalance, type WalletListResponse, type StatementResponse } from './resources/wallets';
export { FxResource, type FxQuoteRequest, type FxQuoteResponse } from './resources/fx';
export * from './types';
