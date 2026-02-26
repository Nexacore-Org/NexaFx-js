// src/modules/messaging/messaging.service.ts
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class MessagingService {
  private readonly ENCRYPTION_KEY = process.env.MSG_ENCRYPTION_KEY;

  async sendEncryptedMessage(senderId: string, receiverId: string, content: string) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.ENCRYPTION_KEY), iv);
    
    let encrypted = cipher.update(content);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return {
      senderId,
      receiverId,
      content: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      timestamp: new Date()
    };
  }
}