import { Injectable } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { SecurityHeadersConfig } from "./security-headers.middleware"

export interface SecurityHeadersReport {
  timestamp: string
  headers: Record<string, string>
  configuration: SecurityHeadersConfig
  recommendations: string[]
}

@Injectable()
export class SecurityHeadersService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Analyze current security headers configuration
   */
  analyzeConfiguration(): SecurityHeadersReport {
    const config = this.getDefaultConfiguration()
    const recommendations: string[] = []

    // Check for potential security improvements
    if (!config.contentSecurityPolicy?.enabled) {
      recommendations.push("Enable Content Security Policy for XSS protection")
    }

    if (!config.strictTransportSecurity?.enabled) {
      recommendations.push("Enable HSTS to enforce HTTPS connections")
    }

    if (config.xFrameOptions?.value !== "DENY") {
      recommendations.push("Consider using X-Frame-Options: DENY for maximum clickjacking protection")
    }

    if (!config.crossOriginOpenerPolicy?.enabled) {
      recommendations.push("Enable Cross-Origin-Opener-Policy for better isolation")
    }

    return {
      timestamp: new Date().toISOString(),
      headers: this.getExpectedHeaders(config),
      configuration: config,
      recommendations,
    }
  }

  /**
   * Get security score based on enabled headers
   */
  getSecurityScore(): { score: number; maxScore: number; percentage: number } {
    const config = this.getDefaultConfiguration()
    let score = 0
    const maxScore = 10

    if (config.contentSecurityPolicy?.enabled) score += 2
    if (config.strictTransportSecurity?.enabled) score += 2
    if (config.xFrameOptions?.enabled) score += 1
    if (config.xContentTypeOptions?.enabled) score += 1
    if (config.xXssProtection?.enabled) score += 1
    if (config.referrerPolicy?.enabled) score += 1
    if (config.permissionsPolicy?.enabled) score += 1
    if (config.crossOriginOpenerPolicy?.enabled) score += 1

    return {
      score,
      maxScore,
      percentage: Math.round((score / maxScore) * 100),
    }
  }

  /**
   * Validate CSP directives
   */
  validateCSPDirectives(directives: Record<string, string | string[]>): {
    isValid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check for unsafe directives
    Object.entries(directives).forEach(([directive, values]) => {
      const valueArray = Array.isArray(values) ? values : [values]

      valueArray.forEach((value) => {
        if (value.includes("'unsafe-eval'")) {
          warnings.push(`${directive} contains 'unsafe-eval' which can be dangerous`)
        }

        if (value.includes("'unsafe-inline'") && directive === "script-src") {
          warnings.push(`${directive} contains 'unsafe-inline' which reduces XSS protection`)
        }

        if (value === "*") {
          errors.push(`${directive} uses wildcard (*) which is not secure`)
        }
      })
    })

    // Check for required directives
    const requiredDirectives = ["default-src", "script-src", "object-src"]
    requiredDirectives.forEach((directive) => {
      if (!directives[directive]) {
        warnings.push(`Missing recommended directive: ${directive}`)
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Generate CSP report endpoint handler
   */
  handleCSPReport(report: any): void {
    console.log("CSP Violation Report:", {
      timestamp: new Date().toISOString(),
      blockedURI: report["blocked-uri"],
      documentURI: report["document-uri"],
      violatedDirective: report["violated-directive"],
      originalPolicy: report["original-policy"],
    })

    // Here you could send the report to a logging service
    // or store it in a database for analysis
  }

  private getDefaultConfiguration(): SecurityHeadersConfig {
    return {
      contentSecurityPolicy: {
        enabled: this.configService.get<boolean>("SECURITY_CSP_ENABLED", true),
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
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
        },
      },
      strictTransportSecurity: {
        enabled: this.configService.get<boolean>("SECURITY_HSTS_ENABLED", true),
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      xFrameOptions: {
        enabled: true,
        value: "DENY",
      },
      xContentTypeOptions: {
        enabled: true,
      },
      xXssProtection: {
        enabled: true,
        mode: "1; mode=block",
      },
      referrerPolicy: {
        enabled: true,
        policy: "strict-origin-when-cross-origin",
      },
      permissionsPolicy: {
        enabled: true,
        directives: {
          camera: "self",
          microphone: "self",
          geolocation: "self",
        },
      },
      crossOriginOpenerPolicy: {
        enabled: true,
        value: "same-origin-allow-popups",
      },
      crossOriginResourcePolicy: {
        enabled: true,
        value: "same-site",
      },
      removeServerHeader: true,
      removePoweredByHeader: true,
    }
  }

  private getExpectedHeaders(config: SecurityHeadersConfig): Record<string, string> {
    const headers: Record<string, string> = {}

    if (config.strictTransportSecurity?.enabled) {
      headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    }

    if (config.xFrameOptions?.enabled) {
      headers["X-Frame-Options"] = config.xFrameOptions.value
    }

    if (config.xContentTypeOptions?.enabled) {
      headers["X-Content-Type-Options"] = "nosniff"
    }

    if (config.xXssProtection?.enabled) {
      headers["X-XSS-Protection"] = config.xXssProtection.mode
    }

    if (config.referrerPolicy?.enabled) {
      headers["Referrer-Policy"] = config.referrerPolicy.policy
    }

    return headers
  }
}
