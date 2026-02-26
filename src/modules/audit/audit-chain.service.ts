// src/modules/audit/audit-chain.service.ts
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class AuditChainService {
  async createLogEntry(data: any, previousHash: string) {
    const stringifiedData = JSON.stringify(data);
    const hash = crypto
      .createHash('sha256')
      .update(stringifiedData + previousHash)
      .digest('hex');

    return {
      ...data,
      hash,
      previousHash,
      timestamp: new Date(),
    };
  }

  async verifyChain(logs: any[]): Promise<boolean> {
    for (let i = 1; i < logs.length; i++) {
      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(logs[i].data) + logs[i-1].hash)
        .digest('hex');
      
      if (logs[i].hash !== expectedHash) return false;
    }
    return true;
  }
}