import { Test, TestingModule } from '@nestjs/testing';
import { MaskingService } from './masking.service';

describe('MaskingService', () => {
  let service: MaskingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaskingService,
        {
          provide: 'MASKING_OPTIONS',
          useValue: {
            sensitiveFields: ['customSecret'],
            maskChar: '#',
            preserveLength: true,
            customMasks: {
              email: (value: string) => {
                const [local, domain] = value.split('@');
                return `${local.charAt(0)}***@${domain}`;
              }
            }
          }
        }
      ],
    }).compile();

    service = module.get<MaskingService>(MaskingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should mask data with custom options', () => {
    const testData = {
      username: 'john',
      password: 'secret123',
      customSecret: 'mySecret',
      email: 'john@example.com'
    };

    const masked = service.maskData(testData);

    expect(masked.username).toBe('john');
    expect(masked.password).toBe('j#######3');
    expect(masked.customSecret).toBe('m#######t');
    expect(masked.email).toBe('j***@example.com');
  });
});