import { Controller, Get, Post, Body, Res } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger"
import type { Response } from "express"
import type { SecurityHeadersService } from "./security-headers.service"
import type { SecurityHeadersMiddleware } from "./security-headers.middleware"

@ApiTags("Security Headers")
@Controller("security")
export class SecurityHeadersController {
  constructor(
    private readonly securityHeadersService: SecurityHeadersService,
    private readonly securityHeadersMiddleware: SecurityHeadersMiddleware,
  ) {}

  @Get("headers/test")
  @ApiOperation({ summary: "Test security headers implementation" })
  @ApiResponse({ status: 200, description: "Returns current response headers" })
  testHeaders(@Res() res: Response): any {
    // This endpoint will have all security headers applied by the middleware
    const headers = {};
    res.getHeaderNames().forEach((name) => {
      headers[name] = res.getHeader(name)
    })

    return res.json({
      message: "Security headers test endpoint",
      appliedHeaders: headers,
      timestamp: new Date().toISOString(),
    })
  }

  @Get("analysis")
  @ApiOperation({ summary: "Get security headers analysis" })
  @ApiResponse({ status: 200, description: "Security headers configuration analysis" })
  getAnalysis() {
    return this.securityHeadersService.analyzeConfiguration()
  }

  @Get("score")
  @ApiOperation({ summary: "Get security score" })
  @ApiResponse({ status: 200, description: "Security score based on enabled headers" })
  getSecurityScore() {
    return this.securityHeadersService.getSecurityScore()
  }

  @Get("configuration")
  @ApiOperation({ summary: "Get current security headers configuration" })
  @ApiResponse({ status: 200, description: "Current middleware configuration" })
  getConfiguration() {
    return {
      configuration: this.securityHeadersMiddleware.getConfiguration(),
      timestamp: new Date().toISOString(),
    }
  }

  @Post("csp/report")
  @ApiOperation({ summary: "CSP violation report endpoint" })
  @ApiResponse({ status: 200, description: "CSP report received" })
  handleCSPReport(@Body() report: any) {
    this.securityHeadersService.handleCSPReport(report)
    return { message: "CSP report received", timestamp: new Date().toISOString() }
  }

  @Post("validate/csp")
  @ApiOperation({ summary: "Validate CSP directives" })
  @ApiResponse({ status: 200, description: "CSP validation result" })
  validateCSP(@Body() body: { directives: Record<string, string | string[]> }) {
    return this.securityHeadersService.validateCSPDirectives(body.directives)
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for security headers service" })
  healthCheck() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "security-headers",
    }
  }
}
