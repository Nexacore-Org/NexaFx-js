import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { TransactionService } from "../../common/services/transaction.service";

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(private transactionService: TransactionService) {}

  async enrichTransaction(
    transactionId: string,
    enrichmentData: any,
  ): Promise<any> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Check if enrichment already applied (idempotency)
      const existing = await this.findExistingEnrichment(
        queryRunner,
        transactionId,
        enrichmentData.source,
      );
      if (existing) {
        this.logger.log(
          `Enrichment already applied from ${enrichmentData.source}`,
        );
        return existing;
      }

      // Step 1: Create enrichment record
      const enrichment = await this.createEnrichmentRecord(
        queryRunner,
        transactionId,
        enrichmentData,
      );

      // Step 2: Update transaction with enriched data
      await this.updateTransactionData(
        queryRunner,
        transactionId,
        enrichmentData,
      );

      // Step 3: Update enrichment metadata
      await this.updateEnrichmentMetadata(queryRunner, transactionId);

      // Step 4: Log enrichment
      await this.logEnrichment(queryRunner, enrichment);

      return enrichment;
    });
  }

  private async findExistingEnrichment(
    queryRunner: QueryRunner,
    transactionId: string,
    source: string,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM enrichments WHERE transaction_id = $1 AND source = $2",
      [transactionId, source],
    );
    return result[0];
  }

  private async createEnrichmentRecord(
    queryRunner: QueryRunner,
    transactionId: string,
    data: any,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      `INSERT INTO enrichments (transaction_id, source, data, created_at) 
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [transactionId, data.source, JSON.stringify(data)],
    );
    return result[0];
  }

  private async updateTransactionData(
    queryRunner: QueryRunner,
    transactionId: string,
    enrichmentData: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `UPDATE transactions 
       SET enriched_data = COALESCE(enriched_data, '{}'::jsonb) || $1::jsonb 
       WHERE id = $2`,
      [JSON.stringify(enrichmentData), transactionId],
    );
  }

  private async updateEnrichmentMetadata(
    queryRunner: QueryRunner,
    transactionId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      `UPDATE transactions 
       SET enrichment_count = enrichment_count + 1, last_enriched_at = NOW() 
       WHERE id = $1`,
      [transactionId],
    );
  }

  private async logEnrichment(
    queryRunner: QueryRunner,
    enrichment: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO audit_logs (transaction_id, action, metadata, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [
        enrichment.transactionId,
        "transaction_enriched",
        JSON.stringify(enrichment),
      ],
    );
  }
}
