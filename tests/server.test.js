// tests/server.test.js

const request = require("supertest");
const app = require("../src/app");

describe("Nyx API", () => {
  // Verify that the API is alive
  test("GET /health should return 200", async () => {
    const response = await request(app).get("/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  // Verify that invalid routes are handled correctly
  test("Unknown route should return 404", async () => {
    const response = await request(app).get("/does-not-exist");

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain("not found");
  });
});
