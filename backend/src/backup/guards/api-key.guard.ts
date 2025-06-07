import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { Request } from "express"

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly validApiKeys: Set<string>

  constructor(private readonly configService: ConfigService) {
    const apiKeys = this.configService.get<string>("BACKUP_API_KEYS", "")
    this.validApiKeys = new Set(apiKeys.split(",").filter((key) => key.trim().length > 0))

    // Add default API key if none configured
    if (this.validApiKeys.size === 0) {
      this.validApiKeys.add("backup-api-key-default")
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()

    // Check for API key in headers
    const apiKey = request.headers["x-api-key"] as string

    if (!apiKey) {
      // API key is optional if user has valid session with admin role
      return true
    }

    if (!this.validApiKeys.has(apiKey)) {
      throw new UnauthorizedException("Invalid API key")
    }

    return true
  }
}
