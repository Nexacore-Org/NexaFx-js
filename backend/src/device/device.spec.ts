import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { DeviceService } from "./device.service"
import { Device, DeviceType, DeviceStatus, OperatingSystem, Browser } from "./entities/device.entity"
import { DeviceSession } from "./entities/device-session.entity"
import { DeviceAnomaly, AnomalyType, AnomalySeverity } from "./entities/device-anomaly.entity"
import { NotificationService } from "../notifications/notification.service"

describe("DeviceService", () => {
  let service: DeviceService
  let deviceRepository: Repository<Device>
  let sessionRepository: Repository<DeviceSession>
  let anomalyRepository: Repository<DeviceAnomaly>
  let notificationService: NotificationService

  const mockDeviceRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
    })),
  }

  const mockSessionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      getCount: jest.fn(),
    })),
  }

  const mockAnomalyRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      getCount: jest.fn(),
    })),
  }

  const mockNotificationService = {
    sendEmail: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        {
          provide: getRepositoryToken(Device),
          useValue: mockDeviceRepository,
        },
        {
          provide: getRepositoryToken(DeviceSession),
          useValue: mockSessionRepository,
        },
        {
          provide: getRepositoryToken(DeviceAnomaly),
          useValue: mockAnomalyRepository,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile()

    service = module.get<DeviceService>(DeviceService)
    deviceRepository = module.get<Repository<Device>>(getRepositoryToken(Device))
    sessionRepository = module.get<Repository<DeviceSession>>(getRepositoryToken(DeviceSession))
    anomalyRepository = module.get<Repository<DeviceAnomaly>>(getRepositoryToken(DeviceAnomaly))
    notificationService = module.get<NotificationService>(NotificationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("createDeviceFingerprint", () => {
    it("should create a unique fingerprint", async () => {
      const fingerprintData = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ipAddress: "192.168.1.100",
        acceptLanguage: "en-US,en;q=0.9",
        screenResolution: "1920x1080",
        colorDepth: 24,
        timezone: "America/New_York",
      }

      const fingerprint = await service.createDeviceFingerprint(fingerprintData)

      expect(fingerprint).toBeDefined()
      expect(typeof fingerprint).toBe("string")
      expect(fingerprint.length).toBe(64) // SHA-256 hash length
    })

    it("should create different fingerprints for different data", async () => {
      const fingerprintData1 = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ipAddress: "192.168.1.100",
      }

      const fingerprintData2 = {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ipAddress: "192.168.1.101",
      }

      const fingerprint1 = await service.createDeviceFingerprint(fingerprintData1)
      const fingerprint2 = await service.createDeviceFingerprint(fingerprintData2)

      expect(fingerprint1).not.toBe(fingerprint2)
    })
  })

  describe("registerDevice", () => {
    it("should register a new device and create session", async () => {
      const userId = "user-123"
      const fingerprintData = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ipAddress: "192.168.1.100",
      }
      const sessionData = {
        sessionToken: "session-token-123",
        sessionType: "web" as any,
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      }

      const mockDevice = {
        id: "device-123",
        fingerprint: "fingerprint-123",
        deviceType: DeviceType.DESKTOP,
        operatingSystem: OperatingSystem.WINDOWS,
        browser: Browser.CHROME,
        userId,
      }

      const mockSession = {
        id: "session-123",
        sessionToken: sessionData.sessionToken,
        deviceId: mockDevice.id,
        userId,
      }

      mockDeviceRepository.findOne.mockResolvedValue(null) // New device
      mockDeviceRepository.create.mockReturnValue(mockDevice)
      mockDeviceRepository.save.mockResolvedValue(mockDevice)
      mockSessionRepository.create.mockReturnValue(mockSession)
      mockSessionRepository.save.mockResolvedValue(mockSession)
      mockSessionRepository.count.mockResolvedValue(0) // No rapid logins

      const result = await service.registerDevice(userId, fingerprintData, sessionData)

      expect(result.device).toEqual(mockDevice)
      expect(result.session).toEqual(mockSession)
      expect(mockDeviceRepository.create).toHaveBeenCalled()
      expect(mockDeviceRepository.save).toHaveBeenCalled()
      expect(mockSessionRepository.create).toHaveBeenCalled()
      expect(mockSessionRepository.save).toHaveBeenCalled()
    })

    it("should detect new device anomaly", async () => {
      const userId = "user-123"
      const fingerprintData = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ipAddress: "192.168.1.100",
      }
      const sessionData = {
        sessionToken: "session-token-123",
        sessionType: "web" as any,
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      }

      const mockDevice = {
        id: "device-123",
        fingerprint: "fingerprint-123",
        userId,
      }

      const mockSession = {
        id: "session-123",
        deviceId: mockDevice.id,
        userId,
        createdAt: new Date(),
      }

      const mockAnomaly = {
        id: "anomaly-123",
        anomalyType: AnomalyType.NEW_DEVICE,
        severity: AnomalySeverity.MEDIUM,
        userId,
        deviceId: mockDevice.id,
      }

      mockDeviceRepository.findOne.mockResolvedValue(null) // New device
      mockDeviceRepository.create.mockReturnValue(mockDevice)
      mockDeviceRepository.save.mockResolvedValue(mockDevice)
      mockSessionRepository.create.mockReturnValue(mockSession)
      mockSessionRepository.save.mockResolvedValue(mockSession)
      mockSessionRepository.count.mockResolvedValue(0)
      mockAnomalyRepository.create.mockReturnValue(mockAnomaly)
      mockAnomalyRepository.save.mockResolvedValue(mockAnomaly)

      const result = await service.registerDevice(userId, fingerprintData, sessionData)

      expect(result.anomalies).toHaveLength(1)
      expect(result.anomalies[0].anomalyType).toBe(AnomalyType.NEW_DEVICE)
      expect(mockAnomalyRepository.create).toHaveBeenCalled()
      expect(mockAnomalyRepository.save).toHaveBeenCalled()
    })
  })

  describe("trustDevice", () => {
    it("should trust a device", async () => {
      const deviceId = "device-123"
      const mockDevice = {
        id: deviceId,
        isTrusted: false,
        status: DeviceStatus.PENDING,
      }

      const updatedDevice = {
        ...mockDevice,
        isTrusted: true,
        status: DeviceStatus.TRUSTED,
        trustedAt: expect.any(Date),
      }

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice)
      mockDeviceRepository.save.mockResolvedValue(updatedDevice)

      const result = await service.trustDevice(deviceId)

      expect(result.isTrusted).toBe(true)
      expect(result.status).toBe(DeviceStatus.TRUSTED)
      expect(mockDeviceRepository.save).toHaveBeenCalled()
    })
  })

  describe("blockDevice", () => {
    it("should block a device", async () => {
      const deviceId = "device-123"
      const reason = "Suspicious activity detected"
      const mockDevice = {
        id: deviceId,
        isBlocked: false,
        status: DeviceStatus.TRUSTED,
      }

      const updatedDevice = {
        ...mockDevice,
        isBlocked: true,
        status: DeviceStatus.BLOCKED,
        blockReason: reason,
        blockedAt: expect.any(Date),
      }

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice)
      mockDeviceRepository.save.mockResolvedValue(updatedDevice)

      const result = await service.blockDevice(deviceId, reason)

      expect(result.isBlocked).toBe(true)
      expect(result.status).toBe(DeviceStatus.BLOCKED)
      expect(result.blockReason).toBe(reason)
      expect(mockDeviceRepository.save).toHaveBeenCalled()
    })
  })

  describe("getDeviceStats", () => {
    it("should return device statistics", async () => {
      mockDeviceRepository.count
        .mockResolvedValueOnce(100) // totalDevices
        .mockResolvedValueOnce(80) // trustedDevices
        .mockResolvedValueOnce(15) // pendingDevices
        .mockResolvedValueOnce(5) // blockedDevices
        .mockResolvedValueOnce(0) // suspiciousDevices

      mockDeviceRepository
        .createQueryBuilder()
        .getRawMany.mockResolvedValueOnce([
          { type: "desktop", count: "60" },
          { type: "mobile", count: "30" },
          { type: "tablet", count: "10" },
        ])
        .mockResolvedValueOnce([
          { os: "windows", count: "50" },
          { os: "ios", count: "25" },
          { os: "android", count: "15" },
          { os: "macos", count: "10" },
        ])
        .mockResolvedValueOnce([
          { browser: "chrome", count: "60" },
          { browser: "safari", count: "25" },
          { browser: "firefox", count: "15" },
        ])

      mockSessionRepository.createQueryBuilder().getCount.mockResolvedValue(50) // recentLogins
      mockAnomalyRepository.createQueryBuilder().getCount.mockResolvedValue(10) // anomaliesDetected

      const stats = await service.getDeviceStats()

      expect(stats).toEqual({
        totalDevices: 100,
        trustedDevices: 80,
        pendingDevices: 15,
        blockedDevices: 5,
        suspiciousDevices: 0,
        devicesByType: {
          desktop: 60,
          mobile: 30,
          tablet: 10,
        },
        devicesByOS: {
          windows: 50,
          ios: 25,
          android: 15,
          macos: 10,
        },
        devicesByBrowser: {
          chrome: 60,
          safari: 25,
          firefox: 15,
        },
        recentLogins: 50,
        anomaliesDetected: 10,
      })
    })
  })
})
