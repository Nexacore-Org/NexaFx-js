import {
  Body,
  Controller,
  Get,
  Put,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import { UserSettingsService } from '../services/user-settings.service';
import { UpdateUserSettingsDto } from '../dto/update-user-settings.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AuditLog } from '../../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';

@ApiTags('User Settings')
@ApiBearerAuth('access-token')
@Controller('users/me/settings')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  private getUserId(req: any): string {
    if (req.user?.id) return req.user.id;
    const mockId = req.headers?.['x-user-id'];
    if (mockId) return mockId;
    throw new UnauthorizedException('User ID could not be determined from request');
  }

  @Get()
  @SkipAudit()
  @ApiOperation({ summary: 'Get all user settings with defaults for new users' })
  @ApiOkResponse({ description: 'User settings' })
  async getSettings(@Request() req) {
    return this.userSettingsService.getSettings(this.getUserId(req));
  }

  @Put()
  @AuditLog({
    action: 'UPDATE_USER_SETTINGS',
    entity: 'UserSettings',
    description: 'User updated their settings',
  })
  @ApiOperation({ summary: 'Validate and persist all setting fields' })
  @ApiOkResponse({ description: 'Updated user settings' })
  async updateSettings(@Request() req, @Body() dto: UpdateUserSettingsDto) {
    return this.userSettingsService.updateSettings(this.getUserId(req), dto);
  }

  @Put('export')
  @SkipAudit()
  @ApiOperation({ summary: 'Export settings as JSON for migration' })
  @ApiOkResponse({ description: 'Settings export JSON' })
  async exportSettings(@Request() req) {
    return this.userSettingsService.exportSettings(this.getUserId(req));
  }
}
