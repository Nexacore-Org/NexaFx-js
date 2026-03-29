import request from "supertest";
import { app } from "../src/app";

describe("Insights & FX Alerts API", () => {
  it("GET /insights/spending returns insights + suggestions", async () => {
    const res = await request(app).get("/insights/spending").set("Authorization", "Bearer userToken");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("insights");
    expect(res.body).toHaveProperty("suggestions");
  });

  it("POST /fx/alerts creates alert", async () => {
    const res = await request(app)
      .post("/fx/alerts")
      .send({ currencyPair: "USD/NGN", threshold: 1500, direction: "above", expiresAt: new Date(Date.now() + 3600_000) })
      .set("Authorization", "Bearer userToken");
    expect(res.status).toBe(201);
  });

  it("GET /fx/alerts lists active alerts", async () => {
    const res = await request(app).get("/fx/alerts").set("Authorization", "Bearer userToken");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
