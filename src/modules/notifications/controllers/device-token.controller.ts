import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PushNotificationService } from '../services/push-notification.service';
import { DevicePlatform } from '../entities/device-token.entity';

class RegisterPushTokenDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(512)
  token: string;

  @IsEnum(['ios', 'android'])
  platform: DevicePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;
}

class UnregisterPushTokenDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(512)
  token: string;
}

@Controller('users/me/push-token')
export class DeviceTokenController {
  constructor(private readonly pushService: PushNotificationService) {}

  /**
   * POST /users/me/push-token
   * Register a device token for the authenticated user.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Req() req: any, @Body() dto: RegisterPushTokenDto) {
    const userId: string = req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    const token = await this.pushService.registerToken(
      userId,
      dto.token,
      dto.platform,
      dto.deviceName,
    );

    return {
      id: token.id,
      platform: token.platform,
      deviceName: token.deviceName,
      createdAt: token.createdAt,
    };
  }

  /**
   * DELETE /users/me/push-token
   * Unregister a device token for the authenticated user.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(@Req() req: any, @Body() dto: UnregisterPushTokenDto) {
    const userId: string = req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    await this.pushService.unregisterToken(userId, dto.token);
  }
}
