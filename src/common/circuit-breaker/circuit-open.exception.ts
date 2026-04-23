import { HttpException, HttpStatus } from '@nestjs/common';

export class CircuitOpenException extends HttpException {
  constructor(name: string) {
    super(
      { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: `Circuit breaker '${name}' is open`, circuit: name },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
