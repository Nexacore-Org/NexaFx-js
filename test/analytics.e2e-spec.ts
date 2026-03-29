import request from "supertest";
import { app } from "../src/app";

describe("Transaction Analytics API", () => {
  it("GET /analytics/transactions returns summary + comparison + categories + series", async () => {
    const res = await request(app).get("/analytics/transactions?period=DAILY").set("Authorization", "Bearer userToken");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("comparison");
    expect(res.body).toHaveProperty("categories");
    expect(res.body).toHaveProperty("series");
  });

  it("GET /admin/analytics/transactions returns admin aggregates", async () => {
    const res = await request(app).get("/admin/analytics/transactions?period=WEEKLY").set("Authorization", "Bearer adminToken");
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });
});
