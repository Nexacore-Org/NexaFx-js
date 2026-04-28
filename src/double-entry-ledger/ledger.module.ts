import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LedgerEntry } from './ledger-entry.entity';
import { LedgerAccount } from './ledger-account.entity';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { LedgerIntegrityJob } from './ledger-integrity.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerEntry, LedgerAccount]),
    ScheduleModule.forRoot(),
  ],
  providers: [LedgerService, LedgerIntegrityJob],
  controllers: [LedgerController],
  exports: [LedgerService],
})
export class LedgerModule {}
