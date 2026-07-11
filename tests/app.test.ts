import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { JsonlDecisionRepository } from "../src/storage/decision-repository.js";

function testConfig(): AppConfig {
  return {
    port: 3000,
    host: "127.0.0.1",
    publicBaseUrl: "http://test.local",
    dataFile: ":memory:",
    pageTokenSecret: "test-page-token-secret-long-enough",
    hashSecret: "test-hash-secret-long-enough-for-use",
    cookieSecret: "test-cookie-secret-long-enough-for-use",
    offerUrl: "https://dest.test/offer",
    whitepageUrl: "https://dest.test/whitepage",
    blockUrl: "https://dest.test/blocked",
    pageTokenTtlMs: 600_000,
    trustProxy: false,
    trustEnrichmentHeaders: false,
    cookieSecure: false,
    logLevel: "silent",
    maxBodyBytes: 65_536,
    visitCookieName: "prelander_visit"
  };
}

function extractToken(html: string): string {
  const match = html.match(/name="pageToken" value="([^"]+)"/u);
  if (!match?.[1]) throw new Error("page token not found");
  return match[1];
}

function extractCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) throw new Error("set-cookie header not found");
  return header.split(";", 1)[0] ?? "";
}

function convincingTelemetry() {
  return {
    pageVisibleMs: 1_750,
    firstInteractionMs: 500,
    stateChangedMs: 1_100,
    submittedMs: 1_800,
    pointerMoves: 5,
    pointerDowns: 2,
    touchStarts: 0,
    keyDowns: 0,
    stateChanges: 1,
    focusCount: 1,
    blurCount: 0,
    visibilityChanges: 0,
    webdriver: false,
    timezone: "America/Los_Angeles",
    languages: ["en-US", "en"],
    screen: { width: 1440, height: 900, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    fingerprintId: "0123456789abcdef0123456789abcdef"
  };
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("HTTP application", () => {
  it("exposes a JSON health contract", async () => {
    const built = await buildApp({
      config: testConfig(),
      repository: new JsonlDecisionRepository(":memory:"),
      logger: false
    });
    apps.push(built.app);

    const response = await built.app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns only the offer URL and writes a full audit record", async () => {
    let nowMs = 1_700_000_000_000;
    const repository = new JsonlDecisionRepository(":memory:");
    const built = await buildApp({
      config: testConfig(),
      repository,
      clock: () => nowMs,
      logger: false
    });
    apps.push(built.app);

    const landing = await built.app.inject({ method: "GET", url: "/" });
    expect(landing.headers["cache-control"]).toBe("private, no-store");
    expect(landing.headers["content-security-policy"]).toContain("form-action 'self'");
    expect(landing.headers["x-frame-options"]).toBe("DENY");
    const pageToken = extractToken(landing.body);
    const cookie = extractCookie(landing.headers["set-cookie"]);
    nowMs += 1_800;

    const response = await built.app.inject({
      method: "POST",
      url: "/api/decision",
      headers: {
        cookie,
        "content-type": "application/json",
        accept: "text/plain,application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
      },
      payload: {
        state: "CA",
        pageToken,
        telemetry: convincingTelemetry()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(built.config.offerUrl);
    expect(response.headers["content-type"]).toContain("text/plain");
    for (const internalKey of ["score", "reason", "decision", "signals"]) {
      expect(response.body).not.toContain(internalKey);
    }

    const records = await repository.getAll();
    expect(records).toHaveLength(1);
    expect(records[0]?.decision).toBe("OFFER");
    expect(records[0]?.incoming.normalized.form.state).toBe("CA");
    expect(records[0]?.score.reasonCodes).toContain("VALID_PAGE_TOKEN");
    expect(records[0]?.incoming.rawBody).toMatchObject({
      state: "CA",
      pageToken: "[REDACTED]"
    });
    expect(JSON.stringify(records[0]?.incoming.rawBody)).not.toContain(pageToken);
  });

  it("does not return OFFER for a direct POST without a page token", async () => {
    const repository = new JsonlDecisionRepository(":memory:");
    const built = await buildApp({
      config: testConfig(),
      repository,
      logger: false
    });
    apps.push(built.app);

    const response = await built.app.inject({
      method: "POST",
      url: "/api/decision",
      headers: {
        "content-type": "application/json",
        accept: "text/plain,application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36"
      },
      payload: {
        state: "CA",
        telemetry: convincingTelemetry()
      }
    });

    expect(response.body).toBe(built.config.whitepageUrl);
    const records = await repository.getAll();
    expect(records).toHaveLength(1);
    expect(records[0]?.incoming.normalized.server.pageTokenStatus).toBe("missing");
    expect(records[0]?.primaryReason).toBe("VALID_PAGE_TOKEN_REQUIRED");
  });

  it("does not accept a page token copied to another visitor session", async () => {
    let nowMs = 1_700_000_070_000;
    const built = await buildApp({
      config: testConfig(),
      repository: new JsonlDecisionRepository(":memory:"),
      clock: () => nowMs,
      logger: false
    });
    apps.push(built.app);

    const firstLanding = await built.app.inject({ method: "GET", url: "/" });
    const copiedToken = extractToken(firstLanding.body);
    const secondLanding = await built.app.inject({ method: "GET", url: "/" });
    const secondVisitorCookie = extractCookie(secondLanding.headers["set-cookie"]);
    nowMs += 1_800;

    const response = await built.app.inject({
      method: "POST",
      url: "/api/decision",
      headers: {
        cookie: secondVisitorCookie,
        "content-type": "application/json",
        accept: "text/plain,application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36"
      },
      payload: {
        state: "CA",
        pageToken: copiedToken,
        telemetry: convincingTelemetry()
      }
    });

    expect(response.body).toBe(built.config.whitepageUrl);
  });

  it("supports a no-JS form POST and redirects to the whitepage", async () => {
    let nowMs = 1_700_000_100_000;
    const built = await buildApp({
      config: testConfig(),
      repository: new JsonlDecisionRepository(":memory:"),
      clock: () => nowMs,
      logger: false
    });
    apps.push(built.app);

    const landing = await built.app.inject({ method: "GET", url: "/" });
    const pageToken = extractToken(landing.body);
    const cookie = extractCookie(landing.headers["set-cookie"]);
    nowMs += 2_000;

    const response = await built.app.inject({
      method: "POST",
      url: "/submit",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
        accept: "text/html",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"
      },
      payload: `state=CA&pageToken=${encodeURIComponent(pageToken)}`
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(built.config.whitepageUrl);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toBe("");
  });


  it("audits malformed JSON and still returns only a destination URL", async () => {
    const repository = new JsonlDecisionRepository(":memory:");
    const built = await buildApp({
      config: testConfig(),
      repository,
      logger: false
    });
    apps.push(built.app);

    const response = await built.app.inject({
      method: "POST",
      url: "/api/decision",
      headers: {
        "content-type": "application/json",
        accept: "text/plain",
        "user-agent": "curl/8.0"
      },
      payload: '{"state":'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(built.config.blockUrl);
    const records = await repository.getAll();
    expect(records).toHaveLength(1);
    expect(records[0]?.incoming.rawBody).toMatchObject({
      parserError: "FST_ERR_CTP_INVALID_JSON_BODY"
    });
  });

  it("returns a block URL for an invalid state without exposing details", async () => {
    const built = await buildApp({
      config: testConfig(),
      repository: new JsonlDecisionRepository(":memory:"),
      logger: false
    });
    apps.push(built.app);

    const response = await built.app.inject({
      method: "POST",
      url: "/api/decision",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en-US",
        "user-agent": "Mozilla/5.0"
      },
      payload: { state: "ZZ" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(built.config.blockUrl);
  });
});
