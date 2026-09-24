import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Otp } from '../otp/otp.entity';
import { PasswordResetToken } from '../auth/password-reset.entity';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { WalletsModule } from '../wallet/wallets.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Otp, PasswordResetToken]),
    WalletsModule,
    AuditModule,
  ],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
