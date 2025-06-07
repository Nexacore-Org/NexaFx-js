import { Injectable, type NestMiddleware, Logger, ForbiddenException } from "@nestjs/common"
import type { Request, Response, NextFunction } from "express"
import type { CsrfService } from "./csrf.service"

interface CsrfRequest extends Request {
  csrfToken?: string
  session?: {
    csrfSecret?: string
    [key: string]: any
  }
}

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name)

  constructor(private readonly csrfService: CsrfService) {}

  use(req: CsrfRequest, res: Response, next: NextFunction) {
    try {
      // Skip CSRF protection for certain routes and methods
      if (this.shouldSkipCsrfProtection(req)) {
        return next()
      }

      // Handle GET requests - generate and set CSRF token
      if (req.method === "GET") {
        this.handleGetRequest(req, res)
        return next()
      }

      // Handle state-changing requests - validate CSRF token
      if (this.isStateChangingRequest(req.method)) {
        this.validateCsrfToken(req)
      }

      next()
    } catch (error) {
      this.logger.error(`CSRF validation failed: ${error.message}`, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      })

      if (error instanceof ForbiddenException) {
        throw error
      }

      throw new ForbiddenException("CSRF token validation failed")
    }
  }

  /**
   * Handle GET requests - generate CSRF token
   */
  private handleGetRequest(req: CsrfRequest, res: Response): void {
    // Ensure session exists
    if (!req.session) {
      this.logger.warn("Session not available for CSRF token generation")
      return
    }

    // Generate CSRF secret if not exists
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = this.csrfService.generateSecret()
    }

    // Generate CSRF token
    const csrfToken = this.csrfService.generateToken(req.session.csrfSecret)

    // Set token in request for template access
    req.csrfToken = csrfToken

    // Set CSRF token in response headers
    res.setHeader("X-CSRF-Token", csrfToken)

    // Set CSRF token as cookie (for AJAX requests)
    res.cookie("XSRF-TOKEN", csrfToken, {
      httpOnly: false, // Allow JavaScript access for AJAX
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })

    this.logger.debug(`CSRF token generated for ${req.method} ${req.url}`)
  }

  /**
   * Validate CSRF token for state-changing requests
   */
  private validateCsrfToken(req: CsrfRequest): void {
    if (!req.session?.csrfSecret) {
      throw new ForbiddenException("CSRF secret not found in session")
    }

    // Get CSRF token from various sources
    const token = this.extractCsrfToken(req)

    if (!token) {
      throw new ForbiddenException("CSRF token not provided")
    }

    // Validate the token
    const isValid = this.csrfService.validateToken(token, req.session.csrfSecret)

    if (!isValid) {
      throw new ForbiddenException("Invalid CSRF token")
    }

    this.logger.debug(`CSRF token validated for ${req.method} ${req.url}`)
  }

  /**
   * Extract CSRF token from request
   */
  private extractCsrfToken(req: CsrfRequest): string | null {
    // Check various sources for CSRF token
    return (
      req.get("X-CSRF-Token") || // Custom header
      req.get("X-XSRF-Token") || // Angular/AngularJS convention
      req.body?._csrf || // Form field
      req.query._csrf || // Query parameter
      req.cookies?.["XSRF-TOKEN"] || // Cookie (for AJAX)
      null
    )
  }

  /**
   * Check if CSRF protection should be skipped
   */
  private shouldSkipCsrfProtection(req: CsrfRequest): boolean {
    const url = req.url
    const method = req.method

    // Skip for safe HTTP methods (except GET which needs token generation)
    if (["HEAD", "OPTIONS", "TRACE"].includes(method)) {
      return true
    }

    // Skip for API routes that use other authentication methods
    if (url.startsWith("/api/") && this.hasApiAuthentication(req)) {
      return true
    }

    // Skip for webhook endpoints
    if (url.includes("/webhook")) {
      return true
    }

    // Skip for health check endpoints
    if (url.includes("/health") || url.includes("/status")) {
      return true
    }

    // Skip for CSRF token endpoint itself
    if (url.includes("/csrf/token")) {
      return true
    }

    // Skip for OAuth callback URLs
    if (url.includes("/auth/") && url.includes("/callback")) {
      return true
    }

    return false
  }

  /**
   * Check if request has API authentication (JWT, API key, etc.)
   */
  private hasApiAuthentication(req: Request): boolean {
    const authHeader = req.get("Authorization")
    const apiKey = req.get("X-API-Key")

    return !!(authHeader?.startsWith("Bearer ") || apiKey)
  }

  /**
   * Check if HTTP method is state-changing
   */
  private isStateChangingRequest(method: string): boolean {
    return ["POST", "PUT", "PATCH", "DELETE"].includes(method)
  }
}
