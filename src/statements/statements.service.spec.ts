import { StatementsService } from './statements.service';
import { UsersService } from '../users/users.service';
import { PdfService } from '../documents/pdf.service';
import { MailService } from '../mail/mail.service';
import { Transaction } from '../transactions/transaction.entity';
import { FxTrade } from '../fx/fx-trade.entity';
import { Queue } from 'bull';
import { Repository } from 'typeorm';

describe('StatementsService', () => {
  const txRepository: Pick<Repository<Transaction>, 'find'> = {
    find: jest.fn(),
  };
  const fxRepository: Pick<Repository<FxTrade>, 'find'> = {
    find: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  } as unknown as UsersService;
  const pdfService = {
    generateStatementPdf: jest.fn(),
  } as unknown as PdfService;
  const mailService = {
    sendStatementReadyEmail: jest.fn(),
  } as unknown as MailService;
  const queue: Pick<Queue, 'add'> = {
    add: jest.fn(),
  };
  const service = new StatementsService(
    txRepository as Repository<Transaction>,
    fxRepository as Repository<FxTrade>,
    usersService,
    pdfService,
    mailService,
    queue as Queue,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a statement from transactions and fx trades', async () => {
    (usersService.findById as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    (txRepository.find as jest.Mock).mockResolvedValue([
      {
        id: 'tx-1',
        senderId: 'user-1',
        receiverId: 'user-2',
        amount: 100,
        currency: 'USD',
        reference: 'ref-1',
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
      } as Transaction,
    ]);
    (fxRepository.find as jest.Mock).mockResolvedValue([]);

    await expect(
      service.buildStatement({
        userId: 'user-1',
        currency: 'USD',
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).resolves.toMatchObject({
      user: { email: 'user@example.com' },
      currency: 'USD',
      openingBalance: 0,
      closingBalance: -100,
    });
  });

  it('queues large ranges for async processing', async () => {
    (queue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

    await expect(
      service.generateStatement({
        userId: 'user-1',
        currency: 'USD',
        from: '2026-01-01',
        to: '2026-03-15',
      }),
    ).resolves.toEqual({ status: 'queued', jobId: 'job-1' });
  });
});
