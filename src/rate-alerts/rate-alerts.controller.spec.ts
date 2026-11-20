import { RateAlertsController } from './rate-alerts.controller';
import { RateAlertsService } from './rate-alerts.service';
import { RateAlertDirection } from './dto/create-rate-alert.dto';

describe('RateAlertsController', () => {
  const service = {
    create: jest.fn(),
    findByUser: jest.fn(),
    deactivate: jest.fn(),
  };
  const controller = new RateAlertsController(
    service as unknown as RateAlertsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates an alert for the authenticated user', async () => {
    const dto = {
      currencyPair: 'USD/NGN',
      targetRate: 1500,
      direction: RateAlertDirection.ABOVE,
    };
    service.create.mockResolvedValue({ id: 'alert-1' });

    await expect(controller.create('user-1', dto)).resolves.toEqual({
      id: 'alert-1',
    });
    expect(service.create).toHaveBeenCalledWith('user-1', dto);
  });

  it("lists only the caller's alerts with bounded pagination", async () => {
    await controller.findAll('user-1', { page: 2, limit: 5 });

    expect(service.findByUser).toHaveBeenCalledWith('user-1', 2, 5);
  });

  it('deactivates an alert using the token user id and route id', async () => {
    await controller.deactivate('user-1', 'alert-1');

    expect(service.deactivate).toHaveBeenCalledWith('alert-1', 'user-1');
  });
});
