import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchApi, setupTestServer, teardownTestServer } from "./api/testHelpers";

beforeEach(async () => {
  await setupTestServer({ tempDirPrefix: "flaque-app-headers-" });
});

afterEach(async () => {
  await teardownTestServer();
});

describe("security headers", () => {
  it("sets helmet hardening headers on responses", async () => {
    const res = await fetchApi("/health");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // helmet default frameguard: deny embedding of API responses.
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("referrer-policy")).toBeTruthy();
    // Fingerprinting header removed by helmet.
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("relaxes Cross-Origin-Resource-Policy so the SPA can embed media cross-origin", async () => {
    const res = await fetchApi("/health");

    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  it("does not set a Content-Security-Policy (owned by the SPA/nginx)", async () => {
    const res = await fetchApi("/health");

    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});
