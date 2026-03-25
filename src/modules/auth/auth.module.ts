fix-app-modules
import { Global, Module } from '@nestjs/common';

import { Module, forwardRef } from '@nestjs/common';
 main
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { SecretsModule } from '../secrets/secrets.module';
import { JwtAuthGuard } from './guards/jwt.guard';
import { AdminGuard } from './guards/admin.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    forwardRef(() => SecretsModule),
  ],
  providers: [AuthService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
