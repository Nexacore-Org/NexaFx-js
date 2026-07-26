import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  NotificationPreferencesService,
  UpdatePreferenceDto,
} from './notification-preferences.service';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1/notification-preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  @Get()
  getPreferences(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? '';
    return this.preferencesService.getPreferences(userId);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: { preferences: UpdatePreferenceDto[] },
  ) {
    const userId = req.user?.sub ?? '';
    return this.preferencesService.updatePreferences(userId, body.preferences);
  }
}
