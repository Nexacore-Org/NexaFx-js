import { Injectable, Logger } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { Request } from "express"

export interface CspDirectives {
  defaultSrc?: string[]
  scriptSrc?: string[]
  styleSrc?: string[]
  imgSrc?: string[]
  connectSrc?: string[]
  fontSrc?: string[]
  objectSrc?: string[]
  mediaSrc?: string[]
  frameSrc?: string[]
  childSrc?: string[]
  workerSrc?: string[]
  manifestSrc?: string[]
  prefetchSrc?: string[]
  formAction?: string[]
  frameAncestors?: string[]
  baseUri?: string[]
  upgradeInsecureRequests?: boolean
  blockAllMixedContent?: boolean
  requireTrustedTypesFor?: string[]
  trustedTypes?: string[]
  reportUri?: string[]
  reportTo?: string
}

export interface CspConfig {
  directives: CspDirectives
  reportOnly: boolean
}

interface CspViolationReport {
  timestamp: Date
  userAgent: string
  ip: string
  violatedDirective: string
  blockedUri: string
  documentUri: string
  originalPolicy: string
  disposition: string
  statusCode: number
}

@Injectable()
export class CspService {
  private readonly logger = new Logger(CspService.name)
  private violationReports: CspViolationReport[] = []

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get CSP configuration based on environment and request context
   */
  getCspConfig(req: Request): CspConfig {
    const environment = this.configService.get<string>("NODE_ENV", "development")
    const isProduction = environment === "production"

    // Base CSP configuration
    const baseDirectives: CspDirectives = {
      defaultSrc: ["'self'"],
      scriptSrc: this.getScriptSrcDirectives(isProduction, req),
      styleSrc: this.getStyleSrcDirectives(isProduction),
      imgSrc: this.getImgSrcDirectives(),
      connectSrc: this.getConnectSrcDirectives(isProduction),
      fontSrc: this.getFontSrcDirectives(),
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: this.getFrameSrcDirectives(),
      childSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: isProduction,
      blockAllMixedContent: isProduction,
    }

    // Add trusted types for modern browsers
    if (isProduction) {
      baseDirectives.requireTrustedTypesFor = ["'script'"]
      baseDirectives.trustedTypes = ["default"]
    }

    // Add reporting
    const reportUri = this.configService.get<string>("CSP_REPORT_URI")
    if (reportUri) {
      baseDirectives.reportUri = [reportUri]
    }

    // Route-specific CSP modifications
    const routeSpecificDirectives = this.getRouteSpecificDirectives(req)
    const mergedDirectives = this.mergeDirectives(baseDirectives, routeSpecificDirectives)

    return {
      directives: mergedDirectives,
      reportOnly: this.configService.get<boolean>("CSP_REPORT_ONLY", !isProduction),
    }
  }

  /**
   * Get script source directives
   */
  private getScriptSrcDirectives(isProduction: boolean, req: Request): string[] {
    const scriptSrc = ["'self'"]

    if (!isProduction) {
      // Allow inline scripts and eval in development
      scriptSrc.push("'unsafe-inline'", "'unsafe-eval'")
      // Allow localhost for development servers
      scriptSrc.push("http://localhost:*", "ws://localhost:*")
    } else {
      // Use nonces or hashes in production
      const nonce = this.generateNonce()
      req.cspNonce = nonce // Store nonce in request for use in templates
      scriptSrc.push(`'nonce-${nonce}'`)
    }

    // Add trusted CDNs
    const trustedCdns = this.configService.get<string>("CSP_TRUSTED_SCRIPT_CDNS", "")
    if (trustedCdns) {
      scriptSrc.push(...trustedCdns.split(",").map((cdn) => cdn.trim()))
    }

    // Common trusted CDNs
    scriptSrc.push(
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",
      "https://cdnjs.cloudflare.com",
      "https://www.googletagmanager.com", // Google Analytics
      "https://www.google-analytics.com",
    )

    return scriptSrc
  }

  /**
   * Get style source directives
   */
  private getStyleSrcDirectives(isProduction: boolean): string[] {
    const styleSrc = ["'self'"]

    if (!isProduction) {
      styleSrc.push("'unsafe-inline'")
    } else {
      // Allow inline styles with specific hashes or use nonces
      styleSrc.push("'unsafe-inline'") // Consider using nonces or hashes instead
    }

    // Add trusted style CDNs
    styleSrc.push(
      "https://fonts.googleapis.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",
      "https://cdnjs.cloudflare.com",
    )

    return styleSrc
  }

  /**
   * Get image source directives
   */
  private getImgSrcDirectives(): string[] {
    return [
      "'self'",
      "data:", // Allow data URLs for inline images
      "blob:", // Allow blob URLs
      "https:", // Allow all HTTPS images
      "https://images.unsplash.com", // Common image CDN
      "https://via.placeholder.com", // Placeholder service
    ]
  }

