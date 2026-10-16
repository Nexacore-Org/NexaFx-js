import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsModule } from '../../wallet/wallets.module';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { EscrowHold } from './entities/escrow-hold.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EscrowHold]), WalletsModule],
  controllers: [EscrowController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
