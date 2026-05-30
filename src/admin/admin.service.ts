import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';

export interface AdminStats {
  users: number;
  transactions: number;
  kycDocuments: number;
  supportTickets: number;
  webhookEndpoints: number;
  amlAlerts: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(KycDocument)
    private readonly kycRepository: Repository<KycDocument>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketsRepository: Repository<SupportTicket>,
    @InjectRepository(WebhookEndpoint)
    private readonly webhooksRepository: Repository<WebhookEndpoint>,
    @InjectRepository(AmlAlert)
    private readonly alertsRepository: Repository<AmlAlert>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const [
      users,
      transactions,
      kycDocuments,
      supportTickets,
      webhookEndpoints,
      amlAlerts,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.transactionsRepository.count(),
      this.kycRepository.count(),
      this.supportTicketsRepository.count(),
      this.webhooksRepository.count(),
      this.alertsRepository.count(),
    ]);

    return {
      users,
      transactions,
      kycDocuments,
      supportTickets,
      webhookEndpoints,
      amlAlerts,
    };
  }
}
