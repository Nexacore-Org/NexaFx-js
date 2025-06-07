import { Test, type TestingModule } from "@nestjs/testing"
import type { INestApplication } from "@nestjs/common"
import * as request from "supertest"
import { PasswordResetModule } from "../password-reset.module"
import { ConfigModule } from "@nestjs/config"
import { describe, beforeAll, afterAll, it, expect } from "@jest/globals"

describe("PasswordReset (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: "test-secret",
              PASSWORD_RESET_TOKEN_EXPIRY: "1h",
              APP_NAME: "TestApp",
              FRONTEND_URL: "http://localhost:3000",
              BCRYPT_SALT_ROUNDS: 10,
            }),
          ],
        }),
        PasswordResetModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe("/auth/password-reset/initiate (POST)", () => {
    it("should initiate password reset for valid email", () => {
      return request(app.getHttpServer())
        .post("/auth/password-reset/initiate")
        .send({ email: "test@example.com" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true)
          expect(res.body.message).toContain("password reset link has been sent")
          expect(res.body.resetId).toBeDefined()
        })
    })

    it("should return success for non-existent email", () => {
      return request(app.getHttpServer())
        .post("/auth/password-reset/initiate")
        .send({ email: "nonexistent@example.com" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true)
          expect(res.body.message).toContain("password reset link has been sent")
        })
    })

    it("should return 400 for invalid email format", () => {
      return request(app.getHttpServer())
        .post("/auth/password-reset/initiate")
        .send({ email: "invalid-email" })
        .expect(400)
    })

    it("should return 400 for missing email", () => {
      return request(app.getHttpServer()).post("/auth/password-reset/initiate").send({}).expect(400)
    })
  })

  describe("/auth/password-reset/validate (GET)", () => {
    it("should return invalid for missing token", () => {
      return request(app.getHttpServer()).get("/auth/password-reset/validate").expect(400)
    })

    it("should return invalid for invalid token", () => {
      return request(app.getHttpServer())
        .get("/auth/password-reset/validate")
        .query({ token: "invalid-token" })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(false)
          expect(res.body.valid).toBe(false)
        })
    })
  })

  describe("/auth/password-reset/confirm (POST)", () => {
    it("should return 400 for missing fields", () => {
      return request(app.getHttpServer()).post("/auth/password-reset/confirm").send({}).expect(400)
    })

    it("should return 400 for mismatched passwords", () => {
      return request(app.getHttpServer())
        .post("/auth/password-reset/confirm")
        .send({
          token: "some-token",
          newPassword: "Password123!",
          confirmPassword: "DifferentPassword123!",
        })
        .expect(400)
    })

    it("should return 400 for weak password", () => {
      return request(app.getHttpServer())
        .post("/auth/password-reset/confirm")
        .send({
          token: "some-token",
          newPassword: "weak",
          confirmPassword: "weak",
        })
        .expect(400)
    })
  })

  describe("/auth/password-reset/requirements (GET)", () => {
    it("should return password requirements", () => {
      return request(app.getHttpServer())
        .get("/auth/password-reset/requirements")
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true)
          expect(res.body.data).toHaveProperty("minLength")
          expect(res.body.data).toHaveProperty("requireUppercase")
          expect(res.body.data).toHaveProperty("requireLowercase")
          expect(res.body.data).toHaveProperty("requireNumbers")
          expect(res.body.data).toHaveProperty("requireSpecialChars")
          expect(res.body.data).toHaveProperty("forbiddenPasswords")
        })
    })
  })

  describe("Rate Limiting", () => {
    it("should handle multiple reset requests", async () => {
      const email = "ratelimit@example.com"

      // Make multiple requests
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).post("/auth/password-reset/initiate").send({ email }).expect(200)
      }

      // Should still work within limits
      await request(app.getHttpServer()).post("/auth/password-reset/initiate").send({ email }).expect(200)
    })
  })
})
