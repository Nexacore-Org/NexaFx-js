import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import type { SuspiciousActivityService } from "./suspicious-activity.service"
import type { ActivityEventDto } from "./dto/activity-event.dto"
import type { ActivityQueryDto } from "./dto/activity-query.dto"
import type { CreateRuleDto, UpdateRuleDto } from "./dto/rule-dto.ts"
import { AdminGuard } from "../auth/guards/admin.guard"
import { AuthGuard } from "../auth/guards/auth.guard"
import type { RuleStatus } from "./entities/activity-rule.entity"

@Controller("security")
export class SuspiciousActivityController {
  private readonly logger = new Logger(SuspiciousActivityController.name)

  constructor(private readonly suspiciousActivityService: SuspiciousActivityService) {}

  @Post("activity/track")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async trackActivity(@Body() activityEvent: ActivityEventDto) {
    this.logger.debug(`Tracking activity: ${activityEvent.activityType}`);
    return this.suspiciousActivityService.trackActivity({
      ...activityEvent,
      timestamp: new Date(),
    });
  }

  @Get("suspicious-activity")
  @UseGuards(AdminGuard)
  async getSuspiciousActivities(@Query() query: ActivityQueryDto) {
    return this.suspiciousActivityService.getSuspiciousActivities(query);
  }

  @Get("suspicious-activity/:id")
  @UseGuards(AdminGuard)
  async getSuspiciousActivityById(@Param("id") id: string) {
    return this.suspiciousActivityService.getSuspiciousActivityById(id);
  }

  @Patch("suspicious-activity/:id/resolve")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async resolveSuspiciousActivity(
    @Param("id") id: string,
    @Body("resolutionNotes") resolutionNotes: string,
    @Body("resolvedById") resolvedById: string,
  ) {
    return this.suspiciousActivityService.resolveSuspiciousActivity(id, resolutionNotes, resolvedById)
  }

  @Get("suspicious-activity/stats")
  @UseGuards(AdminGuard)
  async getActivityStats() {
    return this.suspiciousActivityService.getActivityStats()
  }

  @Get("user/:userId/risk-profile")
  @UseGuards(AdminGuard)
  async getUserRiskProfile(@Param("userId") userId: string) {
    return this.suspiciousActivityService.getUserRiskProfile(userId);
  }

  @Get("activity-rules")
  @UseGuards(AdminGuard)
  async getAllRules() {
    return this.suspiciousActivityService.getAllRules()
  }

  @Get("activity-rules/:id")
  @UseGuards(AdminGuard)
  async getRuleById(@Param("id") id: string) {
    return this.suspiciousActivityService.getRuleById(id);
  }

  @Post("activity-rules")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createRule(@Body() createRuleDto: CreateRuleDto) {
    return this.suspiciousActivityService.createRule(createRuleDto);
  }

  @Patch("activity-rules/:id")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateRule(@Param("id") id: string, @Body() updateRuleDto: UpdateRuleDto) {
    return this.suspiciousActivityService.updateRule(id, updateRuleDto)
  }

  @Delete("activity-rules/:id")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param("id") id: string) {
    return this.suspiciousActivityService.deleteRule(id);
  }

  @Patch("activity-rules/:id/status")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async toggleRuleStatus(@Param("id") id: string, @Body("status") status: RuleStatus) {
    return this.suspiciousActivityService.toggleRuleStatus(id, status)
  }
}
