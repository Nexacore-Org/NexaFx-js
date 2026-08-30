import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  NotificationPreferencesService,
  UpdatePreferenceDto as UpdatePreferenceBody,
} from './notification-preferences.service';
import { UpdatePreferencesRequestDto } from './dto/update-preferences.dto';

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
    @Body() body: UpdatePreferencesRequestDto,
  ) {
    const userId = req.user?.sub ?? '';
    return this.preferencesService.updatePreferences(userId, body.preferences);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  patchPreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: { preferences: UpdatePreferenceBody[] },
  ) {
    const userId = req.user?.sub ?? '';
    return this.preferencesService.updatePreferences(userId, body.preferences);
  }
}
