import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PushNotificationService } from './push/push.service';
import { DevicePlatform } from './device-token.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

export interface RegisterDeviceDto {
  token: string;
  platform: DevicePlatform;
}

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/devices')
export class DevicesController {
  constructor(private readonly pushService: PushNotificationService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Req() req: AuthenticatedRequest, @Body() dto: RegisterDeviceDto) {
    // The token is always bound to the caller, never to a body-supplied userId.
    return this.pushService.registerToken(
      req.user?.sub ?? '',
      dto.token,
      dto.platform,
    );
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deregister(
    @Req() req: AuthenticatedRequest,
    @Param('token') token: string,
  ) {
    await this.pushService.deregisterToken(token, req.user?.sub ?? '');
  }
}
