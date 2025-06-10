import { Test, type TestingModule } from "@nestjs/testing"
import type { INestApplication } from "@nestjs/common"
import * as request from "supertest"
import * as session from "express-session"
import { CsrfModule } from "../csrf.module"
import { ConfigModule } from "@nestjs/config"
import { describe, beforeAll, afterAll, it, expect } from "@jest/globals"

describe("CSRF (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: "test",
            }),
          ],
        }),
        CsrfModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()

    // Configure session middleware for testing
    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
      }),
    )

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe("/security/csrf/token (GET)", () => {
    it("should return CSRF token", () => {
      return request(app.getHttpServer())
        .get("/security/csrf/token")
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true)
          expect(res.body.data).toHaveProperty("token")
          expect(res.body.data).toHaveProperty("headerName")
          expect(res.body.data).toHaveProperty("cookieName")
          expect(typeof res.body.data.token).toBe("string")
        })
    })
  })

  describe("/security/csrf/status (GET)", () => {
    it("should return CSRF status", () => {
      return request(app.getHttpServer())
        .get("/security/csrf/status")
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true)
          expect(res.body.data).toHaveProperty("protected")
          expect(res.body.data).toHaveProperty("methods")
          expect(res.body.data.protected).toBe(true)
        })
    })
  })

  describe("CSRF Protection", () => {
    let csrfToken: string
    let cookies: string[]

    it("should get CSRF token and set session", async () => {
      const response = await request(app.getHttpServer()).get("/security/csrf/token").expect(200)

      csrfToken = response.body.data.token
      cookies = response.headers["set-cookie"]

      expect(csrfToken).toBeDefined()
      expect(cookies).toBeDefined()
    })

    it("should allow POST request with valid CSRF token", async () => {
      return request(app.getHttpServer())
        .post("/security/csrf/test")
        .set("Cookie", cookies)
        .set("X-CSRF-Token", csrfToken)
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true)
          expect(res.body.message).toContain("CSRF protection is working")
        })
    })

    it("should reject POST request without CSRF token", async () => {
      return request(app.getHttpServer()).post("/security/csrf/test").set("Cookie", cookies).expect(403)
    })

    it("should reject POST request with invalid CSRF token", async () => {
      return request(app.getHttpServer())
        .post("/security/csrf/test")
        .set("Cookie", cookies)
        .set("X-CSRF-Token", "invalid-token")
        .expect(403)
    })

    it("should allow GET request without CSRF token", async () => {
      return request(app.getHttpServer()).get("/security/csrf/status").expect(200)
    })
  })

  describe("CSRF Token in Different Locations", () => {
    let csrfToken: string
    let cookies: string[]

    beforeAll(async () => {
      const response = await request(app.getHttpServer()).get("/security/csrf/token")
      csrfToken = response.body.data.token
      cookies = response.headers["set-cookie"]
    })

    it("should accept token in X-XSRF-Token header", async () => {
      return request(app.getHttpServer())
        .post("/security/csrf/test")
        .set("Cookie", cookies)
        .set("X-XSRF-Token", csrfToken)
        .expect(201)
    })

    it("should accept token in request body", async () => {
      return request(app.getHttpServer())
        .post("/security/csrf/test")
        .set("Cookie", cookies)
        .send({ _csrf: csrfToken })
        .expect(201)
    })

    it("should accept token in query parameter", async () => {
      return request(app.getHttpServer())
        .post(`/security/csrf/test?_csrf=${csrfToken}`)
        .set("Cookie", cookies)
        .expect(201)
    })
  })
})
