import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditService } from '../admin-audit.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('AdminAuditInterceptor', () => {
  let interceptor: AdminAuditInterceptor;
  let service: AdminAuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditInterceptor,
        {
          provide: AdminAuditService,
          useValue: {
            logAction: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<AdminAuditInterceptor>(AdminAuditInterceptor);
    service = module.get<AdminAuditService>(AdminAuditService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log admin actions', (done) => {
    const request = {
      method: 'POST',
      url: '/admin/users',
      headers: { 'x-admin': 'true' },
      user: { id: 'admin-1' },
      body: { name: 'New User' },
      ip: '127.0.0.1',
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;

    const callHandler = {
      handle: () => of({ id: '123' }),
    } as CallHandler;

    interceptor.intercept(context, callHandler).subscribe({
      next: () => {
        expect(service.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'admin-1',
            action: 'CREATE', // POST -> CREATE
            entity: 'users',
            entityId: '123',
            ip: '127.0.0.1',
          }),
        );
        done();
      },
    });
  });

  it('should ignore non-admin requests', (done) => {
    const request = {
      method: 'POST',
      url: '/users',
      headers: {},
      user: { id: 'user-1' }, // Not admin
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;

    const callHandler = {
      handle: () => of({ id: '123' }),
    } as CallHandler;

    interceptor.intercept(context, callHandler).subscribe({
      next: () => {
        expect(service.logAction).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
