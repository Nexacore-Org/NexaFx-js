import { DisputesController } from './disputes.controller';

describe('DisputesController', () => {
  it("lists only the authenticated caller's disputes", async () => {
    const disputesService = { findAllByUser: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new DisputesController(disputesService as any);

    await controller.findAll('user-a', 1, 20);
    await controller.findAll('user-b', 1, 20);

    expect(disputesService.findAllByUser).toHaveBeenNthCalledWith(1, 'user-a', 1, 20);
    expect(disputesService.findAllByUser).toHaveBeenNthCalledWith(2, 'user-b', 1, 20);
  });
});