  /**
   * Get connect source directives
   */
  private getConnectSrcDirectives(isProduction: boolean): string[] {
    const connectSrc = ["'self'"]

    if (!isProduction) {
      connectSrc.push("http://localhost:*", "ws://localhost:*", "wss://localhost:*")
    }

    // Add API endpoints
    const apiEndpoints = this.configService.get<string>("CSP_API_ENDPOINTS", "")
    if (apiEndpoints) {
      connectSrc.push(...apiEndpoints.split(",").map((endpoint) => endpoint.trim()))
    }

    // Common services
    connectSrc.push("https://api.github.com", "https://www.google-analytics.com", "https://analytics.google.com")

    return connectSrc
  }

  /**
   * Get font source directives
   */
  private getFontSrcDirectives(): string[] {
    return [
      "'self'",
      "data:", // Allow data URLs for fonts
      "https://fonts.gstatic.com",
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com",
    ]
  }

  /**
   * Get frame source directives
   */
  private getFrameSrcDirectives(): string[] {
    const frameSrc = ["'none'"] // Default to no frames

    // Add trusted frame sources if needed
    const trustedFrames = this.configService.get<string>("CSP_TRUSTED_FRAMES", "")
    if (trustedFrames) {
      return trustedFrames.split(",").map((frame) => frame.trim())
    }

    return frameSrc
  }

  /**
   * Get route-specific CSP directives
   */
  private getRouteSpecificDirectives(req: Request): Partial<CspDirectives> {
    const path = req.path

    // Admin routes might need different CSP
    if (path.startsWith("/admin")) {
      return {
        scriptSrc: ["'self'", "'unsafe-inline'"], // Admin might need inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"],
      }
    }

    // API routes might not need script sources
    if (path.startsWith("/api")) {
      return {
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
      }
    }

    // OAuth callback routes might need specific frame sources
    if (path.includes("/auth/") && path.includes("/callback")) {
      return {
        frameSrc: ["https://accounts.google.com", "https://www.facebook.com"],
      }
    }

    return {}
  }

  /**
   * Merge CSP directives
   */
  private mergeDirectives(base: CspDirectives, override: Partial<CspDirectives>): CspDirectives {
    const merged = { ...base }

    for (const [key, value] of Object.entries(override)) {
      if (Array.isArray(value)) {
        merged[key] = [...(merged[key] || []), ...value]
      } else {
        merged[key] = value
      }
    }

    return merged
  }

  /**
   * Generate a cryptographically secure nonce
   */
  private generateNonce(): string {
    return require("crypto").randomBytes(16).toString("base64")
  }

  /**
   * Log CSP violation report
   */
  logViolation(report: any, req: Request): void {
    const violation: CspViolationReport = {
      timestamp: new Date(),
      userAgent: req.get("User-Agent") || "Unknown",
      ip: req.ip || req.connection.remoteAddress || "Unknown",
      violatedDirective: report["violated-directive"] || "Unknown",
      blockedUri: report["blocked-uri"] || "Unknown",
      documentUri: report["document-uri"] || "Unknown",
      originalPolicy: report["original-policy"] || "Unknown",
      disposition: report.disposition || "enforce",
      statusCode: report["status-code"] || 0,
    }

    this.violationReports.push(violation)

    // Log the violation
    this.logger.warn("CSP Violation Detected", {
      violatedDirective: violation.violatedDirective,
      blockedUri: violation.blockedUri,
      documentUri: violation.documentUri,
      userAgent: violation.userAgent,
      ip: violation.ip,
    })

    // Keep only last 1000 reports to prevent memory issues
    if (this.violationReports.length > 1000) {
      this.violationReports = this.violationReports.slice(-1000)
    }
  }

  /**
   * Get violation reports
   */
  getViolationReports(limit = 100): CspViolationReport[] {
    return this.violationReports.slice(-limit).reverse()
  }

  /**
   * Get violation statistics
   */
  getViolationStats(): {
    total: number
    byDirective: Record<string, number>
    byUri: Record<string, number>
    recent: number
  } {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const byDirective: Record<string, number> = {}
    const byUri: Record<string, number> = {}
    let recent = 0

    for (const report of this.violationReports) {
      // Count by directive
      byDirective[report.violatedDirective] = (byDirective[report.violatedDirective] || 0) + 1

      // Count by URI
      byUri[report.blockedUri] = (byUri[report.blockedUri] || 0) + 1

      // Count recent violations
      if (report.timestamp > oneHourAgo) {
        recent++
      }
    }

    return {
      total: this.violationReports.length,
      byDirective,
      byUri,
      recent,
    }
  }

  /**
   * Clear violation reports
   */
  clearViolationReports(): void {
    this.violationReports = []
    this.logger.log("CSP violation reports cleared")
  }
}
