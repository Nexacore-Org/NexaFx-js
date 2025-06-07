import { Test, type TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { CsrfService } from "../csrf.service"
import { describe, beforeEach, it, expect, jest } from "@jest/globals"

describe("CsrfService", () => {
  let service: CsrfService
  let configService: ConfigService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
              const config = {
                NODE_ENV: "test",
              }
              return config[key] || defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<CsrfService>(CsrfService)
    configService = module.get<ConfigService>(ConfigService)
  })

  describe("generateSecret", () => {
    it("should generate a unique secret", () => {
      const secret1 = service.generateSecret()
      const secret2 = service.generateSecret()

      expect(secret1).toBeDefined()
      expect(secret2).toBeDefined()
      expect(secret1).not.toBe(secret2)
      expect(secret1).toHaveLength(64) // 32 bytes * 2 (hex)
    })
  })

  describe("generateToken", () => {
    it("should generate a valid token", () => {
      const secret = service.generateSecret()
      const token = service.generateToken(secret)

      expect(token).toBeDefined()
      expect(typeof token).toBe("string")
      expect(token.length).toBeGreaterThan(0)
    })

    it("should generate different tokens for same secret", () => {
      const secret = service.generateSecret()
      const token1 = service.generateToken(secret)
      const token2 = service.generateToken(secret)

      expect(token1).not.toBe(token2)
    })
  })

  describe("validateToken", () => {
    it("should validate a valid token", () => {
      const secret = service.generateSecret()
      const token = service.generateToken(secret)

      const isValid = service.validateToken(token, secret)
      expect(isValid).toBe(true)
    })

    it("should reject token with wrong secret", () => {
      const secret1 = service.generateSecret()
      const secret2 = service.generateSecret()
      const token = service.generateToken(secret1)

      const isValid = service.validateToken(token, secret2)
      expect(isValid).toBe(false)
    })

    it("should reject malformed token", () => {
      const secret = service.generateSecret()
      const invalidToken = "invalid-token"

      const isValid = service.validateToken(invalidToken, secret)
      expect(isValid).toBe(false)
    })

    it("should reject empty token", () => {
      const secret = service.generateSecret()

      const isValid = service.validateToken("", secret)
      expect(isValid).toBe(false)
    })
  })

  describe("getStats", () => {
    it("should return statistics", () => {
      const stats = service.getStats()

      expect(stats).toHaveProperty("totalTokensGenerated")
      expect(stats).toHaveProperty("totalValidations")
      expect(stats).toHaveProperty("validationFailures")
      expect(stats).toHaveProperty("recentFailures")
      expect(Array.isArray(stats.recentFailures)).toBe(true)
    })

    it("should track token generation", () => {
      const initialStats = service.getStats()
      const secret = service.generateSecret()
      service.generateToken(secret)
      const newStats = service.getStats()

      expect(newStats.totalTokensGenerated).toBe(initialStats.totalTokensGenerated + 1)
    })

    it("should track validations", () => {
      const secret = service.generateSecret()
      const token = service.generateToken(secret)
      const initialStats = service.getStats()

      service.validateToken(token, secret)
      const newStats = service.getStats()

      expect(newStats.totalValidations).toBe(initialStats.totalValidations + 1)
    })
  })

  describe("clearStats", () => {
    it("should clear all statistics", () => {
      // Generate some activity
      const secret = service.generateSecret()
      const token = service.generateToken(secret)
      service.validateToken(token, secret)

      service.clearStats()
      const stats = service.getStats()

      expect(stats.totalTokensGenerated).toBe(0)
      expect(stats.totalValidations).toBe(0)
      expect(stats.validationFailures).toBe(0)
      expect(stats.recentFailures).toHaveLength(0)
    })
  })
})
