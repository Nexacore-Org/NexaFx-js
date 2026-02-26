// src/gateway/gateway.module.ts
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TradingController } from './trading.controller';

@Module({
  imports: [
    // Preparing for microservices: Registering internal clients
    ClientsModule.register([
      { name: 'TRADING_SERVICE', transport: Transport.TCP, options: { port: 3001 } },
      { name: 'USER_SERVICE', transport: Transport.TCP, options: { port: 3002 } },
    ]),
  ],
  controllers: [TradingController],
})
export class GatewayModule {}

// src/gateway/trading.controller.ts
@Controller('api/v1/trading')
export class TradingController {
  constructor(@Inject('TRADING_SERVICE') private client: ClientProxy) {}

  @Post('order')
  createOrder(@Body() dto: any) {
    // Directing traffic to the domain module (gateway pattern)
    return this.client.send({ cmd: 'create_order' }, dto);
  }
}