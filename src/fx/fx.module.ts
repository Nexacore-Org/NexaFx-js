import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { FxTrade } from './fx-trade.entity';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { WalletsModule } from '../wallet/wallets.module';

@Module({
  imports: [TypeOrmModule.forFeature([FxTrade]), HttpModule, WalletsModule],
  controllers: [FxController],
  providers: [FxService, ExchangeRateService],
  exports: [FxService, ExchangeRateService],
})
export class FxModule {}
