import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportModule } from './support.module';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { SupportMessage } from './entities/support-message.entity';

describe('Support Module (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let adminToken: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [SupportTicket, SupportMessage],
          synchronize: true,
        }),
        SupportModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Mock authentication tokens
    // In a real app, you'd get these from your auth endpoints
    authToken = 'mock-user-token';
    adminToken = 'mock-admin-token';
    userId = 'user-123';
    adminId = 'admin-123';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/support/tickets (POST)', () => {
    it('should create a new support ticket', () => {
      return request(app.getHttpServer())
        .post('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Cannot access my account',
          description: 'I have been trying to log in but keep getting errors',
          priority: 'medium',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.subject).toBe('Cannot access my account');
          expect(res.body.status).toBe('open');
        });
    });

    it('should fail validation with missing fields', () => {
      return request(app.getHttpServer())
        .post('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Test',
          // missing description
        })
        .expect(400);
    });

    it('should fail without authentication', () => {
      return request(app.getHttpServer())
        .post('/support/tickets')
        .send({
          subject: 'Test',
          description: 'Test description',
        })
        .expect(401);
    });
  });

  describe('/support/tickets (GET)', () => {
    beforeEach(async () => {
      // Create some test tickets
      await request(app.getHttpServer())
        .post('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Ticket 1',
          description: 'Description 1',
        });

      await request(app.getHttpServer())
        .post('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Ticket 2',
          description: 'Description 2',
          priority: 'high',
        });
    });

    it('should return user tickets', () => {
      return request(app.getHttpServer())
        .get('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('tickets');
          expect(res.body).toHaveProperty('total');
          expect(Array.isArray(res.body.tickets)).toBe(true);
        });
    });

    it('should filter tickets by status', () => {
      return request(app.getHttpServer())
        .get('/support/tickets?status=open')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.tickets.every((t) => t.status === 'open')).toBe(true);
        });
    });

    it('should paginate results', () => {
      return request(app.getHttpServer())
        .get('/support/tickets?limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.tickets.length).toBeLessThanOrEqual(1);
        });
    });
  });

  describe('/support/tickets/:id (GET)', () => {
    let ticketId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Test Ticket',
          description: 'Test Description',
        });

      ticketId = response.body.id;
    });

    it('should return a specific ticket', () => {
      return request(app.getHttpServer())
        .get(`/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(ticketId);
          expect(res.body.subject).toBe('Test Ticket');
        });
    });

    it('should return 404 for non-existent ticket', () => {
      return request(app.getHttpServer())
        .get('/support/tickets/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('/support/tickets/:id/messages (POST)', () => {
    let ticketId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/support/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Test Ticket',
          description: 'Test Description',
        });

      ticketId = response.body.id;
    });

    it('should add a message to a ticket', () => {
      return request(app.getHttpServer())
        .post(`/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'I tried resetting my password',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.content).toBe('I tried resetting my password');
          expect(res.body.ticketId).toBe(ticketId);
        });
    });

    it('should not allow empty message content', () => {
      return request(app.getHttpServer())
        .post(`/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: '',
        })
        .expect(400);
    });
  });

  describe('Admin Endpoints', () => {
    describe('/admin/support/tickets (GET)', () => {
      it('should return all tickets for admin', () => {
        return request(app.getHttpServer())
          .get('/admin/support/tickets')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('tickets');
            expect(res.body).toHaveProperty('total');
          });
      });

      it('should fail without admin privileges', () => {
        return request(app.getHttpServer())
          .get('/admin/support/tickets')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(403);
      });
    });

    describe('/admin/support/tickets/:id (PATCH)', () => {
      let ticketId: string;

      beforeEach(async () => {
        const response = await request(app.getHttpServer())
          .post('/support/tickets')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            subject: 'Test Ticket',
            description: 'Test Description',
          });

        ticketId = response.body.id;
      });

      it('should update ticket status', () => {
        return request(app.getHttpServer())
          .patch(`/admin/support/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            status: 'resolved',
          })
          .expect(200)
          .expect((res) => {
            expect(res.body.status).toBe('resolved');
          });
      });

      it('should assign ticket to support agent', () => {
        return request(app.getHttpServer())
          .patch(`/admin/support/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            assignedToId: adminId,
          })
          .expect(200)
          .expect((res) => {
            expect(res.body.assignedToId).toBe(adminId);
          });
      });
    });

    describe('/admin/support/tickets/:id/messages (POST)', () => {
      let ticketId: string;

      beforeEach(async () => {
        const response = await request(app.getHttpServer())
          .post('/support/tickets')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            subject: 'Test Ticket',
            description: 'Test Description',
          });

        ticketId = response.body.id;
      });

      it('should allow admin to add internal messages', () => {
        return request(app.getHttpServer())
          .post(`/admin/support/tickets/${ticketId}/messages`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            content: 'Internal note for support team',
            isInternal: true,
          })
          .expect(201)
          .expect((res) => {
            expect(res.body.isInternal).toBe(true);
          });
      });
    });

    describe('/admin/support/tickets/:id (DELETE)', () => {
      let ticketId: string;

      beforeEach(async () => {
        const response = await request(app.getHttpServer())
          .post('/support/tickets')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            subject: 'Test Ticket',
            description: 'Test Description',
          });

        ticketId = response.body.id;
      });

      it('should delete a ticket', () => {
        return request(app.getHttpServer())
          .delete(`/admin/support/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.message).toBe('Ticket deleted successfully');
          });
      });

      it('should fail for non-admin users', () => {
        return request(app.getHttpServer())
          .delete(`/admin/support/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(403);
      });
    });
  });
});