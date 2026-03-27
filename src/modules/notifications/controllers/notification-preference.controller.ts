import { Body, Controller, Get, Put, Request } from '@nestjs/common';
import { NotificationPreferenceService, UpdatePreferenceDto } from '../services/notification-preference.service';

@Controller('users/me/notification-preferences')
export class NotificationPreferenceController {
  constructor(
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get()
  async getPreferences(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const grouped = await this.preferenceService.getPreferences(userId);
    return { data: grouped };
  }

  @Put()
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
