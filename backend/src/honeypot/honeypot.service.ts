import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { HoneypotAccess, HoneypotThreatLevel, HoneypotAccessType } from "./entities/honeypot-access.entity"
import type { HoneypotConfig, AccessAttemptAnalysis } from "./interfaces/honeypot.interface"
import type { NotificationService } from "../notifications/notification.service"

@Injectable()
export class HoneypotService {
  private readonly logger = new Logger(HoneypotService.name)
  private readonly config: HoneypotConfig
  private readonly suspiciousIPs = new Set<string>()
  private readonly blockedIPs = new Set<string>();

  constructor(
    private honeypotAccessRepository: Repository<HoneypotAccess>,
    private notificationService: NotificationService,
    @InjectRepository(HoneypotAccess)
  ) {
    this.config = {
      enableEmailAlerts: process.env.HONEYPOT_EMAIL_ALERTS === "true",
      enableSlackAlerts: process.env.HONEYPOT_SLACK_ALERTS === "true",
      enableDashboardAlerts: process.env.HONEYPOT_DASHBOARD_ALERTS !== "false",
      alertThreshold: Number.parseInt(process.env.HONEYPOT_ALERT_THRESHOLD || "3", 10),
      blockSuspiciousIPs: process.env.HONEYPOT_BLOCK_IPS === "true",
      geolocationEnabled: process.env.HONEYPOT_GEOLOCATION === "true",
      fingerprintingEnabled: process.env.HONEYPOT_FINGERPRINTING === "true",
    }
  }

  async logAccess(
    route: string,
    method: string,
    ipAddress: string,
    headers: Record<string, string>,
    queryParams?: Record<string, any>,
    body?: any,
  ): Promise<HoneypotAccess> {
    this.logger.warn(`Honeypot access detected: ${method} ${route} from ${ipAddress}`)

    // Analyze the access attempt
    const analysis = this.analyzeAccessAttempt(route, method, ipAddress, headers, queryParams, body)

    // Generate fingerprint
    const fingerprint = this.config.fingerprintingEnabled ? this.generateFingerprint(ipAddress, headers) : undefined

    // Get geolocation (mock implementation)
    const geolocation = this.config.geolocationEnabled ? await this.getGeolocation(ipAddress) : undefined

    // Create access log
    const accessLog = this.honeypotAccessRepository.create({
      route,
      method,
      ipAddress,
      userAgent: headers["user-agent"],
      referer: headers.referer,
      headers,
      queryParams,
      body,
      accessType: this.determineAccessType(route, method, queryParams, body),
      threatLevel: analysis.threatLevel as HoneypotThreatLevel,
      description: analysis.riskFactors.join(", "),
      fingerprint,
      geolocation,
    })

    const savedLog = await this.honeypotAccessRepository.save(accessLog)

    // Handle suspicious activity
    if (analysis.isSuspicious) {
      await this.handleSuspiciousActivity(savedLog, analysis)
    }

    // Send alerts if configured
    if (this.shouldSendAlert(analysis.threatLevel)) {
      await this.sendAlert(savedLog, analysis)
    }

    return savedLog
  }

  private analyzeAccessAttempt(
    route: string,
    method: string,
    ipAddress: string,
    headers: Record<string, string>,
    queryParams?: Record<string, any>,
    body?: any,
  ): AccessAttemptAnalysis {
    const riskFactors: string[] = []
    let threatLevel = HoneypotThreatLevel.LOW
    let isSuspicious = false

    // Check for bot indicators
    const userAgent = headers["user-agent"]?.toLowerCase() || ""
    const isBot = this.detectBot(userAgent)

    if (isBot) {
      riskFactors.push("Bot detected")
      threatLevel = HoneypotThreatLevel.MEDIUM
    }

    // Check for suspicious routes
    if (this.isSuspiciousRoute(route)) {
      riskFactors.push("Accessing sensitive honeypot route")
      threatLevel = HoneypotThreatLevel.HIGH
      isSuspicious = true
    }

    // Check for SQL injection attempts
    if (this.detectSQLInjection(queryParams, body)) {
      riskFactors.push("SQL injection attempt detected")
      threatLevel = HoneypotThreatLevel.CRITICAL
      isSuspicious = true
    }

    // Check for XSS attempts
    if (this.detectXSS(queryParams, body)) {
      riskFactors.push("XSS attempt detected")
      threatLevel = HoneypotThreatLevel.HIGH
      isSuspicious = true
    }

    // Check for directory traversal
    if (this.detectDirectoryTraversal(route, queryParams)) {
      riskFactors.push("Directory traversal attempt")
      threatLevel = HoneypotThreatLevel.HIGH
      isSuspicious = true
    }

    // Check for suspicious headers
    if (this.detectSuspiciousHeaders(headers)) {
      riskFactors.push("Suspicious headers detected")
      threatLevel = HoneypotThreatLevel.MEDIUM
      isSuspicious = true
    }

    // Check if IP is already flagged
    if (this.suspiciousIPs.has(ipAddress)) {
      riskFactors.push("Previously flagged IP")
      threatLevel = HoneypotThreatLevel.HIGH
      isSuspicious = true
    }

    const recommendedAction = this.getRecommendedAction(threatLevel, isSuspicious)

    return {
      isBot,
      isSuspicious,
      threatLevel,
      riskFactors,
      recommendedAction,
    }
  }

