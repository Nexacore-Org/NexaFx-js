import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeAuditLogEntity } from './entities/fee-audit-log.entity';
import { FeeAuditService } from './services/fee-audit.service';
import { FeeAuditController } from './controllers/fee-audit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeeAuditLogEntity]),
  ],
  controllers: [FeeAuditController],
  providers: [FeeAuditService],
  exports: [FeeAuditService],
})
export class FeeAuditModule {}
