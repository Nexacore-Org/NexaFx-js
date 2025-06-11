import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AntivirusResult {
  clean: boolean;
  threat?: string;
  engine: string;
}

@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);

  async scanFile(filePath: string): Promise<AntivirusResult> {
    try {
      // Try ClamAV first (most common on Linux servers)
      if (await this.isClamAvailable()) {
        return await this.scanWithClamAV(filePath);
      }

      // Fallback to basic signature scanning
      return await this.basicSignatureScan(filePath);
    } catch (error) {
      this.logger.warn(`Antivirus scan failed: ${error.message}`);
      return {
        clean: false,
        threat: 'Scan failed',
        engine: 'error',
      };
    }
  }

  private async isClamAvailable(): Promise<boolean> {
    try {
      await execAsync('which clamscan');
      return true;
    } catch {
      return false;
    }
  }

  private async scanWithClamAV(filePath: string): Promise<AntivirusResult> {
    try {
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      if (stdout.includes('OK')) {
        return {
          clean: true,
          engine: 'ClamAV',
        };
      } else {
        const threatMatch = stdout.match(/FOUND:\s*(.+)/);
        return {
          clean: false,
          threat: threatMatch ? threatMatch[1] : 'Unknown threat',
          engine: 'ClamAV',
        };
      }
    } catch (error) {
      throw new Error(`ClamAV scan failed: ${error.message}`);
    }
  }

  private async basicSignatureScan(filePath: string): Promise<AntivirusResult> {
    const fs = require('fs/promises');
    
    try {
      const buffer = await fs.readFile(filePath);
      const content = buffer.toString('hex');
      
      // Basic malware signatures (simplified examples)
      const signatures = [
        '4d5a', // PE executable header
        '7f454c46', // ELF header
        'cafebabe', // Java class file
        '504b0304', // ZIP file (could contain malware)
      ];

      // Check for suspicious patterns
      const suspiciousPatterns = [
        'eval\\s*\\(',
        '<script[^>]*>.*?</script>',
        'javascript:',
        'vbscript:',
        'data:text/html',
      ];

      const textContent = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
      
      for (const pattern of suspiciousPatterns) {
        if (new RegExp(pattern, 'i').test(textContent)) {
          return {
            clean: false,
            threat: `Suspicious pattern detected: ${pattern}`,
            engine: 'Basic Scanner',
          };
        }
      }

      return {
        clean: true,
        engine: 'Basic Scanner',
      };
    } catch (error) {
      throw new Error(`Basic scan failed: ${error.message}`);
    }
  }
}