import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { TransactionService } from "../../common/services/transaction.service";

@Injectable()
export class TransactionExecutionService {
  private readonly logger = new Logger(TransactionExecutionService.name);

  constructor(private transactionService: TransactionService) {}

  async executeTransaction(transactionData: any): Promise<any> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Check idempotency
      const existing = await this.checkIdempotency(
        queryRunner,
        transactionData.idempotencyKey,
      );
      if (existing) {
        this.logger.log(
          `Transaction already processed: ${transactionData.idempotencyKey}`,
        );
        return existing;
      }

      // Step 1: Create transaction record
      const transaction = await this.createTransactionRecord(
        queryRunner,
        transactionData,
      );

      // Step 2: Update account balances
      await this.updateAccountBalances(queryRunner, transaction);

      // Step 3: Create audit log
      await this.createAuditLog(queryRunner, transaction);

      // Step 4: Mark as completed
      await this.markTransactionCompleted(queryRunner, transaction.id);

      return transaction;
    });
  }

  private async checkIdempotency(
    queryRunner: QueryRunner,
    idempotencyKey: string,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM transactions WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    return result[0];
  }

  private async createTransactionRecord(
    queryRunner: QueryRunner,
    data: any,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      `INSERT INTO transactions (idempotency_key, amount, status, created_at) 
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [data.idempotencyKey, data.amount, "pending"],
    );
    return result[0];
  }

  private async updateAccountBalances(
    queryRunner: QueryRunner,
    transaction: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
      [transaction.amount, transaction.fromAccountId],
    );
    await queryRunner.manager.query(
      "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
      [transaction.amount, transaction.toAccountId],
    );
  }

  private async createAuditLog(
    queryRunner: QueryRunner,
    transaction: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO audit_logs (transaction_id, action, created_at) 
       VALUES ($1, $2, NOW())`,
      [transaction.id, "transaction_executed"],
    );
  }

  private async markTransactionCompleted(
    queryRunner: QueryRunner,
    transactionId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE transactions SET status = $1, completed_at = NOW() WHERE id = $2",
      ["completed", transactionId],
    );
  }
}
