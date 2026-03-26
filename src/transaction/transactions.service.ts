import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletsService } from '../wallets/wallets.service';
import { ReceiveTransactionDto } from './dto/receive-transaction.dto';
import { TransactionRecord } from './transactions.types';

@Injectable()
export class TransactionsService {
  private readonly transactions: TransactionRecord[] = [];

  constructor(private readonly walletsService: WalletsService) {}

  receiveIncomingTransaction(dto: ReceiveTransactionDto): TransactionRecord {
    this.assertPositiveAmount(dto.amount);
    const currency = dto.currency.toUpperCase();

    this.walletsService.adjustBalance(dto.accountId, currency, dto.amount);
    const transaction = this.createTransaction({
      accountId: dto.accountId,
      type: 'RECEIVE',
      sourceCurrency: currency,
      sourceAmount: dto.amount,
      metadata: {
        reference: dto.reference ?? null,
      },
    });

    this.transactions.push(transaction);
    return transaction;
  }

  createFxConversion(input: {
    accountId: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: number;
    rate: number;
    ruleId: string;
    triggerContext: Record<string, unknown>;
  }): TransactionRecord {
    this.assertPositiveAmount(input.fromAmount);
    if (input.rate <= 0) {
      throw new BadRequestException('FX rate must be greater than zero.');
    }
    const fromCurrency = input.fromCurrency.toUpperCase();
    const toCurrency = input.toCurrency.toUpperCase();

    const destinationAmount = Number((input.fromAmount * input.rate).toFixed(2));
    this.walletsService.adjustBalance(input.accountId, fromCurrency, -input.fromAmount);
    this.walletsService.adjustBalance(input.accountId, toCurrency, destinationAmount);

    const transaction = this.createTransaction({
      accountId: input.accountId,
      type: 'FX_CONVERSION',
      sourceCurrency: fromCurrency,
      sourceAmount: input.fromAmount,
      destinationCurrency: toCurrency,
      destinationAmount,
      rate: input.rate,
      metadata: {
        ruleId: input.ruleId,
        triggerContext: input.triggerContext,
      },
    });

    this.transactions.push(transaction);
    return transaction;
  }

  listTransactions(accountId?: string): TransactionRecord[] {
    if (!accountId) {
      return this.transactions;
    }

    return this.transactions.filter((transaction) => transaction.accountId === accountId);
  }

  private createTransaction(
    transaction: Omit<TransactionRecord, 'id' | 'createdAt'>,
  ): TransactionRecord {
    return {
      ...transaction,
      id: `txn_${this.transactions.length + 1}`,
      createdAt: new Date().toISOString(),
    };
  }

  private assertPositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number.');
    }
  }
}
