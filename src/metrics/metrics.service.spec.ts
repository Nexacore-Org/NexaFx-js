import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should record HTTP requests and export valid exposition format', () => {
    service.recordHttpRequest('GET', '/api/v1/health', 200, 15);
    service.incrementStellarSuccess();
    service.setActiveWsConnections(5);
    service.setBullQueueDepth('default', 2);

    const text = service.exposition();
    expect(text).toContain('http_requests_total{method="GET",route="/api/v1/health",status_code="200"} 1');
    expect(text).toContain('stellar_submission_total{result="success"} 1');
    expect(text).toContain('websocket_connections_active 5');
    expect(text).toContain('bull_queue_depth{queue="default"} 2');
  });
});
