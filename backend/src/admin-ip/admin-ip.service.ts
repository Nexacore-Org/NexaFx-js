import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { type Repository, LessThan } from "typeorm"
import { AdminIpWhitelist, IpType, IpStatus } from "./entities/admin-ip-whitelist.entity"
import { AdminIpAccessLog, AccessResult, AccessType } from "./entities/admin-ip-access-log.entity"
import type {
  IpValidationResult,
  IpAccessAttempt,
  AdminIpConfig,
  IpWhitelistStats,
} from "./interfaces/admin-ip.interface"
import type { CreateAdminIpWhitelistDto, UpdateAdminIpWhitelistDto, BulkAddIpsDto } from "./dto/admin-ip.dto"
import type { AdminIpWhitelistQueryDto, AdminIpAccessLogQueryDto } from "./dto/admin-ip-query.dto"
import type { NotificationService } from "../notifications/notification.service"
import { isIP } from "net"

@Injectable()
export class AdminIpService {
  private readonly logger = new Logger(AdminIpService.name)
  private readonly config: AdminIpConfig
  private readonly blockedIps = new Map<string, Date>()
  private readonly accessAttempts = new Map<string, number>();

  constructor(
    private readonly notificationService: NotificationService,
    @InjectRepository(AdminIpWhitelist)
    private readonly whitelistRepository: Repository<AdminIpWhitelist>,
    @InjectRepository(AdminIpAccessLog)
    private readonly accessLogRepository: Repository<AdminIpAccessLog>,
  ) {
    this.config = {
      enableIpWhitelisting: process.env.ADMIN_IP_WHITELISTING_ENABLED !== "false",
      allowLocalhost: process.env.ADMIN_ALLOW_LOCALHOST !== "false",
      allowPrivateNetworks: process.env.ADMIN_ALLOW_PRIVATE_NETWORKS === "true",
      enableAccessLogging: process.env.ADMIN_IP_ACCESS_LOGGING !== "false",
      enableGeoLocation: process.env.ADMIN_IP_GEOLOCATION === "true",
      maxAccessAttempts: Number.parseInt(process.env.ADMIN_MAX_ACCESS_ATTEMPTS || "5", 10),
      blockDuration: Number.parseInt(process.env.ADMIN_BLOCK_DURATION || "3600", 10), // 1 hour
      alertOnDeniedAccess: process.env.ADMIN_ALERT_ON_DENIED_ACCESS === "true",
      alertThreshold: Number.parseInt(process.env.ADMIN_ALERT_THRESHOLD || "3", 10),
    }

    this.initializeDefaultWhitelist()
  }

