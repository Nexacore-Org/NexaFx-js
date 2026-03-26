import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyService } from './idempotency.service';
import { IDEMPOTENCY_KEY } from './idempotency.decorator';

const MIN_KEY_LENGTH = 16;

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private idempotencyService: IdempotencyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isIdempotent = this.reflector.get<boolean>(
      IDEMPOTENCY_KEY,
      context.getHandler(),
    );

    if (!isIdempotent) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (idempotencyKey.length < MIN_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be at least ${MIN_KEY_LENGTH} characters`,
      );
    }

    const requestHash = this.idempotencyService.hashRequest(
      request.method,
      request.url,
      request.body,
    );

    const existing = await this.idempotencyService.findByKey(idempotencyKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key already used with different request parameters',
        );
      }

      // Return cached response
      request.idempotencyResponse = {
        statusCode: existing.statusCode,
        body: existing.response,
      };
    }

    request.idempotencyKey = idempotencyKey;
    request.requestHash = requestHash;

    return true;
  }
}
