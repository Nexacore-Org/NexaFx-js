import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import { FundWalletDto } from '../dto/fund-wallet.dto';
import { SystemAdminController } from './system-admin.controller';

const VALID_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

function build(env: { network?: string; nodeEnv?: string } = { network: 'TESTNET', nodeEnv: 'development' }) {
  const keyRotation = { rotate: jest.fn().mockResolvedValue({ total: 3, rotated: 2, skipped: 1 }) };
  const config = {
    get: jest.fn((key: string) => (key === 'STELLAR_NETWORK' ? env.network : key === 'app.env' ? env.nodeEnv : undefined)),
  };
  const http = { get: jest.fn().mockReturnValue(of({ data: { hash: 'abc' } })) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const controller = new SystemAdminController(keyRotation as any, config as any, http as any, audit as any);
  return { controller, keyRotation, http, audit };
}

describe('FundWalletDto (issue #1521)', () => {
  it('accepts a valid Stellar address', async () => {
    const errors = await validate(plainToInstance(FundWalletDto, { address: VALID_ADDRESS }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toHaveLength(0);
  });

  it.each(['', 'not-an-address', 12345 as unknown as string])('rejects %p', async (address) => {
    const errors = await validate(plainToInstance(FundWalletDto, { address }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SystemAdminController (issue #1521)', () => {
  it('funds a valid address through a mocked Friendbot and audits it', async () => {
    const { controller, http, audit } = build();

    const result = await controller.fundWallet({ address: VALID_ADDRESS }, 'admin-1');

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent(VALID_ADDRESS)));
    expect(result).toEqual({ funded: true, address: VALID_ADDRESS, hash: 'abc' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', action: 'admin.system.fund_wallet', entityId: VALID_ADDRESS }),
    );
  });

  it.each([
    [{ network: 'PUBLIC', nodeEnv: 'development' }],
    [{ network: 'TESTNET', nodeEnv: 'production' }],
    [{ network: undefined, nodeEnv: 'development' }],
  ])('answers 404 and does nothing for %p', async (env) => {
    const { controller, http, audit } = build(env);

    await expect(controller.fundWallet({ address: VALID_ADDRESS }, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(http.get).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('audits key rotation with the acting admin', async () => {
    const { controller, audit } = build();

    const result = await controller.rotateEncryptionKey('admin-2');

    expect(result).toMatchObject({ message: 'Key rotation complete', total: 3 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-2',
        action: 'admin.system.rotate_encryption_key',
        after: { total: 3, rotated: 2, skipped: 1 },
      }),
    );
  });
});
