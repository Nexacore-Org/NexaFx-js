import { Injectable, type NestMiddleware, HttpException, HttpStatus } from "@nestjs/common"
import type { Request, Response, NextFunction } from "express"
import type { RateLimitService } from "../rate-limit.service"

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const ip = this.getClientIp(req)

    // Check whitelist/blacklist
    const [isWhitelisted, isBlacklisted] = await Promise.all([
      this.rateLimitService.isWhitelisted(ip),
      this.rateLimitService.isBlacklisted(ip),
    ])

    if (isBlacklisted) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: "IP address is blacklisted",
        },
        HttpStatus.FORBIDDEN,
      )
    }

    if (isWhitelisted) {
      // Skip rate limiting for whitelisted IPs
      return next()
    }

    next()
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers["x-forwarded-for"] as string
    const realIp = request.headers["x-real-ip"] as string
    const cfConnectingIp = request.headers["cf-connecting-ip"] as string

    if (forwarded) {
      return forwarded.split(",")[0].trim()
    }

    if (realIp) {
      return realIp
    }

    if (cfConnectingIp) {
      return cfConnectingIp
    }

    return request.ip || request.connection.remoteAddress || "unknown"
  }
}
