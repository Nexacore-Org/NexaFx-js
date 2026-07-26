import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, User])],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
