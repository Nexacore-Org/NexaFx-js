import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(() => {
    service = {
      check: jest.fn().mockResolvedValue({ status: 'healthy', stellar: 'connected' }),
    } as any;
    controller = new HealthController(service);
  });

  it('should delegate health check to service', async () => {
    const res = await controller.check();
    expect(res).toEqual({ status: 'healthy', stellar: 'connected' });
    expect(service.check).toHaveBeenCalled();
  });
});
