import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { WebhookService } from "./webhook.service"
import { WebhookLog, WebhookProvider } from "./entities/webhook-log.entity"
import { createHmac } from "crypto"

describe("WebhookService", () => {
  let service: WebhookService
  let repository: Repository<WebhookLog>

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    })),
  }

  beforeEach(async () => {
    // Set test environment variables
    process.env.STRIPE_WEBHOOK_SECRET = "test_stripe_secret"
    process.env.GITHUB_WEBHOOK_SECRET = "test_github_secret"
    process.env.CUSTOM_WEBHOOK_SECRET = "test_custom_secret"

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(WebhookLog),
          useValue: mockRepository,
        },
      ],
    }).compile()

    service = module.get<WebhookService>(WebhookService)
    repository = module.get<Repository<WebhookLog>>(getRepositoryToken(WebhookLog))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("verifyWebhook", () => {
    it("should verify a valid Stripe webhook", async () => {
      const payload = '{"test": "data"}'
      const timestamp = Math.floor(Date.now() / 1000)
      const secret = "test_stripe_secret"
      const signedPayload = `${timestamp}.${payload}`
      const signature = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex")

      const headers = {
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      }

      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.verifyWebhook(WebhookProvider.STRIPE, headers, payload, "/test")

      expect(result.isValid).toBe(true)
      expect(result.timestamp).toBe(timestamp)
    })

    it("should reject webhook with invalid signature", async () => {
      const payload = '{"test": "data"}'
      const headers = {
        "stripe-signature": "t=1234567890,v1=invalid_signature",
      }

      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.verifyWebhook(WebhookProvider.STRIPE, headers, payload, "/test")

      expect(result.isValid).toBe(false)
      expect(result.error).toContain("Stripe verification failed")
    })

    it("should reject webhook with missing signature", async () => {
      const payload = '{"test": "data"}'
      const headers = {}

      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.verifyWebhook(WebhookProvider.STRIPE, headers, payload, "/test")

      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Missing signature header")
    })

    it("should verify a valid GitHub webhook", async () => {
      const payload = '{"test": "data"}'
      const secret = "test_github_secret"
      const signature = `sha256=${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`

      const headers = {
        "x-hub-signature-256": signature,
      }

      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.verifyWebhook(WebhookProvider.GITHUB, headers, payload, "/test")

      expect(result.isValid).toBe(true)
    })

    it("should verify a valid custom webhook", async () => {
      const payload = '{"test": "data"}'
      const secret = "test_custom_secret"
      const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex")

      const headers = {
        "x-webhook-signature": signature,
      }

      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.verifyWebhook(WebhookProvider.CUSTOM, headers, payload, "/test")

      expect(result.isValid).toBe(true)
    })

    it("should reject webhook with expired timestamp", async () => {
      const payload = '{"test": "data"}'
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400 // 400 seconds ago (beyond 300s tolerance)
      const secret = "test_custom_secret"
      const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex")

      const headers = {
        "x-webhook-signature": signature,
        "x-webhook-timestamp": oldTimestamp.toString(),
      }

      mockRepository.create.mockReturnValue({})
      mockRepository.save.mockResolvedValue({})

      const result = await service.verifyWebhook(WebhookProvider.CUSTOM, headers, payload, "/test")

      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Request timestamp too old")
    })
  })

  describe("processWebhook", () => {
    it("should process a Stripe webhook", async () => {
      const payload = { id: "evt_test", type: "payment_intent.succeeded" }
      const headers = { "stripe-signature": "test" }

      const result = await service.processWebhook(WebhookProvider.STRIPE, payload, headers)

      expect(result.provider).toBe("stripe")
      expect(result.payload).toEqual(payload)
      expect(result.id).toBe("evt_test")
    })

    it("should process a GitHub webhook", async () => {
      const payload = { id: "123", action: "opened" }
      const headers = { "x-github-event": "pull_request" }

      const result = await service.processWebhook(WebhookProvider.GITHUB, payload, headers)

      expect(result.provider).toBe("github")
      expect(result.payload).toEqual(payload)
    })
  })

  describe("getWebhookStats", () => {
    it("should return webhook statistics", async () => {
      const mockStats = {
        total: "100",
        successful: "80",
        failed: "15",
        rejected: "5",
        avgprocessingtime: "150.5",
      }

      mockRepository.createQueryBuilder().getRawOne.mockResolvedValue(mockStats)

      const result = await service.getWebhookStats()

      expect(result).toEqual({
        totalWebhooks: 100,
        successfulWebhooks: 80,
        failedWebhooks: 15,
        rejectedWebhooks: 5,
        averageProcessingTime: 150.5,
      })
    })
  })
})
