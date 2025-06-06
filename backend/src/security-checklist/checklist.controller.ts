import { Controller, Get, Query, HttpCode, HttpStatus, Logger } from "@nestjs/common"
import type { ChecklistService } from "./checklist.service"
import type { SecurityChecklistQueryDto } from "./dto/security-checklist.dto"
import type { SecurityCheckCategory } from "./entities/security-check.entity"

@Controller("security")
export class ChecklistController {
  private readonly logger = new Logger(ChecklistController.name)

  constructor(private readonly checklistService: ChecklistService) {}

  @Get("checklist")
  @HttpCode(HttpStatus.OK)
  async getSecurityChecklist(@Query() query: SecurityChecklistQueryDto) {
    this.logger.log("Security checklist requested")
    return this.checklistService.generateSecurityChecklist(query)
  }

  @Get("checklist/summary")
  @HttpCode(HttpStatus.OK)
  async getSecuritySummary() {
    const checklist = await this.checklistService.generateSecurityChecklist({ failedOnly: false })
    return {
      summary: checklist.summary,
      criticalIssues: checklist.criticalIssues,
      recommendations: checklist.recommendations.slice(0, 5), // Top 5 recommendations
      generatedAt: checklist.generatedAt,
    }
  }

  @Get("checklist/failed")
  @HttpCode(HttpStatus.OK)
  async getFailedChecks() {
    return this.checklistService.generateSecurityChecklist({ failedOnly: true })
  }

  @Get("checklist/category/:category")
  @HttpCode(HttpStatus.OK)
  async getChecksByCategory(@Query("category") category: SecurityCheckCategory) {
    return this.checklistService.getChecksByCategory(category)
  }

  @Get("checklist/history")
  @HttpCode(HttpStatus.OK)
  async getHistoricalChecks(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 10
    return this.checklistService.getHistoricalChecks(parsedLimit)
  }

  @Get("health")
  @HttpCode(HttpStatus.OK)
  async getSecurityHealth() {
    const checklist = await this.checklistService.generateSecurityChecklist()

    return {
      status: checklist.summary.riskLevel === "LOW" ? "healthy" : "at_risk",
      riskLevel: checklist.summary.riskLevel,
      score: checklist.summary.overallScore,
      criticalIssues: checklist.criticalIssues.length,
      lastChecked: checklist.generatedAt,
    }
  }
}
