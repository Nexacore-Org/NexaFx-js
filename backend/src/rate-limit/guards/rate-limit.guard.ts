import { Injectable, type CanActivate, type ExecutionContext, HttpException, HttpStatus } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import type { Request } from "express"
import type { RateLimitService } from "../rate-limit.service"
import { RATE_LIMIT_KEY, type RateLimitOptions } from "../decorators/rate-limit.decorator"

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    // Get rate limit configuration from decorator or use defaults
    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Skip rate limiting if not configured
    if (!rateLimitOptions) {
      return true
    }

    const clientId = this.getClientIdentifier(request, rateLimitOptions)
    const endpoint = this.getEndpointIdentifier(request, rateLimitOptions)

    try {
      const result = await this.rateLimitService.checkRateLimit(clientId, endpoint, rateLimitOptions)

      // Add rate limit headers to response
      const response = context.switchToHttp().getResponse()
      this.addRateLimitHeaders(response, result)

      if (!result.allowed) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: result.message || "Too many requests",
            retryAfter: result.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }

      return true
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }

      // Log error but allow request to proceed to avoid blocking legitimate users
      console.error("Rate limit check failed:", error)
      return true
    }
  }

  private getClientIdentifier(request: Request, options: RateLimitOptions): string {
    if (options.keyGenerator) {
      return options.keyGenerator(request)
    }

    // Default: use IP address
    return this.getClientIp(request)
  }

  private getClientIp(request: Request): string {
    // Check various headers for the real IP address
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

  private getEndpointIdentifier(request: Request, options: RateLimitOptions): string {
    if (options.skipSuccessfulRequests || options.skipFailedRequests) {
      // For conditional rate limiting, we need to include the method and path
      return `${request.method}:${request.route?.path || request.path}`
    }

    return options.endpoint || `${request.method}:${request.route?.path || request.path}`
  }

  private addRateLimitHeaders(response: any, result: any): void {
    response.setHeader("X-RateLimit-Limit", result.limit)
    response.setHeader("X-RateLimit-Remaining", Math.max(0, result.limit - result.current))
    response.setHeader("X-RateLimit-Reset", new Date(result.resetTime).toISOString())

    if (!result.allowed && result.retryAfter) {
      response.setHeader("Retry-After", Math.ceil(result.retryAfter / 1000))
    }
  }
}
