import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    BullModule.registerQueue({ name: 'statements' }),
    UsersModule,
    DocumentsModule,
    MailModule,
    AuthModule,
  ],
  controllers: [StatementsController],
  providers: [StatementsService, StatementsProcessor],
})
export class StatementsModule {}
