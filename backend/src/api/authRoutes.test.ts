import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { apiRequest, loginWithOptions, setupTestServer, teardownTestServer } from "./testHelpers";

beforeEach(async () => {
  await setupTestServer({ tempDirPrefix: "flaque-auth-api-" });
});

afterEach(async () => {
  await teardownTestServer();
  delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
  delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
  delete process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX;
  delete process.env.AUTH_RESET_PASSWORD_RATE_LIMIT_MAX;
  delete process.env.AUTH_FORGOT_PASSWORD_MIN_RESPONSE_MS;
  delete process.env.AUTH_AUDIT_LOGS;
});

describe("authRoutes", () => {
  it("requires auth for session management endpoints", async () => {
    const sessionsResponse = await apiRequest("/api/auth/sessions", {
      method: "GET"
    });
    expect(sessionsResponse.status).toBe(401);

    const revokeResponse = await apiRequest("/api/auth/sessions/non-existent", {
      method: "DELETE"
    });
    expect(revokeResponse.status).toBe(401);

    const logoutOthersResponse = await apiRequest("/api/auth/logout-others", {
      method: "POST"
    });
    expect(logoutOthersResponse.status).toBe(401);
  });

  it("allows login with either username or email", async () => {
    const byUsername = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin",
        password: "admin-secret-123"
      })
    });
    expect(byUsername.status).toBe(200);

    const byEmail = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin@test.local",
        password: "admin-secret-123"
      })
    });
    expect(byEmail.status).toBe(200);
  });

  it("rate limits repeated failed login attempts", async () => {
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "2";

    const firstFailed = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin",
        password: "wrong-password"
      })
    });
    expect(firstFailed.status).toBe(401);

    const secondFailed = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin",
        password: "wrong-password"
      })
    });
    expect(secondFailed.status).toBe(401);

    const blocked = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin",
        password: "wrong-password"
      })
    });
    expect(blocked.status).toBe(429);
    expect(blocked.payload).toEqual({ error: "Too many requests. Try again later." });
    expect(blocked.retryAfter).toBeTruthy();
  });

  it("rate limits repeated forgot-password requests", async () => {
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX = "1";

    const first = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        login: "admin@test.local"
      })
    });
    expect(first.status).toBe(200);

    const blocked = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        login: "admin@test.local"
      })
    });
    expect(blocked.status).toBe(429);
    expect(blocked.payload).toEqual({ error: "Too many requests. Try again later." });
    expect(blocked.retryAfter).toBeTruthy();
  });

  it("supports forgot password and token reset flow", async () => {
    const currentCookie = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent"
    });

    const forgotUnknown = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        login: "nobody@example.com"
      })
    });
    expect(forgotUnknown.status).toBe(200);
    expect(forgotUnknown.payload).toEqual({ ok: true });

    const forgotKnown = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        login: "admin@test.local"
      })
    });
    expect(forgotKnown.status).toBe(200);
    expect(forgotKnown.payload).toEqual({ ok: true });

    const { findUserByUsername, createPasswordResetToken } = await import("../auth/db");
    const admin = findUserByUsername("admin");
    expect(admin).not.toBeNull();
    if (!admin) {
      return;
    }

    const resetToken = createPasswordResetToken({
      userId: admin.id,
      ttlMs: 10 * 60 * 1000
    });

    const resetResponse = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: resetToken.token,
        newPassword: "admin-reset-password-456"
      })
    });
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.payload).toEqual({ ok: true });

    const staleSession = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(staleSession.status).toBe(401);

    const oldPasswordLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin@test.local",
        password: "admin-secret-123"
      })
    });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: "admin@test.local",
        password: "admin-reset-password-456"
      })
    });
    expect(newPasswordLogin.status).toBe(200);

    const reuseTokenResponse = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: resetToken.token,
        newPassword: "admin-reset-password-789"
      })
    });
    expect(reuseTokenResponse.status).toBe(400);
  });

  it("lists active sessions and revokes a targeted session", async () => {
    const currentCookie = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent A",
      deviceLabel: "Laptop"
    });
    const otherCookie = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent B",
      deviceLabel: "Phone"
    });

    const listResponse = await apiRequest("/api/auth/sessions", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });

    expect(listResponse.status).toBe(200);
    const sessions = (listResponse.payload as { sessions: Array<{ id: string; label: string | null; current: boolean }> }).sessions;
    expect(sessions).toHaveLength(2);

    const currentSession = sessions.find((session) => session.current);
    expect(currentSession).toBeTruthy();
    expect(currentSession?.label).toBe("Laptop");

    const otherSession = sessions.find((session) => !session.current);
    expect(otherSession).toBeTruthy();
    expect(otherSession?.label).toBe("Phone");

    const revokeResponse = await apiRequest(`/api/auth/sessions/${otherSession?.id ?? ""}`, {
      method: "DELETE",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(revokeResponse.status).toBe(204);

    const meWithOtherCookie = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: otherCookie
      }
    });
    expect(meWithOtherCookie.status).toBe(401);
  });

  it("logs out other sessions while keeping current session active", async () => {
    const currentCookie = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent A",
      deviceLabel: "Desktop"
    });
    const otherCookieOne = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent B",
      deviceLabel: "Tablet"
    });
    const otherCookieTwo = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent C",
      deviceLabel: "Phone"
    });

    const logoutOthersResponse = await apiRequest("/api/auth/logout-others", {
      method: "POST",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(logoutOthersResponse.status).toBe(200);
    expect(logoutOthersResponse.payload).toEqual({ revoked: 2 });

    const meWithCurrentCookie = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(meWithCurrentCookie.status).toBe(200);

    const meWithOtherCookieOne = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: otherCookieOne
      }
    });
    expect(meWithOtherCookieOne.status).toBe(401);

    const meWithOtherCookieTwo = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: otherCookieTwo
      }
    });
    expect(meWithOtherCookieTwo.status).toBe(401);
  });

  it("allows revoking current session and clears cookie", async () => {
    const currentCookie = await loginWithOptions({
      login: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent Current",
      deviceLabel: "Current Session"
    });

    const sessionsResponse = await apiRequest("/api/auth/sessions", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(sessionsResponse.status).toBe(200);

    const sessions = (sessionsResponse.payload as { sessions: Array<{ id: string; current: boolean }> }).sessions;
    const currentSession = sessions.find((session) => session.current);
    expect(currentSession).toBeTruthy();

    const revokeResponse = await apiRequest(`/api/auth/sessions/${currentSession?.id ?? ""}`, {
      method: "DELETE",
      headers: {
        Cookie: currentCookie
      }
    });

    expect(revokeResponse.status).toBe(204);
    expect(revokeResponse.cookie).toContain("flaque_session=");

    const meResponse = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(meResponse.status).toBe(401);
  });
});
