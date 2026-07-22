import type { Request } from "express";

import { describe, expect, it } from "vitest";

import { resolveTrustProxySetting } from "../app";
import { getClientIp } from "./requestHelpers";

function fakeRequest(ip: string | undefined, remoteAddress?: string): Request {
  return {
    ip,
    socket: { remoteAddress }
  } as unknown as Request;
}

describe("getClientIp", () => {
  it("uses the Express-derived req.ip", () => {
    expect(getClientIp(fakeRequest("203.0.113.9", "10.0.0.1"))).toBe("203.0.113.9");
  });

  it("falls back to the raw socket address when req.ip is unset", () => {
    expect(getClientIp(fakeRequest(undefined, "10.0.0.1"))).toBe("10.0.0.1");
  });

  it("returns undefined when no address is available", () => {
    expect(getClientIp(fakeRequest(undefined, undefined))).toBeUndefined();
  });

  it("does not read X-Forwarded-For directly (spoofing must not forge the IP)", () => {
    const req = {
      ip: "10.0.0.1",
      socket: { remoteAddress: "10.0.0.1" },
      headers: { "x-forwarded-for": "1.2.3.4" }
    } as unknown as Request;
    // With trust proxy disabled Express would set req.ip to the socket peer;
    // getClientIp must ignore the attacker-controlled header entirely.
    expect(getClientIp(req)).toBe("10.0.0.1");
  });
});

describe("resolveTrustProxySetting", () => {
  it("defaults to false (trust nothing) when unset or empty", () => {
    expect(resolveTrustProxySetting(undefined)).toBe(false);
    expect(resolveTrustProxySetting("")).toBe(false);
    expect(resolveTrustProxySetting("   ")).toBe(false);
  });

  it("parses boolean-like keywords case-insensitively", () => {
    for (const truthy of ["true", "on", "yes", "TRUE", "Yes"]) {
      expect(resolveTrustProxySetting(truthy)).toBe(true);
    }
    for (const falsy of ["false", "0", "no", "off", "OFF"]) {
      expect(resolveTrustProxySetting(falsy)).toBe(false);
    }
  });

  it("parses a bare integer as a hop count", () => {
    expect(resolveTrustProxySetting("1")).toBe(1);
    expect(resolveTrustProxySetting("3")).toBe(3);
  });

  it("passes subnet/keyword lists through to proxy-addr", () => {
    expect(resolveTrustProxySetting("loopback")).toBe("loopback");
    expect(resolveTrustProxySetting("10.0.0.0/8, 127.0.0.1")).toBe("10.0.0.0/8, 127.0.0.1");
  });
});
