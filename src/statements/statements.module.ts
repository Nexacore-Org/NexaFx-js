import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import {
  QUEUE_NAMES,
  getDefaultJobOptions,
  isBullEnabled,
} from '../queues/queue.constants';
import { StatementsService } from './statements.service';
import { StatementsController } from './statements.controller';
import { StatementsProcessor } from './statements.processor';
import { Transaction } from '../transactions/transaction.entity';
import { FxTrade } from '../fx/fx-trade.entity';
import { UsersModule } from '../users/users.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, FxTrade]),
    ...(isBullEnabled()
      ? [
          BullModule.registerQueue({
            name: QUEUE_NAMES.STATEMENTS,
            defaultJobOptions: getDefaultJobOptions(),
          }),
        ]
      : []),
    AuditModule,
    UsersModule,
    DocumentsModule,
    MailModule,
    AuthModule,
  ],
  controllers: [StatementsController],
  providers: [StatementsService, StatementsProcessor],
  exports: [StatementsService],
})
export class StatementsModule {}
