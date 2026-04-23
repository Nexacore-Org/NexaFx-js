import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from './error-codes';

export class DomainException extends HttpException {
  constructor(code: string, message: string, status: HttpStatus, details?: any) {
    super({ code, message, details }, status);
  }
}

// Auth exceptions
export class NoTokenException extends DomainException {
  constructor() {
    super(ErrorCodes.AUTH_001, 'No authentication token provided', HttpStatus.UNAUTHORIZED);
  }
}

export class ExpiredTokenException extends DomainException {
  constructor() {
    super(ErrorCodes.AUTH_002, 'Authentication token has expired', HttpStatus.UNAUTHORIZED);
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super(ErrorCodes.AUTH_003, 'Authentication token is invalid', HttpStatus.UNAUTHORIZED);
  }
}

// Transaction exceptions
export class TransactionFailedException extends DomainException {
  constructor(details?: any) {
    super(ErrorCodes.TX_001, 'Transaction failed', HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

// Wallet exceptions
export class InsufficientBalanceException extends DomainException {
  constructor(details?: any) {
    super(ErrorCodes.WALLET_001, 'Insufficient wallet balance', HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

// FX exceptions
export class FxRateUnavailableException extends DomainException {
  constructor(details?: any) {
    super(ErrorCodes.FX_001, 'FX rate unavailable', HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}