  private detectBot(userAgent: string): boolean {
    const botIndicators = [
      "bot",
      "crawler",
      "spider",
      "scraper",
      "curl",
      "wget",
      "python",
      "requests",
      "http",
      "scanner",
    ]

    return botIndicators.some((indicator) => userAgent.includes(indicator))
  }

  private isSuspiciousRoute(route: string): boolean {
    const suspiciousPatterns = [
      "/admin/secret",
      "/admin/config",
      "/admin/users",
      "/admin/database",
      "/admin/logs",
      "/admin/backup",
      "/admin/system",
      "/admin/debug",
      "/admin/test",
      "/admin/dev",
      "/wp-admin",
      "/phpmyadmin",
      "/admin.php",
      "/administrator",
      "/manager",
      "/console",
    ]

    return suspiciousPatterns.some((pattern) => route.includes(pattern))
  }

  private detectSQLInjection(queryParams?: Record<string, any>, body?: any): boolean {
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+set/i,
      /or\s+1\s*=\s*1/i,
      /and\s+1\s*=\s*1/i,
      /'\s*or\s*'/i,
      /--/,
      /\/\*/,
      /xp_cmdshell/i,
    ]

    const checkValue = (value: any): boolean => {
      if (typeof value === "string") {
        return sqlPatterns.some((pattern) => pattern.test(value))
      }
      if (typeof value === "object" && value !== null) {
        return Object.values(value).some(checkValue)
      }
      return false
    }

