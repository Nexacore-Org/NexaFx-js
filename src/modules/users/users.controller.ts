import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { VerifiedGuard } from '../auth/guards/verified.guard';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';
import { ActivityTimelineService } from './services/activity-timeline.service';
import { FinancialSummaryService } from './services/financial-summary.service';
import { AccountHealthService } from './services/account-health.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly activityTimelineService: ActivityTimelineService,
    private readonly financialSummaryService: FinancialSummaryService,
    private readonly accountHealthService: AccountHealthService,
  ) {}

  private getUserId(req: any): string {
    if (req.user?.id) return req.user.id;
    const mockId = req.headers?.['x-user-id'];
    if (mockId) return mockId;
    throw new UnauthorizedException('User ID could not be determined from request');
  }

  // ---------------------------------------------------------------------------
  // Profile (issue #315)
  // ---------------------------------------------------------------------------

  @Get('me')
  @SkipAudit()
  @ApiOperation({ summary: 'Get current user full profile (excludes password, tokens)' })
  @ApiOkResponse({ description: 'User profile' })
  async getProfile(@Request() req) {
    return this.usersService.getProfile(this.getUserId(req));
  }

  @Patch('me')
  @AuditLog({
    action: 'UPDATE_PROFILE',
    entity: 'User',
    description: 'User updated their profile',
  })
  @ApiOperation({ summary: 'Update name, timezone, currency preference, language' })
  @ApiOkResponse({ description: 'Updated user profile' })
  async updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(this.getUserId(req), dto);
  }

  @Post('me/deactivate')
  @UseGuards(VerifiedGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog({
    action: 'DEACTIVATE_ACCOUNT',
    entity: 'User',
    description: 'User deactivated their own account',
  })
  @ApiOperation({ summary: 'Soft-delete account and revoke all active sessions' })
  async deactivateAccount(@Request() req) {
    await this.usersService.deactivateUser(this.getUserId(req));
  }

  // ---------------------------------------------------------------------------
  // Activity timeline (issue #316)
  // ---------------------------------------------------------------------------

  @Get(':id/activity')
  @SkipAudit()
  @ApiOperation({ summary: 'Get chronological activity events for a user' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination (ISO timestamp)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of events per page (default 20)' })
  async getActivity(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityTimelineService.getTimeline(id, {
      cursor,
      limit: limit ? Number(limit) : 20,
    });
  }

  // ---------------------------------------------------------------------------
  // Financial summary (issue #316)
  // ---------------------------------------------------------------------------

  @Get('me/financial-summary')
  @SkipAudit()
  @ApiOperation({ summary: 'Get volume, success rate, top currencies, account age' })
  @ApiOkResponse({ description: 'Financial summary' })
  async getFinancialSummary(@Request() req) {
    return this.financialSummaryService.getSummary(this.getUserId(req));
  }

  // ---------------------------------------------------------------------------
  // Account health score (issue #316)
  // ---------------------------------------------------------------------------

  @Get('me/health')
  @SkipAudit()
  @ApiOperation({ summary: 'Get health score 0-100 with breakdown and improvement suggestions' })
  @ApiOkResponse({ description: 'Account health score' })
  async getHealthScore(@Request() req) {
    return this.accountHealthService.getHealthScore(this.getUserId(req));
  }
}
