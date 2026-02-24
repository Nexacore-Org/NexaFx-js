import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { VersioningInterceptor } from '../../src/versioning/interceptors/versioning.interceptor';
import {
  API_VERSION_HEADER,
  API_DEPRECATED_HEADER,
  API_DEPRECATION_DATE_HEADER,
  API_SUNSET_DATE_HEADER,
  LINK_HEADER,
  DEPRECATION_METADATA_KEY,
  DEPRECATION_INFO_METADATA_KEY,
  CURRENT_API_VERSION,
} from '../../src/versioning/constants/api-version.constants';

function createMockExecutionContext(overrides: {
  path?: string;
  isDeprecated?: boolean;
  deprecationInfo?: object;
}): ExecutionContext {
  const mockResponse = {
    setHeader: jest.fn(),
  };

  const mockRequest = {
    path: overrides.path ?? `/v${CURRENT_API_VERSION}/users`,
    ip: '127.0.0.1',
  };

  const mockContext = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  return mockContext;
}

describe('VersioningInterceptor', () => {
  let interceptor: VersioningInterceptor;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersioningInterceptor,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<VersioningInterceptor>(VersioningInterceptor);
    reflector = module.get<Reflector>(Reflector);
  });

  const callHandler: CallHandler = {
    handle: () => of({ success: true }),
  };

  describe('X-API-Version header', () => {
    it('should set X-API-Version header for v2 route', (done) => {
      const ctx = createMockExecutionContext({ path: '/v2/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(API_VERSION_HEADER, '2');
        done();
      });
    });

    it('should set X-API-Version header for v1 route', (done) => {
      const ctx = createMockExecutionContext({ path: '/v1/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(API_VERSION_HEADER, '1');
        done();
      });
    });

    it('should set default version when no version in path', (done) => {
      const ctx = createMockExecutionContext({ path: '/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(
          API_VERSION_HEADER,
          CURRENT_API_VERSION,
        );
        done();
      });
    });
  });

  describe('Deprecation headers for v1 routes', () => {
    it('should set X-API-Deprecated header for v1 routes via schedule', (done) => {
      const ctx = createMockExecutionContext({ path: '/v1/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(
          API_DEPRECATED_HEADER,
          'true',
        );
        done();
      });
    });

    it('should set X-API-Deprecation-Date header for v1 routes', (done) => {
      const ctx = createMockExecutionContext({ path: '/v1/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(
          API_DEPRECATION_DATE_HEADER,
          '2025-01-01',
        );
        done();
      });
    });

    it('should set Sunset header for v1 routes', (done) => {
      const ctx = createMockExecutionContext({ path: '/v1/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(
          API_SUNSET_DATE_HEADER,
          '2026-01-01',
        );
        done();
      });
    });

    it('should set Link header with successor version for v1 routes', (done) => {
      const ctx = createMockExecutionContext({ path: '/v1/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(
          LINK_HEADER,
          expect.stringContaining('/v2/'),
        );
        done();
      });
    });
  });

  describe('No deprecation headers for v2 routes', () => {
    it('should NOT set X-API-Deprecated for v2 routes', (done) => {
      const ctx = createMockExecutionContext({ path: '/v2/users' });
      const response = ctx.switchToHttp().getResponse() as any;
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).not.toHaveBeenCalledWith(
          API_DEPRECATED_HEADER,
          expect.anything(),
        );
        done();
      });
    });
  });

  describe('@Deprecated decorator metadata', () => {
    it('should set deprecation headers when handler has @Deprecated decorator', (done) => {
      const ctx = createMockExecutionContext({ path: '/v2/users' });
      const response = ctx.switchToHttp().getResponse() as any;

      (reflector.getAllAndOverride as jest.Mock).mockImplementation((key) => {
        if (key === DEPRECATION_METADATA_KEY) return true;
        if (key === DEPRECATION_INFO_METADATA_KEY)
          return {
            version: '2',
            deprecatedAt: '2025-06-01',
            sunsetDate: '2026-06-01',
            replacementEndpoint: '/v3/users',
            message: 'Migrate to v3',
          };
        return undefined;
      });

      interceptor.intercept(ctx, callHandler).subscribe(() => {
        expect(response.setHeader).toHaveBeenCalledWith(
          API_DEPRECATED_HEADER,
          'true',
        );
        expect(response.setHeader).toHaveBeenCalledWith(
          API_DEPRECATION_DATE_HEADER,
          '2025-06-01',
        );
        done();
      });
    });
  });
});
