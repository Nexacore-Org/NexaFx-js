import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PriceFeedGateway } from '../../../web-sockets/gateways/price-feed.gateway';

@Injectable()
export class PriceBroadcastJob {
  constructor(private readonly priceFeedGateway: PriceFeedGateway) {}

  @Cron(CronExpression.EVERY_SECOND)
  async broadcast(): Promise<void> {
    await this.priceFeedGateway.broadcastDuePrices();
  }
}
