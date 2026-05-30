import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { AuthService, CredentialsDto, RegisterDto } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.register(dto, { ip, userAgent });
  }

  @Post('login')
  login(
    @Body() dto: CredentialsDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, { ip, userAgent });
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('refresh')
  async refresh(
    @Body('refreshToken') refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }

    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Body('refreshToken') refreshToken: string,
  ): Promise<{ revoked: true }> {
    if (!refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }

    return this.authService.logout(refreshToken);
  }
}
