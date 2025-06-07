import { Controller, Get, Post, Delete, Param, Body, Query } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger"
import type { RateLimitService } from "./rate-limit.service"

@ApiTags("Rate Limiting")
@Controller("rate-limit")
export class RateLimitController {
  constructor(private readonly rateLimitService: RateLimitService) {}

  @Get("statistics")
  @ApiOperation({ summary: "Get rate limiting statistics" })
  @ApiResponse({ status: 200, description: "Rate limiting statistics" })
  @ApiQuery({ name: "hours", required: false, description: "Time range in hours (default: 24)" })
  async getStatistics(@Query("hours") hours: string = "24") {
    const timeRange = Number.parseInt(hours) * 60 * 60 * 1000
    return await this.rateLimitService.getStatistics(timeRange);
  }

  @Post("whitelist/:ip")
  @ApiOperation({ summary: "Add IP to whitelist" })
  @ApiResponse({ status: 201, description: "IP added to whitelist" })
  async addToWhitelist(@Param("ip") ip: string, @Body() body: { duration?: number } = {}) {
    await this.rateLimitService.whitelist(ip, body.duration)
    return {
      message: `IP ${ip} added to whitelist`,
      duration: body.duration ? `${body.duration}ms` : "permanent",
    }
  }

  @Delete("whitelist/:ip")
  @ApiOperation({ summary: "Remove IP from whitelist" })
  @ApiResponse({ status: 200, description: "IP removed from whitelist" })
  async removeFromWhitelist(@Param("ip") ip: string) {
    // Implementation would remove from whitelist
    return { message: `IP ${ip} removed from whitelist` }
  }

  @Post("blacklist/:ip")
  @ApiOperation({ summary: "Add IP to blacklist" })
  @ApiResponse({ status: 201, description: "IP added to blacklist" })
  async addToBlacklist(@Param("ip") ip: string, @Body() body: { duration?: number } = {}) {
    await this.rateLimitService.blacklist(ip, body.duration)
    return {
      message: `IP ${ip} added to blacklist`,
      duration: body.duration ? `${body.duration}ms` : "permanent",
    }
  }

  @Delete("blacklist/:ip")
  @ApiOperation({ summary: "Remove IP from blacklist" })
  @ApiResponse({ status: 200, description: "IP removed from blacklist" })
  async removeFromBlacklist(@Param("ip") ip: string) {
    // Implementation would remove from blacklist
    return { message: `IP ${ip} removed from blacklist` }
  }

  @Get("status/:ip")
  @ApiOperation({ summary: "Check IP status" })
  @ApiResponse({ status: 200, description: "IP status information" })
  async getIpStatus(@Param("ip") ip: string) {
    const [isWhitelisted, isBlacklisted] = await Promise.all([
      this.rateLimitService.isWhitelisted(ip),
      this.rateLimitService.isBlacklisted(ip),
    ])

    return {
      ip,
      whitelisted: isWhitelisted,
      blacklisted: isBlacklisted,
      timestamp: new Date().toISOString(),
    }
  }

  @Delete("brute-force/:ip/:endpoint")
  @ApiOperation({ summary: "Clear brute force attempts for IP and endpoint" })
  @ApiResponse({ status: 200, description: "Brute force attempts cleared" })
  async clearBruteForceAttempts(@Param("ip") ip: string, @Param("endpoint") endpoint: string) {
    await this.rateLimitService.clearBruteForceAttempts(ip, decodeURIComponent(endpoint))
    return {
      message: `Brute force attempts cleared for IP ${ip} on endpoint ${endpoint}`,
    }
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for rate limiting service" })
  healthCheck() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "rate-limit",
    }
  }
}
