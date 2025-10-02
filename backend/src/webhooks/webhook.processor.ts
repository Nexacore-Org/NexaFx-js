import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery, DeliveryStatus } from './entities/webhook-delivery.entity';
import { createHmac } from 'crypto';
import { firstValueFrom } from 'rxjs';

@Processor('webhook-delivery')
export class WebhookProcessor {
  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
  ) {}

  @Process('dispatch-webhook')
  async handleDispatch(job: Job<{ webhookId: string; eventName: string; payload: any }>) {
    const { webhookId, eventName, payload } = job.data;
    const webhook = await this.webhookRepository.findOne({ where: { id: webhookId } });

    if (!webhook || !webhook.isActive) {
      return; // Or log that the webhook is disabled/deleted
    }

    const delivery = this.deliveryRepository.create({ webhookId, eventName, payload });
    await this.deliveryRepository.save(delivery);

    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');

    try {
      const response = await firstValueFrom(
        this.httpService.post(webhook.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Signature-SHA256': signature,
          },
          timeout: 10000, // 10-second timeout
        }),
      );

      delivery.status = DeliveryStatus.SUCCESS;
      delivery.responseStatusCode = response.status;
      delivery.responseBody = JSON.stringify(response.data);

    } catch (error) {
      delivery.status = DeliveryStatus.FAILED;
      delivery.responseStatusCode = error.response?.status;
      delivery.responseBody = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      
      // Re-throw the error to let Bull handle the retry logic
      throw error;
    } finally {
      await this.deliveryRepository.save(delivery);
    }
  }
}