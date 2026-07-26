import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';

describe('PdfService (Receipts)', () => {
  let service: PdfService;
  const mockTxRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
      ],
    }).compile();
    service = module.get(PdfService);
  });

  it('generates PDF with correct amount, currency, date, reference', async () => {
    mockTxRepo.findOne.mockResolvedValue({
      id: 'tx-1', amount: 100, currency: 'USD', reference: 'NXF-2026-000001',
      createdAt: new Date(), status: 'completed', fee: 0,
    });
    const pdf = await service.generateReceiptPdf('tx-1');
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.toString().startsWith('%PDF')).toBe(true);
  });

  it('shows failure reason for failed transaction', async () => {
    mockTxRepo.findOne.mockResolvedValue({
      id: 'tx-2', status: 'failed',
    });
    const pdf = await service.generateReceiptPdf('tx-2');
    expect(pdf).toBeInstanceOf(Buffer);
  });

  it('throws NotFoundException for non-existent transaction', async () => {
    mockTxRepo.findOne.mockResolvedValue(null);
    await expect(service.generateReceiptPdf('nonexistent')).rejects.toThrow();
  });
});
