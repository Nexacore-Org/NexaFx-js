import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { TransactionService } from "../../common/services/transaction.service";

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private transactionService: TransactionService) {}

  async createSnapshot(snapshotData: any): Promise<any> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Check if snapshot already exists (idempotency)
      const existing = await this.findExistingSnapshot(
        queryRunner,
        snapshotData.entityId,
        snapshotData.version,
      );
      if (existing) {
        this.logger.log(
          `Snapshot already exists for version ${snapshotData.version}`,
        );
        return existing;
      }

      // Step 1: Create snapshot record
      const snapshot = await this.insertSnapshot(queryRunner, snapshotData);

      // Step 2: Archive old snapshots
      await this.archiveOldSnapshots(queryRunner, snapshotData.entityId);

      // Step 3: Update entity with snapshot reference
      await this.updateEntitySnapshot(
        queryRunner,
        snapshotData.entityId,
        snapshot.id,
      );

      // Step 4: Log snapshot creation
      await this.logSnapshotCreation(queryRunner, snapshot);

      return snapshot;
    });
  }

  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Step 1: Get snapshot data
      const snapshot = await this.getSnapshot(queryRunner, snapshotId);

      // Step 2: Restore entity state
      await this.restoreEntityState(queryRunner, snapshot);

      // Step 3: Create restore audit log
      await this.logSnapshotRestore(queryRunner, snapshot);

      // Step 4: Update entity version
      await this.updateEntityVersion(
        queryRunner,
        snapshot.entityId,
        snapshot.version,
      );
    });
  }

  private async findExistingSnapshot(
    queryRunner: QueryRunner,
    entityId: string,
    version: number,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM snapshots WHERE entity_id = $1 AND version = $2",
      [entityId, version],
    );
    return result[0];
  }

  private async insertSnapshot(
    queryRunner: QueryRunner,
    data: any,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      `INSERT INTO snapshots (entity_id, version, data, created_at) 
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [data.entityId, data.version, JSON.stringify(data.data)],
    );
    return result[0];
  }

  private async archiveOldSnapshots(
    queryRunner: QueryRunner,
    entityId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      `UPDATE snapshots SET archived = true 
       WHERE entity_id = $1 AND archived = false`,
      [entityId],
    );
  }

  private async updateEntitySnapshot(
    queryRunner: QueryRunner,
    entityId: string,
    snapshotId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE entities SET current_snapshot_id = $1 WHERE id = $2",
      [snapshotId, entityId],
    );
  }

  private async logSnapshotCreation(
    queryRunner: QueryRunner,
    snapshot: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO audit_logs (entity_id, action, metadata, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [snapshot.entityId, "snapshot_created", JSON.stringify(snapshot)],
    );
  }

  private async getSnapshot(
    queryRunner: QueryRunner,
    snapshotId: string,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM snapshots WHERE id = $1",
      [snapshotId],
    );
    return result[0];
  }

  private async restoreEntityState(
    queryRunner: QueryRunner,
    snapshot: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE entities SET data = $1 WHERE id = $2",
      [snapshot.data, snapshot.entityId],
    );
  }

  private async logSnapshotRestore(
    queryRunner: QueryRunner,
    snapshot: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO audit_logs (entity_id, action, metadata, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [snapshot.entityId, "snapshot_restored", JSON.stringify(snapshot)],
    );
  }

  private async updateEntityVersion(
    queryRunner: QueryRunner,
    entityId: string,
    version: number,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE entities SET version = $1 WHERE id = $2",
      [version, entityId],
    );
  }
}
