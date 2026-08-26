import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
    interceptor = new MetricsInterceptor(service);
  });

  it('should record HTTP request metrics on handle completion', (done) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/api/v1/test' }, path: '/api/v1/test' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of('ok'),
    };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toBe('ok');
        const text = service.exposition();
        expect(text).toContain('http_requests_total{method="GET",route="/api/v1/test",status_code="200"} 1');
        done();
      },
    });
  });
});
