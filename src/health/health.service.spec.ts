import { of, throwError } from 'rxjs';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockHttp: any;

  beforeEach(() => {
    mockHttp = {
      get: jest.fn(),
    };
    service = new HealthService(mockHttp);
  });

  it('should return healthy status when Stellar horizon check succeeds', async () => {
    mockHttp.get.mockReturnValue(of({ status: 200 }));
    const result = await service.check();
    expect(result.status).toBe('healthy');
    expect(result.stellar).toBe('connected');
  });

  it('should return unhealthy status when Stellar horizon check fails', async () => {
    mockHttp.get.mockReturnValue(throwError(() => new Error('Connection refused')));
    const result = await service.check();
    expect(result.status).toBe('unhealthy');
    expect(result.stellar).toBe('disconnected');
  });
});
