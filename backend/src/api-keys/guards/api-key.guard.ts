import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import type { ApiKeysService } from "../api-keys.service"
import { API_KEY_SCOPES_KEY } from "../decorators/api-key-scopes.decorator"

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const apiKey = this.extractApiKeyFromRequest(request)

    if (!apiKey) {
      throw new UnauthorizedException("API key is required")
    }

    try {
      const validatedApiKey = await this.apiKeysService.validateApiKey(apiKey)

      // Check scopes if required
      const requiredScopes = this.reflector.getAllAndOverride<string[]>(API_KEY_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ])

      if (requiredScopes && requiredScopes.length > 0) {
        if (!validatedApiKey.scopes || !this.hasRequiredScopes(validatedApiKey.scopes, requiredScopes)) {
          throw new UnauthorizedException("Insufficient API key permissions")
        }
      }

      // Attach the API key to the request for later use
      request.apiKey = validatedApiKey

      return true
    } catch (error) {
      throw new UnauthorizedException(error.message)
    }
  }

  private extractApiKeyFromRequest(request: any): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7)
    }

    // Check X-API-Key header
    const apiKeyHeader = request.headers["x-api-key"]
    if (apiKeyHeader) {
      return apiKeyHeader
    }

    // Check query parameter
    const apiKeyQuery = request.query.api_key
    if (apiKeyQuery) {
      return apiKeyQuery
    }

    return null
  }

  private hasRequiredScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => userScopes.includes(scope))
  }
}
