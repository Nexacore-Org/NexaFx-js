import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Logger,
  type RawBodyRequest,
  Req,
} from "@nestjs/common"
import type { Request } from "express"
import type { WebhookService } from "./webhook.service"
import { WebhookProvider, type WebhookStatus } from "./entities/webhook-log.entity"

@Controller("webhooks")
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name)

  constructor(private readonly webhookService: WebhookService) {}

  @Post("stripe")
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    return this.handleWebhook(WebhookProvider.STRIPE, req, headers, body, "/webhooks/stripe")
  }

  @Post("github")
  @HttpCode(HttpStatus.OK)
  async handleGitHubWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    return this.handleWebhook(WebhookProvider.GITHUB, req, headers, body, "/webhooks/github")
  }

  @Post("paypal")
  @HttpCode(HttpStatus.OK)
  async handlePayPalWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    return this.handleWebhook(WebhookProvider.PAYPAL, req, headers, body, "/webhooks/paypal")
  }

  @Post("slack")
  @HttpCode(HttpStatus.OK)
  async handleSlackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    return this.handleWebhook(WebhookProvider.SLACK, req, headers, body, "/webhooks/slack")
  }

  @Post("custom")
  @HttpCode(HttpStatus.OK)
  async handleCustomWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    return this.handleWebhook(WebhookProvider.CUSTOM, req, headers, body, "/webhooks/custom")
  }

  private async handleWebhook(
    provider: WebhookProvider,
    req: RawBodyRequest<Request>,
    headers: Record<string, string>,
    body: any,
    endpoint: string,
  ) {
    try {
      // Get raw body for signature verification
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(body))

      this.logger.log(`Received ${provider} webhook at ${endpoint}`)

      // Verify the webhook
      const verification = await this.webhookService.verifyWebhook(provider, headers, rawBody, endpoint)

      if (!verification.isValid) {
        this.logger.warn(`Webhook verification failed: ${verification.error}`)
        throw new UnauthorizedException(`Webhook verification failed: ${verification.error}`)
      }

      // Process the webhook
      const result = await this.webhookService.processWebhook(provider, body, headers)

      this.logger.log(`Successfully processed ${provider} webhook: ${result.id}`)

      return {
        success: true,
        message: "Webhook processed successfully",
        id: result.id,
        processingTime: result.processingTime,
      }
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`)

      if (error instanceof UnauthorizedException) {
        throw error
      }

      throw new BadRequestException(`Webhook processing failed: ${error.message}`)
    }
  }

  @Get("logs")
  async getWebhookLogs(
    @Query("provider") provider?: WebhookProvider,
    @Query("status") status?: WebhookStatus,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 100
    const parsedOffset = offset ? Number.parseInt(offset, 10) : 0

    return this.webhookService.getWebhookLogs(provider, status, parsedLimit, parsedOffset)
  }

  @Get("stats")
  async getWebhookStats() {
    return this.webhookService.getWebhookStats()
  }

  @Post("test/:provider")
  @HttpCode(HttpStatus.OK)
  async testWebhook(
    @Param("provider") provider: WebhookProvider,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    // This endpoint is for testing webhook verification
    // In production, you might want to restrict access to this endpoint

    const rawBody = Buffer.from(JSON.stringify(body))
    const verification = await this.webhookService.verifyWebhook(
      provider,
      headers,
      rawBody,
      `/webhooks/test/${provider}`,
    )

    return {
      provider,
      isValid: verification.isValid,
      error: verification.error,
      timestamp: verification.timestamp,
    }
  }
}
