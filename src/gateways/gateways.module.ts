import { Module } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';

@Module({
  providers: [WalletGateway],
  exports: [WalletGateway],
})
export class WalletGatewayModule {}
