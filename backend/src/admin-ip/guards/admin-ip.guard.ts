import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException, Logger } from "@nestjs/common"
import type { Request } from "express"
import type { AdminIpService } from "../admin-ip.service"
import { AccessType } from "../entities/admin-ip-access-log.entity"

@Injectable()
export class AdminIpGuard implements CanActivate {
  private readonly logger = new Logger(AdminIpGuard.name)

  constructor(private readonly adminIpService: AdminIpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const ipAddress = this.getClientIp(request)

    this.logger.debug(`Checking admin IP access for ${ipAddress} on ${request.path}`)

    const accessAttempt = {
      ipAddress,
      accessType: AccessType.ADMIN_PANEL,
      requestPath: request.path,
      requestMethod: request.method,
      userAgent: request.headers["user-agent"],
      referer: request.headers.referer,
      headers: request.headers as Record<string, string>,
      userId: (request as any).user?.id,
      metadata: {
        originalUrl: request.originalUrl,
        query: request.query,
        timestamp: new Date().toISOString(),
      },
    }

    try {
      const validationResult = await this.adminIpService.validateIpAccess(ipAddress, accessAttempt)

      if (!validationResult.isAllowed) {
        this.logger.warn(`Admin access denied for IP ${ipAddress}: ${validationResult.denialReason}`)

        throw new ForbiddenException({
          message: "Access denied: IP address not authorized for admin access",
          reason: validationResult.denialReason,
          ipAddress,
          timestamp: new Date().toISOString(),
        })
      }

      this.logger.debug(`Admin access granted for IP ${ipAddress}`)
      return true
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }

      this.logger.error(`Error in AdminIpGuard: ${error.message}`)

      // Fail securely - deny access on error
      throw new ForbiddenException({
        message: "Access denied: Unable to validate IP address",
        reason: "Internal validation error",
        ipAddress,
        timestamp: new Date().toISOString(),
      })
    }
  }

  private getClientIp(request: Request): string {
    // Check various headers for the real IP address
    const xForwardedFor = request.headers["x-forwarded-for"]
    const xRealIp = request.headers["x-real-ip"]
    const xClientIp = request.headers["x-client-ip"]
    const cfConnectingIp = request.headers["cf-connecting-ip"] // Cloudflare
    const trueClientIp = request.headers["true-client-ip"] // Cloudflare Enterprise

    // Priority order for IP detection
    if (trueClientIp && typeof trueClientIp === "string") {
      return trueClientIp.split(",")[0].trim()
    }

    if (cfConnectingIp && typeof cfConnectingIp === "string") {
      return cfConnectingIp.split(",")[0].trim()
    }

    if (xClientIp && typeof xClientIp === "string") {
      return xClientIp.split(",")[0].trim()
    }

    if (xRealIp && typeof xRealIp === "string") {
      return xRealIp.split(",")[0].trim()
    }

    if (xForwardedFor && typeof xForwardedFor === "string") {
      return xForwardedFor.split(",")[0].trim()
    }

    // Fallback to connection remote address
    return request.connection.remoteAddress || request.socket.remoteAddress || "unknown"
  }
}
