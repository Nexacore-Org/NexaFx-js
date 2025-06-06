import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { type Repository, MoreThan } from "typeorm"
import { createHash } from "crypto"
import { Device, DeviceType, DeviceStatus, OperatingSystem, Browser } from "./entities/device.entity"
import { DeviceSession, SessionStatus } from "./entities/device-session.entity"
import { DeviceAnomaly, AnomalyType, AnomalySeverity, AnomalyStatus } from "./entities/device-anomaly.entity"
import type {
  ParsedUserAgent,
  DeviceInfo,
  AnomalyDetectionResult,
  DeviceStats,
  UserDeviceSummary,
} from "./interfaces/device.interface"
import type { CreateDeviceFingerprintDto, CreateSessionDto, UpdateDeviceDto } from "./dto/device.dto"
import type { DeviceQueryDto, SessionQueryDto, AnomalyQueryDto } from "./dto/device-query.dto"
import type { NotificationService } from "../notifications/notification.service"

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name)
  private readonly userLocationHistory = new Map<string, string[]>()
  private readonly userLoginTimes = new Map<string, Date[]>();

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(DeviceSession)
    private readonly sessionRepository: Repository<DeviceSession>,
    @InjectRepository(DeviceAnomaly)
    private readonly anomalyRepository: Repository<DeviceAnomaly>,
    private readonly notificationService: NotificationService,
  ) {}

  async createDeviceFingerprint(fingerprintData: CreateDeviceFingerprintDto): Promise<string> {
    // Create a unique fingerprint based on device characteristics
    const fingerprintString = JSON.stringify({
      userAgent: fingerprintData.userAgent,
      acceptLanguage: fingerprintData.acceptLanguage || "",
      acceptEncoding: fingerprintData.acceptEncoding || "",
      timezone: fingerprintData.timezone || "",
      screenResolution: fingerprintData.screenResolution || "",
      colorDepth: fingerprintData.colorDepth || 0,
      platform: fingerprintData.platform || "",
      cookieEnabled: fingerprintData.cookieEnabled || false,
      doNotTrack: fingerprintData.doNotTrack || false,
      plugins: (fingerprintData.plugins || []).sort(),
      fonts: (fingerprintData.fonts || []).sort(),
      canvas: fingerprintData.canvas || "",
      webgl: fingerprintData.webgl || "",
      audioContext: fingerprintData.audioContext || "",
    })

    return createHash("sha256").update(fingerprintString).digest("hex")
  }

  private parseUserAgent(userAgent: string): ParsedUserAgent {
    const ua = userAgent.toLowerCase()

    // Detect browser
    let browser = Browser.UNKNOWN
    let browserVersion = ""

    if (ua.includes("chrome") && !ua.includes("edg")) {
      browser = Browser.CHROME
      const match = ua.match(/chrome\/([0-9.]+)/)
      browserVersion = match ? match[1] : ""
    } else if (ua.includes("firefox")) {
      browser = Browser.FIREFOX
      const match = ua.match(/firefox\/([0-9.]+)/)
      browserVersion = match ? match[1] : ""
    } else if (ua.includes("safari") && !ua.includes("chrome")) {
      browser = Browser.SAFARI
      const match = ua.match(/version\/([0-9.]+)/)
      browserVersion = match ? match[1] : ""
    } else if (ua.includes("edg")) {
      browser = Browser.EDGE
      const match = ua.match(/edg\/([0-9.]+)/)
      browserVersion = match ? match[1] : ""
    } else if (ua.includes("opera") || ua.includes("opr")) {
      browser = Browser.OPERA
      const match = ua.match(/(?:opera|opr)\/([0-9.]+)/)
      browserVersion = match ? match[1] : ""
    }

    // Detect operating system
    let operatingSystem = OperatingSystem.UNKNOWN
    let osVersion = ""

    if (ua.includes("windows")) {
      operatingSystem = OperatingSystem.WINDOWS
      if (ua.includes("windows nt 10.0")) osVersion = "10"
      else if (ua.includes("windows nt 6.3")) osVersion = "8.1"
      else if (ua.includes("windows nt 6.2")) osVersion = "8"
      else if (ua.includes("windows nt 6.1")) osVersion = "7"
    } else if (ua.includes("mac os x") || ua.includes("macos")) {
      operatingSystem = OperatingSystem.MACOS
      const match = ua.match(/mac os x ([0-9_]+)/)
      osVersion = match ? match[1].replace(/_/g, ".") : ""
    } else if (ua.includes("linux")) {
      operatingSystem = OperatingSystem.LINUX
    } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
      operatingSystem = OperatingSystem.IOS
      const match = ua.match(/os ([0-9_]+)/)
      osVersion = match ? match[1].replace(/_/g, ".") : ""
    } else if (ua.includes("android")) {
      operatingSystem = OperatingSystem.ANDROID
      const match = ua.match(/android ([0-9.]+)/)
      osVersion = match ? match[1] : ""
    }

    // Detect device type
    const isMobile = ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")
    const isTablet = ua.includes("tablet") || ua.includes("ipad")
    const isDesktop = !isMobile && !isTablet

    let deviceType = DeviceType.UNKNOWN
    if (isDesktop) deviceType = DeviceType.DESKTOP
    else if (isTablet) deviceType = DeviceType.TABLET
    else if (isMobile) deviceType = DeviceType.MOBILE

    return {
      browser,
      browserVersion,
      operatingSystem,
      osVersion,
      deviceType,
      isMobile,
      isTablet,
      isDesktop,
    }
  }

  async registerDevice(
    userId: string,
    fingerprintData: CreateDeviceFingerprintDto,
    sessionData: CreateSessionDto,
  ): Promise<{ device: Device; session: DeviceSession; anomalies: DeviceAnomaly[] }> {
    this.logger.debug(`Registering device for user ${userId}`)

    // Generate device fingerprint
    const fingerprint = await this.createDeviceFingerprint(fingerprintData)

    // Parse user agent
    const parsedUA = this.parseUserAgent(fingerprintData.userAgent)

    // Check if device already exists
    let device = await this.deviceRepository.findOne({
      where: { fingerprint, userId },
      relations: ["user"],
    })

    const isNewDevice = !device

    if (!device) {
      // Create new device
      const deviceInfo: DeviceInfo = {
        fingerprint,
        deviceType: parsedUA.deviceType,
        operatingSystem: parsedUA.operatingSystem,
        browser: parsedUA.browser,
        browserVersion: parsedUA.browserVersion,
        osVersion: parsedUA.osVersion,
        userAgent: fingerprintData.userAgent,
        ipAddress: fingerprintData.ipAddress,
        capabilities: {
          cookieEnabled: fingerprintData.cookieEnabled,
          doNotTrack: fingerprintData.doNotTrack,
          plugins: fingerprintData.plugins,
          fonts: fingerprintData.fonts,
          screenResolution: fingerprintData.screenResolution,
          colorDepth: fingerprintData.colorDepth,
          timezone: fingerprintData.timezone,
        },
        metadata: fingerprintData.metadata,
      }

      device = await this.createDevice(userId, deviceInfo)
    } else {
      // Update existing device
      device.lastIpAddress = fingerprintData.ipAddress
      device.lastLoginAt = new Date()
      device.loginCount++
      device = await this.deviceRepository.save(device)
    }

    // Create session
    const session = await this.createSession(device.id, userId, sessionData)

    // Detect anomalies
    const anomalyResult = await this.detectAnomalies(userId, device, session, isNewDevice)
    const anomalies: DeviceAnomaly[] = []

    if (anomalyResult.isAnomalous) {
      for (const anomaly of anomalyResult.anomalies) {
        const deviceAnomaly = await this.createAnomaly(userId, device.id, anomaly, session)
        anomalies.push(deviceAnomaly)
      }

      // Update session with anomaly information
      session.isAnomalous = true
      session.anomalyReason = anomalyResult.anomalies.map((a) => a.description).join(", ")
      session.riskScore = anomalyResult.totalRiskScore
      await this.sessionRepository.save(session)

      // Send alerts if necessary
      await this.handleAnomalies(userId, device, anomalies)
    }

    return { device, session, anomalies }
  }

  private async createDevice(userId: string, deviceInfo: DeviceInfo): Promise<Device> {
    const device = this.deviceRepository.create({
      fingerprint: deviceInfo.fingerprint,
      name: deviceInfo.name || this.generateDeviceName(deviceInfo),
      deviceType: deviceInfo.deviceType,
      operatingSystem: deviceInfo.operatingSystem,
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      osVersion: deviceInfo.osVersion,
      userAgent: deviceInfo.userAgent,
      lastIpAddress: deviceInfo.ipAddress,
      lastLocation: deviceInfo.location,
      status: DeviceStatus.PENDING,
      loginCount: 1,
      lastLoginAt: new Date(),
      metadata: deviceInfo.metadata,
      capabilities: deviceInfo.capabilities,
      userId,
    })

    return this.deviceRepository.save(device)
  }

  private generateDeviceName(deviceInfo: DeviceInfo): string {
    const osName = deviceInfo.operatingSystem.charAt(0).toUpperCase() + deviceInfo.operatingSystem.slice(1)
    const browserName = deviceInfo.browser.charAt(0).toUpperCase() + deviceInfo.browser.slice(1)
    const deviceTypeName = deviceInfo.deviceType.charAt(0).toUpperCase() + deviceInfo.deviceType.slice(1)

    return `${osName} ${deviceTypeName} (${browserName})`
  }

  private async createSession(deviceId: string, userId: string, sessionData: CreateSessionDto): Promise<DeviceSession> {
    const session = this.sessionRepository.create({
      sessionToken: sessionData.sessionToken,
      sessionType: sessionData.sessionType,
      ipAddress: sessionData.ipAddress,
      location: sessionData.location,
      userAgent: sessionData.userAgent,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      lastActivityAt: new Date(),
      metadata: sessionData.metadata,
      deviceId,
      userId,
    })

    return this.sessionRepository.save(session)
  }

  private async detectAnomalies(
    userId: string,
    device: Device,
    session: DeviceSession,
    isNewDevice: boolean,
  ): Promise<AnomalyDetectionResult> {
    const anomalies: Array<{
      type: AnomalyType
      severity: AnomalySeverity
      description: string
      riskScore: number
      metadata?: Record<string, any>
    }> = []

    // Check for new device
    if (isNewDevice) {
      anomalies.push({
        type: AnomalyType.NEW_DEVICE,
        severity: AnomalySeverity.MEDIUM,
        description: "Login from a new device",
        riskScore: 30,
        metadata: {
          deviceType: device.deviceType,
          operatingSystem: device.operatingSystem,
          browser: device.browser,
        },
      })
    }

    // Check for location change
    const locationAnomaly = await this.checkLocationAnomaly(userId, session.ipAddress, session.location)
    if (locationAnomaly) {
      anomalies.push(locationAnomaly)
    }

    // Check for unusual time
    const timeAnomaly = this.checkTimeAnomaly(userId, session.createdAt)
    if (timeAnomaly) {
      anomalies.push(timeAnomaly)
    }

    // Check for rapid logins
    const rapidLoginAnomaly = await this.checkRapidLogins(userId)
    if (rapidLoginAnomaly) {
      anomalies.push(rapidLoginAnomaly)
    }

    // Check for device changes
    const deviceChangeAnomaly = await this.checkDeviceChange(userId, device)
    if (deviceChangeAnomaly) {
      anomalies.push(deviceChangeAnomaly)
    }

    // Check for IP address changes
    const ipChangeAnomaly = await this.checkIpChange(userId, session.ipAddress)
    if (ipChangeAnomaly) {
      anomalies.push(ipChangeAnomaly)
    }

    const totalRiskScore = anomalies.reduce((sum, anomaly) => sum + anomaly.riskScore, 0)
    const isAnomalous = anomalies.length > 0

    let recommendedAction = "No action required"
    if (totalRiskScore > 80) {
      recommendedAction = "Block session and require additional verification"
    } else if (totalRiskScore > 50) {
      recommendedAction = "Require additional verification"
    } else if (totalRiskScore > 20) {
      recommendedAction = "Monitor closely and notify user"
    }

    return {
      isAnomalous,
      anomalies,
      totalRiskScore,
      recommendedAction,
    }
  }

  private async checkLocationAnomaly(
    userId: string,
    ipAddress: string,
    location?: string,
  ): Promise<{
    type: AnomalyType
    severity: AnomalySeverity
    description: string
    riskScore: number
    metadata?: Record<string, any>
  } | null> {
    // Get user's location history
    const locationHistory = this.userLocationHistory.get(userId) || []

    // Mock geolocation - in production, you'd use a real geolocation service
    const currentLocation = location || this.mockGeolocation(ipAddress)

    if (locationHistory.length > 0 && !locationHistory.includes(currentLocation)) {
      // Update location history
      locationHistory.push(currentLocation)
      this.userLocationHistory.set(userId, locationHistory.slice(-10)) // Keep last 10 locations

      return {
        type: AnomalyType.LOCATION_CHANGE,
        severity: AnomalySeverity.MEDIUM,
        description: `Login from new location: ${currentLocation}`,
        riskScore: 25,
        metadata: {
          currentLocation,
          previousLocations: locationHistory.slice(0, -1),
        },
      }
    }

    // Update location history for new users
    if (locationHistory.length === 0) {
      this.userLocationHistory.set(userId, [currentLocation])
    }

    return null
  }

  private checkTimeAnomaly(
    userId: string,
    loginTime: Date,
  ): {
    type: AnomalyType
    severity: AnomalySeverity
    description: string
    riskScore: number
    metadata?: Record<string, any>
  } | null {
    const hour = loginTime.getHours()

    // Track login times
    const loginTimes = this.userLoginTimes.get(userId) || []
    loginTimes.push(loginTime)
    this.userLoginTimes.set(userId, loginTimes.slice(-50)) // Keep last 50 login times

    // Check if login is during unusual hours (11 PM - 5 AM)
    if (hour >= 23 || hour < 5) {
      // Check if user has logged in during these hours before
      const unusualHourLogins = loginTimes.filter((time) => {
        const h = time.getHours()
        return h >= 23 || h < 5
      })

      // If this is the first time or very rare, flag as anomaly
      if (unusualHourLogins.length <= 2) {
        return {
          type: AnomalyType.UNUSUAL_TIME,
          severity: AnomalySeverity.LOW,
          description: `Login at unusual hour: ${hour}:00`,
          riskScore: 15,
          metadata: {
            loginHour: hour,
            previousUnusualLogins: unusualHourLogins.length - 1,
          },
        }
      }
    }

    return null
  }

  private async checkRapidLogins(userId: string): Promise<{
    type: AnomalyType
    severity: AnomalySeverity
    description: string
    riskScore: number
    metadata?: Record<string, any>
  } | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const recentSessions = await this.sessionRepository.count({
      where: {
        userId,
        createdAt: MoreThan(fiveMinutesAgo),
      },
    })

    if (recentSessions >= 3) {
      return {
        type: AnomalyType.RAPID_LOGINS,
        severity: AnomalySeverity.HIGH,
        description: `${recentSessions} login attempts in the last 5 minutes`,
        riskScore: 40,
        metadata: {
          sessionCount: recentSessions,
          timeWindow: "5 minutes",
        },
      }
    }

    return null
  }

  private async checkDeviceChange(
    userId: string,
    currentDevice: Device,
  ): Promise<{
    type: AnomalyType
    severity: AnomalySeverity
    description: string
    riskScore: number
    metadata?: Record<string, any>
  } | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const recentSessions = await this.sessionRepository.find({
      where: {
        userId,
        createdAt: MoreThan(oneHourAgo),
      },
      relations: ["device"],
      order: { createdAt: "DESC" },
      take: 5,
    })

    // Check if user switched between different device types recently
    const deviceTypes = new Set(recentSessions.map((session) => session.device.deviceType))
    if (deviceTypes.size > 2) {
      return {
        type: AnomalyType.DEVICE_CHANGE,
        severity: AnomalySeverity.MEDIUM,
        description: "Multiple device types used in short period",
        riskScore: 20,
        metadata: {
          deviceTypes: Array.from(deviceTypes),
          sessionCount: recentSessions.length,
        },
      }
    }

    return null
  }

  private async checkIpChange(
    userId: string,
    currentIp: string,
  ): Promise<{
    type: AnomalyType
    severity: AnomalySeverity
    description: string
    riskScore: number
    metadata?: Record<string, any>
  } | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const recentSession = await this.sessionRepository.findOne({
      where: {
        userId,
        createdAt: MoreThan(oneHourAgo),
      },
      order: { createdAt: "DESC" },
    })

    if (recentSession && recentSession.ipAddress !== currentIp) {
      // Check if IPs are from different geographical regions
      const previousLocation = this.mockGeolocation(recentSession.ipAddress)
      const currentLocation = this.mockGeolocation(currentIp)

      if (previousLocation !== currentLocation) {
        return {
          type: AnomalyType.IP_CHANGE,
          severity: AnomalySeverity.MEDIUM,
          description: `IP address changed from ${previousLocation} to ${currentLocation}`,
          riskScore: 25,
          metadata: {
            previousIp: recentSession.ipAddress,
            currentIp,
            previousLocation,
            currentLocation,
          },
        }
      }
    }

    return null
  }

  private mockGeolocation(ipAddress: string): string {
    // Mock geolocation based on IP address
    // In production, you'd use a real geolocation service like MaxMind or ipapi
    if (ipAddress.startsWith("192.168.") || ipAddress.startsWith("10.") || ipAddress === "127.0.0.1") {
      return "Local Network"
    }

    // Simple mock based on IP ranges
    const firstOctet = Number.parseInt(ipAddress.split(".")[0], 10)
    if (firstOctet >= 1 && firstOctet <= 50) return "North America"
    if (firstOctet >= 51 && firstOctet <= 100) return "Europe"
    if (firstOctet >= 101 && firstOctet <= 150) return "Asia"
    if (firstOctet >= 151 && firstOctet <= 200) return "South America"
    return "Unknown Region"
  }

  private async createAnomaly(
    userId: string,
    deviceId: string,
    anomalyData: {
      type: AnomalyType
      severity: AnomalySeverity
      description: string
      riskScore: number
      metadata?: Record<string, any>
    },
    session: DeviceSession,
  ): Promise<DeviceAnomaly> {
    const anomaly = this.anomalyRepository.create({
      anomalyType: anomalyData.type,
      severity: anomalyData.severity,
      description: anomalyData.description,
      riskScore: anomalyData.riskScore,
      ipAddress: session.ipAddress,
      location: session.location,
      userAgent: session.userAgent,
      metadata: anomalyData.metadata,
      deviceId,
      userId,
    })

    return this.anomalyRepository.save(anomaly)
  }

  private async handleAnomalies(userId: string, device: Device, anomalies: DeviceAnomaly[]): Promise<void> {
    const highSeverityAnomalies = anomalies.filter(
      (a) => a.severity === AnomalySeverity.HIGH || a.severity === AnomalySeverity.CRITICAL,
    )

    if (highSeverityAnomalies.length > 0) {
      // Send admin alert
      await this.sendAdminAlert(userId, device, anomalies)

      // Send user alert
      await this.sendUserAlert(userId, device, anomalies)

      // Mark alerts as sent
      for (const anomaly of anomalies) {
        anomaly.alertSent = true
        await this.anomalyRepository.save(anomaly)
      }
    }

    // Auto-block device if risk score is very high
    const totalRiskScore = anomalies.reduce((sum, anomaly) => sum + anomaly.riskScore, 0)
    if (totalRiskScore > 80) {
      await this.blockDevice(device.id, "Automatically blocked due to high risk score")
    }
  }

  private async sendAdminAlert(userId: string, device: Device, anomalies: DeviceAnomaly[]): Promise<void> {
    try {
      const subject = `🚨 Device Security Alert: Anomalous Activity Detected`
      const template = "device-anomaly-alert"
      const context = {
        userId,
        deviceName: device.name,
        deviceType: device.deviceType,
        anomalies: anomalies.map((a) => ({
          type: a.anomalyType,
          severity: a.severity,
          description: a.description,
          riskScore: a.riskScore,
        })),
        totalRiskScore: anomalies.reduce((sum, a) => sum + a.riskScore, 0),
        timestamp: new Date().toISOString(),
        dashboardUrl: `${process.env.DASHBOARD_URL}/security/devices`,
      }

      const adminEmails = process.env.ADMIN_EMAILS?.split(",") || ["admin@example.com"]

      for (const email of adminEmails) {
        await this.notificationService.sendEmail(email.trim(), subject, template, context)
      }

      this.logger.log(`Admin alert sent for device anomalies: ${anomalies.map((a) => a.id).join(", ")}`)
    } catch (error) {
      this.logger.error(`Failed to send admin alert: ${error.message}`)
    }
  }

  private async sendUserAlert(userId: string, device: Device, anomalies: DeviceAnomaly[]): Promise<void> {
    try {
      // In a real application, you would fetch the user's email from the database
      this.logger.log(`User alert would be sent for device anomalies to user ${userId}`)

      // Example implementation:
      // const user = await this.userService.findById(userId);
      // if (user && user.email) {
      //   const subject = `Security Alert: Unusual Activity on Your Account`;
      //   const template = "user-device-alert";
      //   const context = {
      //     userName: user.name,
      //     deviceName: device.name,
      //     anomalies: anomalies.map(a => a.description),
      //     timestamp: new Date().toISOString(),
      //     securitySettingsUrl: `${process.env.APP_URL}/settings/security`,
      //   };
      //   await this.notificationService.sendEmail(user.email, subject, template, context);
      // }
    } catch (error) {
      this.logger.error(`Failed to send user alert: ${error.message}`)
    }
  }

  async getDevices(query: DeviceQueryDto): Promise<{ devices: Device[]; total: number }> {
    const queryBuilder = this.deviceRepository.createQueryBuilder("device").leftJoinAndSelect("device.user", "user")

    if (query.userId) {
      queryBuilder.andWhere("device.userId = :userId", { userId: query.userId })
    }

    if (query.deviceType) {
      queryBuilder.andWhere("device.deviceType = :deviceType", { deviceType: query.deviceType })
    }

    if (query.status) {
      queryBuilder.andWhere("device.status = :status", { status: query.status })
    }

    if (query.operatingSystem) {
      queryBuilder.andWhere("device.operatingSystem = :operatingSystem", {
        operatingSystem: query.operatingSystem,
      })
    }

    if (query.browser) {
      queryBuilder.andWhere("device.browser = :browser", { browser: query.browser })
    }

    if (query.isTrusted !== undefined) {
      queryBuilder.andWhere("device.isTrusted = :isTrusted", { isTrusted: query.isTrusted })
    }

    if (query.isBlocked !== undefined) {
      queryBuilder.andWhere("device.isBlocked = :isBlocked", { isBlocked: query.isBlocked })
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("device.createdAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      })
    }

    const [devices, total] = await queryBuilder
      .orderBy("device.lastLoginAt", "DESC")
      .limit(query.limit)
      .offset(query.offset)
      .getManyAndCount()

    return { devices, total }
  }

  async getDeviceById(id: string): Promise<Device> {
    return this.deviceRepository.findOne({
      where: { id },
      relations: ["user", "sessions"],
    })
  }

  async updateDevice(id: string, updateData: UpdateDeviceDto): Promise<Device> {
    const device = await this.deviceRepository.findOne({ where: { id } })

    if (!device) {
      throw new Error(`Device with ID ${id} not found`)
    }

    Object.assign(device, updateData)

    if (updateData.isTrusted) {
      device.trustedAt = new Date()
      device.status = DeviceStatus.TRUSTED
    }

    if (updateData.isBlocked) {
      device.blockedAt = new Date()
      device.status = DeviceStatus.BLOCKED
    }

    return this.deviceRepository.save(device)
  }

  async trustDevice(id: string): Promise<Device> {
    return this.updateDevice(id, {
      isTrusted: true,
      isBlocked: false,
      status: DeviceStatus.TRUSTED,
    })
  }

  async blockDevice(id: string, reason?: string): Promise<Device> {
    return this.updateDevice(id, {
      isBlocked: true,
      isTrusted: false,
      status: DeviceStatus.BLOCKED,
      blockReason: reason,
    })
  }

  async deleteDevice(id: string): Promise<void> {
    const device = await this.deviceRepository.findOne({ where: { id } })

    if (!device) {
      throw new Error(`Device with ID ${id} not found`)
    }

    await this.deviceRepository.remove(device)
  }

  async getSessions(query: SessionQueryDto): Promise<{ sessions: DeviceSession[]; total: number }> {
    const queryBuilder = this.sessionRepository
      .createQueryBuilder("session")
      .leftJoinAndSelect("session.device", "device")
      .leftJoinAndSelect("session.user", "user")

    if (query.userId) {
      queryBuilder.andWhere("session.userId = :userId", { userId: query.userId })
    }

    if (query.deviceId) {
      queryBuilder.andWhere("session.deviceId = :deviceId", { deviceId: query.deviceId })
    }

    if (query.status) {
      queryBuilder.andWhere("session.status = :status", { status: query.status })
    }

    if (query.ipAddress) {
      queryBuilder.andWhere("session.ipAddress = :ipAddress", { ipAddress: query.ipAddress })
    }

    if (query.isAnomalous !== undefined) {
      queryBuilder.andWhere("session.isAnomalous = :isAnomalous", { isAnomalous: query.isAnomalous })
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("session.createdAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      })
    }

    const [sessions, total] = await queryBuilder
      .orderBy("session.createdAt", "DESC")
      .limit(query.limit)
      .offset(query.offset)
      .getManyAndCount()

    return { sessions, total }
  }

  async terminateSession(sessionId: string): Promise<DeviceSession> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } })

    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`)
    }

    session.status = SessionStatus.TERMINATED
    return this.sessionRepository.save(session)
  }

  async getAnomalies(query: AnomalyQueryDto): Promise<{ anomalies: DeviceAnomaly[]; total: number }> {
    const queryBuilder = this.anomalyRepository
      .createQueryBuilder("anomaly")
      .leftJoinAndSelect("anomaly.device", "device")
      .leftJoinAndSelect("anomaly.user", "user")

    if (query.userId) {
      queryBuilder.andWhere("anomaly.userId = :userId", { userId: query.userId })
    }

    if (query.deviceId) {
      queryBuilder.andWhere("anomaly.deviceId = :deviceId", { deviceId: query.deviceId })
    }

    if (query.anomalyType) {
      queryBuilder.andWhere("anomaly.anomalyType = :anomalyType", { anomalyType: query.anomalyType })
    }

    if (query.severity) {
      queryBuilder.andWhere("anomaly.severity = :severity", { severity: query.severity })
    }

    if (query.resolved !== undefined) {
      const status = query.resolved ? AnomalyStatus.RESOLVED : AnomalyStatus.DETECTED
      queryBuilder.andWhere("anomaly.status = :status", { status })
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("anomaly.createdAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      })
    }

    const [anomalies, total] = await queryBuilder
      .orderBy("anomaly.createdAt", "DESC")
      .limit(query.limit)
      .offset(query.offset)
      .getManyAndCount()

    return { anomalies, total }
  }

  async resolveAnomaly(id: string, resolutionNotes: string): Promise<DeviceAnomaly> {
    const anomaly = await this.anomalyRepository.findOne({ where: { id } })

    if (!anomaly) {
      throw new Error(`Anomaly with ID ${id} not found`)
    }

    anomaly.status = AnomalyStatus.RESOLVED
    anomaly.resolvedAt = new Date()
    anomaly.resolutionNotes = resolutionNotes

    return this.anomalyRepository.save(anomaly)
  }

  async getDeviceStats(): Promise<DeviceStats> {
    const [
      totalDevices,
      trustedDevices,
      pendingDevices,
      blockedDevices,
      suspiciousDevices,
      devicesByType,
      devicesByOS,
      devicesByBrowser,
      recentLogins,
      anomaliesDetected,
    ] = await Promise.all([
      this.deviceRepository.count(),
      this.deviceRepository.count({ where: { isTrusted: true } }),
      this.deviceRepository.count({ where: { status: DeviceStatus.PENDING } }),
      this.deviceRepository.count({ where: { isBlocked: true } }),
      this.deviceRepository.count({ where: { status: DeviceStatus.SUSPICIOUS } }),
      this.deviceRepository
        .createQueryBuilder("device")
        .select("device.deviceType", "type")
        .addSelect("COUNT(*)", "count")
        .groupBy("device.deviceType")
        .getRawMany()
        .then((results) =>
          results.reduce(
            (acc, item) => {
              acc[item.type] = Number.parseInt(item.count, 10)
              return acc
            },
            {} as Record<DeviceType, number>,
          ),
        ),
      this.deviceRepository
        .createQueryBuilder("device")
        .select("device.operatingSystem", "os")
        .addSelect("COUNT(*)", "count")
        .groupBy("device.operatingSystem")
        .getRawMany()
        .then((results) =>
          results.reduce(
            (acc, item) => {
              acc[item.os] = Number.parseInt(item.count, 10)
              return acc
            },
            {} as Record<OperatingSystem, number>,
          ),
        ),
      this.deviceRepository
        .createQueryBuilder("device")
        .select("device.browser", "browser")
        .addSelect("COUNT(*)", "count")
        .groupBy("device.browser")
        .getRawMany()
        .then((results) =>
          results.reduce(
            (acc, item) => {
              acc[item.browser] = Number.parseInt(item.count, 10)
              return acc
            },
            {} as Record<Browser, number>,
          ),
        ),
      this.sessionRepository
        .createQueryBuilder("session")
        .where("session.createdAt > :date", { date: new Date(Date.now() - 24 * 60 * 60 * 1000) })
        .getCount(),
      this.anomalyRepository
        .createQueryBuilder("anomaly")
        .where("anomaly.createdAt > :date", { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
        .getCount(),
    ])

    return {
      totalDevices,
      trustedDevices,
      pendingDevices,
      blockedDevices,
      suspiciousDevices,
      devicesByType,
      devicesByOS,
      devicesByBrowser,
      recentLogins,
      anomaliesDetected,
    }
  }

  async getUserDeviceSummary(userId: string): Promise<UserDeviceSummary> {
    const [devices, activeSessions, anomalies] = await Promise.all([
      this.deviceRepository.find({
        where: { userId },
        order: { lastLoginAt: "DESC" },
      }),
      this.sessionRepository.count({
        where: { userId, status: SessionStatus.ACTIVE },
      }),
      this.anomalyRepository.count({
        where: { userId, status: AnomalyStatus.DETECTED },
      }),
    ])

    const trustedDevices = devices.filter((d) => d.isTrusted).length
    const recentDevices = devices.slice(0, 5)
    const lastLogin = devices.length > 0 ? devices[0].lastLoginAt : null
    const riskScore = devices.reduce((sum, device) => sum + (device.status === DeviceStatus.SUSPICIOUS ? 20 : 0), 0)

    return {
      userId,
      totalDevices: devices.length,
      trustedDevices,
      recentDevices,
      activeSessions,
      lastLogin,
      riskScore,
      anomalies,
    }
  }
}
