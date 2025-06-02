import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

export interface MaskingOptions {
  sensitiveFields?: string[];
  maskChar?: string;
  preserveLength?: boolean;
  customMasks?: Record<string, (value: any) => string>;
}

@Injectable()
export class MaskingInterceptor implements NestInterceptor {
  private readonly defaultSensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'accessToken',
    'refreshToken',
    'privateKey',
    'jwt',
    'authorization',
    'sessionId',
    'ssn',
    'creditCard',
    'cvv',
    'pin'
  ];

  private readonly maskChar = '*';
  private readonly preserveLength = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly options: MaskingOptions = {}
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.maskSensitiveData(data))
    );
  }

  private maskSensitiveData(data: any): any {
    if (!data) return data;

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }

    // Handle objects
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
      ...this.defaultSensitiveFields,
      ...(this.options.sensitiveFields || [])
    ];

    return sensitiveFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  private maskValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) return value;

    // Check for custom mask function
    if (this.options.customMasks?.[fieldName]) {
      return this.options.customMasks[fieldName](value);
    }

    const stringValue = String(value);
    const maskChar = this.options.maskChar || this.maskChar;
    const preserveLength = this.options.preserveLength ?? this.preserveLength;

    if (preserveLength) {
      return maskChar.repeat(stringValue.length);
    }

    // Default masking strategy
    if (stringValue.length <= 4) {
      return maskChar.repeat(4);
    }

    // Show first and last character for longer values
    return stringValue[0] + maskChar.repeat(stringValue.length - 2) + stringValue[stringValue.length - 1];
  }
}
