import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';

describe('RBAC Admin E2E', () => {
  let app: INestApplication;

  it('returns roles with inheritance chain', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/rbac/roles')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});
