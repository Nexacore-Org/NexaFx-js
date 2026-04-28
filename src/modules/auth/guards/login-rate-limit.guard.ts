import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface LockoutRecord {
  attempts: number;
  lockedUntil?: Date;
  ipAttempts: Map<string, number>;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const IP_RATE_LIMIT = 20;

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(LoginRateLimitGuard.name);
  private readonly records = new Map<string, LockoutRecord>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      body: { email?: string };
      ip: string;
    }>();

    const identifier = req.body?.email ?? 'unknown';
    const ip = req.ip ?? '0.0.0.0';

    this.checkIpRateLimit(ip);
    this.checkAccountLockout(identifier);
    return true;
  }

  recordFailedAttempt(identifier: string, ip: string): void {
    const record = this.getOrCreate(identifier);
    record.attempts += 1;
    record.ipAttempts.set(ip, (record.ipAttempts.get(ip) ?? 0) + 1);

    if (record.attempts >= MAX_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_MINUTES);
      record.lockedUntil = lockedUntil;
      this.logger.warn(`Account locked: ${identifier} until ${lockedUntil.toISOString()}`);
    }

    this.records.set(identifier, record);
  }

  resetAttempts(identifier: string): void {
    this.records.delete(identifier);
  }

  getLockoutExpiry(identifier: string): Date | undefined {
    return this.records.get(identifier)?.lockedUntil;
  }

  private checkAccountLockout(identifier: string): void {
    const record = this.records.get(identifier);
    if (!record?.lockedUntil) return;

    if (record.lockedUntil > new Date()) {
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED,
          message: 'Account temporarily locked due to too many failed login attempts',
          lockedUntil: record.lockedUntil.toISOString(),
        },
        HttpStatus.LOCKED,
      );
    }

    record.lockedUntil = undefined;
    record.attempts = 0;
  }

  private checkIpRateLimit(ip: string): void {
    let totalFromIp = 0;
    for (const record of this.records.values()) {
      totalFromIp += record.ipAttempts.get(ip) ?? 0;
    }

    if (totalFromIp >= IP_RATE_LIMIT) {
      this.logger.warn(`IP rate limit reached for ${ip}`);
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests from this IP' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private getOrCreate(identifier: string): LockoutRecord {
    if (!this.records.has(identifier)) {
      this.records.set(identifier, { attempts: 0, ipAttempts: new Map() });
    }
    return this.records.get(identifier)!;
  }
}
