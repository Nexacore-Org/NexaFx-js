import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SecretsModule } from '../secrets/secrets.module';
import { JwtAuthGuard } from './guards/jwt.guard';
import { AdminGuard } from './guards/admin.guard';
import { ReferralsModule } from '../referrals/referrals.module';
import { MailModule } from '../mail/mail.module';
import { UserDeactivationModule } from '../user-deactivation/user-deactivation.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    forwardRef(() => SecretsModule),
    forwardRef(() => ReferralsModule),
    MailModule,
    forwardRef(() => UserDeactivationModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
