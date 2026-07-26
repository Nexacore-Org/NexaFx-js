import { Module } from '@nestjs/common';
import { RatesGateway } from './rates.gateway';

@Module({
  providers: [RatesGateway],
  exports: [RatesGateway],
})
export class RatesModule {}
