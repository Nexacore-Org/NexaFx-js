import { CircuitBreakerService } from './circuit-breaker.service';
import { CircuitOpenException } from './circuit-open.exception';

export function CircuitBreaker(name: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const breaker: CircuitBreakerService =
        this.circuitBreakerService;

      if (!(await breaker.canExecute(name))) {
        throw new CircuitOpenException(name);
      }

      try {
        const result = await original.apply(this, args);
        await breaker.onSuccess(name);
        return result;
      } catch (err) {
        await breaker.onFailure(name);
        throw err;
      }
    };
  };
}