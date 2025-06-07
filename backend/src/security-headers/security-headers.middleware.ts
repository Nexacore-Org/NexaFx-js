import { Injectable, type NestMiddleware } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { Request, Response, NextFunction } from "express"

export interface SecurityHeadersConfig {
  // Content Security Policy
  contentSecurityPolicy?: {
    enabled: boolean
    directives: Record<string, string | string[]>
    reportOnly?: boolean
  }

  // HTTP Strict Transport Security
  strictTransportSecurity?: {
    enabled: boolean
    maxAge: number
    includeSubDomains: boolean
    preload: boolean
  }

  // X-Frame-Options
  xFrameOptions?: {
    enabled: boolean
    value: "DENY" | "SAMEORIGIN" | string
  }

  // X-Content-Type-Options
  xContentTypeOptions?: {
    enabled: boolean
  }

  // X-XSS-Protection
  xXssProtection?: {
    enabled: boolean
    mode: "0" | "1" | "1; mode=block"
  }

  // Referrer Policy
  referrerPolicy?: {
    enabled: boolean
    policy: string
  }

  // Permissions Policy (formerly Feature Policy)
  permissionsPolicy?: {
    enabled: boolean
    directives: Record<string, string>
  }

  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy?: {
    enabled: boolean
    value: "unsafe-none" | "require-corp" | "credentialless"
  }

  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy?: {
    enabled: boolean
    value: "unsafe-none" | "same-origin-allow-popups" | "same-origin"
  }

  // Cross-Origin Resource Policy
  crossOriginResourcePolicy?: {
    enabled: boolean
    value: "same-site" | "same-origin" | "cross-origin"
  }

  // Remove server header
  removeServerHeader?: boolean

