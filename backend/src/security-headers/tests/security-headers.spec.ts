import { Test, type TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { SecurityHeadersMiddleware } from "../security-headers.middleware"
import { SecurityHeadersService } from "../security-headers.service"
import type { Request, Response } from "express"

describe("SecurityHeadersMiddleware", () => {
  let middleware: SecurityHeadersMiddleware
  let service: SecurityHeadersService
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let nextFunction: jest.Mock

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityHeadersMiddleware,
        SecurityHeadersService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                SECURITY_CSP_ENABLED: true,
                SECURITY_HSTS_ENABLED: true,
                SECURITY_X_FRAME_OPTIONS_ENABLED: true,
                SECURITY_X_FRAME_OPTIONS_VALUE: "DENY",
                SECURITY_X_CONTENT_TYPE_OPTIONS_ENABLED: true,
                SECURITY_X_XSS_PROTECTION_ENABLED: true,
                SECURITY_REFERRER_POLICY_ENABLED: true,
                SECURITY_REMOVE_SERVER_HEADER: true,
                SECURITY_REMOVE_POWERED_BY_HEADER: true,
              }
              return config[key] ?? defaultValue
            }),
          },
        },
      ],
    }).compile()

    middleware = module.get<SecurityHeadersMiddleware>(SecurityHeadersMiddleware)
    service = module.get<SecurityHeadersService>(SecurityHeadersService)

    mockRequest = {}
    mockResponse = {
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
      getHeader: jest.fn(),
      getHeaderNames: jest.fn(() => []),
    }
    nextFunction = jest.fn()
  })

  it("should be defined", () => {
    expect(middleware).toBeDefined()
    expect(service).toBeDefined()
  })

  describe("middleware execution", () => {
    it("should set all security headers", () => {
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

      expect(mockResponse.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY")
      expect(mockResponse.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff")
      expect(mockResponse.setHeader).toHaveBeenCalledWith("X-XSS-Protection", "1; mode=block")
      expect(mockResponse.setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin")
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      )
      expect(nextFunction).toHaveBeenCalled()
    })

    it("should remove identifying headers", () => {
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

      expect(mockResponse.removeHeader).toHaveBeenCalledWith("X-Powered-By")
      expect(mockResponse.removeHeader).toHaveBeenCalledWith("Server")
    })

    it("should set Content Security Policy", () => {
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Content-Security-Policy",
        expect.stringContaining("default-src 'self'"),
      )
    })
  })

  describe("SecurityHeadersService", () => {
    it("should analyze configuration correctly", () => {
      const analysis = service.analyzeConfiguration()

      expect(analysis).toHaveProperty("timestamp")
      expect(analysis).toHaveProperty("headers")
      expect(analysis).toHaveProperty("configuration")
      expect(analysis).toHaveProperty("recommendations")
      expect(Array.isArray(analysis.recommendations)).toBe(true)
    })

    it("should calculate security score", () => {
      const score = service.getSecurityScore()

      expect(score).toHaveProperty("score")
      expect(score).toHaveProperty("maxScore")
      expect(score).toHaveProperty("percentage")
      expect(score.score).toBeGreaterThan(0)
      expect(score.percentage).toBeGreaterThan(0)
    })

    it("should validate CSP directives", () => {
      const directives = {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "object-src": ["'none'"],
      }

      const validation = service.validateCSPDirectives(directives)

      expect(validation).toHaveProperty("isValid")
      expect(validation).toHaveProperty("errors")
      expect(validation).toHaveProperty("warnings")
      expect(Array.isArray(validation.errors)).toBe(true)
      expect(Array.isArray(validation.warnings)).toBe(true)
    })

    it("should detect unsafe CSP directives", () => {
      const unsafeDirectives = {
        "default-src": "*",
        "script-src": ["'self'", "'unsafe-eval'"],
      }

      const validation = service.validateCSPDirectives(unsafeDirectives)

      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.warnings.length).toBeGreaterThan(0)
    })
  })
})
