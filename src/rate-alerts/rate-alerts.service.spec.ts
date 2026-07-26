import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RateAlertsService } from './rate-alerts.service';

describe('RateAlertsService', () => {
  let service: RateAlertsService;
  const mockEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateAlertsService,
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();
    service = module.get(RateAlertsService);
  });

  it('creates an alert', async () => {
    const alert = await service.create('user1', 'XLM-USD', 0.5, 'above');
    expect(alert.direction).toBe('above');
    expect(alert.triggered).toBe(false);
  });

  it('triggers alert when rate goes above threshold', () => {
    service.create('user1', 'XLM-USD', 0.5, 'above');
    service.checkThresholds({ 'XLM-USD': 0.55 });
  });

  it('does not trigger duplicate alerts', () => {
    service.create('user1', 'XLM-USD', 0.5, 'above');
    service.checkThresholds({ 'XLM-USD': 0.55 });
    service.checkThresholds({ 'XLM-USD': 0.60 });
  });

  it('deactivates alert after trigger', () => {
    service.create('user1', 'XLM-USD', 0.5, 'above');
    service.checkThresholds({ 'XLM-USD': 0.55 });
    const activeAlerts = (service as any).alerts.filter((a: any) => !a.triggered);
    expect(activeAlerts.length).toBe(0);
  });

  it('dispatches alert within 60 seconds of threshold breach', () => {
    const start = Date.now();
    service.create('user1', 'XLM-USD', 0.5, 'above');
    service.checkThresholds({ 'XLM-USD': 0.55 });
    expect(Date.now() - start).toBeLessThan(60000);
  });
});
