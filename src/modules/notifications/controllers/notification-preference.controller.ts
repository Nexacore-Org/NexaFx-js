import { Body, Controller, Get, Put, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationPreferenceService, UpdatePreferenceDto } from '../services/notification-preference.service';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@Controller('users/me/notification-preferences')
export class NotificationPreferenceController {
  constructor(
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get notification preferences grouped by type' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved successfully' })
  async getPreferences(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const grouped = await this.preferenceService.getPreferences(userId);
    return { data: grouped };
  }

  @Put()
  @ApiOperation({ summary: 'Update notification preferences atomically' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async updatePreferences(
    @Request() req: any,
    @Body() body: { preferences: UpdatePreferenceDto[] },
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    await this.preferenceService.updatePreferences(userId, body.preferences);
    const grouped = await this.preferenceService.getPreferences(userId);
    return { data: grouped, message: 'Preferences updated' };
  }
}
