import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
    controller = new MetricsController(service);
  });

  it('should return metrics response with text/plain content-type', () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    controller.getMetrics(res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    expect(res.send).toHaveBeenCalled();
  });
});
