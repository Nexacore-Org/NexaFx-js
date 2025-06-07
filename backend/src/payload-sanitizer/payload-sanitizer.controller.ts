import { Controller, Get, Post, Body, UseGuards, Query } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger"
import type { PayloadSanitizerService } from "./payload-sanitizer.service"
import type { PayloadSanitizerMiddleware } from "./payload-sanitizer.middleware"
import { SessionGuard } from "../session/guards/session.guard"
import { CurrentSession } from "../session/decorators/current-session.decorator"
import type { SessionData } from "../session/session.service"

@ApiTags("Payload Sanitizer")
@Controller("payload-sanitizer")
@UseGuards(SessionGuard)
@ApiBearerAuth()
export class PayloadSanitizerController {
  constructor(
    private readonly payloadSanitizerService: PayloadSanitizerService,
    private readonly payloadSanitizerMiddleware: PayloadSanitizerMiddleware,
  ) {}

  @Get("statistics")
  @ApiOperation({ summary: "Get payload sanitizer statistics" })
  @ApiResponse({ status: 200, description: "Statistics retrieved successfully" })
  async getStatistics(@Query("session") session: string) {
    // Only allow admins to view statistics
    if (session !== "admin") {
      throw new Error("Unauthorized to view payload sanitizer statistics")
    }

    const stats = this.payloadSanitizerService.getStatistics()
    return {
      ...stats,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("reset-statistics")
  @ApiOperation({ summary: "Reset payload sanitizer statistics" })
  @ApiResponse({ status: 200, description: "Statistics reset successfully" })
  async resetStatistics(@CurrentSession() session: SessionData) {
    // Only allow admins to reset statistics
    if (!session.roles?.includes("admin")) {
      throw new Error("Unauthorized to reset payload sanitizer statistics")
    }

    this.payloadSanitizerService.resetStatistics()
    return {
      message: "Statistics reset successfully",
      timestamp: new Date().toISOString(),
    }
  }

  @Get("configuration")
  @ApiOperation({ summary: "Get payload sanitizer configuration" })
  @ApiResponse({ status: 200, description: "Configuration retrieved successfully" })
  async getConfiguration(@CurrentSession() session: SessionData) {
    // Only allow admins to view configuration
    if (!session.roles?.includes("admin")) {
      throw new Error("Unauthorized to view payload sanitizer configuration")
    }

    const config = this.payloadSanitizerMiddleware.getConfiguration()
    return {
      configuration: config,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("validate")
  @ApiOperation({ summary: "Validate a string against payload sanitizer rules" })
  @ApiResponse({ status: 200, description: "Validation result" })
  async validateString(@Body() body: { value: string }, @CurrentSession() session: SessionData) {
    // Only allow admins to use validation endpoint
    if (!session.roles?.includes("admin")) {
      throw new Error("Unauthorized to use payload sanitizer validation")
    }

    const result = this.payloadSanitizerService.validateString(body.value)
    return {
      value: body.value.length > 100 ? `${body.value.substring(0, 100)}... (truncated)` : body.value,
      isValid: result.isValid,
      detections: result.detections,
      timestamp: new Date().toISOString(),
    }
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for payload sanitizer" })
  healthCheck() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "payload-sanitizer",
    }
  }
}
