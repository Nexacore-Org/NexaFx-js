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
    // Broadcasts (ALL) as well as direct messages; skip ones scheduled for later (issue #1388).
    const rows = await this.messageRepo.find({
      where: [{ targetType: 'ALL' }, { targetType: 'USER', targetUserId: userId }],
      order: { createdAt: 'DESC' },
    });
    const now = new Date();
    return rows.filter((m) => !m.scheduledAt || m.scheduledAt <= now);
  }
}
