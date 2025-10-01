import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
  ) {}

  async create(userId: string, createDto: CreateWebhookDto): Promise<Webhook> {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const webhook = this.webhookRepository.create({
      ...createDto,
      userId,
      secret,
    });
    return this.webhookRepository.save(webhook);
  }

  async findByUserId(userId: string): Promise<Webhook[]> {
    return this.webhookRepository.find({ where: { userId } });
  }
  
  async delete(id: string, userId: string): Promise<void> {
    const result = await this.webhookRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException(`Webhook with ID "${id}" not found.`);
    }
  }
}