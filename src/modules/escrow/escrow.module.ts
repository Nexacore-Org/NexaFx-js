import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { UsersModule } from '../users/users.module';
import { WalletEntity } from '../users/entities/wallet.entity';
import { DisputesModule } from '../disputes/disputes.module';
import { DisputeEntity } from '../disputes/entities/dispute.entity';
import { EscrowController } from './controllers/escrow.controller';
import { EscrowEntity } from './entities/escrow.entity';
import { AutoReleaseJob } from './jobs/auto-release.job';
import { EscrowService } from './services/escrow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EscrowEntity, WalletEntity, TransactionEntity, DisputeEntity]),
    NotificationsModule,
    UsersModule,
    DisputesModule,
    AuthModule,
  ],
  controllers: [EscrowController],
  providers: [EscrowService, AutoReleaseJob],
  exports: [EscrowService],
})
export class EscrowModule {
  constructor(
    private readonly escrowService: EscrowService,
    private readonly autoReleaseJob: AutoReleaseJob,
  ) {
    this.escrowService.registerAutoReleaseJob(this.autoReleaseJob);
  }
}
