import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthService } from './auth.service';

class ForgotPasswordDto {
  @ApiProperty({ example: '[email]', description: 'Registered email address' })
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @ApiProperty({ example: '[email]' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'abc123token', description: 'Password reset token from email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewP@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPasswordHash: string;
}

class VerifyEmailDto {
  @ApiProperty({ example: 'uuid-user-id' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'verification-token' })
  @IsString()
  token: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async forgotPassword(@Body(ValidationPipe) dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body(ValidationPipe) dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.token, dto.newPasswordHash);
    return { message: 'Password reset successfully.' };
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address with token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body(ValidationPipe) dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.userId, dto.token);
    return { message: 'Email verified successfully.' };
  }
}
