import { Injectable, type CanActivate, type ExecutionContext, BadRequestException } from "@nestjs/common"
import type { Request } from "express"

interface RateLimitEntry {
  count: number
  resetTime: number
}

@Injectable()
export class ResetRateLimitGuard implements CanActivate {
  private attempts = new Map<string, RateLimitEntry>()
  private readonly maxAttempts = 5
  private readonly windowMs = 15 * 60 * 1000 // 15 minutes

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const ip = request.ip || request.connection.remoteAddress || "unknown"

    const now = Date.now()
    const entry = this.attempts.get(ip)

    if (!entry || now > entry.resetTime) {
      // First attempt or window expired
      this.attempts.set(ip, { count: 1, resetTime: now + this.windowMs })
      return true
    }

    if (entry.count >= this.maxAttempts) {
      const remainingTime = Math.ceil((entry.resetTime - now) / 1000 / 60)
      throw new BadRequestException(`Too many password reset attempts. Try again in ${remainingTime} minutes.`)
    }

    // Increment attempt count
    entry.count++
    return true
  }
}
