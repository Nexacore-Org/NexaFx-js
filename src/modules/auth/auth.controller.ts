import { Body, Controller, Post, Query, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPasswordHash: string;
}

class VerifyEmailDto {
  @IsString()
  userId: string;

  @IsString()
  token: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('forgot-password')
  async forgotPassword(@Body(ValidationPipe) dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  async resetPassword(@Body(ValidationPipe) dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.token, dto.newPasswordHash);
    return { message: 'Password reset successfully.' };
  }

  @Post('verify-email')
  async verifyEmail(@Body(ValidationPipe) dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.userId, dto.token);
    return { message: 'Email verified successfully.' };
  }
}
