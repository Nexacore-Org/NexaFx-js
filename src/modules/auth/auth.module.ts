import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserEntity } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SecretsModule } from '../secrets/secrets.module';
import { JwtAuthGuard } from './guards/jwt.guard';
import { AdminGuard } from './guards/admin.guard';
import { VerifiedGuard } from './guards/verified.guard';
import { ReferralsModule } from '../referrals/referrals.module';
import { MailModule } from '../mail/mail.module';
import { SessionsModule } from '../sessions/sessions.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'placeholder-secret'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    forwardRef(() => SecretsModule),
    forwardRef(() => ReferralsModule),
    SessionsModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard, VerifiedGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard, VerifiedGuard],
})
export class AuthModule {}
