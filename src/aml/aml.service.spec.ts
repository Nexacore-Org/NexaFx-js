import { AmlService, TransactionRecord } from './aml.service';

describe('AmlService.checkVelocityBurst', () => {
  const saveMock = jest.fn((v) => v);
  const alertRepo = { create: (v: any) => v, save: saveMock } as any;
  const config = { get: () => undefined } as any; // fall back to defaults (maxCount=10)
  const events = { emit: jest.fn() } as any;
  const service = new AmlService(alertRepo, config, events);

  const makeTxs = (count: number): TransactionRecord[] =>
    Array.from({ length: count }, (_, i) => ({
      userId: 'user-1',
      amount: 100,
      currency: 'USD',
      executedAt: new Date(),
    }));

  beforeEach(() => jest.clearAllMocks());

  it('does not alert just below the threshold', async () => {
    await service.checkVelocityBurst('user-1', makeTxs(9));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('does not alert exactly at the threshold (exclusive boundary)', async () => {
    await service.checkVelocityBurst('user-1', makeTxs(10));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('alerts once clearly over the threshold', async () => {
    await service.checkVelocityBurst('user-1', makeTxs(11));
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ ruleTriggered: 'velocity-burst' }),
    );
    expect(events.emit).toHaveBeenCalledWith('aml.alert.created', expect.anything());
  });
});
