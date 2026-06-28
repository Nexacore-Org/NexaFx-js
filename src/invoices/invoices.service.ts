import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Invoice, InvoiceStatus, InvoiceLineItem } from './entities/invoice.entity';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>
  ) {}

  /**
   * Generates a sequential invoice number scoped exclusively per user.
   */
  private async generateNextInvoiceNumber(userId: string): Promise<string> {
    const lastInvoice = await this.invoiceRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' }
    });

    if (!lastInvoice) return 'INV-00001';
    
    const lastNum = parseInt(lastInvoice.invoiceNumber.replace('INV-', ''), 10);
    return `INV-${String(lastNum + 1).padStart(5, '0')}`;
  }

  public async createInvoice(userId: string, data: Partial<Invoice>): Promise<Invoice> {
    const invoice = new Invoice();
    invoice.userId = userId;
    invoice.invoiceNumber = await this.generateNextInvoiceNumber(userId);
    invoice.recipientEmail = data.recipientEmail!;
    invoice.recipientName = data.recipientName!;
    invoice.lineItems = data.lineItems || [];
    invoice.currency = data.currency || 'USD';
    invoice.taxPercent = data.taxPercent || 0;
    invoice.notes = data.notes;
    invoice.dueDate = new Date(data.dueDate!);
    invoice.status = InvoiceStatus.DRAFT;

    // Financial calculations
    invoice.subtotal = invoice.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    invoice.taxAmount = invoice.subtotal * (invoice.taxPercent / 100);
    invoice.totalAmount = invoice.subtotal + invoice.taxAmount;

    return this.invoiceRepo.save(invoice);
  }

  public async updateInvoice(id: string, userId: string, data: Partial<Invoice>): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Constraints Violation: Invoices are immutable after transition from DRAFT status.');
    }

    if (data.lineItems) {
      invoice.lineItems = data.lineItems;
      invoice.subtotal = invoice.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      invoice.taxAmount = invoice.subtotal * ((data.taxPercent ?? invoice.taxPercent) / 100);
      invoice.totalAmount = invoice.subtotal + invoice.taxAmount;
    }
    
    Object.assign(invoice, {
      recipientEmail: data.recipientEmail ?? invoice.recipientEmail,
      recipientName: data.recipientName ?? invoice.recipientName,
      currency: data.currency ?? invoice.currency,
      notes: data.notes ?? invoice.notes,
      dueDate: data.dueDate ? new Date(data.dueDate) : invoice.dueDate
    });

    return this.invoiceRepo.save(invoice);
  }

  public async sendInvoice(id: string, userId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    
    invoice.status = InvoiceStatus.SENT;
    invoice.paymentUrl = `https://nexafx.com/v2/pay-invoice/${invoice.id}`;
    
    // Trigger outbound email delivery here (e.g., MailerService.send(...))
    return this.invoiceRepo.save(invoice);
  }

  public async payInvoice(id: string, payerUserId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is not in a payable state');
    }

    // Process Ledger Account Debit/Credit internal transfers here...
    const simulatedTxId = `TX-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.linkedTransactionId = simulatedTxId;

    // Invalidate PDF cache on state mutations
    invoice.pdfS3Key = undefined; 

    return this.invoiceRepo.save(invoice);
  }

  /**
   * Daily invoice tracking engine. Evaluates states and drops notifications.
   * Execution Window: Daily at 09:00 UTC
   */
  @Cron('0 9 * * *')
  public async processInvoiceSchedules(): Promise<void> {
    const now = new Date();
    
    // 1. Transit elapsed targets into OVERDUE state arrays
    const expiredInvoices = await this.invoiceRepo.find({
      where: { status: InvoiceStatus.SENT, dueDate: MoreThan(now) } // Assuming raw chronological comparison checks
    });

    for (const inv of expiredInvoices) {
      if (inv.dueDate < now) {
        inv.status = InvoiceStatus.OVERDUE;
        await this.invoiceRepo.save(inv);
      }
    }

    // 2. Dispatch T-3 Pre-reminders and Overdue batches (Up to 3 total iterations max)
    // Add evaluation routines mapping the `reminderCount` index sequentially here.
  }

  public async getInvoicePdf(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // Simulate PDF generation binary stream buffer mapping
    const mockPdfBuffer = Buffer.from(`%PDF-1.4 Invoice Reference: ${invoice.invoiceNumber}`);
    return { buffer: mockPdfBuffer, contentType: 'application/pdf' };
  }

  public async cancelInvoice(id: string, userId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    invoice.status = InvoiceStatus.CANCELLED;
    return this.invoiceRepo.save(invoice);
  }

  public async deleteInvoice(id: string, userId: string): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Only DRAFT invoices can be deleted');
    await this.invoiceRepo.remove(invoice);
  }

  public async getInvoiceById(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  public async listInvoices(userId: string): Promise<Invoice[]> {
    return this.invoiceRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}