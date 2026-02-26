import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { TransactionService } from "../../common/services/transaction.service";

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(private transactionService: TransactionService) {}

  async dispatchWebhook(webhookData: any): Promise<any> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Check if webhook already dispatched (idempotency)
      const existing = await this.findExistingDispatch(
        queryRunner,
        webhookData.eventId,
        webhookData.webhookUrl,
      );
      if (existing) {
        this.logger.log(
          `Webhook already dispatched for event ${webhookData.eventId}`,
        );
        return existing;
      }

      // Step 1: Create webhook dispatch log
      const dispatch = await this.createDispatchLog(queryRunner, webhookData);

      // Step 2: Update event status
      await this.updateEventStatus(
        queryRunner,
        webhookData.eventId,
        "dispatching",
      );

      // Step 3: Record dispatch attempt
      await this.recordDispatchAttempt(queryRunner, dispatch.id);

      return dispatch;
    });
  }

  async recordWebhookResponse(
    dispatchId: string,
    response: any,
  ): Promise<void> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Step 1: Update dispatch log with response
      await this.updateDispatchLog(queryRunner, dispatchId, response);

      // Step 2: Get dispatch info
      const dispatch = await this.getDispatch(queryRunner, dispatchId);

      // Step 3: Update event status based on response
      const status = response.success ? "completed" : "failed";
      await this.updateEventStatus(queryRunner, dispatch.eventId, status);

      // Step 4: Create audit log
      await this.logWebhookResponse(queryRunner, dispatch, response);

      // Step 5: Schedule retry if failed
      if (!response.success && dispatch.attemptCount < 3) {
        await this.scheduleRetry(queryRunner, dispatchId);
      }
    });
  }

  private async findExistingDispatch(
    queryRunner: QueryRunner,
    eventId: string,
    webhookUrl: string,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM webhook_dispatches WHERE event_id = $1 AND webhook_url = $2",
      [eventId, webhookUrl],
    );
    return result[0];
  }

  private async createDispatchLog(
    queryRunner: QueryRunner,
    data: any,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      `INSERT INTO webhook_dispatches (event_id, webhook_url, payload, status, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [data.eventId, data.webhookUrl, JSON.stringify(data.payload), "pending"],
    );
    return result[0];
  }

  private async updateEventStatus(
    queryRunner: QueryRunner,
    eventId: string,
    status: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      "UPDATE events SET webhook_status = $1 WHERE id = $2",
      [status, eventId],
    );
  }

  private async recordDispatchAttempt(
    queryRunner: QueryRunner,
    dispatchId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      `UPDATE webhook_dispatches 
       SET attempt_count = attempt_count + 1, last_attempt_at = NOW() 
       WHERE id = $1`,
      [dispatchId],
    );
  }

  private async updateDispatchLog(
    queryRunner: QueryRunner,
    dispatchId: string,
    response: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `UPDATE webhook_dispatches 
       SET status = $1, response = $2, completed_at = NOW() 
       WHERE id = $3`,
      [
        response.success ? "completed" : "failed",
        JSON.stringify(response),
        dispatchId,
      ],
    );
  }

  private async getDispatch(
    queryRunner: QueryRunner,
    dispatchId: string,
  ): Promise<any> {
    const result = await queryRunner.manager.query(
      "SELECT * FROM webhook_dispatches WHERE id = $1",
      [dispatchId],
    );
    return result[0];
  }

  private async logWebhookResponse(
    queryRunner: QueryRunner,
    dispatch: any,
    response: any,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO audit_logs (event_id, action, metadata, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [
        dispatch.eventId,
        "webhook_response_received",
        JSON.stringify({ dispatchId: dispatch.id, response }),
      ],
    );
  }

  private async scheduleRetry(
    queryRunner: QueryRunner,
    dispatchId: string,
  ): Promise<void> {
    await queryRunner.manager.query(
      `INSERT INTO webhook_retries (dispatch_id, scheduled_at, status) 
       VALUES ($1, NOW() + INTERVAL '5 minutes', 'pending')`,
      [dispatchId],
    );
  }
}
