import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { TransactionService } from "../../common/services/transaction.service";

@Injectable()
export class RetryJobService {
  private readonly logger = new Logger(RetryJobService.name);

  constructor(private transactionService: TransactionService) {}

  async createRetryJob(jobData: any): Promise<any> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Check if retry job already exists (idempotency)
      const existing = await this.findExistingRetryJob(
        queryRunner,
        jobData.transactionId,
        jobData.attemptNumber,
      );
      if (existing) {
        this.logger.log(
          `Retry job already exists for attempt ${jobData.attemptNumber}`,
        );
        return existing;
      }

      // Step 1: Create retry job record
      const retryJob = await this.insertRetryJob(queryRunner, jobData);

      // Step 2: Update transaction retry count
      await this.incrementRetryCount(queryRunner, jobData.transactionId);

      // Step 3: Log retry attempt
      await this.logRetryAttempt(queryRunner, retryJob);

      return retryJob;
    });
  }

  async processRetryJob(retryJobId: string): Promise<void> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Step 1: Mark job as processing
      await this.markJobProcessing(queryRunner, retryJobId);

      try {
        // Step 2: Execute the retry logic
        const job = await this.getRetryJob(queryRunner, retryJobId);
        await this.executeRetryLogic(queryRunner, job);

        // Step 3: Mark job as completed
        await this.markJobCompleted(queryRunner, retryJobId);

        // Step 4: Update transaction status
        await this.updateTransactionStatus(
          queryRunner,
          job.transactionId,
          "completed",
        );
      } catch (error) {
        // Step 5: Mark job as failed
        await this.markJobFailed(queryRunner, retryJobId, error.message);
        throw error;
      }
    });
  }

  private async findExistingRetryJob(
    queryRunner: QueryRunner,
    transactionId: string,
    attemptNumber: number,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM retry_jobs WHERE transaction_id = $1 AND attempt_number = $2",
      [transactionId, attemptNumber],
    );
    return result[0];
  }

  private async insertRetryJob(
    queryRunner: QueryRunner,
    data: any,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      `INSERT INTO retry_jobs (transaction_id, attempt_number, status, created_at) 
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [data.transactionId, data.attemptNumber, "pending"],
    );
    return result[0];
  }

  private async incrementRetryCount(
    queryRunner: QueryRunner,
    transactionId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE transactions SET retry_count = retry_count + 1 WHERE id = $1",
      [transactionId],
    );
  }

  private async logRetryAttempt(
    queryRunner: QueryRunner,
    retryJob: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO audit_logs (transaction_id, action, metadata, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [retryJob.transactionId, "retry_scheduled", JSON.stringify(retryJob)],
    );
  }

  private async markJobProcessing(
    queryRunner: QueryRunner,
    retryJobId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE retry_jobs SET status = $1, started_at = NOW() WHERE id = $2",
      ["processing", retryJobId],
    );
  }

  private async getRetryJob(
    queryRunner: QueryRunner,
    retryJobId: string,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM retry_jobs WHERE id = $1",
      [retryJobId],
    );
    return result[0];
  }

  private async executeRetryLogic(
    queryRunner: QueryRunner,
    job: any,
  ): Promise<void> {
    // Implement your retry logic here
    this.logger.log(`Executing retry logic for job ${job.id}`);
  }

  private async markJobCompleted(
    queryRunner: QueryRunner,
    retryJobId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE retry_jobs SET status = $1, completed_at = NOW() WHERE id = $2",
      ["completed", retryJobId],
    );
  }

  private async markJobFailed(
    queryRunner: QueryRunner,
    retryJobId: string,
    errorMessage: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE retry_jobs SET status = $1, error_message = $2, failed_at = NOW() WHERE id = $3",
      ["failed", errorMessage, retryJobId],
    );
  }

  private async updateTransactionStatus(
    queryRunner: QueryRunner,
    transactionId: string,
    status: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE transactions SET status = $1 WHERE id = $2",
      [status, transactionId],
    );
  }
}
