import { ValidationPipe } from '@nestjs/common';
import { ActivityFeedController } from './activity-feed.controller';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityType } from './activity-feed-item.entity';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';

describe('ActivityFeedController', () => {
  const findAllMock = jest.fn();
  const markAsReadMock = jest.fn();
  const markAllAsReadMock = jest.fn();
  const activityFeedService = {
    findAll: findAllMock,
    markAsRead: markAsReadMock,
    markAllAsRead: markAllAsReadMock,
  } as unknown as ActivityFeedService;
  const controller = new ActivityFeedController(activityFeedService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds the feed to the authenticated principal and forwards filters', async () => {
    const page = { items: [], page: 2, limit: 50, total: 0, totalPages: 0 };
    findAllMock.mockResolvedValue(page);

    await expect(
      controller.findAll(
        { user: { sub: 'user-1' } },
        {
          type: ActivityType.TRANSACTION,
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-01-31T00:00:00.000Z',
          page: 2,
          limit: 50,
        },
      ),
    ).resolves.toBe(page);

    expect(findAllMock).toHaveBeenCalledWith('user-1', {
      type: ActivityType.TRANSACTION,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T00:00:00.000Z',
      page: 2,
      limit: 50,
    });
  });

  it('uses defaults when no query is supplied', async () => {
    await controller.findAll(
      { user: { sub: 'user-1' } },
      new ListActivityQueryDto(),
    );

    expect(findAllMock).toHaveBeenCalledWith('user-1', {
      type: undefined,
      startDate: undefined,
      endDate: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('marks a single item as read for the caller', async () => {
    const item = { id: 'uuid-1', isRead: true };
    markAsReadMock.mockResolvedValue(item);

    await expect(
      controller.markAsRead({ user: { sub: 'user-1' } }, 'uuid-1'),
    ).resolves.toBe(item);
    expect(markAsReadMock).toHaveBeenCalledWith('user-1', 'uuid-1');
  });

  it('marks all items as read for the caller', async () => {
    await expect(
      controller.markAllAsRead({ user: { sub: 'user-1' } }),
    ).resolves.toEqual({ message: 'All activities marked as read' });
    expect(markAllAsReadMock).toHaveBeenCalledWith('user-1');
  });

  describe('ListActivityQueryDto validation', () => {
    const pipe = new ValidationPipe();
    const validate = (query: Record<string, unknown>) =>
      pipe.transform(query, {
        type: 'query',
        metatype: ListActivityQueryDto,
      });

    it.each([
      [{ type: 'not-a-type' }],
      [{ page: 'abc' }],
      [{ page: '0' }],
      [{ limit: '101' }],
      [{ startDate: 'not-a-date' }],
      [
        {
          startDate: '2026-02-01T00:00:00.000Z',
          endDate: '2026-01-01T00:00:00.000Z',
        },
      ],
    ])('rejects the invalid query %j', async (query) => {
      await expect(validate(query)).rejects.toBeDefined();
    });

    it('accepts a valid query', async () => {
      await expect(
        validate({
          type: ActivityType.KYC,
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-01-31T00:00:00.000Z',
          page: '2',
          limit: '50',
        }),
      ).resolves.toBeDefined();
    });
  });
});
