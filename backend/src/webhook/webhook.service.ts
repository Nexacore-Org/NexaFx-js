import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { createHmac, timingSafeEqual } from "crypto"
import { WebhookLog, WebhookStatus, WebhookProvider } from "./entities/webhook-log.entity"
import type {
  WebhookVerificationResult,
  WebhookConfig,
  ProcessedWebhook,
} from "./interfaces/webhook-verification.interface"

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)
  private readonly webhookConfigs: Map<WebhookProvider, WebhookConfig> = new Map();

  constructor(
    @InjectRepository(WebhookLog)
    private webhookLogRepository: Repository<WebhookLog>,
  ) {
    this.webhookLogRepository = webhookLogRepository
    this.initializeWebhookConfigs()
  }

  private initializeWebhookConfigs(): void {
    // Initialize webhook configurations for different providers
    this.webhookConfigs.set(WebhookProvider.STRIPE, {
      provider: "stripe",
      secret: process.env.STRIPE_WEBHOOK_SECRET || "",
      signatureHeader: "stripe-signature",
      timestampHeader: "stripe-timestamp",
      toleranceSeconds: 300, // 5 minutes
    })

    this.webhookConfigs.set(WebhookProvider.GITHUB, {
      provider: "github",
      secret: process.env.GITHUB_WEBHOOK_SECRET || "",
      signatureHeader: "x-hub-signature-256",
      toleranceSeconds: 300,
    })

    this.webhookConfigs.set(WebhookProvider.PAYPAL, {
      provider: "paypal",
      secret: process.env.PAYPAL_WEBHOOK_SECRET || "",
      signatureHeader: "paypal-auth-algo",
      toleranceSeconds: 300,
    })

    this.webhookConfigs.set(WebhookProvider.SLACK, {
      provider: "slack",
      secret: process.env.SLACK_WEBHOOK_SECRET || "",
      signatureHeader: "x-slack-signature",
      timestampHeader: "x-slack-request-timestamp",
      toleranceSeconds: 300,
    })

    this.webhookConfigs.set(WebhookProvider.CUSTOM, {
      provider: "custom",
      secret: process.env.CUSTOM_WEBHOOK_SECRET || "",
      signatureHeader: "x-webhook-signature",
      timestampHeader: "x-webhook-timestamp",
      toleranceSeconds: 300,
    })
  }

  async verifyWebhook(
    provider: WebhookProvider,
    headers: Record<string, string>,
    payload: string | Buffer,
    endpoint: string,
  ): Promise<WebhookVerificationResult> {
    const startTime = Date.now()
    const config = this.webhookConfigs.get(provider)

    if (!config || !config.secret) {
      this.logger.error(`No configuration found for provider: ${provider}`)
      await this.logWebhook(
        provider,
        endpoint,
        "POST",
        headers,
        null,
        WebhookStatus.REJECTED,
        "No configuration found",
        null,
        Date.now() - startTime,
      )
      return { isValid: false, error: "Provider not configured" }
    }

    try {
      const verification = await this.performVerification(config, headers, payload)

      if (verification.isValid) {
        await this.logWebhook(
          provider,
          endpoint,
          "POST",
          headers,
          payload,
          WebhookStatus.SUCCESS,
          null,
          this.extractSignature(headers, config.signatureHeader),
          Date.now() - startTime,
        )
      } else {
        await this.logWebhook(
          provider,
          endpoint,
          "POST",
          headers,
          null,
          WebhookStatus.REJECTED,
          verification.error,
          this.extractSignature(headers, config.signatureHeader),
          Date.now() - startTime,
        )
      }

      return verification
    } catch (error) {
      this.logger.error(`Webhook verification failed: ${error.message}`)
      await this.logWebhook(
        provider,
        endpoint,
        "POST",
        headers,
        null,
        WebhookStatus.FAILED,
        error.message,
        null,
        Date.now() - startTime,
      )
      return { isValid: false, error: error.message }
    }
  }

  private async performVerification(
    config: WebhookConfig,
    headers: Record<string, string>,
    payload: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    const signature = this.extractSignature(headers, config.signatureHeader)

    if (!signature) {
      return { isValid: false, error: "Missing signature header" }
    }

    // Check timestamp if required
    if (config.timestampHeader) {
      const timestampResult = this.verifyTimestamp(headers, config)
      if (!timestampResult.isValid) {
        return timestampResult
      }
    }

    // Verify signature based on provider
    switch (config.provider) {
      case "stripe":
        return this.verifyStripeSignature(signature, payload, config.secret)
      case "github":
        return this.verifyGitHubSignature(signature, payload, config.secret)
      case "paypal":
        return this.verifyPayPalSignature(headers, payload, config.secret)
      case "slack":
        return this.verifySlackSignature(signature, headers, payload, config.secret)
      case "custom":
      default:
        return this.verifyCustomSignature(signature, payload, config.secret)
    }
  }

  private verifyStripeSignature(
    signature: string,
    payload: string | Buffer,
    secret: string,
  ): WebhookVerificationResult {
    try {
      const elements = signature.split(",")
      const signatureHash = elements.find((element) => element.startsWith("v1="))?.split("=")[1]
      const timestamp = elements.find((element) => element.startsWith("t="))?.split("=")[1]

      if (!signatureHash || !timestamp) {
        return { isValid: false, error: "Invalid Stripe signature format" }
      }

      const payloadString = typeof payload === "string" ? payload : payload.toString()
      const signedPayload = `${timestamp}.${payloadString}`
      const expectedSignature = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex")

      const isValid = timingSafeEqual(Buffer.from(signatureHash, "hex"), Buffer.from(expectedSignature, "hex"))

      return { isValid, timestamp: Number.parseInt(timestamp, 10) }
    } catch (error) {
      return { isValid: false, error: `Stripe verification failed: ${error.message}` }
    }
  }

  private verifyGitHubSignature(
    signature: string,
    payload: string | Buffer,
    secret: string,
  ): WebhookVerificationResult {
    try {
      const payloadString = typeof payload === "string" ? payload : payload.toString()
      const expectedSignature = `sha256=${createHmac("sha256", secret).update(payloadString, "utf8").digest("hex")}`

      const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))

      return { isValid }
    } catch (error) {
      return { isValid: false, error: `GitHub verification failed: ${error.message}` }
    }
  }

  private verifyPayPalSignature(
    headers: Record<string, string>,
    payload: string | Buffer,
    secret: string,
  ): WebhookVerificationResult {
    try {
      // PayPal uses a more complex verification process
      // This is a simplified version - in production, you'd use PayPal's SDK
      const authAlgo = headers["paypal-auth-algo"]
      const transmission = headers["paypal-transmission-id"]
      const certId = headers["paypal-cert-id"]
      const transmissionTime = headers["paypal-transmission-time"]

      if (!authAlgo || !transmission || !certId || !transmissionTime) {
        return { isValid: false, error: "Missing PayPal headers" }
      }

      // In a real implementation, you would verify against PayPal's certificate
      // For now, we'll do a basic HMAC verification
      const payloadString = typeof payload === "string" ? payload : payload.toString()
      const expectedSignature = createHmac("sha256", secret).update(payloadString, "utf8").digest("hex")
      const providedSignature = headers["paypal-auth-signature"] || ""

      const isValid = timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))

      return { isValid }
    } catch (error) {
      return { isValid: false, error: `PayPal verification failed: ${error.message}` }
    }
  }

  private verifySlackSignature(
    signature: string,
    headers: Record<string, string>,
    payload: string | Buffer,
    secret: string,
  ): WebhookVerificationResult {
    try {
      const timestamp = headers["x-slack-request-timestamp"]

      if (!timestamp) {
        return { isValid: false, error: "Missing Slack timestamp" }
      }

      const payloadString = typeof payload === "string" ? payload : payload.toString()
      const signedPayload = `v0:${timestamp}:${payloadString}`
      const expectedSignature = `v0=${createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex")}`

      const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))

      return { isValid, timestamp: Number.parseInt(timestamp, 10) }
    } catch (error) {
      return { isValid: false, error: `Slack verification failed: ${error.message}` }
    }
  }

  private verifyCustomSignature(
    signature: string,
    payload: string | Buffer,
    secret: string,
  ): WebhookVerificationResult {
    try {
      const payloadString = typeof payload === "string" ? payload : payload.toString()
      const expectedSignature = createHmac("sha256", secret).update(payloadString, "utf8").digest("hex")

      const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))

      return { isValid }
    } catch (error) {
      return { isValid: false, error: `Custom verification failed: ${error.message}` }
    }
  }

  private verifyTimestamp(headers: Record<string, string>, config: WebhookConfig): WebhookVerificationResult {
    if (!config.timestampHeader) {
      return { isValid: true }
    }

    const timestampHeader = headers[config.timestampHeader]

    if (!timestampHeader) {
      return { isValid: false, error: "Missing timestamp header" }
    }

    const timestamp = Number.parseInt(timestampHeader, 10)
    const currentTime = Math.floor(Date.now() / 1000)
    const timeDifference = Math.abs(currentTime - timestamp)

    if (timeDifference > config.toleranceSeconds) {
      return { isValid: false, error: "Request timestamp too old" }
    }

    return { isValid: true, timestamp }
  }

  private extractSignature(headers: Record<string, string>, signatureHeader: string): string | null {
    // Try different case variations of the header
    const headerVariations = [signatureHeader, signatureHeader.toLowerCase(), signatureHeader.toUpperCase()]

    for (const variation of headerVariations) {
      if (headers[variation]) {
        return headers[variation]
      }
    }

    return null
  }

  private async logWebhook(
    provider: WebhookProvider,
    endpoint: string,
    method: string,
    headers: Record<string, string>,
    payload: any,
    status: WebhookStatus,
    errorMessage: string | null,
    signature: string | null,
    processingTimeMs: number,
  ): Promise<void> {
    try {
      const webhookLog = this.webhookLogRepository.create({
        provider,
        endpoint,
        method,
        headers,
        payload: payload ? (typeof payload === "string" ? JSON.parse(payload) : payload) : null,
        status,
        errorMessage,
        signature,
        timestamp: Date.now(),
        processingTimeMs,
      })

      await this.webhookLogRepository.save(webhookLog)
    } catch (error) {
      this.logger.error(`Failed to log webhook: ${error.message}`)
    }
  }

  async processWebhook(
    provider: WebhookProvider,
    payload: any,
    headers: Record<string, string>,
  ): Promise<ProcessedWebhook> {
    const startTime = Date.now()

    // Process the webhook based on provider
    switch (provider) {
      case WebhookProvider.STRIPE:
        return this.processStripeWebhook(payload, headers, startTime)
      case WebhookProvider.GITHUB:
        return this.processGitHubWebhook(payload, headers, startTime)
      case WebhookProvider.PAYPAL:
        return this.processPayPalWebhook(payload, headers, startTime)
      case WebhookProvider.SLACK:
        return this.processSlackWebhook(payload, headers, startTime)
      default:
        return this.processCustomWebhook(payload, headers, startTime)
    }
  }

  private async processStripeWebhook(
    payload: any,
    headers: Record<string, string>,
    startTime: number,
  ): Promise<ProcessedWebhook> {
    // Handle Stripe-specific webhook processing
    this.logger.log(`Processing Stripe webhook: ${payload.type}`)

    // Add your Stripe-specific business logic here
    // For example: handle payment success, subscription updates, etc.

    return {
      id: payload.id,
      provider: "stripe",
      payload,
      headers,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
    }
  }

  private async processGitHubWebhook(
    payload: any,
    headers: Record<string, string>,
    startTime: number,
  ): Promise<ProcessedWebhook> {
    // Handle GitHub-specific webhook processing
    const event = headers["x-github-event"]
    this.logger.log(`Processing GitHub webhook: ${event}`)

    // Add your GitHub-specific business logic here
    // For example: handle push events, pull requests, etc.

    return {
      id: payload.id || `github-${Date.now()}`,
      provider: "github",
      payload,
      headers,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
    }
  }

  private async processPayPalWebhook(
    payload: any,
    headers: Record<string, string>,
    startTime: number,
  ): Promise<ProcessedWebhook> {
    // Handle PayPal-specific webhook processing
    this.logger.log(`Processing PayPal webhook: ${payload.event_type}`)

    // Add your PayPal-specific business logic here

    return {
      id: payload.id,
      provider: "paypal",
      payload,
      headers,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
    }
  }

  private async processSlackWebhook(
    payload: any,
    headers: Record<string, string>,
    startTime: number,
  ): Promise<ProcessedWebhook> {
    // Handle Slack-specific webhook processing
    this.logger.log(`Processing Slack webhook: ${payload.type}`)

    // Add your Slack-specific business logic here

    return {
      id: `slack-${Date.now()}`,
      provider: "slack",
      payload,
      headers,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
    }
  }

  private async processCustomWebhook(
    payload: any,
    headers: Record<string, string>,
    startTime: number,
  ): Promise<ProcessedWebhook> {
    // Handle custom webhook processing
    this.logger.log("Processing custom webhook")

    // Add your custom business logic here

    return {
      id: `custom-${Date.now()}`,
      provider: "custom",
      payload,
      headers,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
    }
  }

  async getWebhookLogs(
    provider?: WebhookProvider,
    status?: WebhookStatus,
    limit = 100,
    offset = 0,
  ): Promise<{ logs: WebhookLog[]; total: number }> {
    const query = this.webhookLogRepository.createQueryBuilder("log")

    if (provider) {
      query.andWhere("log.provider = :provider", { provider })
    }

    if (status) {
      query.andWhere("log.status = :status", { status })
    }

    const [logs, total] = await query.orderBy("log.createdAt", "DESC").limit(limit).offset(offset).getManyAndCount()

    return { logs, total }
  }

  async getWebhookStats(): Promise<{
    totalWebhooks: number
    successfulWebhooks: number
    failedWebhooks: number
    rejectedWebhooks: number
    averageProcessingTime: number
  }> {
    const stats = await this.webhookLogRepository
      .createQueryBuilder("log")
      .select([
        "COUNT(*) as total",
        "COUNT(CASE WHEN status = 'success' THEN 1 END) as successful",
        "COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed",
        "COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected",
        "AVG(processing_time_ms) as avgProcessingTime",
      ])
      .getRawOne()

    return {
      totalWebhooks: Number.parseInt(stats.total, 10),
      successfulWebhooks: Number.parseInt(stats.successful, 10),
      failedWebhooks: Number.parseInt(stats.failed, 10),
      rejectedWebhooks: Number.parseInt(stats.rejected, 10),
      averageProcessingTime: Number.parseFloat(stats.avgprocessingtime) || 0,
    }
  }
}
