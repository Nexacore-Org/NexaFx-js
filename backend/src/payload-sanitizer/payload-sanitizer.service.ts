import { Injectable, Logger } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { PayloadSanitizerOptions } from "./payload-sanitizer.middleware"

export interface PayloadSanitizerStats {
  totalRequests: number
  blockedRequests: number
  detectionsByType: Record<string, number>
  topBlockedIPs: Array<{ ip: string; count: number }>
  topBlockedPaths: Array<{ path: string; count: number }>
  lastDetections: Array<{
    timestamp: string
    type: string
    path: string
    ip: string
  }>
}

@Injectable()
export class PayloadSanitizerService {
  private readonly logger = new Logger(PayloadSanitizerService.name)
  private stats: PayloadSanitizerStats = {
    totalRequests: 0,
    blockedRequests: 0,
    detectionsByType: {},
    topBlockedIPs: [],
    topBlockedPaths: [],
    lastDetections: [],
  }

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validate a string against all configured detection rules
   */
  validateString(
    value: string,
    options?: Partial<PayloadSanitizerOptions>,
  ): {
    isValid: boolean
    detections: Array<{ type: string; pattern: string }>
  } {
    if (!value || typeof value !== "string") {
      return { isValid: true, detections: [] }
    }

    const detections: Array<{ type: string; pattern: string }> = []
    const config = this.getDefaultConfiguration()

    // Apply custom options if provided
    if (options) {
      Object.assign(config, options)
    }

    // Check for XSS
    if (config.detectionRules.xss.enabled) {
      for (const pattern of config.detectionRules.xss.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "XSS", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for SQL Injection
    if (config.detectionRules.sqlInjection.enabled) {
      for (const pattern of config.detectionRules.sqlInjection.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "SQL_INJECTION", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for Command Injection
    if (config.detectionRules.commandInjection.enabled) {
      for (const pattern of config.detectionRules.commandInjection.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "COMMAND_INJECTION", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for Path Traversal
    if (config.detectionRules.pathTraversal.enabled) {
      for (const pattern of config.detectionRules.pathTraversal.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "PATH_TRAVERSAL", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for LDAP Injection
    if (config.detectionRules.ldapInjection.enabled) {
      for (const pattern of config.detectionRules.ldapInjection.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "LDAP_INJECTION", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for SSRF
    if (config.detectionRules.ssrf.enabled) {
      for (const pattern of config.detectionRules.ssrf.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "SSRF", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for Template Injection
    if (config.detectionRules.templateInjection.enabled) {
      for (const pattern of config.detectionRules.templateInjection.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "TEMPLATE_INJECTION", pattern: pattern.toString() })
          break
        }
      }
    }

    // Check for Custom Patterns
    if (config.detectionRules.customPatterns.enabled) {
      for (const pattern of config.detectionRules.customPatterns.patterns) {
        if (pattern.test(value)) {
          detections.push({ type: "CUSTOM_PATTERN", pattern: pattern.toString() })
          break
        }
      }
    }

    return {
      isValid: detections.length === 0,
      detections,
    }
  }

  /**
   * Record a detection for statistics
   */
  recordDetection(type: string, path: string, ip: string): void {
    // Update detection counts by type
    this.stats.detectionsByType[type] = (this.stats.detectionsByType[type] || 0) + 1
    this.stats.blockedRequests++

    // Update top blocked IPs
    const ipEntry = this.stats.topBlockedIPs.find((entry) => entry.ip === ip)
    if (ipEntry) {
      ipEntry.count++
    } else {
      this.stats.topBlockedIPs.push({ ip, count: 1 })
    }

    // Update top blocked paths
    const pathEntry = this.stats.topBlockedPaths.find((entry) => entry.path === path)
    if (pathEntry) {
      pathEntry.count++
    } else {
      this.stats.topBlockedPaths.push({ path, count: 1 })
    }

    // Add to recent detections
    this.stats.lastDetections.unshift({
      timestamp: new Date().toISOString(),
      type,
      path,
      ip,
    })

    // Keep only the last 100 detections
    if (this.stats.lastDetections.length > 100) {
      this.stats.lastDetections.pop()
    }

    // Sort top lists
    this.stats.topBlockedIPs.sort((a, b) => b.count - a.count)
    this.stats.topBlockedPaths.sort((a, b) => b.count - a.count)

    // Keep only top 10
    this.stats.topBlockedIPs = this.stats.topBlockedIPs.slice(0, 10)
    this.stats.topBlockedPaths = this.stats.topBlockedPaths.slice(0, 10)
  }

  /**
   * Record a request for statistics
   */
  recordRequest(): void {
    this.stats.totalRequests++
  }

  /**
   * Get current statistics
   */
  getStatistics(): PayloadSanitizerStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      detectionsByType: {},
      topBlockedIPs: [],
      topBlockedPaths: [],
      lastDetections: [],
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): PayloadSanitizerOptions {
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
      enabled: true,
      logOnly: false,
      scanJsonBody: true,
      scanFormBody: true,
      scanQueryParams: true,
      scanHeaders: false,
      maxPayloadSize: 100 * 1024, // 100KB
      blockStatusCode: 400,
      blockMessage: "Request blocked due to suspicious content",
      sensitiveParamNames: ["password", "token", "key", "secret", "credential"],
      excludedRoutes: ["/health", "/metrics"],
      excludedContentTypes: ["multipart/form-data"],
      detectionRules: {
        xss: {
          enabled: true,
          patterns: xssPatterns,
        },
        sqlInjection: {
          enabled: true,
          patterns: sqlInjectionPatterns,
        },
        commandInjection: {
          enabled: true,
          patterns: commandInjectionPatterns,
        },
        pathTraversal: {
          enabled: true,
          patterns: pathTraversalPatterns,
        },
        ldapInjection: {
          enabled: true,
          patterns: ldapInjectionPatterns,
        },
        ssrf: {
          enabled: true,
          patterns: ssrfPatterns,
        },
        templateInjection: {
          enabled: true,
          patterns: templateInjectionPatterns,
        },
        customPatterns: {
          enabled: false,
          patterns: [],
        },
      },
    }
  }
}
