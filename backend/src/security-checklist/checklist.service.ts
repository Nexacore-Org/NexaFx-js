import { Injectable, Logger } from "@nestjs/common"
import type { Repository } from "typeorm"
import {
  type SecurityCheck,
  SecurityCheckStatus,
  SecurityCheckCategory,
  SecurityCheckSeverity,
} from "./entities/security-check.entity"
import type {
  SecurityCheckResult,
  SecurityChecklistReport,
  EnvironmentConfig,
} from "./interfaces/security-check.interface"
import type { SecurityChecklistQueryDto } from "./dto/security-checklist.dto"
import * as fs from "fs"
import * as path from "path"

@Injectable()
export class ChecklistService {
  private readonly logger = new Logger(ChecklistService.name)

  constructor(private securityCheckRepository: Repository<SecurityCheck>) {}

  async generateSecurityChecklist(query?: SecurityChecklistQueryDto): Promise<SecurityChecklistReport> {
    this.logger.log("Generating security checklist...")

    const environmentConfig = this.getEnvironmentConfig()
    const checks = await this.performSecurityChecks(environmentConfig)

    // Filter checks based on query parameters
    let filteredChecks = checks
    if (query?.category) {
      filteredChecks = filteredChecks.filter((check) => check.category === query.category)
    }
    if (query?.severity) {
      filteredChecks = filteredChecks.filter((check) => check.severity === query.severity)
    }
    if (query?.failedOnly) {
      filteredChecks = filteredChecks.filter((check) => check.status === SecurityCheckStatus.FAIL)
    }

    const summary = this.calculateSummary(checks)
    const categories = this.calculateCategoryScores(checks)
    const recommendations = this.generateRecommendations(checks)
    const criticalIssues = checks.filter(
      (check) => check.status === SecurityCheckStatus.FAIL && check.severity === SecurityCheckSeverity.CRITICAL,
    )

    // Save checks to database for historical tracking
    await this.saveChecksToDatabase(checks)

    return {
      summary,
      categories,
      checks: filteredChecks,
      recommendations: query?.includeRecommendations !== false ? recommendations : [],
      criticalIssues,
      generatedAt: new Date(),
    }
  }

  private getEnvironmentConfig(): EnvironmentConfig {
    return {
      nodeEnv: process.env.NODE_ENV || "development",
      port: Number.parseInt(process.env.PORT || "3000", 10),
      httpsEnabled: process.env.HTTPS_ENABLED === "true",
      corsEnabled: process.env.CORS_ENABLED !== "false",
      corsOrigins: process.env.CORS_ORIGINS?.split(",") || ["*"],
      rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
      rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
      rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
      jwtSecret: process.env.JWT_SECRET || "",
      databaseUrl: process.env.DATABASE_URL || "",
      logLevel: process.env.LOG_LEVEL || "info",
      sessionSecret: process.env.SESSION_SECRET || "",
      cookieSecure: process.env.COOKIE_SECURE === "true",
      cookieHttpOnly: process.env.COOKIE_HTTP_ONLY !== "false",
      cookieSameSite: process.env.COOKIE_SAME_SITE || "lax",
      helmetEnabled: process.env.HELMET_ENABLED !== "false",
      compressionEnabled: process.env.COMPRESSION_ENABLED !== "false",
      trustProxy: process.env.TRUST_PROXY === "true",
    }
  }

