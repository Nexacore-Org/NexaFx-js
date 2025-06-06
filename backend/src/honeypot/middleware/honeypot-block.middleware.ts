import { Injectable, type NestMiddleware, ForbiddenException } from "@nestjs/common"
import type { Request, Response, NextFunction } from "express"
import type { HoneypotService } from "../honeypot.service"

@Injectable()
export class HoneypotBlockMiddleware implements NestMiddleware {
  constructor(private readonly honeypotService: HoneypotService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const ipAddress = this.getClientIP(req)

    if (this.honeypotService.isIPBlocked(ipAddress)) {
      throw new ForbiddenException("Access denied - IP blocked")
    }

    next()
  }

  private getClientIP(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown"
    )
  }
}
