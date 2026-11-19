import { ConfigService } from '@nestjs/config';
import { AmlMonitoringListener } from './aml-monitoring.listener';

function build() {
  const aml = {
    checkStructuring: jest.fn().mockResolvedValue(undefined),
    checkSmurfing: jest.fn().mockResolvedValue(undefined),
    checkVelocityBurst: jest.fn().mockResolvedValue(undefined),
  };
  const txRepo = { find: jest.fn().mockResolvedValue([]) };
  const rates = { calculateConversion: jest.fn() };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'aml.structuringWindowHours') return 24;
      return 1;
    }),
  } as unknown as ConfigService;
  const listener = new AmlMonitoringListener(
    aml as any,
    txRepo as any,
    rates as any,
    config,
  );
  return { listener, aml, txRepo, rates };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  senderId: 'user-1',
  receiverId: 'receiver-1',
  amount: 2500,
  currency: 'USD',
  completedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

describe('AmlMonitoringListener', () => {
  it('runs every persisted rule on completed transfers for the sender', async () => {
    const { listener, aml, txRepo } = build();
    txRepo.find.mockResolvedValue([row()]);

    await listener.evaluate('user-1');

    expect(txRepo.find).toHaveBeenCalled();
    expect(aml.checkStructuring).toHaveBeenCalledWith(
      'user-1',
      [expect.objectContaining({ userId: 'user-1', amount: 2500 })],
    );
    expect(aml.checkSmurfing).toHaveBeenCalled();
    expect(aml.checkVelocityBurst).toHaveBeenCalled();
  });

  it('normalises foreign-currency amounts to USD before evaluating', async () => {
    const { listener, aml, txRepo, rates } = build();
    txRepo.find.mockResolvedValue([row({ currency: 'EUR', amount: 1000 })]);
    rates.calculateConversion.mockResolvedValue({ convertedAmount: 1100 });

    await listener.evaluate('user-1');

    expect(rates.calculateConversion).toHaveBeenCalledWith('EUR', 'USD', 1000);
    expect(aml.checkStructuring).toHaveBeenCalledWith(
      'user-1',
      [expect.objectContaining({ amount: 1100, currency: 'USD' })],
    );
  });

  it('keeps evaluating the other rules when one rule fails', async () => {
    const { listener, aml } = build();
    aml.checkStructuring.mockRejectedValueOnce(new Error('boom'));

    await listener.evaluate('user-1');

    expect(aml.checkSmurfing).toHaveBeenCalled();
    expect(aml.checkVelocityBurst).toHaveBeenCalled();
  });

  it('swallows repository failures so the event handler never rejects', async () => {
    const { listener, txRepo, aml } = build();
    txRepo.find.mockRejectedValue(new Error('db down'));

    await expect(listener.evaluate('user-1')).resolves.toBeUndefined();
    expect(aml.checkStructuring).not.toHaveBeenCalled();
  });

  it('does nothing without a user id', async () => {
    const { listener, txRepo } = build();
    await listener.evaluate('');
    expect(txRepo.find).not.toHaveBeenCalled();
  });
});
