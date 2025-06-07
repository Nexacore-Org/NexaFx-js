import { Test, type TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { RateLimitService } from "../rate-limit.service"
import { MemoryRateLimitStorage } from "../storage/memory-rate-limit.storage"
import { RateLimitStorage } from "../storage/rate-limit.storage"
import { jest } from "@jest/globals"

describe("RateLimitService", () => {
  let service: RateLimitService
  let storage: RateLimitStorage

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: RateLimitStorage,
          useClass: MemoryRateLimitStorage,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                RATE_LIMIT_STORAGE: "memory",
              }
              return config[key] || defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<RateLimitService>(RateLimitService)
    storage = module.get<RateLimitStorage>(RateLimitStorage)
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("checkRateLimit", () => {
    it("should allow requests within limit", async () => {
      const result = await service.checkRateLimit("test-ip", "test-endpoint", {
        limit: 5,
        windowMs: 60000,
      })

      expect(result.allowed).toBe(true)
      expect(result.current).toBe(1)
      expect(result.remaining).toBe(4)
    })

    it("should block requests exceeding limit", async () => {
      const options = { limit: 2, windowMs: 60000 }

      // Make requests up to limit
      await service.checkRateLimit("test-ip", "test-endpoint", options)
      await service.checkRateLimit("test-ip", "test-endpoint", options)

      // This should be blocked
      const result = await service.checkRateLimit("test-ip", "test-endpoint", options)

      expect(result.allowed).toBe(false)
      expect(result.current).toBe(3)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeDefined()
    })
  })

  describe("brute force protection", () => {
    it("should track failed login attempts", async () => {
      const ip = "192.168.1.1"
      const endpoint = "POST:/auth/login"

      await service.recordLoginAttempt({
        ip,
        endpoint,
        timestamp: Date.now(),
        success: false,
      })

      const status = await service.checkBruteForce(ip, endpoint)
      expect(status.attempts).toBe(1)
      expect(status.isBlocked).toBe(false)
    })

    it("should block IP after too many failed attempts", async () => {
      const ip = "192.168.1.2"
      const endpoint = "POST:/auth/login"

      // Record multiple failed attempts
      for (let i = 0; i < 6; i++) {
        await service.recordLoginAttempt({
          ip,
          endpoint,
          timestamp: Date.now(),
          success: false,
        })
      }

      const status = await service.checkBruteForce(ip, endpoint)
      expect(status.isBlocked).toBe(true)
      expect(status.blockUntil).toBeDefined()
    })

    it("should clear attempts after successful login", async () => {
      const ip = "192.168.1.3"
      const endpoint = "POST:/auth/login"

      // Record failed attempts
      for (let i = 0; i < 3; i++) {
        await service.recordLoginAttempt({
          ip,
          endpoint,
          timestamp: Date.now(),
          success: false,
        })
      }

      // Clear attempts
      await service.clearBruteForceAttempts(ip, endpoint)

      const status = await service.checkBruteForce(ip, endpoint)
      expect(status.attempts).toBe(0)
      expect(status.isBlocked).toBe(false)
    })
  })

  describe("whitelist/blacklist", () => {
    it("should whitelist IP addresses", async () => {
      const ip = "192.168.1.100"
      await service.whitelist(ip)

      const isWhitelisted = await service.isWhitelisted(ip)
      expect(isWhitelisted).toBe(true)
    })

    it("should blacklist IP addresses", async () => {
      const ip = "192.168.1.200"
      await service.blacklist(ip)

      const isBlacklisted = await service.isBlacklisted(ip)
      expect(isBlacklisted).toBe(true)
    })

    it("should handle temporary whitelist/blacklist", async () => {
      const ip = "192.168.1.300"
      const duration = 1000 // 1 second

      await service.whitelist(ip, duration)
      expect(await service.isWhitelisted(ip)).toBe(true)

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect(await service.isWhitelisted(ip)).toBe(false)
    })
  })
})
