import { describe, expect, it } from "vitest";
import { issuePageToken, verifyPageToken } from "../src/security/page-token.js";

const signingSecret = "test-page-token-secret-long-enough";
const bindingSecret = "test-binding-secret-long-enough-for-use";
const visitorId = "visitor-a";
const ttlMs = 60_000;

function issue(nowMs = 10_000): string {
  return issuePageToken(nowMs, ttlMs, visitorId, signingSecret, bindingSecret);
}

function verify(
  token: string | undefined,
  nowMs = 11_500,
  currentVisitorId = visitorId,
  hadValidVisitCookie = true
) {
  return verifyPageToken(
    token,
    nowMs,
    currentVisitorId,
    hadValidVisitCookie,
    signingSecret,
    bindingSecret
  );
}

describe("page token", () => {
  it("verifies a fresh token for the same visitor session", () => {
    expect(verify(issue()).status).toBe("valid");
  });

  it("rejects a modified signature", () => {
    const token = issue();
    const replacement = token.endsWith("a") ? "b" : "a";
    const tampered = `${token.slice(0, -1)}${replacement}`;

    expect(verify(tampered).status).toBe("invalid_signature");
  });

  it("expires at the embedded expiration boundary", () => {
    expect(verify(issue(), 70_000).status).toBe("expired");
  });

  it("rejects an issue time beyond the allowed future skew", () => {
    expect(verify(issue(100_000), 69_999).status).toBe("future");
  });

  it("rejects a malformed token", () => {
    expect(verify("not-a-token").status).toBe("malformed");
  });

  it("rejects an oversized token", () => {
    const oversized = `${"a".repeat(4_095)}.x`;

    expect(verify(oversized).status).toBe("malformed");
  });

  it("rejects a token copied to another visitor session", () => {
    expect(verify(issue(), 11_500, "visitor-b").status).toBe(
      "visitor_mismatch"
    );
  });

  it("rejects a token when the signed visit cookie is missing", () => {
    expect(verify(issue(), 11_500, visitorId, false).status).toBe(
      "visitor_mismatch"
    );
  });
});
