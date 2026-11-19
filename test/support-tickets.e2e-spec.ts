import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import type { Server } from 'http';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { Role } from '../src/auth/enums/role.enum';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';
import { SupportTicketsService } from '../src/modules/support-tickets/services/support-tickets.service';
import { SupportTicketsController } from '../src/modules/support-tickets/controllers/support-tickets.controller';
import { AdminSupportTicketsController } from '../src/modules/support-tickets/controllers/admin-support-tickets.controller';
import { TicketStatus } from '../src/modules/support-tickets/entities/support-ticket.entity';

const ticketId = '00000000-0000-4000-8000-000000000001';

interface TestRequest {
  user?: { id: string; sub: string; role: Role };
  headers: Record<string, string | string[] | undefined>;
}

const authStub = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest<TestRequest>();
    const roleHeader = req.headers['x-role'];
    req.user = {
      id: 'user-1',
      sub: 'user-1',
      role:
        (Array.isArray(roleHeader) ? roleHeader[0] : roleHeader) ?? Role.USER,
    };
    return true;
  },
};

describe('Support tickets (e2e)', () => {
  let app: INestApplication;
  const service = {
    create: jest
      .fn()
      .mockResolvedValue({ id: ticketId, status: TicketStatus.OPEN }),
    findAllForStaff: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    changeStatus: jest
      .fn()
      .mockResolvedValue({ id: ticketId, status: TicketStatus.RESOLVED }),
    assign: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupportTicketsController, AdminSupportTicketsController],
      providers: [
        { provide: APP_GUARD, useValue: authStub },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: SupportTicketsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lets a customer create a ticket', async () => {
    await request(app.getHttpServer<Server>())
      .post('/api/v1/support-tickets')
      .set('x-role', Role.USER)
      .send({ subject: 'Help', description: 'Details' })
      .expect(201);

    expect(service.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subject: 'Help' }),
    );
  });

  it('lets staff view the queue but refuses customers', async () => {
    await request(app.getHttpServer<Server>())
      .get('/api/v1/admin/support-tickets')
      .set('x-role', Role.USER)
      .expect(403);
    await request(app.getHttpServer<Server>())
      .get('/api/v1/admin/support-tickets')
      .set('x-role', Role.COMPLIANCE)
      .expect(200)
      .expect({ data: [], total: 0, page: 1, limit: 20 });
    await request(app.getHttpServer<Server>())
      .get('/api/v1/admin/support-tickets')
      .set('x-role', Role.ADMIN)
      .expect(200);
  });

  it('refuses a customer assignment and validates staff status changes', async () => {
    await request(app.getHttpServer<Server>())
      .patch(`/api/v1/support-tickets/${ticketId}/assign`)
      .set('x-role', Role.USER)
      .send({ assignedTo: ticketId })
      .expect(403);
    await request(app.getHttpServer<Server>())
      .patch(`/api/v1/admin/support-tickets/${ticketId}/status`)
      .set('x-role', Role.ADMIN)
      .send({ status: 'not-a-status' })
      .expect(400);
    await request(app.getHttpServer<Server>())
      .patch(`/api/v1/admin/support-tickets/${ticketId}/status`)
      .set('x-role', Role.COMPLIANCE)
      .send({ status: TicketStatus.RESOLVED })
      .expect(200);
    expect(service.changeStatus).toHaveBeenCalledWith(
      ticketId,
      TicketStatus.RESOLVED,
      'user-1',
    );
  });
});
