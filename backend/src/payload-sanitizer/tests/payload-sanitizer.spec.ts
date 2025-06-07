import { Test, type TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { PayloadSanitizerMiddleware } from "../payload-sanitizer.middleware"
import { PayloadSanitizerService } from "../payload-sanitizer.service"
import type { Request, Response } from "express"
import { jest } from "@jest/globals"

describe("PayloadSanitizerMiddleware", () => {
  let middleware: PayloadSanitizerMiddleware
  let service: PayloadSanitizerService
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let nextFunction: jest.Mock

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayloadSanitizerMiddleware,
        PayloadSanitizerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                PAYLOAD_SANITIZER_ENABLED: true,
                PAYLOAD_SANITIZER_LOG_ONLY: false,
                PAYLOAD_SANITIZER_SCAN_JSON_BODY: true,
                PAYLOAD_SANITIZER_SCAN_FORM_BODY: true,
                PAYLOAD_SANITIZER_SCAN_QUERY_PARAMS: true,
                PAYLOAD_SANITIZER_SCAN_HEADERS: false,
              }
              return config[key] ?? defaultValue
            }),
          },
        },
      ],
    }).compile()

    middleware = module.get<PayloadSanitizerMiddleware>(PayloadSanitizerMiddleware)
    service = module.get<PayloadSanitizerService>(PayloadSanitizerService)

    mockRequest = {
      path: "/test",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "test-agent",
      },
      body: {},
      query: {},
      ip: "127.0.0.1",
      connection: {
        remoteAddress: "127.0.0.1",
      },
    }

    mockResponse = {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    nextFunction = jest.fn()
  })

  it("should be defined", () => {
    expect(middleware).toBeDefined()
    expect(service).toBeDefined()
  })

  describe("middleware execution", () => {
    it("should allow safe payloads", () => {
      mockRequest.body = {
        name: "Test User",
        email: "test@example.com",
      }

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)
      expect(nextFunction).toHaveBeenCalled()
    })

    it("should detect XSS in request body", () => {
      mockRequest.body = {
        name: "Test User <script>alert('XSS')</script>",
        email: "test@example.com",
      }

      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)
      }).toThrow()
      expect(nextFunction).not.toHaveBeenCalled()
    })

    it("should detect SQL injection in query params", () => {
      mockRequest.query = {
        id: "1; DROP TABLE users;",
      }

      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)
      }).toThrow()
      expect(nextFunction).not.toHaveBeenCalled()
    })

    it("should allow requests for excluded routes", () => {
      mockRequest.path = "/health"
      mockRequest.body = {
        name: "Test User <script>alert('XSS')</script>", // Would normally be blocked
      }

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)
      expect(nextFunction).toHaveBeenCalled()
    })

    it("should allow requests with excluded content types", () => {
      mockRequest.headers["content-type"] = "multipart/form-data"
      mockRequest.body = {
        name: "Test User <script>alert('XSS')</script>", // Would normally be blocked
      }

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction)
      expect(nextFunction).toHaveBeenCalled()
    })
  })

  describe("PayloadSanitizerService", () => {
    it("should validate strings correctly", () => {
      const safeResult = service.validateString("Hello, world!")
      expect(safeResult.isValid).toBe(true)
      expect(safeResult.detections).toHaveLength(0)

      const xssResult = service.validateString("<script>alert('XSS')</script>")
      expect(xssResult.isValid).toBe(false)
      expect(xssResult.detections[0].type).toBe("XSS")

      const sqlResult = service.validateString("1; DROP TABLE users;")
      expect(sqlResult.isValid).toBe(false)
      expect(sqlResult.detections[0].type).toBe("SQL_INJECTION")
    })

    it("should track statistics correctly", () => {
      service.recordRequest()
      service.recordRequest()
      service.recordDetection("XSS", "/test", "127.0.0.1")
      service.recordDetection("SQL_INJECTION", "/api/users", "192.168.1.1")

      const stats = service.getStatistics()
      expect(stats.totalRequests).toBe(2)
      expect(stats.blockedRequests).toBe(2)
      expect(stats.detectionsByType.XSS).toBe(1)
      expect(stats.detectionsByType.SQL_INJECTION).toBe(1)
      expect(stats.lastDetections).toHaveLength(2)

      service.resetStatistics()
      const resetStats = service.getStatistics()
      expect(resetStats.totalRequests).toBe(0)
      expect(resetStats.blockedRequests).toBe(0)
    })
  })
})
