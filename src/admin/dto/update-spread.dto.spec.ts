import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSpreadDto } from './update-spread.dto';

const check = (body: unknown) =>
  validate(plainToInstance(UpdateSpreadDto, body), { whitelist: true, forbidNonWhitelisted: true });

describe('UpdateSpreadDto (issue #1520)', () => {
  it('accepts a normal spread and normalises the pair', async () => {
    const dto = plainToInstance(UpdateSpreadDto, { pair: ' usd/ngn ', spreadPercentage: 0.015 });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.pair).toBe('USD/NGN');
  });

  it.each([
    [{ pair: 'USDNGN', spreadPercentage: 0.01 }],
    [{ pair: 123, spreadPercentage: 0.01 }],
    [{ pair: {}, spreadPercentage: 0.01 }],
    [{ pair: 'USD/NGN', spreadPercentage: -0.1 }],
    [{ pair: 'USD/NGN', spreadPercentage: 1000 }],
    [{ pair: 'USD/NGN', spreadPercentage: 'abc' }],
    [{ pair: 'USD/NGN', spreadPercentage: Number.NaN }],
    [{ pair: 'USD/NGN', spreadPercentage: 0.12345 }],
    [{ pair: 'USD/NGN', spreadPercentage: 0.01, extra: 1 }],
  ])('rejects %j', async (body) => {
    expect((await check(body)).length).toBeGreaterThan(0);
  });
});
