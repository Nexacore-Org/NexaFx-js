import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from 'pdf-lib';
import { PdfService } from './pdf.service';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/transaction.entity';

const pdfText = async (bytes: Uint8Array): Promise<string> => {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const objects =
    contents instanceof PDFArray ? contents.asArray() : [contents];
  return objects
    .map((object) =>
      object instanceof PDFRef ? doc.context.lookup(object) : object,
    )
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) =>
      Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'),
    )
    .join('\n')
    .replace(
      /<([0-9a-fA-F]+)>\s*Tj/g,
      (_match, hex: string) =>
        `(${Buffer.from(hex, 'hex').toString('latin1')}) Tj`,
    );
};

describe('PdfService (Receipts)', () => {
  let service: PdfService;
  const mockTxRepo = { findOne: jest.fn() };

  const transaction = (overrides: Record<string, unknown> = {}): Transaction =>
    ({
      id: 'tx-1',
      senderId: 'sender-1',
      receiverId: 'receiver-1',
      sender: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      },
      receiver: {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
      },
      amount: 100.5,
      currency: 'USD',
      fee: 1.25,
      status: TransactionStatus.COMPLETED,
      reference: 'NXF-2026-000001',
      receiptNumber: 'NXF-2026-R000001',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      completedAt: new Date('2026-01-02T03:05:06.000Z'),
      metadata: {},
      ...overrides,
    }) as Transaction;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
      ],
    }).compile();
    service = module.get(PdfService);
  });

  const pdfBuffer = async (tx: Transaction | string) =>
    Buffer.from(await service.generateReceiptPdf(tx));

  it('generates a PDF with the real receipt data', async () => {
    const pdf = await pdfBuffer(transaction());
    const text = await pdfText(pdf);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.toString('latin1').startsWith('%PDF')).toBe(true);
    expect(text).toContain('NXF-2026-R000001');
    expect(text).toContain('NXF-2026-000001');
    expect(text).toContain('2026-01-02T03:05:06.000Z');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('USD 100.50');
    expect(text).toContain('USD 1.25');
    expect(text).toContain('completed');
  });

  it('loads a transaction by id when one is passed', async () => {
    mockTxRepo.findOne.mockResolvedValue(transaction());
    const pdf = await pdfBuffer('tx-1');

    expect(mockTxRepo.findOne).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(await pdfText(pdf)).toContain('NXF-2026-000001');
  });

  it('shows the failure reason for a failed transaction', async () => {
    const pdf = await pdfBuffer(
      transaction({
        status: TransactionStatus.FAILED,
        metadata: { failureReason: 'Insufficient funds' },
      }),
    );
    expect(await pdfText(pdf)).toContain('Insufficient funds');
  });

  it('includes the FX rate and converted amount for swaps', async () => {
    const pdf = await pdfBuffer(
      transaction({
        metadata: { type: 'swap', toAmount: 90, toCurrency: 'EUR', rate: 0.9 },
      }),
    );
    const text = await pdfText(pdf);
    expect(text).toContain('FX rate: 0.9');
    expect(text).toContain('90 EUR');
  });

  it('sanitizes symbols and non-Latin text for the standard font', async () => {
    const pdf = await pdfBuffer(
      transaction({
        currency: 'NGN',
        amount: 5000,
        metadata: {
          type: 'swap',
          toAmount: '₦ 5 000',
          toCurrency: '₦',
          rate: '→',
        },
        sender: {
          firstName: 'Ẹ̀mi',
          lastName: '😀 漢字',
          email: 'emi@example.com',
        },
      }),
    );
    const text = await pdfText(pdf);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(text).toContain('NGN 5000.00');
    expect(text).toContain('NGN');
    expect(text).not.toContain('₦');
  });

  it('throws NotFoundException when the transaction is missing', async () => {
    mockTxRepo.findOne.mockResolvedValue(null);
    await expect(
      service.generateReceiptPdf('nonexistent'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.generateReceiptPdf(null as unknown as Transaction),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
