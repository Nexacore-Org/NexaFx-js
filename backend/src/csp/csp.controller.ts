import { Controller, Post, Get, Req, UseGuards, Query } from "@nestjs/common"
import type { Request } from "express"
import type { CspService } from "./csp.service"
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard"

@Controller("security/csp")
export class CspController {
  constructor(private readonly cspService: CspService) {}

  /**
   * CSP violation reporting endpoint
   */
  @Post("report")
  async reportViolation(report: any, @Req() req: Request) {
    try {
      this.cspService.logViolation(report, req)
      return { success: true, message: "Violation report received" }
    } catch (error) {
      return { success: false, message: "Failed to process violation report" }
    }
  }

  /**
   * Get CSP violation reports (admin only)
   */
  @Get("violations")
  @UseGuards(JwtAuthGuard)
  async getViolations(@Query("limit") limit?: string) {
    const limitNum = limit ? Number.parseInt(limit, 10) : 100
    const reports = this.cspService.getViolationReports(limitNum)
    return {
      success: true,
      data: reports,
      count: reports.length,
    }
  }

  /**
   * Get CSP violation statistics (admin only)
   */
  @Get("violations/stats")
  @UseGuards(JwtAuthGuard)
  async getViolationStats() {
    const stats = this.cspService.getViolationStats()
    return {
      success: true,
      data: stats,
    }
  }

  /**
   * Clear CSP violation reports (admin only)
   */
  @Post("violations/clear")
  @UseGuards(JwtAuthGuard)
  async clearViolations() {
    this.cspService.clearViolationReports()
    return {
      success: true,
      message: "Violation reports cleared",
    }
  }

  /**
   * Get current CSP configuration (admin only)
   */
  @Get("config")
  @UseGuards(JwtAuthGuard)
  async getCspConfig(@Req() req: Request) {
    const config = this.cspService.getCspConfig(req)
    return {
      success: true,
      data: config,
    }
  }
}
