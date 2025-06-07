import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  HttpException,
  HttpStatus,
} from "@nestjs/common"
import { type Observable, throwError } from "rxjs"
import { catchError, tap } from "rxjs/operators"
import type { Request, Response } from "express"
import type { RateLimitService } from "../rate-limit.service"

@Injectable()
export class BruteForceInterceptor implements NestInterceptor {
  constructor(private readonly rateLimitService: RateLimitService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()

    const ip = this.getClientIp(request)
    const endpoint = `${request.method}:${request.route?.path || request.path}`
    const userAgent = request.headers["user-agent"]

    return next.handle().pipe(
      tap(async (result) => {
        // Record successful attempt
        await this.rateLimitService.recordLoginAttempt({
          ip,
          endpoint,
          timestamp: Date.now(),
          success: true,
          userAgent,
        })
      }),
      catchError(async (error) => {
        // Record failed attempt
        await this.rateLimitService.recordLoginAttempt({
          ip,
          endpoint,
          timestamp: Date.now(),
          success: false,
          userAgent,
        })

        // Check if IP should be blocked
        const bruteForceStatus = await this.rateLimitService.checkBruteForce(ip, endpoint)

        if (bruteForceStatus.isBlocked) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: bruteForceStatus.message,
              blockUntil: bruteForceStatus.blockUntil,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          )
        }

        return throwError(() => error)
      }),
    )
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
