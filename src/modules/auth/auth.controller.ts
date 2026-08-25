import {
  Body,
  Controller,
  Post,
  Query,
  ValidationPipe,
  UseGuards,
  UseInterceptors,
  ConflictException,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { AuthService } from './auth.service';
import { Idempotent } from '../../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';

class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  passwordHash: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  passwordHash: string;
}

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

class ResendVerificationDto {
  @IsEmail()
  email: string;
}

@Controller('api/v1/legacy-auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async signup(@Body(ValidationPipe) dto: SignupDto) {
    const existing = await this.authService.findUserByEmail(dto.email);
    if (existing && !existing.deletedAt) {
      throw new ConflictException('User with this email already exists');
    }

    const user = await this.authService.createUser({
      email: dto.email,
      passwordHash: dto.passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    await this.authService.linkReferralOnRegistration(user.id, dto.referralCode);
    await this.authService.sendEmailVerification(user.id, user.email);

    const isEmailVerified = !!user.emailVerifiedAt;

    return {
      message: 'Account created successfully.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified,
      },
    };
  }

  @Post('login')
  async login(@Body(ValidationPipe) dto: LoginDto) {
    const result = await this.authService.login(dto.email, dto.passwordHash);
    const isEmailVerified = !!result.user.emailVerifiedAt;

    return {
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        isEmailVerified,
      },
      ...(isEmailVerified ? {} : { requiresEmailVerification: true }),
    };
  }

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

  @Post('resend-verification')
  async resendVerification(@Body(ValidationPipe) dto: ResendVerificationDto) {
    await this.authService.resendVerification(dto.email);
    return { message: 'If that email exists, a verification link has been sent.' };
  }
}
