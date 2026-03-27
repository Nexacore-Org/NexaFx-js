import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BlockchainService } from './blockchain.service';
import { ConfirmationTracker } from './confirmation.tracker';

@Module({
  imports: [HttpModule],
  providers: [BlockchainService, ConfirmationTracker],
  exports: [BlockchainService, ConfirmationTracker],
})
export class BlockchainModule {}
