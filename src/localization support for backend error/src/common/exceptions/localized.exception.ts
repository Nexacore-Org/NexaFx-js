import { HttpException, HttpStatus } from "@nestjs/common";

export class LocalizedException extends HttpException {
  constructor(
    messageKey: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    params?: Record<string, any>,
  ) {
    super({ messageKey, params }, status);
  }
}

// Convenience exception classes
export class NotFoundException extends LocalizedException {
  constructor(resource: string) {
    super("error.not_found", HttpStatus.NOT_FOUND, { resource });
  }
}

export class UnauthorizedException extends LocalizedException {
  constructor() {
    super("error.unauthorized", HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends LocalizedException {
  constructor() {
    super("error.forbidden", HttpStatus.FORBIDDEN);
  }
}

export class ValidationException extends LocalizedException {
  constructor(field: string, constraint: string, params?: Record<string, any>) {
    super(`error.${constraint}`, HttpStatus.BAD_REQUEST, { field, ...params });
  }
}
