import * as request from 'supertest';

describe('Analytics Endpoints (e2e)', () => {
  let app;
  let userToken;
  let adminToken;

  beforeAll(async () => {
    // bootstrap app + generate tokens
  });

  it('GET /insights/spending (user)', async () => {
    return request(app.getHttpServer())
      .get('/insights/spending')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('GET /insights/categories (user)', async () => {
    return request(app.getHttpServer())
      .get('/insights/categories')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('GET /insights/trends (user)', async () => {
    return request(app.getHttpServer())
      .get('/insights/trends')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('POST /admin/analytics/aggregate (admin)', async () => {
    return request(app.getHttpServer())
      .post('/admin/analytics/aggregate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('GET /admin/analytics/lineage (admin)', async () => {
    return request(app.getHttpServer())
      .get('/admin/analytics/lineage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('POST /admin/analytics/aggregate (non-admin) → 403', async () => {
    return request(app.getHttpServer())
      .post('/admin/analytics/aggregate')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });
});