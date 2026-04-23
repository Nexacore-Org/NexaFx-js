/**
 * Central registry for all application error codes
 */
export const ErrorCodes = {
  // Auth Errors
  /** Missing authentication token */
  AUTH_001: 'AUTH_001',

  /** Expired token */
  AUTH_002: 'AUTH_002',

  /** Invalid token */
  AUTH_003: 'AUTH_003',

  // Transaction Errors
  /** Transaction failed */
  TX_001: 'TX_001',

  // Wallet Errors
  /** Insufficient balance */
  WALLET_001: 'WALLET_001',

  // FX Errors
  /** FX rate unavailable */
  FX_001: 'FX_001',

  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
