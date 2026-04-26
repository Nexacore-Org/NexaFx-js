import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class SplitPaymentService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly repo: any,
  ) {}

  async contribute(paymentId: string, userId: string, amount: number) {
    const payment = await this.repo.findOneBy({ id: paymentId });

    setImmediate(() => {
      this.notificationService.send({
        type: 'SPLIT_CONTRIBUTION',
        payload: { paymentId, userId, amount },
      });

      payment.participants
        .filter((p: string) => p !== userId)
        .forEach((recipientId: string) => {
          this.notificationService.send({
            type: 'SPLIT_CONTRIBUTION',
            userId: recipientId,
            payload: { paymentId, from: userId, amount },
          });
        });
    });

    return payment;
  }

  async completeSplit(paymentId: string) {
    const payment = await this.repo.findOneBy({ id: paymentId });

    setImmediate(() => {
      this.notificationService.send({
        type: 'SPLIT_COMPLETED',
        payload: { paymentId },
      });

      payment.participants.forEach((userId: string) => {
        this.notificationService.send({
          type: 'SPLIT_COMPLETED',
          userId,
          payload: { paymentId },
        });
      });
    });

    return payment;
  }
}