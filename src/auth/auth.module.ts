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
})
export class AuthModule {}
