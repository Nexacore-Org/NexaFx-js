import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhookVerificationService } from '../services/webhook-verification.service';
import { WebhooksService } from '../webhooks.service';

const REQUIRED_HEADERS = [
  'x-nexafx-signature',
  'x-nexafx-timestamp',
  'x-nexafx-delivery-id',
];

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(
    private readonly verificationService: WebhookVerificationService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const signature = request.headers['x-nexafx-signature'];
    const timestamp = request.headers['x-nexafx-timestamp'];
    const deliveryId = request.headers['x-nexafx-delivery-id'];
    const eventName = request.headers['x-nexafx-event'];

    // Check all required headers are present
    const missing = REQUIRED_HEADERS.filter((h) => !request.headers[h]);
    if (missing.length > 0) {
      this.logger.warn(
        `Webhook request missing headers: ${missing.join(', ')}`,
      );
      throw new UnauthorizedException(
        `Missing required webhook headers: ${missing.join(', ')}`,
      );
    }

    // Raw body must be available. NestJS parses JSON by default — we need the raw buffer.
    // This is populated by the rawBodyMiddleware registered in main.ts.
    const rawBody: Buffer | undefined = request.rawBody;
    if (!rawBody) {
      this.logger.error(
        'rawBody is not available — ensure rawBodyMiddleware is applied to the webhooks route',
      );
      throw new UnauthorizedException(
        'Unable to verify webhook signature: raw body unavailable',
      );
    }

    const rawBodyString = rawBody.toString('utf8');

    // Look up the subscription secret by delivery ID (via subscription ID embedded in delivery)
    // The secret to verify against is scoped per subscription. Since inbound webhooks reference
    // a subscriptionId via deliveryId, we look up the delivery to find the subscription secret.
    // Fall back to a global shared secret if configured.
    const secret = await this.resolveSecret(deliveryId);

    if (!secret) {
      this.logger.warn(`No secret found for deliveryId=${deliveryId}`);
      throw new UnauthorizedException('Unable to resolve webhook secret');
    }

    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      'unknown';

    const result = await this.verificationService.verify({
      signature,
      timestamp,
      deliveryId,
      rawBody: rawBodyString,
      secret,
      ipAddress,
      eventName,
    });

    if (!result.valid) {
      throw new UnauthorizedException(
        `Webhook verification failed: ${result.reason}`,
      );
    }

    return true;
  }

  private async resolveSecret(deliveryId: string): Promise<string | null> {
    // Try to find the subscription linked to this delivery
    const secret = await this.webhooksService.getSecretByDeliveryId(deliveryId);
    if (secret) return secret;

    // Fall back to a global shared ingestion secret (env var)
    return process.env.WEBHOOK_INGESTION_SECRET ?? null;
  }
}
