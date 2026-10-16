import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '../common/security.module';
import { SharedJwtModule } from '../common/jwt/jwt.module';
import { AdminApproval } from './admin-approval.entity';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdminApproval]), SecurityModule, SharedJwtModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class TransactionApprovalModule {}
