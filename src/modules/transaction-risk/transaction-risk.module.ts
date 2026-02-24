import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionRiskScoreEntity } from './entities/transaction-risk-score.entity';
import { TransactionRiskScoringService } from './services/transaction-risk-scoring.service';
import { VelocityCheck } from './services/risk-checks/velocity.check';
import { VolumeSpikeCheck } from './services/risk-checks/volume-spike.check';
import { NewDeviceCheck } from './services/risk-checks/new-device.check';
import { TransactionRiskAdminController } from './controllers/transaction-risk-admin.controller';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { DeviceEntity } from '../sessions/entities/device.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionRiskScoreEntity,
      TransactionEntity,
      DeviceEntity,
    ]),
  ],
  controllers: [TransactionRiskAdminController],
  providers: [
    TransactionRiskScoringService,
    VelocityCheck,
    VolumeSpikeCheck,
    NewDeviceCheck,
  ],
  exports: [TransactionRiskScoringService],
})
export class TransactionRiskModule {}
