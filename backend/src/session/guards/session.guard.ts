import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from "@nestjs/common"
import type { Request } from "express"
import type { SessionService } from "../session.service"

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    const sessionId = this.extractSessionId(request)
    if (!sessionId) {
      throw new UnauthorizedException("No session token provided")
    }

    const session = await this.sessionService.getSession(sessionId)
    if (!session) {
      throw new UnauthorizedException("Invalid or expired session")
    }

    // Validate session security
    const ipAddress = this.getClientIp(request)
    const userAgent = request.headers["user-agent"] || ""

    const isSecure = await this.sessionService.validateSessionSecurity(sessionId, ipAddress, userAgent)
    if (!isSecure) {
      throw new UnauthorizedException("Session security validation failed")
    }

    // Refresh session
    await this.sessionService.refreshSession(sessionId, ipAddress, userAgent)

    // Attach session to request
    request["session"] = session

    return true
  }

  private extractSessionId(request: Request): string | null {
    // Try Authorization header first
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7)
    }

    // Try session cookie
    const sessionCookie = request.cookies?.sessionId
    if (sessionCookie) {
      return sessionCookie
    }

    // Try custom header
    const sessionHeader = request.headers["x-session-id"] as string
    if (sessionHeader) {
      return sessionHeader
    }

    return null
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