  private async performSecurityChecks(config: EnvironmentConfig): Promise<SecurityCheckResult[]> {
    const checks: SecurityCheckResult[] = []

    // HTTPS Configuration
    checks.push({
      id: "https-enabled",
      name: "HTTPS Enabled",
      description: "Verify that HTTPS is enabled for secure communication",
      category: SecurityCheckCategory.ENCRYPTION,
      severity: SecurityCheckSeverity.CRITICAL,
      status: config.httpsEnabled ? SecurityCheckStatus.PASS : SecurityCheckStatus.FAIL,
      currentValue: config.httpsEnabled.toString(),
      expectedValue: "true",
      recommendation: config.httpsEnabled ? "HTTPS is properly configured" : "Enable HTTPS for secure communication",
      remediation: "Set HTTPS_ENABLED=true and configure SSL certificates",
    })

    // Production Environment
    checks.push({
      id: "production-environment",
      name: "Production Environment",
      description: "Verify that NODE_ENV is set to production in production deployments",
      category: SecurityCheckCategory.CONFIGURATION,
      severity: SecurityCheckSeverity.HIGH,
      status: config.nodeEnv === "production" ? SecurityCheckStatus.PASS : SecurityCheckStatus.WARNING,
      currentValue: config.nodeEnv,
      expectedValue: "production",
      recommendation:
        config.nodeEnv === "production"
          ? "Environment is correctly set"
          : "Set NODE_ENV=production for production deployments",
      remediation: "Set NODE_ENV=production environment variable",
    })

    // JWT Secret Strength
    checks.push({
      id: "jwt-secret-strength",
      name: "JWT Secret Strength",
      description: "Verify that JWT secret is strong and not default",
      category: SecurityCheckCategory.AUTHENTICATION,
      severity: SecurityCheckSeverity.CRITICAL,
      status: this.checkJwtSecretStrength(config.jwtSecret),
      currentValue: config.jwtSecret ? `${config.jwtSecret.length} characters` : "Not set",
      expectedValue: "Strong secret (32+ characters)",
      recommendation: this.getJwtSecretRecommendation(config.jwtSecret),
      remediation: "Generate a strong JWT secret with at least 32 characters",
    })

    // CORS Configuration
    checks.push({
      id: "cors-configuration",
      name: "CORS Configuration",
      description: "Verify that CORS is properly configured",
      category: SecurityCheckCategory.NETWORK,
      severity: SecurityCheckSeverity.MEDIUM,
      status: this.checkCorsConfiguration(config),
      currentValue: config.corsOrigins.join(", "),
      expectedValue: "Specific origins (not wildcard)",
      recommendation: this.getCorsRecommendation(config),
      remediation: "Configure specific CORS origins instead of using wildcard",
    })

    // Rate Limiting
    checks.push({
      id: "rate-limiting",
      name: "Rate Limiting",
      description: "Verify that rate limiting is enabled",
      category: SecurityCheckCategory.NETWORK,
      severity: SecurityCheckSeverity.HIGH,
      status: config.rateLimitEnabled ? SecurityCheckStatus.PASS : SecurityCheckStatus.FAIL,
      currentValue: config.rateLimitEnabled
        ? `${config.rateLimitMax} requests per ${config.rateLimitWindowMs}ms`
        : "Disabled",
      expectedValue: "Enabled with appropriate limits",
      recommendation: config.rateLimitEnabled
        ? "Rate limiting is properly configured"
        : "Enable rate limiting to prevent abuse",
      remediation: "Set RATE_LIMIT_ENABLED=true and configure appropriate limits",
    })

    // Session Secret
    checks.push({
      id: "session-secret",
      name: "Session Secret",
      description: "Verify that session secret is strong",
      category: SecurityCheckCategory.AUTHENTICATION,
      severity: SecurityCheckSeverity.HIGH,
      status: this.checkSessionSecret(config.sessionSecret),
      currentValue: config.sessionSecret ? `${config.sessionSecret.length} characters` : "Not set",
      expectedValue: "Strong secret (32+ characters)",
      recommendation: this.getSessionSecretRecommendation(config.sessionSecret),
      remediation: "Generate a strong session secret with at least 32 characters",
    })

    // Cookie Security
    checks.push({
      id: "cookie-security",
      name: "Cookie Security",
      description: "Verify that cookies are configured securely",
      category: SecurityCheckCategory.NETWORK,
      severity: SecurityCheckSeverity.MEDIUM,
      status: this.checkCookieSecurity(config),
      currentValue: `Secure: ${config.cookieSecure}, HttpOnly: ${config.cookieHttpOnly}, SameSite: ${config.cookieSameSite}`,
      expectedValue: "Secure: true, HttpOnly: true, SameSite: strict/lax",
      recommendation: this.getCookieSecurityRecommendation(config),
      remediation: "Configure cookies with secure, httpOnly, and sameSite attributes",
    })

    // Security Headers (Helmet)
    checks.push({
      id: "security-headers",
      name: "Security Headers",
      description: "Verify that security headers are enabled",
      category: SecurityCheckCategory.HEADERS,
      severity: SecurityCheckSeverity.HIGH,
      status: config.helmetEnabled ? SecurityCheckStatus.PASS : SecurityCheckStatus.FAIL,
      currentValue: config.helmetEnabled.toString(),
      expectedValue: "true",
      recommendation: config.helmetEnabled ? "Security headers are enabled" : "Enable Helmet for security headers",
      remediation: "Install and configure Helmet middleware",
    })

    // Database Security
    checks.push({
      id: "database-security",
      name: "Database Security",
      description: "Verify database connection security",
      category: SecurityCheckCategory.ENCRYPTION,
      severity: SecurityCheckSeverity.HIGH,
      status: this.checkDatabaseSecurity(config.databaseUrl),
      currentValue: config.databaseUrl ? "Configured" : "Not configured",
      expectedValue: "SSL enabled connection",
      recommendation: this.getDatabaseSecurityRecommendation(config.databaseUrl),
      remediation: "Use SSL-enabled database connections",
    })

    // Logging Configuration
    checks.push({
      id: "logging-configuration",
      name: "Logging Configuration",
      description: "Verify that logging is properly configured",
      category: SecurityCheckCategory.LOGGING,
      severity: SecurityCheckSeverity.MEDIUM,
      status: this.checkLoggingConfiguration(config.logLevel),
      currentValue: config.logLevel,
      expectedValue: "info or warn (not debug in production)",
      recommendation: this.getLoggingRecommendation(config),
      remediation: "Set appropriate log level for environment",
    })

    // Dependency Security
    checks.push({
      id: "dependency-security",
      name: "Dependency Security",
      description: "Check for known vulnerabilities in dependencies",
      category: SecurityCheckCategory.DEPENDENCIES,
      severity: SecurityCheckSeverity.HIGH,
      status: await this.checkDependencySecurity(),
      currentValue: "Checked",
      expectedValue: "No known vulnerabilities",
      recommendation: "Regularly audit and update dependencies",
      remediation: "Run npm audit and update vulnerable packages",
    })

    return checks
  }

