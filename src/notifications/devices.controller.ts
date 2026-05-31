import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PushNotificationService } from './push/push.service';
import { DevicePlatform } from './device-token.entity';

export interface RegisterDeviceDto {
  userId: string;
  token: string;
  platform: DevicePlatform;
}

@Controller('api/v1/devices')
export class DevicesController {
  constructor(private readonly pushService: PushNotificationService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDeviceDto) {
    return this.pushService.registerToken(dto.userId, dto.token, dto.platform);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deregister(@Param('token') token: string) {
    await this.pushService.deregisterToken(token);
  }
}
