import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MaskingInterceptor } from './masking.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('MaskingInterceptor', () => {
  let interceptor: MaskingInterceptor;
  let configService: ConfigService;

  const mockExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        url: '/api/users',
        body: { username: 'john', password: 'secret123' }
      }),
      getResponse: () => ({})
    })
  } as ExecutionContext;

  const mockCallHandler: CallHandler = {
    handle: () => of({
      id: 1,
      username: 'john',
      password: 'secret123',
      apiKey: 'api_key_12345',
      profile: {
        email: 'john@example.com',
        token: 'jwt_token_xyz'
      }
    })
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaskingInterceptor,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        }
      ],
    }).compile();

    interceptor = module.get<MaskingInterceptor>(MaskingInterceptor);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should mask sensitive fields in response', (done) => {
    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe(result => {
      expect(result.password).toBe('*********');
      expect(result.apiKey).toBe('a***********5');
      expect(result.profile.token).toBe('j***********z');
      expect(result.username).toBe('john'); // Should not be masked
      expect(result.id).toBe(1); // Should not be masked
      done();
    });
  });

  it('should handle arrays correctly', (done) => {
    const arrayHandler: CallHandler = {
      handle: () => of([
        { id: 1, password: 'secret1' },
        { id: 2, password: 'secret2' }
      ])
    };

    interceptor.intercept(mockExecutionContext, arrayHandler).subscribe(result => {
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].password).toBe('*******');
      expect(result[1].password).toBe('*******');
      done();
    });
  });

  it('should handle null and undefined values', (done) => {
    const nullHandler: CallHandler = {
      handle: () => of({
        id: 1,
        password: null,
        token: undefined,
        apiKey: ''
      })
    };

    interceptor.intercept(mockExecutionContext, nullHandler).subscribe(result => {
      expect(result.password).toBeNull();
      expect(result.token).toBeUndefined();
      expect(result.apiKey).toBe('');
      done();
    });
  });
});