    return checkValue(queryParams) || checkValue(body)
  }

  private detectXSS(queryParams?: Record<string, any>, body?: any): boolean {
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /eval\s*\(/i,
      /alert\s*\(/i,
    ]

    const checkValue = (value: any): boolean => {
      if (typeof value === "string") {
        return xssPatterns.some((pattern) => pattern.test(value))
      }
      if (typeof value === "object" && value !== null) {
        return Object.values(value).some(checkValue)
      }
      return false
    }

    return checkValue(queryParams) || checkValue(body)
  }

  private detectDirectoryTraversal(route: string, queryParams?: Record<string, any>): boolean {
    const traversalPatterns = [/\.\./g, /\/etc\/passwd/i, /\/windows\/system32/i, /\.\.\//, /\.\.\\\/]

    const checkValue = (value: any): boolean => {
      if (typeof value === "string") {
        return traversalPatterns.some((pattern) => pattern.test(value))
      }
      return false
    }

    return traversalPatterns.some((pattern) => pattern.test(route)) || checkValue(queryParams)
  }

  private detectSuspiciousHeaders(headers: Record<string, string>): boolean {
    const suspiciousHeaders = ["x-forwarded-for", "x-real-ip", "x-originating-ip"]
    const suspiciousValues = ["127.0.0.1", "localhost", "0.0.0.0"]

    return suspiciousHeaders.some((header) => {
      const value = headers[header]?.toLowerCase()
      return value && suspiciousValues.some((suspicious) => value.includes(suspicious))
    })
  }

  private getRecommendedAction(threatLevel: string, isSuspicious: boolean): string {
    if (threatLevel === HoneypotThreatLevel.CRITICAL) {
      return "Immediate IP blocking and security team notification required"
    }
    if (threatLevel === HoneypotThreatLevel.HIGH) {
      return "Monitor closely and consider IP blocking"
    }
    if (threatLevel === HoneypotThreatLevel.MEDIUM || isSuspicious) {
      return "Flag for monitoring and analysis"
    }
    return "Log for future reference"
  }

  private determineAccessType(
    route: string,
    method: string,
    queryParams?: Record<string, any>,
    body?: any,
  ): HoneypotAccessType {
    if (this.detectSQLInjection(queryParams, body)) {
      return HoneypotAccessType.PARAMETER_INJECTION
    }
    if (method === "POST" && body) {
      return HoneypotAccessType.BRUTE_FORCE
    }
    return HoneypotAccessType.ROUTE_ACCESS
  }

  private generateFingerprint(ipAddress: string, headers: Record<string, string>): string {
    const fingerprintData = {
      userAgent: headers["user-agent"] || "",
      acceptLanguage: headers["accept-language"] || "",
      acceptEncoding: headers["accept-encoding"] || "",
      connection: headers.connection || "",
    }

    return crypto.createHash("sha256").update(JSON.stringify(fingerprintData)).digest("hex").substring(0, 16)
  }

  private async getGeolocation(ipAddress: string): Promise<string | undefined> {
    // Mock geolocation - in production, you'd use a service like MaxMind or ipapi
    if (ipAddress.startsWith("192.168.") || ipAddress.startsWith("10.") || ipAddress === "127.0.0.1") {
      return "Local Network"
    }
    return "Unknown Location"
  }

  private async handleSuspiciousActivity(accessLog: HoneypotAccess, analysis: AccessAttemptAnalysis): Promise<void> {
    this.suspiciousIPs.add(accessLog.ipAddress)

    // Check if we should block the IP
    if (this.config.blockSuspiciousIPs && analysis.threatLevel === HoneypotThreatLevel.CRITICAL) {
      this.blockedIPs.add(accessLog.ipAddress)
      this.logger.error(`IP ${accessLog.ipAddress} has been blocked due to critical threat level`)
    }

    // Check for repeated attempts
    const recentAttempts = await this.getRecentAttemptsByIP(accessLog.ipAddress, 3600000) // 1 hour
    if (recentAttempts >= this.config.alertThreshold) {
      this.logger.error(`IP ${accessLog.ipAddress} has made ${recentAttempts} attempts in the last hour`)
    }
  }

  private shouldSendAlert(threatLevel: string): boolean {
    return (
      threatLevel === HoneypotThreatLevel.HIGH ||
      threatLevel === HoneypotThreatLevel.CRITICAL ||
      this.config.enableEmailAlerts ||
      this.config.enableSlackAlerts
    )
  }

  private async sendAlert(accessLog: HoneypotAccess, analysis: AccessAttemptAnalysis): Promise<void> {
    const alert: HoneypotAlert = {
      id: accessLog.id,
      route: accessLog.route,
      ipAddress: accessLog.ipAddress,
      threatLevel: accessLog.threatLevel,
      timestamp: accessLog.createdAt,
      userAgent: accessLog.userAgent,
      description: accessLog.description || "Suspicious access attempt detected",
      geolocation: accessLog.geolocation,
      recommendedAction: analysis.recommendedAction,
    }

    try {
      if (this.config.enableEmailAlerts) {
        await this.sendEmailAlert(alert)
      }

      if (this.config.enableSlackAlerts) {
        await this.sendSlackAlert(alert)
      }

      // Mark alert as sent
      await this.honeypotAccessRepository.update(accessLog.id, { alertSent: true })
    } catch (error) {
      this.logger.error(`Failed to send honeypot alert: ${error.message}`
    )
  }
}

private
async
sendEmailAlert(alert: HoneypotAlert)
: Promise<void>
{
  const subject = `🚨 Security Alert: Honeypot Access Detected - ${alert.threatLevel.toUpperCase()}`
  const template = "honeypot-alert"
  const context = {
    alert,
    timestamp: alert.timestamp.toISOString(),
    dashboardUrl: `${process.env.DASHBOARD_URL}/security/honeypot`,
  }

  // Get admin emails from environment or database
  const adminEmails = process.env.ADMIN_EMAILS?.split(",") || ["admin@example.com"]

  for (const email of adminEmails) {
    await this.notificationService.sendEmail(email.trim(), subject, template, context)
  }
}

private
async
sendSlackAlert(alert: HoneypotAlert)
: Promise<void>
{
  // Implementation would depend on your Slack integration
  this.logger.log(`Slack alert would be sent for honeypot access: ${alert.id}`)
}

async
getAccessLogs(query: HoneypotQueryDto)
: Promise<
{
  logs: HoneypotAccess[];
  total: number
}
>
{
  const queryBuilder = this.honeypotAccessRepository.createQueryBuilder("access")

  if (query.threatLevel) {
    queryBuilder.andWhere("access.threatLevel = :threatLevel", { threatLevel: query.threatLevel })
  }

  if (query.accessType) {
    queryBuilder.andWhere("access.accessType = :accessType", { accessType: query.accessType })
  }

  if (query.ipAddress) {
    queryBuilder.andWhere("access.ipAddress = :ipAddress", { ipAddress: query.ipAddress })
  }

  if (query.startDate && query.endDate) {
    queryBuilder.andWhere("access.createdAt BETWEEN :startDate AND :endDate", {
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
    })
  }

  const [logs, total] = await queryBuilder
    .orderBy("access.createdAt", "DESC")
    .limit(query.limit)
    .offset(query.offset)
    .getManyAndCount()

  return { logs, total }
}

async
getHoneypotStats()
: Promise<HoneypotStats>
{
  const [totalAttempts, uniqueIPs, topRoutes, topUserAgents, threatLevelDistribution, recentAttempts] =
    await Promise.all([
      this.honeypotAccessRepository.count(),
      this.honeypotAccessRepository
        .createQueryBuilder("access")
        .select("COUNT(DISTINCT access.ipAddress)", "count")
        .getRawOne()
        .then((result) => Number.parseInt(result.count, 10)),
      this.honeypotAccessRepository
        .createQueryBuilder("access")
        .select("access.route", "route")
        .addSelect("COUNT(*)", "count")
        .groupBy("access.route")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany(),
      this.honeypotAccessRepository
        .createQueryBuilder("access")
        .select("access.userAgent", "userAgent")
        .addSelect("COUNT(*)", "count")
        .where("access.userAgent IS NOT NULL")
        .groupBy("access.userAgent")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany(),
      this.honeypotAccessRepository
        .createQueryBuilder("access")
        .select("access.threatLevel", "threatLevel")
        .addSelect("COUNT(*)", "count")
        .groupBy("access.threatLevel")
        .getRawMany()
        .then((results) =>
          results.reduce(
            (acc, item) => {
              acc[item.threatLevel] = Number.parseInt(item.count, 10)
              return acc
            },
            {} as Record<string, number>,
          ),
        ),
      this.honeypotAccessRepository
        .createQueryBuilder("access")
        .where("access.createdAt > :date", { date: new Date(Date.now() - 24 * 60 * 60 * 1000) })
        .getCount(),
    ])

  return {
      totalAttempts,
      uniqueIPs,
      topRoutes: topRoutes.map((item) => ({ route: item.route, count: Number.parseInt(item.count, 10) })),
      topUserAgents: topUserAgents.map((item) => ({
        userAgent: item.userAgent,
        count: Number.parseInt(item.count, 10),
      })),
      threatLevelDistribution,
      recentAttempts,
      blockedIPs: this.blockedIPs.size,
    }
}

private
async
getRecentAttemptsByIP(ipAddress: string, timeWindowMs: number)
: Promise<number>
{
  const since = new Date(Date.now() - timeWindowMs)
  return this.honeypotAccessRepository.count({
      where: {
        ipAddress,
        createdAt: { $gte: since } as any,
      },
    })
}

isIPBlocked(ipAddress: string)
: boolean
{
  return this.blockedIPs.has(ipAddress)
}

async
blockIP(ipAddress: string)
: Promise<void>
{
  this.blockedIPs.add(ipAddress)
  this.logger.warn(`IP ${ipAddress} has been manually blocked`)
}

async
unblockIP(ipAddress: string)
: Promise<void>
{
  this.blockedIPs.delete(ipAddress)
  this.suspiciousIPs.delete(ipAddress)
  this.logger.log(`IP ${ipAddress} has been unblocked`)
}
}
