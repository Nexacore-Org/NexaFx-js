import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowHold, EscrowStatus } from './entities/escrow-hold.entity';

const PAYER = '11111111-1111-4111-8111-111111111111';
const PAYEE = '22222222-2222-4222-8222-222222222222';

function build(initial?: Partial<EscrowHold>) {
  let row: any = initial ? { id: 'h1', ...initial } : null;
  const manager = {
    create: jest.fn((_e: unknown, v: object) => ({ id: 'h-new', ...v })),
    save: jest.fn(async (_e: unknown, v: any) => { row = v; return v; }),
    findOne: jest.fn(async () => (row ? { ...row } : null)),
    update: jest.fn(async (_e: unknown, where: any, patch: any) => {
      if (!row || row.status !== where.status) return { affected: 0 };
      Object.assign(row, patch);
      return { affected: 1 };
    }),
  };
  // withTransaction() drives a query runner; hand it the fake manager.
  const queryRunner = {
    connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(), release: jest.fn(), isTransactionActive: true, manager,
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
  const wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) };
  const service = new EscrowService({} as any, dataSource as any, wallets as any);
  return { service, wallets, manager, queryRunner, get: () => row };
}

const held = (over: Partial<EscrowHold> = {}): Partial<EscrowHold> => ({
  payerId: PAYER, payeeId: PAYEE, amount: 50, currency: 'USD', status: EscrowStatus.HELD, ...over,
});

describe('EscrowService (#1381)', () => {
  describe('hold', () => {
    it('debits the payer through the transaction manager and records a HELD hold', async () => {
      const { service, wallets, get } = build();
      const hold = await service.hold(PAYER, { payeeId: PAYEE, amount: 50, currency: 'usd' });
      expect(wallets.adjustBalance).toHaveBeenCalledWith(PAYER, 'USD', -50, expect.anything());
      expect(hold.status).toBe(EscrowStatus.HELD);
      expect(get().currency).toBe('USD');
    });

    it('rolls back (and records nothing) when the payer cannot afford it', async () => {
      const { service, wallets, manager, queryRunner } = build();
      wallets.adjustBalance.mockRejectedValue(new BadRequestException('Insufficient balance'));
      await expect(service.hold(PAYER, { payeeId: PAYEE, amount: 50, currency: 'USD' })).rejects.toThrow('Insufficient balance');
      expect(manager.save).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('refuses to hold funds for yourself', async () => {
      const { service } = build();
      await expect(service.hold(PAYER, { payeeId: PAYER, amount: 5, currency: 'USD' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('release', () => {
    it('credits the payee and marks the hold RELEASED', async () => {
      const { service, wallets, get } = build(held());
      const result = await service.release('h1', { id: PAYER });
      expect(wallets.adjustBalance).toHaveBeenCalledWith(PAYEE, 'USD', 50, expect.anything());
      expect(result.status).toBe(EscrowStatus.RELEASED);
      expect(get().status).toBe(EscrowStatus.RELEASED);
    });

    it('only the payer may release', async () => {
      const { service, wallets } = build(held());
      await expect(service.release('h1', { id: PAYEE })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.release('h1', { id: 'admin', role: 'admin' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(wallets.adjustBalance).not.toHaveBeenCalled();
    });

    it('a second release is rejected with 409 and pays nothing twice', async () => {
      const { service, wallets } = build(held());
      await service.release('h1', { id: PAYER });
      await expect(service.release('h1', { id: PAYER })).rejects.toBeInstanceOf(ConflictException);
      expect(wallets.adjustBalance).toHaveBeenCalledTimes(1);
    });

    it('404s for an unknown hold', async () => {
      await expect(build().service.release('nope', { id: PAYER })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('refund', () => {
    it('credits the payer back; the payee or an admin may refund', async () => {
      const a = build(held());
      await a.service.refund('h1', { id: PAYEE });
      expect(a.wallets.adjustBalance).toHaveBeenCalledWith(PAYER, 'USD', 50, expect.anything());

      const b = build(held());
      await b.service.refund('h1', { id: 'someone', role: 'admin' });
      expect(b.get().status).toBe(EscrowStatus.REFUNDED);
    });

    it('the payer cannot refund their own hold', async () => {
      const { service } = build(held());
      await expect(service.refund('h1', { id: PAYER })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a refund after release, and a release after refund, with 409', async () => {
      const a = build(held());
      await a.service.release('h1', { id: PAYER });
      await expect(a.service.refund('h1', { id: PAYEE })).rejects.toBeInstanceOf(ConflictException);

      const b = build(held());
      await b.service.refund('h1', { id: PAYEE });
      await expect(b.service.release('h1', { id: PAYER })).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not mark the hold resolved when the credit fails (the transaction rolls back)', async () => {
      const { service, wallets, queryRunner } = build(held());
      wallets.adjustBalance.mockRejectedValue(new Error('wallet down'));
      await expect(service.refund('h1', { id: PAYEE })).rejects.toThrow('wallet down');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});
