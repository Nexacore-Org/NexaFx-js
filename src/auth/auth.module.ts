import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { SharedJwtModule } from '../common/jwt/jwt.module';
import { TermsModule } from '../terms/terms.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard as PassportJwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => TermsModule),
    AuditModule,
    PassportModule,
    SharedJwtModule,
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
  providers: [AuthService, JwtAuthGuard, PassportJwtAuthGuard, JwtStrategy],
  exports: [AuthService, JwtAuthGuard, PassportJwtAuthGuard, SharedJwtModule],
})
export class AuthModule {}
