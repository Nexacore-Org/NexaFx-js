import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordResetToken } from './password-reset.entity';
import { PasswordResetService } from './password-reset.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PasswordResetToken])],
  controllers: [AuthController],
  providers: [PasswordResetService],
  exports: [PasswordResetService],
import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { TermsModule } from '../terms/terms.module';
import { AuditModule } from '../audit/audit.module';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => TermsModule),
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') || 'dev-secret',
        signOptions: {
          expiresIn: `${config.get<number>('jwt.expiry') ?? 3600}s`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
