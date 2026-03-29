import request from "supertest";
import { app } from "../src/app";

describe("Admin Metrics API", () => {
  it("GET /admin/metrics returns metrics", async () => {
    const res = await request(app).get("/admin/metrics").set("Authorization", "Bearer adminToken");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("queues");
    expect(res.body).toHaveProperty("wsConnections");
    expect(res.body).toHaveProperty("dbStats");
    expect(res.body).toHaveProperty("redis");
    expect(res.body).toHaveProperty("apiStats");
  });
});
