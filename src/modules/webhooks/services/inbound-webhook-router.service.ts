import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InboundWebhookLog } from '../entities/inbound-webhook-log.entity';
import { WebhookSignatureGuard } from '../guards/webhook-signature.guard';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface WebhookEvent {
  eventName: string;
  deliveryId: string;
  payload: Record<string, any>;
  userId?: string;
  transactionId?: string;
}

export interface WebhookHandler {
  handle(event: WebhookEvent): Promise<void>;
}

@Injectable()
export class InboundWebhookRouterService {
  private readonly logger = new Logger(InboundWebhookRouterService.name);
  private readonly handlers = new Map<string, WebhookHandler>();

  constructor(
    @InjectRepository(InboundWebhookLog)
    private readonly webhookLogRepo: Repository<InboundWebhookLog>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register handlers for different event types
    this.handlers.set('payment.settled', new PaymentSettledHandler(this.eventEmitter));
    this.handlers.set('payment.failed', new PaymentFailedHandler(this.eventEmitter));
    this.handlers.set('blockchain.confirmed', new BlockchainConfirmedHandler(this.eventEmitter));
    this.handlers.set('bank.settlement.completed', new BankSettlementCompletedHandler(this.eventEmitter));
    this.handlers.set('bank.settlement.failed', new BankSettlementFailedHandler(this.eventEmitter));
  }

  async routeEvent(eventName: string, deliveryId: string, payload: Record<string, any>): Promise<void> {
    const startTime = Date.now();
    let processingResult: string = 'Unknown error';
    let status: 'PROCESSED' | 'FAILED' | 'UNHANDLED' = 'FAILED';

    try {
      // Log the inbound event immediately
      const logEntry = this.webhookLogRepo.create({
        eventName,
        deliveryId,
        payload,
        status: 'PROCESSING',
        receivedAt: new Date(),
      });
      
      await this.webhookLogRepo.save(logEntry);

      // Find and execute handler
      const handler = this.handlers.get(eventName);
      if (!handler) {
        processingResult = `No handler found for event: ${eventName}`;
        status = 'UNHANDLED';
        this.logger.warn(processingResult);
      } else {
        const event: WebhookEvent = {
          eventName,
          deliveryId,
          payload,
          userId: payload.userId,
          transactionId: payload.transactionId || payload.reference,
        };

        await handler.handle(event);
        processingResult = 'Event processed successfully';
        status = 'PROCESSED';
        this.logger.log(`Processed event ${eventName} with delivery ID ${deliveryId}`);
      }
    } catch (error) {
      processingResult = `Error processing event: ${error.message}`;
      status = 'FAILED';
      this.logger.error(`Failed to process event ${eventName}:`, error.stack);
    } finally {
      // Update log entry with processing result
      const processingTime = Date.now() - startTime;
      await this.webhookLogRepo.update(
        { deliveryId },
        {
          status,
          processingResult,
          processingTime,
          processedAt: new Date(),
        },
      );
    }
  }
}

// Handler implementations
class PaymentSettledHandler implements WebhookHandler {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async handle(event: WebhookEvent): Promise<void> {
    // Find the referenced transaction and update status to COMPLETED
    // This would integrate with your transaction service
    this.eventEmitter.emit('payment.settled', {
      transactionId: event.transactionId,
      userId: event.userId,
      payload: event.payload,
    });
  }
}

class PaymentFailedHandler implements WebhookHandler {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async handle(event: WebhookEvent): Promise<void> {
    // Find the referenced transaction and update status to FAILED
    // Trigger retry logic if applicable
    this.eventEmitter.emit('payment.failed', {
      transactionId: event.transactionId,
      userId: event.userId,
      payload: event.payload,
    });
  }
}

class BlockchainConfirmedHandler implements WebhookHandler {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async handle(event: WebhookEvent): Promise<void> {
    // Handle blockchain confirmation
    this.eventEmitter.emit('blockchain.confirmed', {
      transactionId: event.transactionId,
      userId: event.userId,
      payload: event.payload,
    });
  }
}

class BankSettlementCompletedHandler implements WebhookHandler {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async handle(event: WebhookEvent): Promise<void> {
    // Update bank transfer status and credit user wallet
    this.eventEmitter.emit('bank.settlement.completed', {
      transactionId: event.transactionId,
      userId: event.userId,
      payload: event.payload,
    });
  }
}

class BankSettlementFailedHandler implements WebhookHandler {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async handle(event: WebhookEvent): Promise<void> {
    // Handle failed bank settlement
    this.eventEmitter.emit('bank.settlement.failed', {
      transactionId: event.transactionId,
      userId: event.userId,
      payload: event.payload,
    });
  }
}
