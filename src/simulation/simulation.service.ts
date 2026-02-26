// src/modules/simulation/simulation.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SimulationService {
  async simulateExecution(orderData: any) {
    // Mocking 1-3 second delay for "blockchain" processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      status: 'SUCCESS',
      txHash: `sim_0x${Math.random().toString(16).slice(2)}`,
      simulated: true,
      executionPrice: orderData.price * (1 + (Math.random() * 0.001))
    };
  }
}

// src/common/guards/sandbox.interceptor.ts
@Injectable()
export class SandboxInterceptor implements NestInterceptor {
  constructor(private simulation: SimulationService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-sandbox-mode'] === 'true') {
       // Short-circuit the real provider and return simulation
       const result = await this.simulation.simulateExecution(request.body);
       return of(result); 
    }
    return next.handle();
  }
}