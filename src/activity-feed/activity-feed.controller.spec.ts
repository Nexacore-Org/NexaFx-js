import { UnauthorizedException } from '@nestjs/common';
import { ActivityFeedController } from './activity-feed.controller';
import { ActivityFeedService } from './activity-feed.service';

describe('ActivityFeedController', () => {
  const getActivityForUserMock = jest.fn();
  const activityFeedService = {
    getActivityForUser: getActivityForUserMock,
  } as unknown as ActivityFeedService;
  const controller = new ActivityFeedController(activityFeedService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the authenticated user activity feed', async () => {
    getActivityForUserMock.mockResolvedValue({
      items: [],
      page: 2,
      limit: 25,
      total: 0,
      totalPages: 0,
    });

    await expect(
      controller.getMyActivity({ user: { id: 'user-1' } }, '2', '25'),
    ).resolves.toEqual({
      items: [],
      page: 2,
      limit: 25,
      total: 0,
      totalPages: 0,
    });

    expect(getActivityForUserMock).toHaveBeenCalledWith('user-1', 2, 25);
  });

  it('rejects anonymous requests', async () => {
    await expect(
      controller.getMyActivity({}, '1', '20'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
