import { BadRequestException } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import { Queue } from 'bull';
import { StatementsService } from './statements.service';
import { UsersService } from '../users/users.service';
import { PdfService } from '../documents/pdf.service';
import { MailService } from '../mail/mail.service';
import { EmailQueueService } from '../mail/email-queue.service';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { FxTrade } from '../fx/fx-trade.entity';

function queryBuilder(total = '0') {
  const qb = {
    select: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue({ total }),
  };
  qb.select.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  return qb;
}

const makeTx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-1',
    senderId: 'user-1',
    receiverId: 'user-2',
    amount: 100,
    fee: 0,
    currency: 'USD',
    status: TransactionStatus.COMPLETED,
    metadata: { type: 'transfer' },
    reference: 'ref-1',
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  }) as Transaction;

const BASE = {
  userId: 'user-1',
  currency: 'USD',
  from: '2026-01-01',
  to: '2026-01-31',
};

describe('StatementsService', () => {
  let txRepository: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let fxRepository: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let usersService: { findById: jest.Mock };
  let pdfService: { generateStatementPdf: jest.Mock };
  let mailService: { sendStatementReadyEmail: jest.Mock };
  let emailQueue: { enqueue: jest.Mock };
  let queue: { add: jest.Mock };
  let service: StatementsService;

  beforeEach(() => {
    txRepository = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => queryBuilder()),
    };
    fxRepository = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => queryBuilder()),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    };
    pdfService = {
      generateStatementPdf: jest.fn().mockResolvedValue(new Uint8Array([1])),
    };
    mailService = { sendStatementReadyEmail: jest.fn() };
    emailQueue = { enqueue: jest.fn().mockResolvedValue(true) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    service = new StatementsService(
      txRepository as unknown as Repository<Transaction>,
      fxRepository as unknown as Repository<FxTrade>,
      usersService as unknown as UsersService,
      pdfService as unknown as PdfService,
      mailService as unknown as MailService,
      emailQueue as unknown as EmailQueueService,
      queue as unknown as Queue,
    );
  });

  describe('transaction classification', () => {
    it('shows a deposit as a credit with the fee as its own debit', async () => {
      txRepository.find.mockResolvedValue([
        makeTx({
          senderId: 'user-1',
          receiverId: 'user-1',
          amount: 100,
          fee: 1,
          metadata: { type: 'deposit' },
        }),
      ]);

      const statement = await service.buildStatement(BASE);

      expect(statement.lines).toEqual([
        expect.objectContaining({
          description: 'Deposit',
          amount: 100,
          source: 'transaction',
        }),
        expect.objectContaining({
          description: 'Deposit fee',
          amount: -1,
          source: 'fee',
        }),
      ]);
      expect(statement.closingBalance).toBe(99);
      expect(statement.lines.map((line) => line.description)).not.toContain(
        expect.stringContaining('Transfer to'),
      );
    });

    it('debits principal plus fee for a withdrawal and names the destination', async () => {
      txRepository.find.mockResolvedValue([
        makeTx({
          senderId: 'user-1',
          receiverId: 'user-1',
          amount: 50,
          fee: 1,
          metadata: {
            type: 'withdrawal',
            destinationAddress: 'GABCDEFGHIJKLMNOP',
          },
        }),
      ]);

      const statement = await service.buildStatement(BASE);

      expect(statement.lines).toEqual([
        expect.objectContaining({
          description: 'Withdrawal to GABCDE...MNOP',
          amount: -50,
        }),
        expect.objectContaining({
          description: 'Withdrawal fee',
          amount: -1,
          source: 'fee',
        }),
      ]);
      expect(statement.closingBalance).toBe(-51);
    });

    it('debits both the source amount and fee on the source-currency statement', async () => {
      txRepository.find.mockResolvedValue([
        makeTx({
          amount: 100,
          fee: 1,
          currency: 'USD',
          metadata: { type: 'swap', toAmount: 90, toCurrency: 'EUR' },
        }),
      ]);

      const statement = await service.buildStatement(BASE);

      expect(statement.lines).toEqual([
        expect.objectContaining({
          description: 'Swap USD -> EUR',
          amount: -100,
        }),
        expect.objectContaining({
          description: 'Swap fee',
          amount: -1,
          source: 'fee',
        }),
      ]);
    });

    it('credits swap proceeds on the destination-currency statement', async () => {
      txRepository.find.mockResolvedValue([
        makeTx({
          amount: 100,
          fee: 1,
          currency: 'USD',
          metadata: { type: 'swap', toAmount: 90, toCurrency: 'EUR' },
        }),
      ]);

      const statement = await service.buildStatement({
        ...BASE,
        currency: 'EUR',
      });

      expect(statement.lines).toEqual([
        expect.objectContaining({
          description: 'Swap USD -> EUR',
          amount: 90,
          source: 'transaction',
        }),
      ]);
      expect(statement.closingBalance).toBe(90);
    });

    it('signs peer transfers by direction', async () => {
      txRepository.find.mockResolvedValue([
        makeTx({ id: 'out', senderId: 'user-1', receiverId: 'user-2' }),
        makeTx({
          id: 'in',
          senderId: 'user-2',
          receiverId: 'user-1',
          amount: 25,
        }),
      ]);

      const statement = await service.buildStatement(BASE);

      expect(statement.lines).toEqual([
        expect.objectContaining({
          description: 'Transfer to user-2',
          amount: -100,
        }),
        expect.objectContaining({
          description: 'Transfer from user-2',
          amount: 25,
        }),
      ]);
      expect(statement.closingBalance).toBe(-75);
    });

    it('normalises the requested currency before querying and labelling', async () => {
      const statement = await service.buildStatement({
        ...BASE,
        currency: 'usd',
      });

      expect(statement.currency).toBe('USD');
      const { where } = txRepository.find.mock.calls[0]![0] as {
        where: Array<{ currency?: string; metadata?: unknown }>;
      };
      expect(where[0].currency).toBe('USD');
      expect(where[1].currency).toBe('USD');
      expect(where[2].metadata).toBeInstanceOf(FindOperator);
    });
  });

  describe('bounded queries', () => {
    it('pushes the date range and completed status into the transaction query', async () => {
      await service.buildStatement(BASE);

      const options = txRepository.find.mock.calls[0]![0] as {
        where: Array<{ createdAt: unknown; status: TransactionStatus }>;
      };
      expect(options.where).toHaveLength(3);
      for (const clause of options.where) {
        expect(clause.createdAt).toBeInstanceOf(FindOperator);
        expect(clause.status).toBe(TransactionStatus.COMPLETED);
      }
    });

    it('filters fx trades by currency and date in SQL', async () => {
      await service.buildStatement(BASE);

      const options = fxRepository.find.mock.calls[0]![0] as {
        where: unknown[];
      };
      expect(options.where).toHaveLength(2);
      const [outbound, inbound] = options.where as Array<{
        userId: string;
        fromCurrency?: string;
        toCurrency?: string;
        executedAt: unknown;
      }>;
      expect(outbound).toMatchObject({ userId: 'user-1', fromCurrency: 'USD' });
      expect(inbound).toMatchObject({ userId: 'user-1', toCurrency: 'USD' });
      expect(outbound.executedAt).toBeInstanceOf(FindOperator);
      expect(inbound.executedAt).toBeInstanceOf(FindOperator);
    });

    it('computes the opening balance with aggregates instead of row fetches', async () => {
      const txQb = queryBuilder('1000');
      const fxQb = queryBuilder('25');
      txRepository.createQueryBuilder.mockReturnValue(txQb);
      fxRepository.createQueryBuilder.mockReturnValue(fxQb);

      const statement = await service.buildStatement(BASE);

      expect(statement.openingBalance).toBe(1025);
      expect(txQb.getRawOne).toHaveBeenCalled();
      expect(fxQb.getRawOne).toHaveBeenCalled();
      expect(txRepository.find).toHaveBeenCalledTimes(1);
      expect(fxRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconciliation', () => {
    it('keeps the closing balance equal to the wallet after a mixed sequence', async () => {
      // Wallet starts at 1000 USD. Deposit 100 with 1 fee (+99); withdrawal 50
      // with 1 fee (-51); swap 20 with 1 fee out of USD (-21); transfer out 10.
      // The EUR leg of the swap must not affect the USD statement.
      const walletAfter = 1000 + 99 - 51 - 21 - 10;
      txRepository.createQueryBuilder.mockReturnValue(queryBuilder('1000'));
      txRepository.find.mockResolvedValue([
        makeTx({
          id: 'deposit',
          senderId: 'user-1',
          receiverId: 'user-1',
          amount: 100,
          fee: 1,
          metadata: { type: 'deposit' },
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
        makeTx({
          id: 'withdrawal',
          senderId: 'user-1',
          receiverId: 'user-1',
          amount: 50,
          fee: 1,
          metadata: { type: 'withdrawal', destinationAddress: 'GDEST' },
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
        }),
        makeTx({
          id: 'swap',
          senderId: 'user-1',
          receiverId: 'user-1',
          amount: 20,
          fee: 1,
          metadata: { type: 'swap', toAmount: 18, toCurrency: 'EUR' },
          createdAt: new Date('2026-01-04T00:00:00.000Z'),
        }),
        makeTx({
          id: 'transfer',
          senderId: 'user-1',
          receiverId: 'user-2',
          amount: 10,
          fee: 0,
          createdAt: new Date('2026-01-05T00:00:00.000Z'),
        }),
      ]);

      const statement = await service.buildStatement(BASE);
      const lineTotal = statement.lines.reduce(
        (sum, line) => sum + line.amount,
        0,
      );

      expect(statement.openingBalance + lineTotal).toBe(
        statement.closingBalance,
      );
      expect(statement.closingBalance).toBe(walletAfter);
    });
  });

  describe('validation', () => {
    it.each([
      ['invalid from', { ...BASE, from: 'not-a-date' }],
      ['invalid to', { ...BASE, to: 'nope' }],
      ['reversed range', { ...BASE, from: '2026-02-01', to: '2026-01-01' }],
      ['over 366 days', { ...BASE, from: '2024-01-01', to: '2026-01-01' }],
      ['missing currency', { ...BASE, currency: '' }],
    ])('rejects %s with 400', async (_label, request) => {
      await expect(service.buildStatement(request)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an invalid range before enqueueing', async () => {
      await expect(
        service.generateStatement({
          ...BASE,
          from: '2024-01-01',
          to: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('generateStatement', () => {
    it('returns a synchronous statement for ranges up to 31 days', async () => {
      const statement = await service.generateStatement(BASE);

      expect(statement).toEqual(
        expect.objectContaining({ currency: 'USD', openingBalance: 0 }),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('queues a larger range with the normalised request', async () => {
      await expect(
        service.generateStatement({
          ...BASE,
          currency: 'usd',
          from: '2026-01-01',
          to: '2026-03-15',
        }),
      ).resolves.toEqual({ status: 'queued', jobId: 'job-1' });
      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        expect.objectContaining({ currency: 'USD' }),
      );
    });

    it('renders a PDF when requested', async () => {
      const result = await service.generateStatement({
        ...BASE,
        format: 'pdf',
      });

      expect(pdfService.generateStatementPdf).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
