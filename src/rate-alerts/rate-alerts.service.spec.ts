import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrenciesService } from '../currencies/currencies.service';
import { RateAlertEvent } from './rate-alert.events';
import { RateAlertsService } from './rate-alerts.service';

describe('RateAlertsService', () => {
  let service: RateAlertsService;
  let repo: {
    count: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let queryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    whereInIds: jest.Mock;
    andWhere: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock;
  };
  let events: { emit: jest.Mock };
  let currencies: { validateCurrencyActive: jest.Mock };

  const dto = {
    currencyPair: 'USD/NGN',
    targetRate: 1550,
    direction: 'above' as const,
  };

  beforeEach(() => {
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [], affected: 0 }),
    };
    repo = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: Record<string, unknown>) => ({
        id: 'alert-1',
        ...value,
      })),
      save: jest.fn((value: Record<string, unknown>) => Promise.resolve(value)),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    events = { emit: jest.fn() };
    currencies = { validateCurrencyActive: jest.fn() };

    service = new RateAlertsService(
      repo as any,
      events as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(20) } as unknown as ConfigService,
      currencies as unknown as CurrenciesService,
    );
  });

  it('creates an active untriggered alert from the token user id', async () => {
    const alert = await service.create('user-1', dto);

    expect(currencies.validateCurrencyActive).toHaveBeenCalledWith('USD');
    expect(currencies.validateCurrencyActive).toHaveBeenCalledWith('NGN');
    expect(alert).toMatchObject({
      userId: 'user-1',
      currencyPair: 'USD/NGN',
      isActive: true,
      triggered: false,
    });
  });

  it('rejects an alert once the active per-user cap is reached', async () => {
    repo.count.mockResolvedValue(20);

    await expect(service.create('user-1', dto)).rejects.toThrow(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate active untriggered alert', async () => {
    repo.findOne.mockResolvedValue({ id: 'existing' });

    await expect(service.create('user-1', dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('paginates alerts owned by the user', async () => {
    repo.findAndCount.mockResolvedValue([[], 5]);

    await expect(service.findByUser('user-1', 2, 5)).resolves.toEqual({
      items: [],
      total: 5,
      page: 2,
      limit: 5,
    });
    expect(repo.findAndCount.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user-1' },
      skip: 5,
      take: 5,
    });
  });

  it('deactivates only an owned active alert', async () => {
    const alert = { id: 'alert-1', isActive: true };
    repo.findOne.mockResolvedValueOnce(alert);

    await service.deactivate('alert-1', 'user-1');

    expect(alert).toMatchObject({ isActive: false });
    expect(alert).toHaveProperty('deactivatedAt');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'alert-1', userId: 'user-1', isActive: true },
    });
  });

  it('returns 404 when deactivating a stranger or already inactive alert', async () => {
    await expect(service.deactivate('alert-1', 'user-2')).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('bulk-updates candidates and emits only the ids that were updated', async () => {
    repo.find.mockResolvedValue([
      {
        id: 'alert-1',
        userId: 'user-1',
        currencyPair: 'USD/NGN',
        targetRate: 1500,
        direction: 'above',
      },
      {
        id: 'alert-2',
        userId: 'user-2',
        currencyPair: 'USD/NGN',
        targetRate: 1600,
        direction: 'below',
      },
    ]);
    queryBuilder.execute.mockResolvedValue({ raw: [{ id: 'alert-1' }] });

    await service.checkThresholds({ 'USD/NGN': 1550 });

    expect(queryBuilder.set).toHaveBeenCalledWith({
      triggered: true,
      triggeredAt: expect.any(Function) as unknown,
    });
    expect(queryBuilder.whereInIds).toHaveBeenCalledWith([
      'alert-1',
      'alert-2',
    ]);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('"triggered" = false');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('"isActive" = true');
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(RateAlertEvent.TRIGGERED, {
      alertId: 'alert-1',
      userId: 'user-1',
      currencyPair: 'USD/NGN',
      rate: 1550,
      targetRate: 1500,
      direction: 'above',
    });
  });

  it('evaluates rates in chunks of 500 pairs', async () => {
    const rates: Record<string, number> = {};
    for (let i = 0; i < 501; i += 1) {
      const code = String.fromCharCode(
        65 + Math.floor(i / 676),
        65 + (Math.floor(i / 26) % 26),
        65 + (i % 26),
      );
      rates[`USD/${code}`] = 1;
    }

    await service.checkThresholds(rates);

    expect(repo.find).toHaveBeenCalledTimes(2);
    expect(queryBuilder.execute).not.toHaveBeenCalled();
  });

  it('does not skip a legitimate zero rate', async () => {
    repo.find.mockResolvedValue([
      {
        id: 'alert-zero',
        userId: 'user-1',
        currencyPair: 'USD/NGN',
        targetRate: 1,
        direction: 'below',
      },
    ]);
    queryBuilder.execute.mockResolvedValue({ raw: [{ id: 'alert-zero' }] });

    await service.checkThresholds({ 'USD/NGN': 0 });

    expect(events.emit).toHaveBeenCalledWith(
      RateAlertEvent.TRIGGERED,
      expect.objectContaining({ rate: 0 }),
    );
  });
});
