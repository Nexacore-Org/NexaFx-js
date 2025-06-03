import { Injectable, Inject } from '@nestjs/common';
import { MaskingOptions } from '../interceptors/masking.interceptor';

@Injectable()
export class MaskingService {
  constructor(
    @Inject('MASKING_OPTIONS') private readonly options: MaskingOptions
  ) {}

  maskData(data: any): any {
    return this.maskSensitiveData(data);
  }

  private maskSensitiveData(data: any): any {
    if (!data) return data;

    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const maskedData = { ...data };
      
      for (const [key, value] of Object.entries(maskedData)) {
        if (this.isSensitiveField(key)) {
          maskedData[key] = this.maskValue(value, key);
        } else if (typeof value === 'object') {
          maskedData[key] = this.maskSensitiveData(value);
        }
      }
      
      return maskedData;
    }

    return data;
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'token', 'secret', 'apiKey', 'accessToken', 'refreshToken',
      'privateKey', 'jwt', 'authorization', 'sessionId', 'ssn', 'creditCard',
      'cvv', 'pin', ...(this.options.sensitiveFields || [])
    ];

    return sensitiveFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  private maskValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) return value;

    if (this.options.customMasks?.[fieldName.toLowerCase()]) {
      return this.options.customMasks[fieldName.toLowerCase()](value);
    }

    const stringValue = String(value);
    const maskChar = this.options.maskChar || '*';

    if (stringValue.length <= 4) {
      return maskChar.repeat(4);
    }

    return stringValue[0] + maskChar.repeat(stringValue.length - 2) + stringValue[stringValue.length - 1];
  }
}