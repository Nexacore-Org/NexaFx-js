import { Module } from "@nestjs/common";
import { TransactionExecutionService } from "./services/transaction-execution.service";
import { RetryJobService } from "./services/retry-job.service";

@Module({
  providers: [TransactionExecutionService, RetryJobService],
  exports: [TransactionExecutionService, RetryJobService],
})
export class TransactionsModule {}
