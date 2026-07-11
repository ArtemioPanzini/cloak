import { describe, expect, it } from "vitest";
import type { Decision, PageTokenStatus } from "../src/domain/types.js";
import { resolveDecision } from "../src/scoring/policy.js";
import { scoreVisitor } from "../src/scoring/scorer.js";
import { cleanClient, makeHistory, makeInput } from "./fixtures.js";

interface Scenario {
  name: string;
  input: ReturnType<typeof makeInput>;
  history: ReturnType<typeof makeHistory>;
  expected: Decision;
}

const scenarios: Scenario[] = [
  {
    name: "clean live user",
    input: makeInput(),
    history: makeHistory(),
    expected: "OFFER"
  },
  {
    name: "very fast clicker",
    input: makeInput({
      client: {
        pageVisibleMs: 180,
        firstInteractionMs: 40,
        stateChangedMs: 100,
        submittedMs: 180
      },
      server: { serverDwellMs: 180 }
    }),
    history: makeHistory(),
    // A single very fast interaction is routed to the fallback, not hard-blocked.
    expected: "WHITEPAGE"
  },
  {
    name: "headless bot without mouse movement",
    input: makeInput({
      clientReplacement: {
        pageVisibleMs: 100,
        submittedMs: 100,
        pointerMoves: 0,
        pointerDowns: 0,
        touchStarts: 0,
        keyDowns: 0,
        stateChanges: 0,
        focusCount: 0,
        blurCount: 0,
        visibilityChanges: 0,
        webdriver: true,
        timezone: "UTC",
        languages: ["en-US"],
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        hardwareConcurrency: 4,
        deviceMemory: 4,
        maxTouchPoints: 0,
        fingerprintId: "abcdefabcdefabcdefabcdefabcdefab"
      },
      server: {
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/124.0.0.0 Safari/537.36",
        serverDwellMs: 100
      }
    }),
    history: makeHistory(),
    expected: "BLOCK"
  },
  {
    name: "live user on VPN with geo mismatch",
    input: makeInput({
      state: "NV",
      server: { networkType: "vpn", geoRegion: "CA" }
    }),
    history: makeHistory(),
    // VPN and region mismatch are deliberately weak/neutral signals.
    expected: "OFFER"
  },
  {
    name: "mobile user with slow submit",
    input: makeInput({
      client: {
        ...cleanClient,
        pageVisibleMs: 42_000,
        firstInteractionMs: 1_200,
        stateChangedMs: 3_000,
        submittedMs: 45_000,
        pointerMoves: 0,
        pointerDowns: 0,
        touchStarts: 2,
        screen: { width: 390, height: 844, colorDepth: 24 },
        maxTouchPoints: 5
      },
      server: {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        clientHintMobile: true,
        serverDwellMs: 45_000
      }
    }),
    history: makeHistory(),
    expected: "OFFER"
  },
  {
    name: "user with suspicious fingerprint and device values",
    input: makeInput({
      client: {
        screen: { width: 0, height: 0, colorDepth: 0 },
        hardwareConcurrency: 0,
        deviceMemory: 2_048,
        maxTouchPoints: 99,
        fingerprintId: "not-a-valid-fingerprint"
      }
    }),
    history: makeHistory(),
    // Device anomalies alone cause fallback, but not a hard block.
    expected: "WHITEPAGE"
  },
  {
    name: "JavaScript disabled with minimal payload",
    input: makeInput({ withoutClient: true }),
    history: makeHistory(),
    // Missing telemetry lowers coverage; it is not itself proof of automation.
    expected: "WHITEPAGE"
  },
  {
    name: "normal repeat visit from same fingerprint",
    input: makeInput(),
    history: makeHistory({
      previousVisitorDecisions: 1,
      previousFingerprintDecisions: 1,
      previousIpDecisions: 1,
      visitorSubmitsLast30Seconds: 0,
      fingerprintSubmitsLast30Seconds: 0,
      fingerprintSubmitsLast5Minutes: 1
    }),
    // Fingerprint reuse is normal unless it is paired with abnormal velocity.
    expected: "OFFER"
  },
  {
    name: "extreme repeated submit burst",
    input: makeInput(),
    history: makeHistory({
      previousVisitorDecisions: 12,
      previousFingerprintDecisions: 12,
      visitorSubmitsLast30Seconds: 12,
      fingerprintSubmitsLast30Seconds: 12,
      fingerprintSubmitsLast5Minutes: 12
    }),
    expected: "BLOCK"
  },
  {
    name: "IP region differs from selected state but behavior is coherent",
    input: makeInput({ state: "NY", server: { geoRegion: "TX" } }),
    history: makeHistory(),
    expected: "OFFER"
  }
];

describe("scoring scenarios", () => {
  it.each(scenarios)("returns $expected for $name", ({ input, history, expected }) => {
    const score = scoreVisitor(input, history);
    const resolution = resolveDecision(input, score);
    expect(resolution.decision).toBe(expected);
  });

  it.each<PageTokenStatus>([
    "missing",
    "malformed",
    "invalid_signature",
    "expired",
    "future",
    "visitor_mismatch"
  ])("never returns OFFER when page token status is %s", (pageTokenStatus) => {
    const input = makeInput({ server: { pageTokenStatus } });
    const score = scoreVisitor(input, makeHistory());
    const resolution = resolveDecision(input, score);

    expect(resolution.decision).toBe("WHITEPAGE");
    expect(resolution.primaryReason).toBe("VALID_PAGE_TOKEN_REQUIRED");
  });

  it("requires independent evidence groups for a hard automation block", () => {
    const input = makeInput({
      client: { webdriver: true },
      server: {
        userAgent:
          "Mozilla/5.0 AppleWebKit/537.36 HeadlessChrome/124.0.0.0 Safari/537.36",
        serverDwellMs: 1_500
      }
    });
    const score = scoreVisitor(input, makeHistory());
    const resolution = resolveDecision(input, score);

    expect(score.automationRisk).toBeGreaterThanOrEqual(75);
    expect(score.suspiciousGroups).toEqual(["automation"]);
    expect(resolution.decision).toBe("WHITEPAGE");
  });
});
