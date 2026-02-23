import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

describe("Security - Unauthorized Access (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Feature Flags", () => {
    it("GET /feature-flags should return 401 without token", () => {
      return request(app.getHttpServer()).get("/feature-flags").expect(401);
    });

    it("POST /feature-flags should return 401 without token", () => {
      return request(app.getHttpServer())
        .post("/feature-flags")
        .send({ name: "test-flag", enabled: true })
        .expect(401);
    });

    it("PUT /feature-flags/:id should return 401 without token", () => {
      return request(app.getHttpServer())
        .put("/feature-flags/1")
        .send({ enabled: false })
        .expect(401);
    });

    it("DELETE /feature-flags/:id should return 401 without token", () => {
      return request(app.getHttpServer())
        .delete("/feature-flags/1")
        .expect(401);
    });
  });

  describe("Retry Jobs", () => {
    it("GET /retry-jobs should return 401 without token", () => {
      return request(app.getHttpServer()).get("/retry-jobs").expect(401);
    });

    it("POST /retry-jobs/:id/retry should return 401 without token", () => {
      return request(app.getHttpServer())
        .post("/retry-jobs/1/retry")
        .expect(401);
    });
  });

  describe("API Usage Logs", () => {
    it("GET /api-usage/logs should return 401 without token", () => {
      return request(app.getHttpServer()).get("/api-usage/logs").expect(401);
    });

    it("GET /api-usage/stats should return 401 without token", () => {
      return request(app.getHttpServer()).get("/api-usage/stats").expect(401);
    });
  });

  describe("Webhook Configuration", () => {
    it("GET /webhooks/config should return 401 without token", () => {
      return request(app.getHttpServer()).get("/webhooks/config").expect(401);
    });

    it("POST /webhooks/config should return 401 without token", () => {
      return request(app.getHttpServer())
        .post("/webhooks/config")
        .send({ url: "https://example.com/webhook" })
        .expect(401);
    });

    it("PUT /webhooks/config/:id should return 401 without token", () => {
      return request(app.getHttpServer())
        .put("/webhooks/config/1")
        .send({ url: "https://example.com/webhook-updated" })
        .expect(401);
    });

    it("DELETE /webhooks/config/:id should return 401 without token", () => {
      return request(app.getHttpServer())
        .delete("/webhooks/config/1")
        .expect(401);
    });

    it("POST /webhooks/events/:id should be public (200 or 201)", () => {
      return request(app.getHttpServer())
        .post("/webhooks/events/test-webhook")
        .send({ event: "test" })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });
    });
  });
});
