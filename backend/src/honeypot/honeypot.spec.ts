import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { HoneypotService } from "./honeypot.service"
import { HoneypotAccess, HoneypotThreatLevel } from "./entities/honeypot-access.entity"
import { NotificationService } from "../notifications/notification.service"

describe("HoneypotService", () => {
  let service: HoneypotService
  let repository: Repository<HoneypotAccess>
  let notificationService: NotificationService

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
    })),
  }

  const mockNotificationService = {
    sendEmail: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoneypotService,
        {
          provide: getRepositoryToken(HoneypotAccess),
          useValue: mockRepository,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile()

    service = module.get<HoneypotService>(HoneypotService)
    repository = module.get<Repository<HoneypotAccess>>(getRepositoryToken(HoneypotAccess))
    notificationService = module.get<NotificationService>(NotificationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("logAccess", () => {
    it("should log honeypot access attempt", async () => {
      const mockAccessLog = {
        id: "test-id",
        route: "/admin/secret",
        method: "GET",
        ipAddress: "192.168.1.100",
        threatLevel: HoneypotThreatLevel.HIGH,
      }

      mockRepository.create.mockReturnValue(mockAccessLog)
      mockRepository.save.mockResolvedValue(mockAccessLog)

      const result = await service.logAccess(
        "/admin/secret",
        "GET",
        "192.168.1.100",
        { "user-agent": "test-agent" },
        {},
        {},
      )

      expect(mockRepository.create).toHaveBeenCalled()
      expect(mockRepository.save).toHaveBeenCalled()
      expect(result).toEqual(mockAccessLog)
    })

    it("should detect suspicious routes", async () => {
      const mockAccessLog = {
        id: "test-id",
        route: "/admin/secret",
        method: "GET",
        ipAddress: "192.168.1.100",
        threatLevel: HoneypotThreatLevel.HIGH,
      }

      mockRepository.create.mockReturnValue(mockAccessLog)
      mockRepository.save.mockResolvedValue(mockAccessLog)

      await service.logAccess("/admin/secret", "GET", "192.168.1.100", { "user-agent": "test-agent" }, {}, {})

      const createCall = mockRepository.create.mock.calls[0][0]
      expect(createCall.threatLevel).toBe(HoneypotThreatLevel.HIGH)
    })

    it("should detect bot user agents", async () => {
      const mockAccessLog = {
        id: "test-id",
        route: "/admin/secret",
        method: "GET",
        ipAddress: "192.168.1.100",
        threatLevel: HoneypotThreatLevel.HIGH,
      }

      mockRepository.create.mockReturnValue(mockAccessLog)
      mockRepository.save.mockResolvedValue(mockAccessLog)

      await service.logAccess("/admin/secret", "GET", "192.168.1.100", { "user-agent": "curl/7.68.0" }, {}, {})

      const createCall = mockRepository.create.mock.calls[0][0]
      expect(createCall.description).toContain("Bot detected")
    })

    it("should detect SQL injection attempts", async () => {
      const mockAccessLog = {
        id: "test-id",
        route: "/admin/users",
        method: "GET",
        ipAddress: "192.168.1.100",
        threatLevel: HoneypotThreatLevel.CRITICAL,
      }

      mockRepository.create.mockReturnValue(mockAccessLog)
      mockRepository.save.mockResolvedValue(mockAccessLog)

      await service.logAccess(
        "/admin/users",
        "GET",
        "192.168.1.100",
        { "user-agent": "test-agent" },
        { id: "1 OR 1=1" },
        {},
      )

      const createCall = mockRepository.create.mock.calls[0][0]
      expect(createCall.description).toContain("SQL injection attempt detected")
      expect(createCall.threatLevel).toBe(HoneypotThreatLevel.CRITICAL)
    })

    it("should detect XSS attempts", async () => {
      const mockAccessLog = {
        id: "test-id",
        route: "/admin/test",
        method: "POST",
        ipAddress: "192.168.1.100",
        threatLevel: HoneypotThreatLevel.HIGH,
      }

      mockRepository.create.mockReturnValue(mockAccessLog)
      mockRepository.save.mockResolvedValue(mockAccessLog)

      await service.logAccess(
        "/admin/test",
        "POST",
        "192.168.1.100",
        { "user-agent": "test-agent" },
        {},
        { comment: "<script>alert('xss')</script>" },
      )

      const createCall = mockRepository.create.mock.calls[0][0]
      expect(createCall.description).toContain("XSS attempt detected")
    })
  })

  describe("IP blocking", () => {
    it("should block suspicious IPs", () => {
      service.blockIP("192.168.1.100")
      expect(service.isIPBlocked("192.168.1.100")).toBe(true)
    })

    it("should unblock IPs", () => {
      service.blockIP("192.168.1.100")
      service.unblockIP("192.168.1.100")
      expect(service.isIPBlocked("192.168.1.100")).toBe(false)
    })
  })

  describe("getHoneypotStats", () => {
    it("should return honeypot statistics", async () => {
      mockRepository.count.mockResolvedValue(100)
      mockRepository.createQueryBuilder().getRawOne.mockResolvedValue({ count: "50" })
      mockRepository.createQueryBuilder().getRawMany.mockResolvedValue([
        { route: "/admin/secret", count: "25" },
        { userAgent: "curl/7.68.0", count: "15" },
        { threatLevel: "high", count: "30" },
      ])
      mockRepository.createQueryBuilder().getCount.mockResolvedValue(10)

      const stats = await service.getHoneypotStats()

      expect(stats).toHaveProperty("totalAttempts")
      expect(stats).toHaveProperty("uniqueIPs")
      expect(stats).toHaveProperty("topRoutes")
      expect(stats).toHaveProperty("topUserAgents")
      expect(stats).toHaveProperty("threatLevelDistribution")
      expect(stats).toHaveProperty("recentAttempts")
      expect(stats).toHaveProperty("blockedIPs")
    })
  })
})
