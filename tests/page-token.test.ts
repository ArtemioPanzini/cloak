import { describe, expect, it } from "vitest";
import { issuePageToken, verifyPageToken } from "../src/security/page-token.js";

const secret = "test-page-token-secret-long-enough";

describe("page token", () => {
  it("verifies a fresh token", () => {
    const token = issuePageToken(10_000, secret);
    expect(verifyPageToken(token, 11_500, secret, 60_000).status).toBe("valid");
  });

  it("rejects a modified signature", () => {
    const token = issuePageToken(10_000, secret);
    const tampered = `${token.slice(0, -1)}x`;
    expect(verifyPageToken(tampered, 11_500, secret, 60_000).status).toBe(
      "invalid_signature"
    );
  });

  it("marks an old signed token as expired rather than forged", () => {
    const token = issuePageToken(10_000, secret);
    expect(verifyPageToken(token, 100_001, secret, 60_000).status).toBe("expired");
  });
});
