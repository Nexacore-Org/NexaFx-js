import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DisputeEntity } from './entities/dispute.entity';
import { DisputesService } from './services/disputes.service';
import { DisputeController, AdminDisputeController } from './controllers/dispute.controller';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DisputeEntity, TransactionEntity]),
    ScheduleModule.forRoot(),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [DisputeController, AdminDisputeController],
  providers: [DisputesService],
  exports: [DisputesService, TypeOrmModule],
})
export class DisputesModule {}
