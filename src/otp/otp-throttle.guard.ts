import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';

@Injectable()
export class OtpThrottleGuard implements CanActivate {
  private store = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    const email = request.body?.email || 'unknown';
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
