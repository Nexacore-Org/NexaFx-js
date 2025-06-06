import { Test, type TestingModule } from "@nestjs/testing"
import { type ExecutionContext, ForbiddenException } from "@nestjs/common"
import { AdminIpGuard } from "./admin-ip.guard"
import { AdminIpService } from "../admin-ip.service"
import { AccessType } from "../entities/admin-ip-access-log.entity"

describe("AdminIpGuard", () => {
  let guard: AdminIpGuard
  let adminIpService: AdminIpService

  const mockAdminIpService = {
    validateIpAccess: jest.fn(),
  }

  const mockExecutionContext = {
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(),
    })),
  } as unknown as ExecutionContext

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminIpGuard,
        {
          provide: AdminIpService,
          useValue: mockAdminIpService,
        },
      ],
    }).compile()

    guard = module.get<AdminIpGuard>(AdminIpGuard)
    adminIpService = module.get<AdminIpService>(AdminIpService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("should be defined", () => {
    expect(guard).toBeDefined()
  })

  it("should allow access for whitelisted IP", async () => {
    const mockRequest = {
      path: "/admin/dashboard",
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      connection: {
        remoteAddress: "127.0.0.1",
      },
      query: {},
      user: { id: "admin-123" },
    }

    mockExecutionContext.switchToHttp().getRequest.mockReturnValue(mockRequest)
    mockAdminIpService.validateIpAccess.mockResolvedValue({
      isAllowed: true,
      whitelistEntry: {
        id: "whitelist-123",
        ipAddress: "127.0.0.1",
        ipType: "single",
      },
    })

    const result = await guard.canActivate(mockExecutionContext)

    expect(result).toBe(true)
    expect(mockAdminIpService.validateIpAccess).toHaveBeenCalledWith("127.0.0.1", {
      ipAddress: "127.0.0.1",
      accessType: AccessType.ADMIN_PANEL,
      requestPath: "/admin/dashboard",
      requestMethod: "GET",
      userAgent: "Mozilla/5.0",
      referer: undefined,
      headers: mockRequest.headers,
      userId: "admin-123",
      metadata: {
        originalUrl: undefined,
        query: {},
        timestamp: expect.any(String),
      },
    })
  })

  it("should deny access for non-whitelisted IP", async () => {
    const mockRequest = {
      path: "/admin/dashboard",
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      connection: {
        remoteAddress: "192.0.2.100",
      },
      query: {},
    }

    mockExecutionContext.switchToHttp().getRequest.mockReturnValue(mockRequest)
    mockAdminIpService.validateIpAccess.mockResolvedValue({
      isAllowed: false,
      denialReason: "IP address not in whitelist",
    })

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException)

    expect(mockAdminIpService.validateIpAccess).toHaveBeenCalledWith("192.0.2.100", expect.any(Object))
  })

  it("should extract IP from X-Forwarded-For header", async () => {
    const mockRequest = {
      path: "/admin/dashboard",
      method: "GET",
      headers: {
        "x-forwarded-for": "203.0.113.50, 192.168.1.1",
        "user-agent": "Mozilla/5.0",
      },
      connection: {
        remoteAddress: "192.168.1.1",
      },
      query: {},
    }

    mockExecutionContext.switchToHttp().getRequest.mockReturnValue(mockRequest)
    mockAdminIpService.validateIpAccess.mockResolvedValue({
      isAllowed: true,
    })

    await guard.canActivate(mockExecutionContext)

    expect(mockAdminIpService.validateIpAccess).toHaveBeenCalledWith("203.0.113.50", expect.any(Object))
  })

  it("should handle validation errors gracefully", async () => {
    const mockRequest = {
      path: "/admin/dashboard",
      method: "GET",
      headers: {},
      connection: {
        remoteAddress: "127.0.0.1",
      },
      query: {},
    }

    mockExecutionContext.switchToHttp().getRequest.mockReturnValue(mockRequest)
    mockAdminIpService.validateIpAccess.mockRejectedValue(new Error("Database error"))

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException)
  })
})
