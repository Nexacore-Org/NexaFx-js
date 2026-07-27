import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class BackupCodesService {
  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      codes.push(code.slice(0, 4) + '-' + code.slice(4));
    }
    return codes;
  }

  validateBackupCode(code: string, storedCodes: string[]): boolean {
    return storedCodes.includes(code.toUpperCase());
  }

  removeUsedCode(code: string, storedCodes: string[]): string[] {
    return storedCodes.filter(c => c !== code.toUpperCase());
  }
}
