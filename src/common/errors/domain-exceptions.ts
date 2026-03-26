import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly details?: any,
  ) {
    super({ code, message, details }, status);
  }
}

// 🔐 Auth Exceptions
export class UnauthorizedException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

// 💼 Business Errors
export class BusinessException extends AppException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}