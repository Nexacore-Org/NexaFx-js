import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminMessage } from './admin-message.entity';

@Injectable()
export class AdminMessageService {
  constructor(
    @InjectRepository(AdminMessage)
    private messageRepo: Repository<AdminMessage>,
  ) {}

  async createMessage(data: Partial<AdminMessage>) {
    const message = this.messageRepo.create(data);
    return this.messageRepo.save(message);
  }

  async markAsRead(messageId: string, userId: string) {
    return this.messageRepo.update(messageId, { sentAt: new Date() });
  }

  async getUserMessages(userId: string) {
    return this.messageRepo.find({ where: { targetUserId: userId } });
  }
}
