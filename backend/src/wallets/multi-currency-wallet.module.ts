import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultiCurrencyWalletService } from './multi-currency-wallet.service';
import { MultiCurrencyWalletController } from './multi-currency-wallet.controller';
import { WalletBalance } from './entities/wallet-balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WalletBalance])],
  controllers: [MultiCurrencyWalletController],
  providers: [MultiCurrencyWalletService],
  exports: [MultiCurrencyWalletService],
})
export class MultiCurrencyWalletModule {}