  // Remove X-Powered-By header
  removePoweredByHeader?: boolean
}

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly config: SecurityHeadersConfig

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfiguration()
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Remove identifying headers first
    if (this.config.removePoweredByHeader) {
      res.removeHeader("X-Powered-By")
    }

    if (this.config.removeServerHeader) {
      res.removeHeader("Server")
    }

    // Set security headers
    this.setContentSecurityPolicy(res)
    this.setStrictTransportSecurity(res)
    this.setXFrameOptions(res)
    this.setXContentTypeOptions(res)
    this.setXXssProtection(res)
    this.setReferrerPolicy(res)
    this.setPermissionsPolicy(res)
    this.setCrossOriginEmbedderPolicy(res)
    this.setCrossOriginOpenerPolicy(res)
    this.setCrossOriginResourcePolicy(res)

    // Set additional security headers
    this.setAdditionalSecurityHeaders(res)

    next()
  }

  private loadConfiguration(): SecurityHeadersConfig {
    return {
      contentSecurityPolicy: {
        enabled: this.configService.get<boolean>("SECURITY_CSP_ENABLED", true),
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "https:"],
          "font-src": ["'self'"],
          "connect-src": ["'self'"],
          "media-src": ["'self'"],
          "object-src": ["'none'"],
          "child-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'self'"],
          "base-uri": ["'self'"],
          "manifest-src": ["'self'"],
        },
        reportOnly: this.configService.get<boolean>("SECURITY_CSP_REPORT_ONLY", false),
      },

      strictTransportSecurity: {
        enabled: this.configService.get<boolean>("SECURITY_HSTS_ENABLED", true),
        maxAge: this.configService.get<number>("SECURITY_HSTS_MAX_AGE", 31536000), // 1 year
        includeSubDomains: this.configService.get<boolean>("SECURITY_HSTS_INCLUDE_SUBDOMAINS", true),
        preload: this.configService.get<boolean>("SECURITY_HSTS_PRELOAD", true),
      },

      xFrameOptions: {
        enabled: this.configService.get<boolean>("SECURITY_X_FRAME_OPTIONS_ENABLED", true),
        value: this.configService.get<"DENY" | "SAMEORIGIN">("SECURITY_X_FRAME_OPTIONS_VALUE", "DENY"),
      },

      xContentTypeOptions: {
        enabled: this.configService.get<boolean>("SECURITY_X_CONTENT_TYPE_OPTIONS_ENABLED", true),
      },

      xXssProtection: {
        enabled: this.configService.get<boolean>("SECURITY_X_XSS_PROTECTION_ENABLED", true),
        mode: this.configService.get<"0" | "1" | "1; mode=block">("SECURITY_X_XSS_PROTECTION_MODE", "1; mode=block"),
      },

      referrerPolicy: {
        enabled: this.configService.get<boolean>("SECURITY_REFERRER_POLICY_ENABLED", true),
        policy: this.configService.get<string>("SECURITY_REFERRER_POLICY_VALUE", "strict-origin-when-cross-origin"),
      },

      permissionsPolicy: {
        enabled: this.configService.get<boolean>("SECURITY_PERMISSIONS_POLICY_ENABLED", true),
        directives: {
          camera: "self",
          microphone: "self",
          geolocation: "self",
          "interest-cohort": "()",
          "user-id": "()",
          bluetooth: "()",
          "display-capture": "()",
          "document-domain": "()",
          "encrypted-media": "self",
          fullscreen: "self",
          gamepad: "()",
          gyroscope: "()",
          "layout-animations": "self",
          "legacy-image-formats": "self",
          magnetometer: "()",
          midi: "()",
          "navigation-override": "()",
          payment: "self",
          "picture-in-picture": "()",
          "publickey-credentials-get": "self",
          "screen-wake-lock": "()",
          "sync-xhr": "()",
          usb: "()",
          "web-share": "self",
          "xr-spatial-tracking": "()",
        },
      },

      crossOriginEmbedderPolicy: {
        enabled: this.configService.get<boolean>("SECURITY_COEP_ENABLED", false),
        value: this.configService.get<"unsafe-none" | "require-corp">("SECURITY_COEP_VALUE", "unsafe-none"),
      },

      crossOriginOpenerPolicy: {
        enabled: this.configService.get<boolean>("SECURITY_COOP_ENABLED", true),
        value: this.configService.get<"unsafe-none" | "same-origin-allow-popups" | "same-origin">(
          "SECURITY_COOP_VALUE",
          "same-origin-allow-popups",
        ),
      },

      crossOriginResourcePolicy: {
        enabled: this.configService.get<boolean>("SECURITY_CORP_ENABLED", true),
        value: this.configService.get<"same-site" | "same-origin" | "cross-origin">("SECURITY_CORP_VALUE", "same-site"),
      },

      removeServerHeader: this.configService.get<boolean>("SECURITY_REMOVE_SERVER_HEADER", true),
      removePoweredByHeader: this.configService.get<boolean>("SECURITY_REMOVE_POWERED_BY_HEADER", true),
    }
  }

  private setContentSecurityPolicy(res: Response): void {
    if (!this.config.contentSecurityPolicy?.enabled) return

    const directives = this.config.contentSecurityPolicy.directives
    const cspString = Object.entries(directives)
      .map(([key, value]) => {
        const valueString = Array.isArray(value) ? value.join(" ") : value
        return `${key} ${valueString}`
      })
      .join("; ")

    const headerName = this.config.contentSecurityPolicy.reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy"

    res.setHeader(headerName, cspString)
  }

  private setStrictTransportSecurity(res: Response): void {
    if (!this.config.strictTransportSecurity?.enabled) return

    const { maxAge, includeSubDomains, preload } = this.config.strictTransportSecurity
    let hstsValue = `max-age=${maxAge}`

    if (includeSubDomains) {
      hstsValue += "; includeSubDomains"
    }

    if (preload) {
      hstsValue += "; preload"
    }

    res.setHeader("Strict-Transport-Security", hstsValue)
  }

  private setXFrameOptions(res: Response): void {
    if (!this.config.xFrameOptions?.enabled) return
    res.setHeader("X-Frame-Options", this.config.xFrameOptions.value)
  }

  private setXContentTypeOptions(res: Response): void {
    if (!this.config.xContentTypeOptions?.enabled) return
    res.setHeader("X-Content-Type-Options", "nosniff")
  }

  private setXXssProtection(res: Response): void {
    if (!this.config.xXssProtection?.enabled) return
    res.setHeader("X-XSS-Protection", this.config.xXssProtection.mode)
  }

  private setReferrerPolicy(res: Response): void {
    if (!this.config.referrerPolicy?.enabled) return
    res.setHeader("Referrer-Policy", this.config.referrerPolicy.policy)
  }

  private setPermissionsPolicy(res: Response): void {
    if (!this.config.permissionsPolicy?.enabled) return

    const directives = this.config.permissionsPolicy.directives
    const policyString = Object.entries(directives)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")

    res.setHeader("Permissions-Policy", policyString)
  }

  private setCrossOriginEmbedderPolicy(res: Response): void {
    if (!this.config.crossOriginEmbedderPolicy?.enabled) return
    res.setHeader("Cross-Origin-Embedder-Policy", this.config.crossOriginEmbedderPolicy.value)
  }

  private setCrossOriginOpenerPolicy(res: Response): void {
    if (!this.config.crossOriginOpenerPolicy?.enabled) return
    res.setHeader("Cross-Origin-Opener-Policy", this.config.crossOriginOpenerPolicy.value)
  }

  private setCrossOriginResourcePolicy(res: Response): void {
    if (!this.config.crossOriginResourcePolicy?.enabled) return
    res.setHeader("Cross-Origin-Resource-Policy", this.config.crossOriginResourcePolicy.value)
  }

  private setAdditionalSecurityHeaders(res: Response): void {
    // Prevent MIME type sniffing
    res.setHeader("X-Download-Options", "noopen")

    // Prevent Adobe Flash and PDF files from loading content
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none")

    // DNS Prefetch Control
    res.setHeader("X-DNS-Prefetch-Control", "off")

    // Expect-CT (Certificate Transparency)
    res.setHeader("Expect-CT", "max-age=86400, enforce")
  }

  // Method to get current configuration (useful for debugging)
  getConfiguration(): SecurityHeadersConfig {
    return { ...this.config }
  }

  // Method to update configuration at runtime
  updateConfiguration(newConfig: Partial<SecurityHeadersConfig>): void {
    Object.assign(this.config, newConfig)
  }
}
