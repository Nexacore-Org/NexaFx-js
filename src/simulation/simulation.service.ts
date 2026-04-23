import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';

@Injectable()
export class SimulationService {
  async simulateExecution(orderData: any) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      status: 'SUCCESS',
      txHash: `sim_0x${Math.random().toString(16).slice(2)}`,
      simulated: true,
      executionPrice: orderData?.price ? orderData.price * (1 + Math.random() * 0.001) : 0,
    };
  }
}

@Injectable()
export class SandboxInterceptor implements NestInterceptor {
  constructor(private readonly simulation: SimulationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-sandbox-mode'] === 'true') {
      return of(this.simulation.simulateExecution(request.body));
    }
    return next.handle();
  }
}
