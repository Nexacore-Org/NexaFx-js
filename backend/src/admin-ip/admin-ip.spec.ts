import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { AdminIpService } from "./admin-ip.service"
import { AdminIpWhitelist, IpType, IpStatus } from "./entities/admin-ip-whitelist.entity"
import { AdminIpAccessLog, AccessType } from "./entities/admin-ip-access-log.entity"
import { NotificationService } from "../notifications/notification.service"

describe("AdminIpService", () => {
  let service: AdminIpService
  let whitelistRepository: Repository<AdminIpWhitelist>
  let accessLogRepository: Repository<AdminIpAccessLog>
  let notificationService: NotificationService

  const mockWhitelistRepository = {
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
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
      where: jest.fn().mockReturnThis(),
    })),
  }

  const mockAccessLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
      where: jest.fn().mockReturnThis(),
    })),
  }

  const mockNotificationService = {
    sendEmail: jest.fn(),
  }

  beforeEach(async () => {
    // Set test environment variables
    process.env.ADMIN_IP_WHITELISTING_ENABLED = "true"
    process.env.ADMIN_ALLOW_LOCALHOST = "true"
    process.env.ADMIN_ALLOW_PRIVATE_NETWORKS = "false"
    process.env.ADMIN_IP_ACCESS_LOGGING = "true"
    process.env.ADMIN_MAX_ACCESS_ATTEMPTS = "3"
    process.env.ADMIN_BLOCK_DURATION = "300" // 5 minutes

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminIpService,
        {
          provide: getRepositoryToken(AdminIpWhitelist),
          useValue: mockWhitelistRepository,
        },
        {
          provide: getRepositoryToken(AdminIpAccessLog),
          useValue: mockAccessLogRepository,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile()

    service = module.get<AdminIpService>(AdminIpService)
    whitelistRepository = module.get<Repository<AdminIpWhitelist>>(getRepositoryToken(AdminIpWhitelist))
    accessLogRepository = module.get<Repository<AdminIpAccessLog>>(getRepositoryToken(AdminIpAccessLog))
    notificationService = module.get<NotificationService>(NotificationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("validateIpAccess", () => {
    it("should allow localhost when enabled", async () => {
      const accessAttempt = {
        ipAddress: "127.0.0.1",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("127.0.0.1", accessAttempt)

      expect(result.isAllowed).toBe(true)
      expect(mockAccessLogRepository.create).toHaveBeenCalled()
      expect(mockAccessLogRepository.save).toHaveBeenCalled()
    })

    it("should deny access for non-whitelisted IP", async () => {
      const accessAttempt = {
        ipAddress: "192.0.2.100",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      mockWhitelistRepository.find.mockResolvedValue([])
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("192.0.2.100", accessAttempt)

      expect(result.isAllowed).toBe(false)
      expect(result.denialReason).toBe("IP address not in whitelist")
    })

    it("should allow access for whitelisted single IP", async () => {
      const accessAttempt = {
        ipAddress: "203.0.113.50",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      const mockWhitelistEntry = {
        id: "whitelist-123",
        ipAddress: "203.0.113.50",
        ipType: IpType.SINGLE,
        status: IpStatus.ACTIVE,
        isActive: true,
        accessCount: 5,
        save: jest.fn(),
      }

      mockWhitelistRepository.find.mockResolvedValue([mockWhitelistEntry])
      mockWhitelistRepository.save.mockResolvedValue(mockWhitelistEntry)
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("203.0.113.50", accessAttempt)

      expect(result.isAllowed).toBe(true)
      expect(result.whitelistEntry).toBeDefined()
      expect(result.whitelistEntry.id).toBe("whitelist-123")
    })

    it("should allow access for IP in CIDR range", async () => {
      const accessAttempt = {
        ipAddress: "192.168.1.100",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      const mockWhitelistEntry = {
        id: "whitelist-456",
        ipAddress: "192.168.1.0/24",
        ipType: IpType.CIDR,
        status: IpStatus.ACTIVE,
        isActive: true,
        accessCount: 10,
      }

      mockWhitelistRepository.find.mockResolvedValue([mockWhitelistEntry])
      mockWhitelistRepository.save.mockResolvedValue(mockWhitelistEntry)
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("192.168.1.100", accessAttempt)

      expect(result.isAllowed).toBe(true)
      expect(result.whitelistEntry.id).toBe("whitelist-456")
    })

    it("should deny access for expired whitelist entry", async () => {
      const accessAttempt = {
        ipAddress: "203.0.113.75",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      const mockWhitelistEntry = {
        id: "whitelist-789",
        ipAddress: "203.0.113.75",
        ipType: IpType.SINGLE,
        status: IpStatus.ACTIVE,
        isActive: true,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
      }

      mockWhitelistRepository.find.mockResolvedValue([mockWhitelistEntry])
      mockWhitelistRepository.save.mockResolvedValue({ ...mockWhitelistEntry, status: IpStatus.EXPIRED })
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("203.0.113.75", accessAttempt)

      expect(result.isAllowed).toBe(false)
      expect(result.denialReason).toBe("Whitelist entry has expired")
      expect(mockWhitelistRepository.save).toHaveBeenCalledWith({
        ...mockWhitelistEntry,
        status: IpStatus.EXPIRED,
      })
    })

    it("should block IP after max attempts", async () => {
      const accessAttempt = {
        ipAddress: "192.0.2.200",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      mockWhitelistRepository.find.mockResolvedValue([])
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      // First attempt
      await service.validateIpAccess("192.0.2.200", accessAttempt)
      // Second attempt
      await service.validateIpAccess("192.0.2.200", accessAttempt)
      // Third attempt - should trigger block
      const result = await service.validateIpAccess("192.0.2.200", accessAttempt)

      expect(result.isAllowed).toBe(false)

      // Fourth attempt - should be blocked
      const blockedResult = await service.validateIpAccess("192.0.2.200", accessAttempt)
      expect(blockedResult.isAllowed).toBe(false)
      expect(blockedResult.denialReason).toBe("IP temporarily blocked due to excessive failed attempts")
    })
  })

  describe("IP matching", () => {
    it("should match wildcard patterns", async () => {
      const accessAttempt = {
        ipAddress: "203.0.113.25",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      const mockWhitelistEntry = {
        id: "whitelist-wildcard",
        ipAddress: "203.0.113.*",
        ipType: IpType.WILDCARD,
        status: IpStatus.ACTIVE,
        isActive: true,
        accessCount: 2,
      }

      mockWhitelistRepository.find.mockResolvedValue([mockWhitelistEntry])
      mockWhitelistRepository.save.mockResolvedValue(mockWhitelistEntry)
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("203.0.113.25", accessAttempt)

      expect(result.isAllowed).toBe(true)
      expect(result.whitelistEntry.id).toBe("whitelist-wildcard")
    })

    it("should match IP ranges", async () => {
      const accessAttempt = {
        ipAddress: "10.0.0.25",
        accessType: AccessType.ADMIN_PANEL,
        requestPath: "/admin/dashboard",
        requestMethod: "GET",
      }

      const mockWhitelistEntry = {
        id: "whitelist-range",
        ipAddress: "10.0.0.1-10.0.0.50",
        ipType: IpType.RANGE,
        status: IpStatus.ACTIVE,
        isActive: true,
        accessCount: 8,
      }

      mockWhitelistRepository.find.mockResolvedValue([mockWhitelistEntry])
      mockWhitelistRepository.save.mockResolvedValue(mockWhitelistEntry)
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.validateIpAccess("10.0.0.25", accessAttempt)

      expect(result.isAllowed).toBe(true)
      expect(result.whitelistEntry.id).toBe("whitelist-range")
    })
  })

  describe("addIpToWhitelist", () => {
    it("should add a valid single IP to whitelist", async () => {
      const createDto = {
        ipAddress: "203.0.113.100",
        ipType: IpType.SINGLE,
        description: "Test IP",
      }

      const mockWhitelist = {
        id: "new-whitelist",
        ...createDto,
        status: IpStatus.ACTIVE,
        isActive: true,
      }

      mockWhitelistRepository.create.mockReturnValue(mockWhitelist)
      mockWhitelistRepository.save.mockResolvedValue(mockWhitelist)

      const result = await service.addIpToWhitelist(createDto, "admin-123")

      expect(mockWhitelistRepository.create).toHaveBeenCalledWith({
        ...createDto,
        expiresAt: null,
        createdById: "admin-123",
      })
      expect(mockWhitelistRepository.save).toHaveBeenCalledWith(mockWhitelist)
      expect(result).toEqual(mockWhitelist)
    })

    it("should throw error for invalid IP format", async () => {
      const createDto = {
        ipAddress: "invalid-ip",
        ipType: IpType.SINGLE,
        description: "Invalid IP",
      }

      await expect(service.addIpToWhitelist(createDto)).rejects.toThrow("Invalid IP address: invalid-ip")
    })

    it("should validate CIDR format", async () => {
      const validCidr = {
        ipAddress: "192.168.1.0/24",
        ipType: IpType.CIDR,
        description: "Valid CIDR",
      }

      const invalidCidr = {
        ipAddress: "192.168.1.0/33",
        ipType: IpType.CIDR,
        description: "Invalid CIDR",
      }

      mockWhitelistRepository.create.mockReturnValue(validCidr)
      mockWhitelistRepository.save.mockResolvedValue(validCidr)

      // Valid CIDR should work
      await expect(service.addIpToWhitelist(validCidr)).resolves.toBeDefined()

      // Invalid CIDR should throw
      await expect(service.addIpToWhitelist(invalidCidr)).rejects.toThrow("Invalid CIDR format")
    })
  })

  describe("getWhitelistStats", () => {
    it("should return comprehensive statistics", async () => {
      mockWhitelistRepository.count
        .mockResolvedValueOnce(50) // totalEntries
        .mockResolvedValueOnce(45) // activeEntries
        .mockResolvedValueOnce(3) // expiredEntries
        .mockResolvedValueOnce(2) // blockedEntries

      mockAccessLogRepository.count
        .mockResolvedValueOnce(1000) // totalAccesses
        .mockResolvedValueOnce(950) // allowedAccesses
        .mockResolvedValueOnce(50) // deniedAccesses

      mockAccessLogRepository.createQueryBuilder().getRawOne.mockResolvedValue({ count: "25" }) // uniqueIps

      mockAccessLogRepository.createQueryBuilder().getCount.mockResolvedValue(100) // recentAccesses

      mockAccessLogRepository
        .createQueryBuilder()
        .getRawMany.mockResolvedValueOnce([
          { ip: "127.0.0.1", count: "50" },
          { ip: "192.168.1.100", count: "30" },
        ])
        .mockResolvedValueOnce([
          { result: "allowed", count: "950" },
          { result: "denied", count: "50" },
        ])

      const stats = await service.getWhitelistStats()

      expect(stats).toEqual({
        totalEntries: 50,
        activeEntries: 45,
        expiredEntries: 3,
        blockedEntries: 2,
        totalAccesses: 1000,
        allowedAccesses: 950,
        deniedAccesses: 50,
        uniqueIps: 25,
        recentAccesses: 100,
        topAccessedIps: [
          { ip: "127.0.0.1", count: 50 },
          { ip: "192.168.1.100", count: 30 },
        ],
        accessByResult: {
          allowed: 950,
          denied: 50,
        },
      })
    })
  })

  describe("testIpAccess", () => {
    it("should test IP access without logging", async () => {
      mockWhitelistRepository.find.mockResolvedValue([])
      mockAccessLogRepository.create.mockReturnValue({})
      mockAccessLogRepository.save.mockResolvedValue({})

      const result = await service.testIpAccess("192.0.2.100")

      expect(result.isAllowed).toBe(false)
      expect(result.denialReason).toBe("IP address not in whitelist")
    })
  })
})
