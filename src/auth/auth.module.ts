import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { SharedJwtModule } from '../common/jwt/jwt.module';
import { TermsModule } from '../terms/terms.module';
import { UsersModule } from '../users/users.module';
import { UserDeactivationModule } from '../modules/user-deactivation/user-deactivation.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PasswordPolicyService } from './password-policy.service';
import { BiometricGuard } from './biometric.guard';
import { JwtAuthGuard as PassportJwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { TokenVersionService } from './token-version.service';
import { TokenVersionGuard } from './token-version.guard';
import { TokensModule } from '../tokens/tokens.module';
import { PasswordResetToken } from './password-reset.entity';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetFlowService } from './password-reset-flow.service';
import { PasswordResetRateLimiter } from './password-reset-rate-limiter';
import { AccountStatusService } from './account-status.service';
import { TokensModule } from '../tokens/tokens.module';

@Global()
@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([User, PasswordResetToken]),
    TokensModule,
    forwardRef(() => TermsModule),
    AuditModule,
    MailModule,
    TokensModule,
    EventEmitterModule,
    PassportModule,
    SharedJwtModule,
    forwardRef(() => UserDeactivationModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('jwt.secret');
        if (!secret) {
          throw new Error('JWT_SECRET is not set — refusing to start without a signing key');
        }
        return {
          secret,
          signOptions: {
            expiresIn: `${config.get<number>('jwt.expiry') ?? 3600}s`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, PasswordResetFlowService, PasswordResetRateLimiter, TokenVersionService, TokenVersionGuard, PasswordService, PasswordPolicyService, BiometricGuard, JwtAuthGuard, PassportJwtAuthGuard, JwtStrategy],
  exports: [TokensModule, AuthService, TokenVersionService, TokenVersionGuard, PasswordService, PasswordPolicyService, BiometricGuard, JwtAuthGuard, PassportJwtAuthGuard, SharedJwtModule],
  providers: [AuthService, AccountStatusService, TokenVersionService, TokenVersionGuard, PasswordService, PasswordPolicyService, BiometricGuard, JwtAuthGuard, PassportJwtAuthGuard, JwtStrategy],
  exports: [AuthService, AccountStatusService, TokenVersionService, TokenVersionGuard, PasswordService, PasswordPolicyService, BiometricGuard, JwtAuthGuard, PassportJwtAuthGuard, SharedJwtModule],
})
export class AuthModule {}
