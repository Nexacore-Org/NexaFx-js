import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { ChecklistService } from "./checklist.service"
import { SecurityCheck, SecurityCheckStatus } from "./entities/security-check.entity"

describe("ChecklistService", () => {
  let service: ChecklistService
  let repository: Repository<SecurityCheck>

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    clear: jest.fn(),
  }

  beforeEach(async () => {
    // Set test environment variables
    process.env.NODE_ENV = "test"
    process.env.HTTPS_ENABLED = "true"
    process.env.JWT_SECRET = "test-jwt-secret-with-sufficient-length-for-security"
    process.env.RATE_LIMIT_ENABLED = "true"
    process.env.CORS_ORIGINS = "https://example.com,https://app.example.com"

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistService,
        {
          provide: getRepositoryToken(SecurityCheck),
          useValue: mockRepository,
        },
      ],
    }).compile()

    service = module.get<ChecklistService>(ChecklistService)
    repository = module.get<Repository<SecurityCheck>>(getRepositoryToken(SecurityCheck))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("generateSecurityChecklist", () => {
    it("should generate a comprehensive security checklist", async () => {
      mockRepository.clear.mockResolvedValue(undefined)
      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.generateSecurityChecklist()

      expect(result).toHaveProperty("summary")
      expect(result).toHaveProperty("categories")
      expect(result).toHaveProperty("checks")
      expect(result).toHaveProperty("recommendations")
      expect(result).toHaveProperty("criticalIssues")
      expect(result).toHaveProperty("generatedAt")

      expect(result.summary).toHaveProperty("totalChecks")
      expect(result.summary).toHaveProperty("overallScore")
      expect(result.summary).toHaveProperty("riskLevel")

      expect(Array.isArray(result.checks)).toBe(true)
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(Array.isArray(result.criticalIssues)).toBe(true)
    })

    it("should filter checks by category", async () => {
      mockRepository.clear.mockResolvedValue(undefined)
      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.generateSecurityChecklist({
        category: "authentication" as any,
      })

      const authChecks = result.checks.filter((check) => check.category === "authentication")
      expect(authChecks.length).toBeGreaterThan(0)
    })

    it("should filter failed checks only", async () => {
      // Set environment to trigger some failures
      process.env.HTTPS_ENABLED = "false"
      process.env.RATE_LIMIT_ENABLED = "false"

      mockRepository.clear.mockResolvedValue(undefined)
      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.generateSecurityChecklist({
        failedOnly: true,
      })

      const failedChecks = result.checks.filter((check) => check.status === SecurityCheckStatus.FAIL)
      expect(failedChecks.length).toBeGreaterThan(0)
    })

    it("should calculate correct risk level", async () => {
      // Set environment to trigger failures
      process.env.HTTPS_ENABLED = "false"
      process.env.JWT_SECRET = "weak"
      process.env.RATE_LIMIT_ENABLED = "false"

      mockRepository.clear.mockResolvedValue(undefined)
      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.generateSecurityChecklist()

      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(result.summary.riskLevel)
      expect(result.summary.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.summary.overallScore).toBeLessThanOrEqual(100)
    })
  })

  describe("security checks", () => {
    beforeEach(() => {
      mockRepository.clear.mockResolvedValue(undefined)
      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})
    })

    it("should pass HTTPS check when enabled", async () => {
      process.env.HTTPS_ENABLED = "true"

      const result = await service.generateSecurityChecklist()
      const httpsCheck = result.checks.find((check) => check.id === "https-enabled")

      expect(httpsCheck?.status).toBe(SecurityCheckStatus.PASS)
    })

    it("should fail HTTPS check when disabled", async () => {
      process.env.HTTPS_ENABLED = "false"

      const result = await service.generateSecurityChecklist()
      const httpsCheck = result.checks.find((check) => check.id === "https-enabled")

      expect(httpsCheck?.status).toBe(SecurityCheckStatus.FAIL)
    })

    it("should validate JWT secret strength", async () => {
      process.env.JWT_SECRET = "short"

      const result = await service.generateSecurityChecklist()
      const jwtCheck = result.checks.find((check) => check.id === "jwt-secret-strength")

      expect(jwtCheck?.status).toBe(SecurityCheckStatus.WARNING)
    })

    it("should check CORS configuration", async () => {
      process.env.CORS_ORIGINS = "*"

      const result = await service.generateSecurityChecklist()
      const corsCheck = result.checks.find((check) => check.id === "cors-configuration")

      expect(corsCheck?.status).toBe(SecurityCheckStatus.WARNING)
    })
  })
})
