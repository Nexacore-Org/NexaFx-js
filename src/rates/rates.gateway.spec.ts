import { RatesGateway } from './rates.gateway';

describe('RatesGateway', () => {
  const makeGateway = () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const gateway = new RatesGateway(config as any);
    gateway.server = { emit: jest.fn() } as any;
    return gateway;
  };

  it('emits rates.updated to connected clients on a broadcast', () => {
    const gateway = makeGateway();

    gateway.broadcastRateUpdate('USD/NGN', 1550);

    expect(gateway.server.emit).toHaveBeenCalledWith(
      'rates.updated',
      expect.objectContaining({ currencyPair: 'USD/NGN', rate: 1550 }),
    );
  });

  it('sends seeded rates in rates.current to a client connecting before any broadcast', () => {
    const gateway = makeGateway();
    const client = { id: 'client-1', emit: jest.fn() };

    gateway.seedCurrentRates([{ currencyPair: 'USD/NGN', rate: 1550 }]);
    gateway.handleConnection(client as any);

    expect(client.emit).toHaveBeenCalledWith('rates.current', [
      expect.objectContaining({ currencyPair: 'USD/NGN', rate: 1550 }),
    ]);
  });

  it('does not replay seeded rates, only broadcast updates', () => {
    const gateway = makeGateway();
    const client = { id: 'client-1', emit: jest.fn() };

    gateway.seedCurrentRates([{ currencyPair: 'USD/NGN', rate: 1550 }]);
    gateway.handleReplay(client as any, 0);

    expect(client.emit).not.toHaveBeenCalledWith(
      'rates.replay',
      expect.anything(),
    );

    gateway.broadcastRateUpdate('USD/NGN', 1551);
    gateway.handleReplay(client as any, 0);

    expect(client.emit).toHaveBeenCalledWith('rates.replay', [
      expect.objectContaining({ currencyPair: 'USD/NGN', rate: 1551 }),
    ]);
  });
});
