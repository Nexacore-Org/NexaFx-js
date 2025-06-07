import { SetMetadata } from "@nestjs/common"

export const SECURITY_HEADERS_KEY = "security-headers"

export interface RouteSecurityConfig {
  csp?: {
    override?: boolean
    directives?: Record<string, string | string[]>
  }
  frameOptions?: "DENY" | "SAMEORIGIN" | "ALLOW-FROM"
  noSniff?: boolean
  xssProtection?: boolean
}

/**
 * Decorator to override security headers for specific routes
 */
export const SecurityHeaders = (config: RouteSecurityConfig) => SetMetadata(SECURITY_HEADERS_KEY, config)

/**
 * Decorator to disable security headers for specific routes
 */
export const DisableSecurityHeaders = () => SetMetadata(SECURITY_HEADERS_KEY, { disabled: true })

/**
 * Decorator for CSP-specific configuration
 */
export const CSP = (directives: Record<string, string | string[]>) =>
  SetMetadata(SECURITY_HEADERS_KEY, { csp: { directives } })
