import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionsController } from './conversions.controller';
import { ConversionsService } from './conversions.service';
import { Conversion } from './entities/conversion.entity';
import { MultiCurrencyWalletModule } from '../wallets/multi-currency-wallet.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [TypeOrmModule.forFeature([Conversion]), MultiCurrencyWalletModule, ExchangeRatesModule],
  controllers: [ConversionsController],
  providers: [ConversionsService],
})
export class ConversionsModule {}


