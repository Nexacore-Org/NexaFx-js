import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PassThrough } from 'stream';
import type { Response } from 'express';
import { DocumentsController } from './documents.controller';
import { PdfService } from './pdf.service';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';

const transaction = {
  id: 'tx-1',
  senderId: 'sender-1',
  receiverId: 'receiver-1',
  amount: 100,
  currency: 'USD',
  reference: 'NXF-2026-000001',
  receiptNumber: 'NXF-2026-R000001',
} as Transaction;

const make = (
  found: unknown = transaction,
): {
  controller: DocumentsController;
  pdfService: {
    generateReceiptPdf: jest.Mock<Promise<Buffer>, [Transaction | string]>;
    generateStatementPdf: jest.Mock;
  };
  transactionRepo: { findOne: jest.Mock<Promise<unknown>, [unknown]> };
} => {
  const pdfService = {
    generateReceiptPdf: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.7'))),
    generateStatementPdf: jest.fn(),
  };
  const transactionRepo = {
    findOne: jest.fn(() => Promise.resolve(found)),
  };
  return {
    controller: new DocumentsController(
      pdfService as unknown as PdfService,
      transactionRepo as unknown as Repository<Transaction>,
    ),
    pdfService,
    transactionRepo,
  };
};

const makeResponse = () => {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<void>((resolve) =>
    sink.on('finish', () => resolve()),
  );
  const setHeader = jest.fn();
  const res = sink as PassThrough & { setHeader: jest.Mock };
  res.setHeader = setHeader;
  return { res: res as Response, setHeader, finished, chunks, sink };
};

describe('DocumentsController.downloadReceipt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows the sender and passes the full transaction to the PDF service', async () => {
    const { controller, pdfService, transactionRepo } = make();
    const { res, setHeader, finished, chunks } = makeResponse();

    await controller.downloadReceipt(
      'tx-1',
      { user: { sub: 'sender-1' } },
      res,
    );
    await finished;

    expect(transactionRepo.findOne).toHaveBeenCalled();
    expect(pdfService.generateReceiptPdf).toHaveBeenCalledWith(transaction);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(Buffer.concat(chunks).toString()).toBe('%PDF-1.7');
  });

  it('allows the receiver', async () => {
    const { controller, pdfService } = make();
    const { res, finished } = makeResponse();

    await controller.downloadReceipt(
      'tx-1',
      { user: { sub: 'receiver-1' } },
      res,
    );
    await finished;

    expect(pdfService.generateReceiptPdf).toHaveBeenCalledWith(transaction);
  });

  it('refuses a stranger', async () => {
    const { controller, pdfService } = make();
    const { res } = makeResponse();

    await expect(
      controller.downloadReceipt('tx-1', { user: { sub: 'stranger' } }, res),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pdfService.generateReceiptPdf).not.toHaveBeenCalled();
  });

  it('404s for a missing transaction', async () => {
    const { controller } = make(null);
    const { res } = makeResponse();

    await expect(
      controller.downloadReceipt('missing', { user: { sub: 'sender-1' } }, res),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
