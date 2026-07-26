import { ActivityEvent } from './activity-event.entity';
import { ActivityFeedService } from './activity-feed.service';

describe('ActivityFeedService', () => {
  const createMock = jest.fn();
  const saveMock = jest.fn();
  const findAndCountMock = jest.fn();
  const repository = {
    create: createMock,
    save: saveMock,
    findAndCount: findAndCountMock,
  } as unknown as {
    create: typeof createMock;
    save: typeof saveMock;
    findAndCount: typeof findAndCountMock;
  };
  const service = new ActivityFeedService(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records an activity event with sensible defaults', async () => {
    const storedEvent = {
      id: 'evt-1',
      userId: 'user-1',
      type: 'security.password_change',
      description: 'Password updated',
      ipAddress: '127.0.0.1',
      deviceInfo: 'Chrome on macOS',
      securityEvent: true,
      metadata: { source: 'account-settings' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    } as ActivityEvent;
    createMock.mockReturnValue(storedEvent);
    saveMock.mockResolvedValue(storedEvent);

    await expect(
      service.recordActivity({
        userId: 'user-1',
        type: 'security.password_change',
        description: 'Password updated',
        ipAddress: '127.0.0.1',
        deviceInfo: 'Chrome on macOS',
        securityEvent: true,
        metadata: { source: 'account-settings' },
      }),
    ).resolves.toBe(storedEvent);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        securityEvent: true,
        metadata: { source: 'account-settings' },
      }),
    );
    expect(saveMock).toHaveBeenCalledWith(storedEvent);
  });

  it('pages activity items in reverse chronological order', async () => {
    const newerEvent = {
      id: 'evt-2',
      userId: 'user-1',
      type: 'transaction.sent',
      description: 'Sent funds',
      ipAddress: '10.0.0.2',
      deviceInfo: 'iPhone',
      securityEvent: false,
      metadata: null,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
    } as ActivityEvent;
    const olderEvent = {
      ...newerEvent,
      id: 'evt-1',
      description: 'Logged in',
      createdAt: new Date('2026-02-01T09:00:00.000Z'),
      type: 'auth.login',
    } as ActivityEvent;

    findAndCountMock.mockResolvedValue([[newerEvent, olderEvent], 2]);

    await expect(service.getActivityForUser('user-1', 2, 250)).resolves.toEqual(
      {
        items: [
          {
            timestamp: '2026-02-01T10:00:00.000Z',
            type: 'transaction.sent',
            description: 'Sent funds',
            ipAddress: '10.0.0.2',
            deviceInfo: 'iPhone',
            securityEvent: false,
          },
          {
            timestamp: '2026-02-01T09:00:00.000Z',
            type: 'auth.login',
            description: 'Logged in',
            ipAddress: '10.0.0.2',
            deviceInfo: 'iPhone',
            securityEvent: false,
          },
        ],
        page: 2,
        limit: 100,
        total: 2,
        totalPages: 1,
      },
    );

    expect(findAndCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
        skip: 100,
        take: 100,
      }),
    );
  });
});
