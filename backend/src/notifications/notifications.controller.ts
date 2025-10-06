import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('notifications')
@UseGuards(AuthGuard('jwt')) 
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  async getPreferences(@Req() req) {
    const userId = req.user.id;
    return this.notificationsService.getPreferences(userId);
  }

  @Post('preferences')
  async updatePreferences(@Req() req, @Body() updatePreferencesDto: UpdatePreferencesDto) {
    const userId = req.user.id;
    return this.notificationsService.updatePreferences(userId, updatePreferencesDto);
  }
  
  @Get('history')
  async getHistory(@Req() req) {
    const userId = req.user.id;
    return this.notificationsService.getHistory(userId);
  }

  @Patch(':notificationId/read')
  async markAsRead(@Req() req, @Param('notificationId') notificationId: string) {
      const userId = req.user.id;
      return this.notificationsService.markAsRead(userId, notificationId);
  }
}