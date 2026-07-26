import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Otp } from '../otp/otp.entity';
import { PasswordResetToken } from '../auth/password-reset.entity';
import { ScheduledJobsService } from './scheduled-jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Otp, PasswordResetToken])],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
