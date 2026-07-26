import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { CurrencyPair } from './entities/currency-pair.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CurrencyPair])],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService, TypeOrmModule],
})
export class CurrenciesModule {}
