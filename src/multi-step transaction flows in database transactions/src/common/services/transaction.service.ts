import { Injectable } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";

@Injectable()
export class TransactionService {
  constructor(private dataSource: DataSource) {}

  async runInTransaction<T>(
    work: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await work(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
