import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PasswordResetFlowService } from './password-reset-flow.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { AuthTokenResponseDto } from './dto/auth-token-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetFlow: PasswordResetFlowService,
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
  @ApiOkResponse({ type: AuthTokenResponseDto })
  refresh(
    @Body('refreshToken') refreshToken: string,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.rotateRefreshToken(refreshToken, { ip, userAgent });
  }

  /** End the current session. Send `refreshToken` to revoke a specific one; otherwise the session in the access token (`sid`) is revoked. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentUser('id') userId: string,
    @CurrentUser('sid') sid?: string,
    @Body('refreshToken') refreshToken?: string,
  ) {
    await this.authService.logout(userId, sid, refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Email a password reset link (same response for unknown emails)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordResetFlow.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password with a single-use reset token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetFlow.resetPassword(dto.token, dto.newPassword);
  }
}
