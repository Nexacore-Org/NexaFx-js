import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
@Version('1')
export class AuthController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    // In a real app, look up the user by email and send the token via email.
    // We return a generic message to prevent user enumeration.
    const mockUserId = dto.email; // placeholder — replace with real user lookup
    const token = await this.passwordResetService.createResetToken(mockUserId);

    // TODO: send email with reset link containing `token`
    // e.g. await this.mailService.sendPasswordReset(dto.email, token);
    void token; // suppress unused warning until mail service is wired

    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using a valid token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or used token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const userId = await this.passwordResetService.validateToken(dto.token);

    // TODO: hash newPassword and update the user record
    // e.g. await this.usersService.updatePassword(userId, dto.newPassword);
    // TODO: invalidate all refresh tokens for userId
    // e.g. await this.authService.revokeAllSessions(userId);
    void userId;

    await this.passwordResetService.consumeToken(dto.token);

    return { message: 'Password has been reset successfully.' };
import { Body, Controller, HttpCode, HttpStatus, Post, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: { email: string; password: string }) {
    return this.authService.register(body.email, body.password);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Request() req: { user: { id: string } }) {
    return this.authService.logout(req.user.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyEmail(body.email, body.otp);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email);
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
  }
}