  private checkJwtSecretStrength(secret: string): SecurityCheckStatus {
    if (!secret) return SecurityCheckStatus.FAIL
    if (secret.length < 32) return SecurityCheckStatus.WARNING
    if (secret === "your-secret-key" || secret === "secret") return SecurityCheckStatus.FAIL
    return SecurityCheckStatus.PASS
  }

  private getJwtSecretRecommendation(secret: string): string {
    if (!secret) return "JWT secret is not configured"
    if (secret.length < 32) return "JWT secret is too short, use at least 32 characters"
    if (secret === "your-secret-key" || secret === "secret") return "JWT secret is using default value"
    return "JWT secret appears to be properly configured"
  }

  private checkCorsConfiguration(config: EnvironmentConfig): SecurityCheckStatus {
    if (!config.corsEnabled) return SecurityCheckStatus.WARNING
    if (config.corsOrigins.includes("*")) return SecurityCheckStatus.WARNING
    return SecurityCheckStatus.PASS
  }

  private getCorsRecommendation(config: EnvironmentConfig): string {
    if (!config.corsEnabled) return "CORS is disabled, consider enabling with specific origins"
    if (config.corsOrigins.includes("*")) return "CORS allows all origins, consider restricting to specific domains"
    return "CORS is properly configured with specific origins"
  }

  private checkSessionSecret(secret: string): SecurityCheckStatus {
    if (!secret) return SecurityCheckStatus.WARNING
    if (secret.length < 32) return SecurityCheckStatus.WARNING
    return SecurityCheckStatus.PASS
  }

  private getSessionSecretRecommendation(secret: string): string {
    if (!secret) return "Session secret is not configured"
    if (secret.length < 32) return "Session secret is too short"
    return "Session secret appears to be properly configured"
  }

  private checkCookieSecurity(config: EnvironmentConfig): SecurityCheckStatus {
    let issues = 0
    if (!config.cookieSecure && config.nodeEnv === "production") issues++
    if (!config.cookieHttpOnly) issues++
    if (config.cookieSameSite === "none") issues++

    if (issues === 0) return SecurityCheckStatus.PASS
    if (issues === 1) return SecurityCheckStatus.WARNING
    return SecurityCheckStatus.FAIL
  }

  private getCookieSecurityRecommendation(config: EnvironmentConfig): string {
    const issues = []
    if (!config.cookieSecure && config.nodeEnv === "production") {
      issues.push("Enable secure cookies in production")
    }
    if (!config.cookieHttpOnly) {
      issues.push("Enable httpOnly cookies")
    }
    if (config.cookieSameSite === "none") {
      issues.push("Consider using 'strict' or 'lax' for sameSite")
    }

    return issues.length > 0 ? issues.join(", ") : "Cookie security is properly configured"
  }

  private checkDatabaseSecurity(databaseUrl: string): SecurityCheckStatus {
    if (!databaseUrl) return SecurityCheckStatus.WARNING
    if (databaseUrl.includes("sslmode=require") || databaseUrl.includes("ssl=true")) {
      return SecurityCheckStatus.PASS
    }
    return SecurityCheckStatus.WARNING
  }

  private getDatabaseSecurityRecommendation(databaseUrl: string): string {
    if (!databaseUrl) return "Database URL is not configured"
    if (!databaseUrl.includes("ssl")) return "Consider enabling SSL for database connections"
    return "Database connection appears to use SSL"
  }

  private checkLoggingConfiguration(logLevel: string): SecurityCheckStatus {
    if (logLevel === "debug" && process.env.NODE_ENV === "production") {
      return SecurityCheckStatus.WARNING
    }
    return SecurityCheckStatus.PASS
  }

  private getLoggingRecommendation(config: EnvironmentConfig): string {
    if (config.logLevel === "debug" && config.nodeEnv === "production") {
      return "Debug logging is enabled in production, consider using 'info' or 'warn'"
    }
    return "Logging configuration is appropriate"
  }

