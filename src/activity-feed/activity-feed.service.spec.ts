import { NotFoundException } from '@nestjs/common';
import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityType } from './activity-feed-item.entity';

describe('ActivityFeedService', () => {
  const createMock = jest.fn();
  const saveMock = jest.fn();
  const findAndCountMock = jest.fn();
  const findOneMock = jest.fn();
  const updateMock = jest.fn();
  const repository = {
    create: createMock,
    save: saveMock,
    findAndCount: findAndCountMock,
    findOne: findOneMock,
    update: updateMock,
  };
  const service = new ActivityFeedService(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
    findAndCountMock.mockResolvedValue([[], 0]);
    saveMock.mockImplementation(
      (value: unknown): Promise<unknown> => Promise.resolve(value),
    );
    updateMock.mockResolvedValue({ affected: 1 });
  });

  const options = () =>
    findAndCountMock.mock.calls.at(-1)?.[0] as Record<string, any>;

  it('records an activity with a null metadata default', async () => {
    createMock.mockReturnValue({ id: 'item-1' });

    await expect(
      service.recordActivity({
        userId: 'user-1',
        type: ActivityType.LOGIN,
        title: 'Login',
        description: 'Successful login',
      }),
    ).resolves.toEqual({ id: 'item-1' });

    expect(createMock).toHaveBeenCalledWith({
      userId: 'user-1',
      type: ActivityType.LOGIN,
      title: 'Login',
      description: 'Successful login',
      metadata: null,
    });
    expect(saveMock).toHaveBeenCalledWith({ id: 'item-1' });
  });

  it('pages activity in reverse chronological order', async () => {
    findAndCountMock.mockResolvedValue([[{ id: 'item-2' }], 42]);

    const result = await service.findAll('user-1', { page: 2, limit: 50 });

    expect(options()).toEqual(
      expect.objectContaining({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
        skip: 50,
        take: 50,
      }),
    );
    expect(result).toEqual({
      items: [{ id: 'item-2' }],
      page: 2,
      limit: 50,
      total: 42,
      totalPages: 1,
    });
  });

  it('guards against non-finite paging values', async () => {
    await service.findAll('user-1', {
      page: Number.NaN,
      limit: Number.POSITIVE_INFINITY,
    });

    expect(options()).toEqual(expect.objectContaining({ skip: 0, take: 20 }));
    expect(findAndCountMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('filters by type and by an inclusive date range', async () => {
    await service.findAll('user-1', {
      type: ActivityType.TRANSACTION,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.000Z',
    });

    expect((options().where as Record<string, unknown>).createdAt).toEqual(
      Between(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-31T23:59:59.000Z'),
      ),
    );
    expect((options().where as Record<string, unknown>).type).toBe(
      ActivityType.TRANSACTION,
    );
  });

  it('does not exclude future items when only startDate is given', async () => {
    await service.findAll('user-1', { startDate: '2026-01-01T00:00:00.000Z' });
    expect((options().where as Record<string, unknown>).createdAt).toEqual(
      MoreThanOrEqual(new Date('2026-01-01T00:00:00.000Z')),
    );
  });

  it('supports an end-date-only filter and ignores invalid dates', async () => {
    await service.findAll('user-1', { endDate: '2026-01-31T00:00:00.000Z' });
    expect((options().where as Record<string, unknown>).createdAt).toEqual(
      LessThanOrEqual(new Date('2026-01-31T00:00:00.000Z')),
    );

    await service.findAll('user-1', { startDate: 'not-a-date' });
    expect(
      (options().where as Record<string, unknown>).createdAt,
    ).toBeUndefined();
  });

  it('marks an item as read for its owner only', async () => {
    const item = { id: 'item-1', userId: 'user-1', isRead: false };
    findOneMock.mockResolvedValue(item);

    await expect(service.markAsRead('user-1', 'item-1')).resolves.toEqual(
      expect.objectContaining({ isRead: true }),
    );
    expect(findOneMock).toHaveBeenCalledWith({
      where: { id: 'item-1', userId: 'user-1' },
    });
    expect(saveMock).toHaveBeenCalledWith(item);
  });

  it("404s when marking another user's item as read", async () => {
    findOneMock.mockResolvedValue(null);
    await expect(
      service.markAsRead('stranger', 'item-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("marks all of a user's unread items as read", async () => {
    await service.markAllAsRead('user-1');
    expect(updateMock).toHaveBeenCalledWith(
      { userId: 'user-1', isRead: false },
      { isRead: true },
    );
  });

  const recorded = () => createMock.mock.calls[0]?.[0] as Record<string, any>;

  it('records a transaction completion event', async () => {
    await service.handleTransactionCompleted({
      transactionId: 'tx-1',
      senderId: 'sender-1',
      receiverId: 'receiver-1',
      amount: 100,
      currency: 'USD',
      reference: 'NXF-1',
    });

    expect(recorded()).toMatchObject({
      userId: 'sender-1',
      type: ActivityType.TRANSACTION,
      title: 'Transaction Completed',
      metadata: {
        transactionId: 'tx-1',
        counterpartyId: 'receiver-1',
        reference: 'NXF-1',
      },
    });
  });

  it('records a deposit completion event', async () => {
    await service.handleDepositCompleted({
      transactionId: 'tx-2',
      userId: 'user-1',
    });
    expect(recorded()).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: ActivityType.WALLET,
        title: 'Deposit Completed',
      }),
    );
  });

  it('records a withdrawal completion event', async () => {
    await service.handleWithdrawalCompleted({
      transactionId: 'tx-3',
      userId: 'user-1',
    });
    expect(recorded()).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: ActivityType.WALLET,
        title: 'Withdrawal Completed',
      }),
    );
  });

  it('records a KYC submission event', async () => {
    await service.handleKycSubmitted({
      userId: 'user-1',
      documentType: 'passport',
    });
    expect(recorded()).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: ActivityType.KYC,
        title: 'KYC Submitted',
        metadata: { documentType: 'passport' },
      }),
    );
  });

  it('records a login event', async () => {
    await service.handleLogin({ userId: 'user-1', ipAddress: '127.0.0.1' });
    expect(recorded()).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: ActivityType.LOGIN,
        title: 'Login',
        metadata: { ipAddress: '127.0.0.1' },
      }),
    );
  });

  it('records a profile update event', async () => {
    await service.handleProfileUpdated({
      userId: 'user-1',
      fields: ['firstName'],
    });
    expect(recorded()).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: ActivityType.PROFILE_UPDATE,
        title: 'Profile Updated',
        metadata: { fields: ['firstName'] },
      }),
    );
  });
});
