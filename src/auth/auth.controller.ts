import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PasswordResetFlowService } from './password-reset-flow.service';
import { PasswordPolicyService } from './password-policy.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { AuthTokenResponseDto } from './dto/auth-token-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LogoutDto, RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@ApiBadRequestResponse({ description: 'Validation failed' })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetFlow: PasswordResetFlowService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  /** The rules clients should display, straight from the service that enforces them. */
  @Public()
  @Get('password-policy')
  @ApiOperation({ summary: 'Current password policy' })
  getPasswordPolicy() {
    return this.passwordPolicy.getPolicy();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthTokenResponseDto })
  @ApiForbiddenResponse({ description: 'Registration not permitted' })
  register(
    @Body() dto: RegisterDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.register(dto, { ip, userAgent });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and issue an access token' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiForbiddenResponse({ description: 'Account locked' })
  login(
    @Body() dto: LoginDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, { ip, userAgent });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue new token pair' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired or revoked refresh token' })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.rotateRefreshToken(dto.refreshToken, { ip, userAgent });
  }

  /** End the current session. Send `refreshToken` to revoke a specific one; otherwise the session in the access token (`sid`) is revoked. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiNoContentResponse({ description: 'Session revoked' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async logout(
    @CurrentUser('id') userId: string,
    @CurrentUser('sid') sid?: string,
    @Body() dto?: LogoutDto,
  ) {
    await this.authService.logout(userId, sid, dto?.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Email a password reset link (same response for unknown emails)' })
  @ApiOkResponse({ description: 'Always the same generic message, whether or not the email exists' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordResetFlow.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password with a single-use reset token' })
  @ApiOkResponse({ description: 'Password changed; all sessions were signed out' })
  @ApiBadRequestResponse({ description: 'Password too weak, or the reset token is invalid or expired' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetFlow.resetPassword(dto.token, dto.newPassword);
  }
}