  private async initializeDefaultWhitelist(): Promise<void> {
    try {
      // Add environment-based IPs to whitelist
      const envIps = process.env.ADMIN_WHITELIST_IPS?.split(",") || []

      for (const ip of envIps) {
        const trimmedIp = ip.trim()
        if (trimmedIp && isIP(trimmedIp)) {
          const existing = await this.whitelistRepository.findOne({
            where: { ipAddress: trimmedIp },
          })

          if (!existing) {
            await this.whitelistRepository.save(
              this.whitelistRepository.create({
                ipAddress: trimmedIp,
                ipType: IpType.SINGLE,
                description: "Environment-configured IP",
                status: IpStatus.ACTIVE,
                isActive: true,
              }),
            )
            this.logger.log(`Added environment IP to whitelist: ${trimmedIp}`)
          }
        }
      }

      // Add localhost if enabled
      if (this.config.allowLocalhost) {
        const localhostIps = ["127.0.0.1", "::1"]
        for (const ip of localhostIps) {
          const existing = await this.whitelistRepository.findOne({
            where: { ipAddress: ip },
          })

          if (!existing) {
            await this.whitelistRepository.save(
              this.whitelistRepository.create({
                ipAddress: ip,
                ipType: IpType.SINGLE,
                description: "Localhost access",
                status: IpStatus.ACTIVE,
                isActive: true,
              }),
            )
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to initialize default whitelist: ${error.message}`)
    }
  }

  async validateIpAccess(ipAddress: string, accessAttempt: IpAccessAttempt): Promise<IpValidationResult> {
    try {
      // Check if IP whitelisting is enabled
      if (!this.config.enableIpWhitelisting) {
        return { isAllowed: true }
      }

      // Check if IP is temporarily blocked
      if (this.isIpBlocked(ipAddress)) {
        await this.logAccess(
          {
            ...accessAttempt,
            ipAddress,
          },
          AccessResult.BLOCKED,
          "IP temporarily blocked due to excessive failed attempts",
        )

        return {
          isAllowed: false,
          denialReason: "IP temporarily blocked due to excessive failed attempts",
        }
      }

      // Check localhost access
      if (this.config.allowLocalhost && this.isLocalhost(ipAddress)) {
        await this.logAccess(accessAttempt, AccessResult.ALLOWED, "Localhost access allowed")
        return { isAllowed: true }
      }

      // Check private network access
      if (this.config.allowPrivateNetworks && this.isPrivateNetwork(ipAddress)) {
        await this.logAccess(accessAttempt, AccessResult.ALLOWED, "Private network access allowed")
        return { isAllowed: true }
      }

      // Check whitelist
      const whitelistEntry = await this.findMatchingWhitelistEntry(ipAddress)

      if (!whitelistEntry) {
        await this.handleDeniedAccess(ipAddress, accessAttempt, "IP not in whitelist")
        return {
          isAllowed: false,
          denialReason: "IP address not in whitelist",
        }
      }

      // Check if entry is active
      if (!whitelistEntry.isActive || whitelistEntry.status !== IpStatus.ACTIVE) {
        await this.handleDeniedAccess(ipAddress, accessAttempt, "Whitelist entry inactive")
        return {
          isAllowed: false,
          denialReason: "Whitelist entry is inactive",
          whitelistEntry: {
            id: whitelistEntry.id,
            ipAddress: whitelistEntry.ipAddress,
            ipType: whitelistEntry.ipType,
            description: whitelistEntry.description,
          },
        }
      }

      // Check if entry is expired
      if (whitelistEntry.expiresAt && whitelistEntry.expiresAt < new Date()) {
        await this.handleDeniedAccess(ipAddress, accessAttempt, "Whitelist entry expired")

        // Update entry status to expired
        whitelistEntry.status = IpStatus.EXPIRED
        await this.whitelistRepository.save(whitelistEntry)

        return {
          isAllowed: false,
          denialReason: "Whitelist entry has expired",
          whitelistEntry: {
            id: whitelistEntry.id,
            ipAddress: whitelistEntry.ipAddress,
            ipType: whitelistEntry.ipType,
            description: whitelistEntry.description,
            expiresAt: whitelistEntry.expiresAt,
          },
        }
      }

      // Access allowed - update entry statistics
      whitelistEntry.accessCount++
      whitelistEntry.lastAccessAt = new Date()
      whitelistEntry.lastAccessIp = ipAddress
      whitelistEntry.userAgent = accessAttempt.userAgent
      await this.whitelistRepository.save(whitelistEntry)

      await this.logAccess(accessAttempt, AccessResult.ALLOWED, "Access granted via whitelist")

      // Reset access attempts for this IP
      this.accessAttempts.delete(ipAddress)

      return {
        isAllowed: true,
        whitelistEntry: {
          id: whitelistEntry.id,
          ipAddress: whitelistEntry.ipAddress,
          ipType: whitelistEntry.ipType,
          description: whitelistEntry.description,
          expiresAt: whitelistEntry.expiresAt,
        },
      }
    } catch (error) {
      this.logger.error(`Error validating IP access: ${error.message}`)

      // Fail securely - deny access on error
      await this.logAccess(accessAttempt, AccessResult.DENIED, `Validation error: ${error.message}`)

      return {
        isAllowed: false,
        denialReason: "Internal validation error",
      }
    }
  }

  private async findMatchingWhitelistEntry(ipAddress: string): Promise<AdminIpWhitelist | null> {
    const entries = await this.whitelistRepository.find({
      where: { isActive: true, status: IpStatus.ACTIVE },
    })

    for (const entry of entries) {
      if (this.isIpMatch(ipAddress, entry.ipAddress, entry.ipType)) {
        return entry
      }
    }

    return null
  }

  private isIpMatch(testIp: string, whitelistIp: string, ipType: IpType): boolean {
    switch (ipType) {
      case IpType.SINGLE:
        return testIp === whitelistIp

      case IpType.RANGE:
        return this.isIpInRange(testIp, whitelistIp)

      case IpType.CIDR:
        return this.isIpInCidr(testIp, whitelistIp)

      case IpType.WILDCARD:
        return this.isIpMatchWildcard(testIp, whitelistIp)

      default:
        return false
    }
  }

  private isIpInRange(testIp: string, rangeString: string): boolean {
    try {
      const [startIp, endIp] = rangeString.split("-").map((ip) => ip.trim())
      if (!startIp || !endIp) return false

      const testNum = this.ipToNumber(testIp)
      const startNum = this.ipToNumber(startIp)
      const endNum = this.ipToNumber(endIp)

      return testNum >= startNum && testNum <= endNum
    } catch {
      return false
    }
  }

  private isIpInCidr(testIp: string, cidrString: string): boolean {
    try {
      const [network, prefixStr] = cidrString.split("/")
      const prefix = Number.parseInt(prefixStr, 10)

      if (!network || isNaN(prefix) || prefix < 0 || prefix > 32) return false

      const testNum = this.ipToNumber(testIp)
      const networkNum = this.ipToNumber(network)
      const mask = (0xffffffff << (32 - prefix)) >>> 0

      return (testNum & mask) === (networkNum & mask)
    } catch {
      return false
    }
  }

  private isIpMatchWildcard(testIp: string, wildcardPattern: string): boolean {
    try {
      const testParts = testIp.split(".")
      const patternParts = wildcardPattern.split(".")

      if (testParts.length !== 4 || patternParts.length !== 4) return false

      for (let i = 0; i < 4; i++) {
        if (patternParts[i] !== "*" && patternParts[i] !== testParts[i]) {
          return false
        }
      }

      return true
    } catch {
      return false
    }
  }

  private ipToNumber(ip: string): number {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0
  }

  private isLocalhost(ipAddress: string): boolean {
    return ipAddress === "127.0.0.1" || ipAddress === "::1" || ipAddress === "localhost"
  }

  private isPrivateNetwork(ipAddress: string): boolean {
    try {
      const ipNum = this.ipToNumber(ipAddress)

      // 10.0.0.0/8
      if ((ipNum & 0xff000000) === 0x0a000000) return true

      // 172.16.0.0/12
      if ((ipNum & 0xfff00000) === 0xac100000) return true

      // 192.168.0.0/16
      if ((ipNum & 0xffff0000) === 0xc0a80000) return true

      return false
    } catch {
      return false
    }
  }

  private isIpBlocked(ipAddress: string): boolean {
    const blockedUntil = this.blockedIps.get(ipAddress)
    if (!blockedUntil) return false

    if (new Date() > blockedUntil) {
      this.blockedIps.delete(ipAddress)
      this.accessAttempts.delete(ipAddress)
      return false
    }

    return true
  }

  private async handleDeniedAccess(ipAddress: string, accessAttempt: IpAccessAttempt, reason: string): Promise<void> {
    // Log the denied access
    await this.logAccess(accessAttempt, AccessResult.DENIED, reason)

    // Track access attempts
    const attempts = this.accessAttempts.get(ipAddress) || 0
    this.accessAttempts.set(ipAddress, attempts + 1)

    // Block IP if too many attempts
    if (attempts + 1 >= this.config.maxAccessAttempts) {
      const blockUntil = new Date(Date.now() + this.config.blockDuration * 1000)
      this.blockedIps.set(ipAddress, blockUntil)

      this.logger.warn(`IP ${ipAddress} blocked until ${blockUntil} due to ${attempts + 1} failed attempts`)

      // Send alert if configured
      if (this.config.alertOnDeniedAccess) {
        await this.sendDeniedAccessAlert(ipAddress, accessAttempt, attempts + 1)
      }
    }

    // Send alert if threshold reached
    if (this.config.alertOnDeniedAccess && attempts + 1 >= this.config.alertThreshold) {
      await this.sendDeniedAccessAlert(ipAddress, accessAttempt, attempts + 1)
    }
  }

  private async logAccess(accessAttempt: IpAccessAttempt, result: AccessResult, reason?: string): Promise<void> {
    if (!this.config.enableAccessLogging) return

    try {
      const whitelistEntry =
        result === AccessResult.ALLOWED ? await this.findMatchingWhitelistEntry(accessAttempt.ipAddress) : null

      const accessLog = this.accessLogRepository.create({
        ipAddress: accessAttempt.ipAddress,
        accessResult: result,
        accessType: accessAttempt.accessType,
        requestPath: accessAttempt.requestPath,
        requestMethod: accessAttempt.requestMethod,
        userAgent: accessAttempt.userAgent,
        referer: accessAttempt.referer,
        headers: accessAttempt.headers,
        denialReason: reason,
        location: this.config.enableGeoLocation ? this.mockGeolocation(accessAttempt.ipAddress) : null,
        metadata: accessAttempt.metadata,
        whitelistEntryId: whitelistEntry?.id,
        userId: accessAttempt.userId,
      })

      await this.accessLogRepository.save(accessLog)
    } catch (error) {
      this.logger.error(`Failed to log access attempt: ${error.message}`)
    }
  }

  private mockGeolocation(ipAddress: string): string {
    // Mock geolocation - in production, you'd use a real service
    if (this.isLocalhost(ipAddress) || this.isPrivateNetwork(ipAddress)) {
      return "Local Network"
    }

    const firstOctet = Number.parseInt(ipAddress.split(".")[0], 10)
    if (firstOctet >= 1 && firstOctet <= 50) return "North America"
    if (firstOctet >= 51 && firstOctet <= 100) return "Europe"
    if (firstOctet >= 101 && firstOctet <= 150) return "Asia"
    if (firstOctet >= 151 && firstOctet <= 200) return "South America"
    return "Unknown Region"
  }

  private async sendDeniedAccessAlert(
    ipAddress: string,
    accessAttempt: IpAccessAttempt,
    attemptCount: number,
  ): Promise<void> {
    try {
      const subject = `🚨 Admin Access Denied: Unauthorized IP Attempt`
      const template = "admin-ip-denied-alert"
      const context = {
        ipAddress,
        attemptCount,
        requestPath: accessAttempt.requestPath,
        requestMethod: accessAttempt.requestMethod,
        userAgent: accessAttempt.userAgent,
        location: this.mockGeolocation(ipAddress),
        timestamp: new Date().toISOString(),
        isBlocked: attemptCount >= this.config.maxAccessAttempts,
        dashboardUrl: `${process.env.DASHBOARD_URL}/admin/ip-whitelist`,
      }

      const adminEmails = process.env.ADMIN_EMAILS?.split(",") || ["admin@example.com"]

      for (const email of adminEmails) {
        await this.notificationService.sendEmail(email.trim(), subject, template, context)
      }

      this.logger.log(`Denied access alert sent for IP ${ipAddress}`)
    } catch (error) {
      this.logger.error(`Failed to send denied access alert: ${error.message}`)
    }
  }

  async addIpToWhitelist(createDto: CreateAdminIpWhitelistDto, createdById?: string): Promise<AdminIpWhitelist> {
    // Validate IP format based on type
    this.validateIpFormat(createDto.ipAddress, createDto.ipType)

    const whitelist = this.whitelistRepository.create({
      ...createDto,
      expiresAt: createDto.expiresAt ? new Date(createDto.expiresAt) : null,
      createdById,
    })

    return this.whitelistRepository.save(whitelist)
  }

  async bulkAddIps(bulkDto: BulkAddIpsDto, createdById?: string): Promise<AdminIpWhitelist[]> {
    const results: AdminIpWhitelist[] = []

    for (const ipAddress of bulkDto.ipAddresses) {
      try {
        this.validateIpFormat(ipAddress, bulkDto.ipType)

        const existing = await this.whitelistRepository.findOne({
          where: { ipAddress },
        })

        if (!existing) {
          const whitelist = this.whitelistRepository.create({
            ipAddress,
            ipType: bulkDto.ipType,
            description: bulkDto.description,
            expiresAt: bulkDto.expiresAt ? new Date(bulkDto.expiresAt) : null,
            createdById,
          })

          const saved = await this.whitelistRepository.save(whitelist)
          results.push(saved)
        }
      } catch (error) {
        this.logger.warn(`Failed to add IP ${ipAddress}: ${error.message}`)
      }
    }

    return results
  }

  private validateIpFormat(ipAddress: string, ipType: IpType): void {
    switch (ipType) {
      case IpType.SINGLE:
        if (!isIP(ipAddress)) {
          throw new Error(`Invalid IP address: ${ipAddress}`)
        }
        break

      case IpType.RANGE:
        const rangeParts = ipAddress.split("-")
        if (rangeParts.length !== 2 || !isIP(rangeParts[0].trim()) || !isIP(rangeParts[1].trim())) {
          throw new Error(`Invalid IP range format: ${ipAddress}`)
        }
        break

      case IpType.CIDR:
        const cidrParts = ipAddress.split("/")
        if (cidrParts.length !== 2 || !isIP(cidrParts[0]) || isNaN(Number.parseInt(cidrParts[1], 10))) {
          throw new Error(`Invalid CIDR format: ${ipAddress}`)
        }
        break

      case IpType.WILDCARD:
        const wildcardParts = ipAddress.split(".")
        if (wildcardParts.length !== 4) {
          throw new Error(`Invalid wildcard format: ${ipAddress}`)
        }
        for (const part of wildcardParts) {
          if (
            part !== "*" &&
            (isNaN(Number.parseInt(part, 10)) || Number.parseInt(part, 10) < 0 || Number.parseInt(part, 10) > 255)
          ) {
            throw new Error(`Invalid wildcard format: ${ipAddress}`)
          }
        }
        break
    }
  }

  async getWhitelistEntries(query: AdminIpWhitelistQueryDto): Promise<{
    entries: AdminIpWhitelist[]
    total: number
  }> {
    const queryBuilder = this.whitelistRepository
      .createQueryBuilder("whitelist")
      .leftJoinAndSelect("whitelist.createdBy", "createdBy")
      .leftJoinAndSelect("whitelist.lastModifiedBy", "lastModifiedBy")

    if (query.ipType) {
      queryBuilder.andWhere("whitelist.ipType = :ipType", { ipType: query.ipType })
    }

    if (query.status) {
      queryBuilder.andWhere("whitelist.status = :status", { status: query.status })
    }

    if (query.isActive !== undefined) {
      queryBuilder.andWhere("whitelist.isActive = :isActive", { isActive: query.isActive })
    }

    if (query.isExpired !== undefined) {
      if (query.isExpired) {
        queryBuilder.andWhere("whitelist.expiresAt < :now", { now: new Date() })
      } else {
        queryBuilder.andWhere("(whitelist.expiresAt IS NULL OR whitelist.expiresAt >= :now)", { now: new Date() })
      }
    }

    if (query.search) {
      queryBuilder.andWhere("(whitelist.ipAddress ILIKE :search OR whitelist.description ILIKE :search)", {
        search: `%${query.search}%`,
      })
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("whitelist.createdAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      })
    }

    const [entries, total] = await queryBuilder
      .orderBy("whitelist.createdAt", "DESC")
      .limit(query.limit)
      .offset(query.offset)
      .getManyAndCount()

    return { entries, total }
  }

  async getWhitelistEntryById(id: string): Promise<AdminIpWhitelist> {
    const entry = await this.whitelistRepository.findOne({
      where: { id },
      relations: ["createdBy", "lastModifiedBy"],
    })

    if (!entry) {
      throw new Error(`Whitelist entry with ID ${id} not found`)
    }

    return entry
  }

  async updateWhitelistEntry(
    id: string,
    updateDto: UpdateAdminIpWhitelistDto,
    lastModifiedById?: string,
  ): Promise<AdminIpWhitelist> {
    const entry = await this.getWhitelistEntryById(id)

    if (updateDto.ipAddress && updateDto.ipType) {
      this.validateIpFormat(updateDto.ipAddress, updateDto.ipType)
    } else if (updateDto.ipAddress) {
      this.validateIpFormat(updateDto.ipAddress, entry.ipType)
    }

    Object.assign(entry, {
      ...updateDto,
      expiresAt: updateDto.expiresAt ? new Date(updateDto.expiresAt) : entry.expiresAt,
      lastModifiedById,
    })

    return this.whitelistRepository.save(entry)
  }

  async deleteWhitelistEntry(id: string): Promise<void> {
    const entry = await this.getWhitelistEntryById(id)
    await this.whitelistRepository.remove(entry)
  }

  async getAccessLogs(query: AdminIpAccessLogQueryDto): Promise<{
    logs: AdminIpAccessLog[]
    total: number
  }> {
    const queryBuilder = this.accessLogRepository
      .createQueryBuilder("log")
      .leftJoinAndSelect("log.whitelistEntry", "whitelistEntry")
      .leftJoinAndSelect("log.user", "user")

    if (query.ipAddress) {
      queryBuilder.andWhere("log.ipAddress = :ipAddress", { ipAddress: query.ipAddress })
    }

    if (query.accessResult) {
      queryBuilder.andWhere("log.accessResult = :accessResult", { accessResult: query.accessResult })
    }

    if (query.accessType) {
      queryBuilder.andWhere("log.accessType = :accessType", { accessType: query.accessType })
    }

    if (query.requestPath) {
      queryBuilder.andWhere("log.requestPath ILIKE :requestPath", { requestPath: `%${query.requestPath}%` })
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("log.createdAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      })
    }

    const [logs, total] = await queryBuilder
      .orderBy("log.createdAt", "DESC")
      .limit(query.limit)
      .offset(query.offset)
      .getManyAndCount()

    return { logs, total }
  }

  async getWhitelistStats(): Promise<IpWhitelistStats> {
    const [
      totalEntries,
      activeEntries,
      expiredEntries,
      blockedEntries,
      totalAccesses,
      allowedAccesses,
      deniedAccesses,
      uniqueIps,
      recentAccesses,
      topAccessedIps,
      accessByResult,
    ] = await Promise.all([
      this.whitelistRepository.count(),
      this.whitelistRepository.count({ where: { isActive: true, status: IpStatus.ACTIVE } }),
      this.whitelistRepository.count({ where: { expiresAt: LessThan(new Date()) } }),
      this.whitelistRepository.count({ where: { status: IpStatus.BLOCKED } }),
      this.accessLogRepository.count(),
      this.accessLogRepository.count({ where: { accessResult: AccessResult.ALLOWED } }),
      this.accessLogRepository.count({ where: { accessResult: AccessResult.DENIED } }),
      this.accessLogRepository
        .createQueryBuilder("log")
        .select("COUNT(DISTINCT log.ipAddress)", "count")
        .getRawOne()
        .then((result) => Number.parseInt(result.count, 10)),
      this.accessLogRepository
        .createQueryBuilder("log")
        .where("log.createdAt > :date", { date: new Date(Date.now() - 24 * 60 * 60 * 1000) })
        .getCount(),
      this.accessLogRepository
        .createQueryBuilder("log")
        .select("log.ipAddress", "ip")
        .addSelect("COUNT(*)", "count")
        .groupBy("log.ipAddress")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany()
        .then((results) =>
          results.map((item) => ({
            ip: item.ip,
            count: Number.parseInt(item.count, 10),
          })),
        ),
      this.accessLogRepository
        .createQueryBuilder("log")
        .select("log.accessResult", "result")
        .addSelect("COUNT(*)", "count")
        .groupBy("log.accessResult")
        .getRawMany()
        .then((results) =>
          results.reduce(
            (acc, item) => {
              acc[item.result] = Number.parseInt(item.count, 10)
              return acc
            },
            {} as Record<AccessResult, number>,
          ),
        ),
    ])

    return {
      totalEntries,
      activeEntries,
      expiredEntries,
      blockedEntries,
      totalAccesses,
      allowedAccesses,
      deniedAccesses,
      uniqueIps,
      recentAccesses,
      topAccessedIps,
      accessByResult,
    }
  }

  async testIpAccess(ipAddress: string, requestPath = "/admin", userAgent?: string): Promise<IpValidationResult> {
    const accessAttempt: IpAccessAttempt = {
      ipAddress,
      accessType: AccessType.ADMIN_PANEL,
      requestPath,
      requestMethod: "GET",
      userAgent,
    }

    return this.validateIpAccess(ipAddress, accessAttempt)
  }

  async clearBlockedIps(): Promise<number> {
    const count = this.blockedIps.size
    this.blockedIps.clear()
    this.accessAttempts.clear()
    this.logger.log(`Cleared ${count} blocked IPs`)
    return count
  }

  async getBlockedIps(): Promise<Array<{ ip: string; blockedUntil: Date; attempts: number }>> {
    const blocked: Array<{ ip: string; blockedUntil: Date; attempts: number }> = []

    for (const [ip, blockedUntil] of this.blockedIps.entries()) {
      if (new Date() <= blockedUntil) {
        blocked.push({
          ip,
          blockedUntil,
          attempts: this.accessAttempts.get(ip) || 0,
        })
      }
    }

    return blocked
  }

  async unblockIp(ipAddress: string): Promise<boolean> {
    const wasBlocked = this.blockedIps.has(ipAddress)
    this.blockedIps.delete(ipAddress)
    this.accessAttempts.delete(ipAddress)

    if (wasBlocked) {
      this.logger.log(`Manually unblocked IP: ${ipAddress}`)
    }

    return wasBlocked
  }

  getConfig(): AdminIpConfig {
    return { ...this.config }
  }
}
