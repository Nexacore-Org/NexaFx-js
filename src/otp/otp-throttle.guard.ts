import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';
import { normalizeEmail } from '../common/decorators/normalize-email.decorator';

@Injectable()
export class OtpThrottleGuard implements CanActivate {
  private store = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    // Normalise so changing the case of an address cannot dodge the throttle.
    const rawEmail = normalizeEmail(request.body?.email);
    const email = typeof rawEmail === 'string' && rawEmail ? rawEmail : 'unknown';
    const now = Date.now();

    const ipKey = `ip:${ip}`;
    const emailKey = `email:${email}`;

    for (const key of [ipKey, emailKey]) {
      const entry = this.store.get(key);
      if (entry && now < entry.resetAt) {
        if (entry.count >= (key.startsWith('ip:') ? 5 : 3)) {
          throw new HttpException('Too many requests', 429);
        }
        entry.count++;
      } else {
        this.store.set(key, { count: 1, resetAt: now + (key.startsWith('ip:') ? 900000 : 3600000) });
      }
    }
    return true;
  }
}
