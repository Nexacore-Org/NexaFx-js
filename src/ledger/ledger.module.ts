import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { LedgerEntry } from './ledger-entry.entity';
import { LedgerService } from './ledger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerEntry]),
    UsersModule,
  ],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
