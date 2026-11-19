import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';

describe('FeesController /fees/preview', () => {
  const previewFee = jest.fn();
  const controller = new FeesController({
    previewFee,
  } as unknown as FeesService);
  const result = { feeAmount: 1, netAmount: 199 };

  beforeEach(() => {
    previewFee.mockReset().mockReturnValue(result);
  });

  it('defaults a missing amount to 0 and a missing type to deposit', () => {
    expect(controller.previewFee('', undefined as unknown as string)).toBe(
      result,
    );
    expect(previewFee).toHaveBeenCalledWith('deposit', 0, undefined);
  });

  it('forwards an explicit type, amount and currency', () => {
    controller.previewFee('withdrawal', '200', 'EUR');

    expect(previewFee).toHaveBeenCalledWith('withdrawal', 200, 'EUR');
  });

  it('passes NaN through for a non-numeric amount', () => {
    controller.previewFee('deposit', 'abc');

    const amount = previewFee.mock.calls[0]?.[1] as number;
    expect(Number.isNaN(amount)).toBe(true);
  });

  it('forwards a negative amount to the service', () => {
    controller.previewFee('withdrawal', '-25');

    expect(previewFee).toHaveBeenCalledWith('withdrawal', -25, undefined);
  });

  it('parses decimal amount strings', () => {
    controller.previewFee('deposit', '12.50');

    expect(previewFee).toHaveBeenCalledWith('deposit', 12.5, undefined);
  });

  it('parses a zero amount string as zero', () => {
    controller.previewFee('deposit', '0');

    expect(previewFee).toHaveBeenCalledWith('deposit', 0, undefined);
  });

  it('returns the service preview unchanged', () => {
    expect(controller.previewFee('deposit', '100')).toEqual(result);
  });

  it.todo(
    'reject negative preview amounts instead of quoting them (https://github.com/Nexacore-Org/NexaFx-js/issues/1417)',
  );
  it.todo(
    'validate preview query params as a DTO so abc and missing amounts are rejected (https://github.com/Nexacore-Org/NexaFx-js/issues/1613)',
  );
});