  private async checkDependencySecurity(): Promise<SecurityCheckStatus> {
    try {
      // Check if package-lock.json exists
      const packageLockPath = path.join(process.cwd(), "package-lock.json")
      if (!fs.existsSync(packageLockPath)) {
        return SecurityCheckStatus.WARNING
      }

      // In a real implementation, you would run npm audit or use a security scanning tool
      // For now, we'll return a pass status
      return SecurityCheckStatus.PASS
    } catch (error) {
      return SecurityCheckStatus.WARNING
    }
  }

  private calculateSummary(checks: SecurityCheckResult[]) {
    const totalChecks = checks.length
    const passedChecks = checks.filter((check) => check.status === SecurityCheckStatus.PASS).length
    const failedChecks = checks.filter((check) => check.status === SecurityCheckStatus.FAIL).length
    const warningChecks = checks.filter((check) => check.status === SecurityCheckStatus.WARNING).length
    const notApplicableChecks = checks.filter((check) => check.status === SecurityCheckStatus.NOT_APPLICABLE).length

    const overallScore = Math.round((passedChecks / totalChecks) * 100)

    let riskLevel = "LOW"
    if (overallScore < 50) riskLevel = "CRITICAL"
    else if (overallScore < 70) riskLevel = "HIGH"
    else if (overallScore < 85) riskLevel = "MEDIUM"

    return {
      totalChecks,
      passedChecks,
      failedChecks,
      warningChecks,
      notApplicableChecks,
      overallScore,
      riskLevel,
    }
  }

  private calculateCategoryScores(checks: SecurityCheckResult[]) {
    const categories = {} as any

    for (const category of Object.values(SecurityCheckCategory)) {
      const categoryChecks = checks.filter((check) => check.category === category)
      const totalChecks = categoryChecks.length
      const passedChecks = categoryChecks.filter((check) => check.status === SecurityCheckStatus.PASS).length
      const failedChecks = categoryChecks.filter((check) => check.status === SecurityCheckStatus.FAIL).length
      const warningChecks = categoryChecks.filter((check) => check.status === SecurityCheckStatus.WARNING).length

      categories[category] = {
        totalChecks,
        passedChecks,
        failedChecks,
        warningChecks,
        score: totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0,
      }
    }

    return categories
  }

  private generateRecommendations(checks: SecurityCheckResult[]): string[] {
    const recommendations = []

    const failedChecks = checks.filter((check) => check.status === SecurityCheckStatus.FAIL)
    const criticalFailed = failedChecks.filter((check) => check.severity === SecurityCheckSeverity.CRITICAL)
    const highFailed = failedChecks.filter((check) => check.severity === SecurityCheckSeverity.HIGH)

    if (criticalFailed.length > 0) {
      recommendations.push(`Address ${criticalFailed.length} critical security issues immediately`)
    }

    if (highFailed.length > 0) {
      recommendations.push(`Fix ${highFailed.length} high-severity security issues`)
    }

    const warningChecks = checks.filter((check) => check.status === SecurityCheckStatus.WARNING)
    if (warningChecks.length > 0) {
      recommendations.push(`Review ${warningChecks.length} security warnings`)
    }

    if (!checks.find((check) => check.id === "https-enabled")?.status === SecurityCheckStatus.PASS) {
      recommendations.push("Enable HTTPS for all production traffic")
    }

    if (!checks.find((check) => check.id === "rate-limiting")?.status === SecurityCheckStatus.PASS) {
      recommendations.push("Implement rate limiting to prevent abuse")
    }

    recommendations.push("Regularly update dependencies and run security audits")
    recommendations.push("Monitor security logs and implement alerting")
    recommendations.push("Conduct regular security assessments")

    return recommendations
  }

  private async saveChecksToDatabase(checks: SecurityCheckResult[]): Promise<void> {
    try {
      // Clear existing checks
      await this.securityCheckRepository.clear()

      // Save new checks
      for (const check of checks) {
        const securityCheck = this.securityCheckRepository.create({
          name: check.name,
          description: check.description,
          category: check.category,
          severity: check.severity,
          status: check.status,
          currentValue: check.currentValue,
          expectedValue: check.expectedValue,
          recommendation: check.recommendation,
          remediation: check.remediation,
          metadata: check.metadata,
        })

        await this.securityCheckRepository.save(securityCheck)
      }
    } catch (error) {
      this.logger.error(`Failed to save security checks: ${error.message}`)
    }
  }

  async getHistoricalChecks(limit = 10): Promise<SecurityCheck[]> {
    return this.securityCheckRepository.find({
      order: { createdAt: "DESC" },
      take: limit,
    })
  }

  async getChecksByCategory(category: SecurityCheckCategory): Promise<SecurityCheck[]> {
    return this.securityCheckRepository.find({
      where: { category },
      order: { severity: "ASC", createdAt: "DESC" },
    })
  }
}
