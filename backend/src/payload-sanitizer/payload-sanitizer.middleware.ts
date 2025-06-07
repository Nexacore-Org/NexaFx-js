import { Injectable, type NestMiddleware, Logger, HttpException, HttpStatus } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { Request, Response, NextFunction } from "express"
import { createHash } from "crypto"

export interface PayloadSanitizerOptions {
  enabled: boolean
  logOnly: boolean
  scanJsonBody: boolean
  scanFormBody: boolean
  scanQueryParams: boolean
  scanHeaders: boolean
  maxPayloadSize: number
  blockStatusCode: number
  blockMessage: string
  sensitiveParamNames: string[]
  excludedRoutes: string[]
  excludedContentTypes: string[]
  detectionRules: {
    xss: {
      enabled: boolean
      patterns: RegExp[]
    }
    sqlInjection: {
      enabled: boolean
      patterns: RegExp[]
    }
    commandInjection: {
      enabled: boolean
      patterns: RegExp[]
    }
    pathTraversal: {
      enabled: boolean
      patterns: RegExp[]
    }
    ldapInjection: {
      enabled: boolean
      patterns: RegExp[]
    }
    ssrf: {
      enabled: boolean
      patterns: RegExp[]
    }
    templateInjection: {
      enabled: boolean
      patterns: RegExp[]
    }
    customPatterns: {
      enabled: boolean
      patterns: RegExp[]
    }
  }
}

@Injectable()
export class PayloadSanitizerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PayloadSanitizerMiddleware.name)
  private readonly options: PayloadSanitizerOptions

  constructor(private readonly configService: ConfigService) {
    this.options = this.loadConfiguration()
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.options.enabled) {
      return next()
    }

    // Skip excluded routes
    if (this.isExcludedRoute(req.path)) {
      return next()
    }

    // Skip excluded content types
    const contentType = req.headers["content-type"] || ""
    if (this.isExcludedContentType(contentType)) {
      return next()
    }

    try {
      // Scan request components based on configuration
      const detectionResults: DetectionResult[] = []

      if (this.options.scanJsonBody && req.body && contentType.includes("application/json")) {
        this.scanObject(req.body, "body", detectionResults)
      }

      if (this.options.scanFormBody && req.body && contentType.includes("application/x-www-form-urlencoded")) {
        this.scanObject(req.body, "form", detectionResults)
      }

      if (this.options.scanQueryParams && req.query) {
        this.scanObject(req.query, "query", detectionResults)
      }

      if (this.options.scanHeaders && req.headers) {
        // Only scan specific headers that might contain user input
        const headersToScan = {
          "user-agent": req.headers["user-agent"],
          referer: req.headers.referer,
          "x-forwarded-for": req.headers["x-forwarded-for"],
          cookie: req.headers.cookie,
        }
        this.scanObject(headersToScan, "headers", detectionResults)
      }

      // Handle detection results
      if (detectionResults.length > 0) {
        const requestInfo = this.getRequestInfo(req)
        this.handleDetection(detectionResults, requestInfo, req, res, next)
        return
      }

      next()
    } catch (error) {
      this.logger.error(`Error in payload sanitizer: ${error.message}`, error.stack)
      next()
    }
  }

  private loadConfiguration(): PayloadSanitizerOptions {
    // Default XSS patterns
    const xssPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /<script[\s\S]*?>/i,
      /<img[\s\S]*?on\w+[\s\S]*?>/i,
      /<[\s\S]*?on\w+[\s\S]*?>/i,
      /javascript:[\s\S]*?/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
      /document\.cookie/i,
      /document\.domain/i,
      /document\.write/i,
      /window\.location/i,
      /\.innerHTML/i,
      /alert\s*\(/i,
    ]

    // Default SQL injection patterns
    const sqlInjectionPatterns = [
      /(%27)|(')|(--)|(%23)|(#)/i,
      /((%3D)|(=))[^\n]*((%27)|(')|(--)|(%3B)|(;))/i,
      /\w*((%27)|('))((%6F)|o|(%4F))((%72)|r|(%52))/i,
      /exec(\s|\+)+(s|x)p\w+/i,
      /UNION\s+ALL\s+SELECT/i,
      /SELECT\s+[\w*)(,\s]+\s+FROM/i,
      /INSERT\s+INTO.+VALUES/i,
      /UPDATE.+SET.+=/i,
      /DELETE\s+FROM/i,
    ]

    // Default command injection patterns
    const commandInjectionPatterns = [
      /;.*(sh|bash)/i,
      /\|\s*\w+/i,
      /`.*`/i,
      /\$$$[^)]+$$/i,
      /\$\{[^}]+\}/i,
      /&\s*\w+/i,
      />\s*\w+/i,
      /\/bin\/(?:bash|sh|ksh|csh|tcsh)/i,
    ]

    // Default path traversal patterns
    const pathTraversalPatterns = [
      /\.\.\/+/i,
      /\.\.\\+/i,
      /\.\.%2f/i,
      /\.\.%5c/i,
      /%252e%252e%252f/i,
      /%c0%ae%c0%ae\//i,
      /file:\/\//i,
    ]

    // Default LDAP injection patterns
    const ldapInjectionPatterns = [
      /$$\s*\|\s*[^)]*$$/i,
      /$$\s*&\s*[^)]*$$/i,
      /$$\s*!\s*[^)]*$$/i,
      /$$\s*\|\s*\(\s*[^)]*$$/i,
    ]

    // Default SSRF patterns
    const ssrfPatterns = [
      /^(file|gopher|ldap|ftp|dict|http|https):\/\//i,
      /localhost/i,
      /127\.0\.0\.1/i,
      /0\.0\.0\.0/i,
      /::1/i,
      /169\.254\./i,
      /192\.168\./i,
      /10\./i,
      /172\.(1[6-9]|2[0-9]|3[0-1])\./i,
    ]

    // Default template injection patterns
    const templateInjectionPatterns = [/\$\{.+\}/i, /\{\{.+\}\}/i, /<#.+>/i, /<%.+%>/i, /#\{.+\}/i]

    return {
      enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_ENABLED", true),
      logOnly: this.configService.get<boolean>("PAYLOAD_SANITIZER_LOG_ONLY", false),
      scanJsonBody: this.configService.get<boolean>("PAYLOAD_SANITIZER_SCAN_JSON_BODY", true),
      scanFormBody: this.configService.get<boolean>("PAYLOAD_SANITIZER_SCAN_FORM_BODY", true),
      scanQueryParams: this.configService.get<boolean>("PAYLOAD_SANITIZER_SCAN_QUERY_PARAMS", true),
      scanHeaders: this.configService.get<boolean>("PAYLOAD_SANITIZER_SCAN_HEADERS", false),
      maxPayloadSize: this.configService.get<number>("PAYLOAD_SANITIZER_MAX_SIZE", 100 * 1024), // 100KB
      blockStatusCode: this.configService.get<number>("PAYLOAD_SANITIZER_BLOCK_STATUS", HttpStatus.BAD_REQUEST),
      blockMessage: this.configService.get<string>(
        "PAYLOAD_SANITIZER_BLOCK_MESSAGE",
        "Request blocked due to suspicious content",
      ),
      sensitiveParamNames: this.configService
        .get<string>("PAYLOAD_SANITIZER_SENSITIVE_PARAMS", "password,token,key,secret,credential")
        .split(","),
      excludedRoutes: this.configService
        .get<string>("PAYLOAD_SANITIZER_EXCLUDED_ROUTES", "/health,/metrics")
        .split(","),
      excludedContentTypes: this.configService
        .get<string>("PAYLOAD_SANITIZER_EXCLUDED_CONTENT_TYPES", "multipart/form-data")
        .split(","),
      detectionRules: {
        xss: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_XSS_ENABLED", true),
          patterns: xssPatterns,
        },
        sqlInjection: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_SQL_INJECTION_ENABLED", true),
          patterns: sqlInjectionPatterns,
        },
        commandInjection: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_COMMAND_INJECTION_ENABLED", true),
          patterns: commandInjectionPatterns,
        },
        pathTraversal: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_PATH_TRAVERSAL_ENABLED", true),
          patterns: pathTraversalPatterns,
        },
        ldapInjection: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_LDAP_INJECTION_ENABLED", true),
          patterns: ldapInjectionPatterns,
        },
        ssrf: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_SSRF_ENABLED", true),
          patterns: ssrfPatterns,
        },
        templateInjection: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_TEMPLATE_INJECTION_ENABLED", true),
          patterns: templateInjectionPatterns,
        },
        customPatterns: {
          enabled: this.configService.get<boolean>("PAYLOAD_SANITIZER_CUSTOM_PATTERNS_ENABLED", false),
          patterns: this.configService
            .get<string>("PAYLOAD_SANITIZER_CUSTOM_PATTERNS", "")
            .split(",")
            .filter((p) => p)
            .map((p) => new RegExp(p, "i")),
        },
      },
    }
  }

  private isExcludedRoute(path: string): boolean {
    return this.options.excludedRoutes.some((route) => {
      if (route.includes("*")) {
        const pattern = route.replace(/\*/g, ".*")
        return new RegExp(`^${pattern}$`).test(path)
      }
      return route === path
    })
  }

  private isExcludedContentType(contentType: string): boolean {
    return this.options.excludedContentTypes.some((excluded) => contentType.includes(excluded))
  }

  private scanObject(obj: any, location: string, results: DetectionResult[], path = "", depth = 0): void {
    // Prevent deep recursion
    if (depth > 10) {
      return
    }

    if (obj === null || obj === undefined) {
      return
    }

    // Handle different types
    if (typeof obj === "string") {
      this.scanString(obj, location, path, results)
    } else if (typeof obj === "object") {
      if (Array.isArray(obj)) {
        // Handle arrays
        obj.forEach((item, index) => {
          this.scanObject(item, location, results, path ? `${path}[${index}]` : `[${index}]`, depth + 1)
        })
      } else {
        // Handle objects
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const newPath = path ? `${path}.${key}` : key
            this.scanObject(obj[key], location, results, newPath, depth + 1)
          }
        }
      }
    }
  }

  private scanString(value: string, location: string, path: string, results: DetectionResult[]): void {
    if (!value || typeof value !== "string" || value.length > this.options.maxPayloadSize) {
      return
    }

    // Skip scanning sensitive parameters (like passwords)
    if (this.isSensitiveParam(path)) {
      return
    }

    // Check for XSS
    if (this.options.detectionRules.xss.enabled) {
      for (const pattern of this.options.detectionRules.xss.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "XSS",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for SQL Injection
    if (this.options.detectionRules.sqlInjection.enabled) {
      for (const pattern of this.options.detectionRules.sqlInjection.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "SQL_INJECTION",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for Command Injection
    if (this.options.detectionRules.commandInjection.enabled) {
      for (const pattern of this.options.detectionRules.commandInjection.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "COMMAND_INJECTION",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for Path Traversal
    if (this.options.detectionRules.pathTraversal.enabled) {
      for (const pattern of this.options.detectionRules.pathTraversal.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "PATH_TRAVERSAL",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for LDAP Injection
    if (this.options.detectionRules.ldapInjection.enabled) {
      for (const pattern of this.options.detectionRules.ldapInjection.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "LDAP_INJECTION",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for SSRF
    if (this.options.detectionRules.ssrf.enabled) {
      for (const pattern of this.options.detectionRules.ssrf.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "SSRF",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for Template Injection
    if (this.options.detectionRules.templateInjection.enabled) {
      for (const pattern of this.options.detectionRules.templateInjection.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "TEMPLATE_INJECTION",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }

    // Check for Custom Patterns
    if (this.options.detectionRules.customPatterns.enabled) {
      for (const pattern of this.options.detectionRules.customPatterns.patterns) {
        if (pattern.test(value)) {
          results.push({
            type: "CUSTOM_PATTERN",
            location,
            path,
            pattern: pattern.toString(),
            value: this.sanitizeValue(value),
          })
          break
        }
      }
    }
  }

  private isSensitiveParam(path: string): boolean {
    if (!path) return false
    const paramName = path.split(".").pop()?.split("[").shift()?.toLowerCase()
    return paramName ? this.options.sensitiveParamNames.includes(paramName) : false
  }

  private sanitizeValue(value: string): string {
    // Truncate long values
    if (value.length > 100) {
      return `${value.substring(0, 100)}... (truncated, total length: ${value.length})`
    }
    return value
  }

  private getRequestInfo(req: Request): RequestInfo {
    return {
      method: req.method,
      path: req.path,
      ip: this.getClientIp(req),
      userAgent: req.headers["user-agent"] || "unknown",
      timestamp: new Date().toISOString(),
      requestId: (req.headers["x-request-id"] as string) || this.generateRequestId(),
    }
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"] as string
    const realIp = req.headers["x-real-ip"] as string
    const cfConnectingIp = req.headers["cf-connecting-ip"] as string

    if (forwarded) {
      return forwarded.split(",")[0].trim()
    }

    if (realIp) {
      return realIp
    }

    if (cfConnectingIp) {
      return cfConnectingIp
    }

    return req.ip || req.connection.remoteAddress || "unknown"
  }

  private generateRequestId(): string {
    return createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").substring(0, 16)
  }

  private handleDetection(
    detectionResults: DetectionResult[],
    requestInfo: RequestInfo,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Log the detection
    const logData = {
      level: "warn",
      message: "Suspicious payload detected",
      detections: detectionResults,
      request: requestInfo,
    }

    this.logger.warn(JSON.stringify(logData))

    // If in log-only mode, allow the request to proceed
    if (this.options.logOnly) {
      return next()
    }

    // Otherwise, block the request
    throw new HttpException(
      {
        statusCode: this.options.blockStatusCode,
        message: this.options.blockMessage,
        error: "Bad Request",
        requestId: requestInfo.requestId,
      },
      this.options.blockStatusCode,
    )
  }

  // Method to get current configuration (useful for debugging)
  getConfiguration(): PayloadSanitizerOptions {
    return { ...this.options }
  }

  // Method to update configuration at runtime
  updateConfiguration(newConfig: Partial<PayloadSanitizerOptions>): void {
    Object.assign(this.options, newConfig)
  }
}

interface DetectionResult {
  type: string
  location: string
  path: string
  pattern: string
  value: string
}

interface RequestInfo {
  method: string
  path: string
  ip: string
  userAgent: string
  timestamp: string
  requestId: string
}
