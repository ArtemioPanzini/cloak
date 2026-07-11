import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PageTokenStatus } from "../domain/types.js";

interface PageTokenPayload {
  issuedAtMs: number;
  nonce: string;
}

export interface PageTokenVerification {
  status: PageTokenStatus;
  payload?: PageTokenPayload;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function issuePageToken(nowMs: number, secret: string): string {
  const payload: PageTokenPayload = {
    issuedAtMs: nowMs,
    nonce: randomBytes(16).toString("base64url")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyPageToken(
  token: string | undefined,
  nowMs: number,
  secret: string,
  ttlMs: number
): PageTokenVerification {
  if (!token) return { status: "missing" };

  const parts = token.split(".");
  const encodedPayload = parts[0];
  const suppliedSignature = parts[1];
  if (parts.length !== 2 || !encodedPayload || !suppliedSignature) {
    return { status: "malformed" };
  }

  const expectedSignature = sign(encodedPayload, secret);
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return { status: "invalid_signature" };
  }

  let payload: PageTokenPayload;
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { status: "malformed" };
    }
    const record = parsed as Record<string, unknown>;
    const issuedAtMs = record.issuedAtMs;
    const nonce = record.nonce;
    if (typeof issuedAtMs !== "number" || typeof nonce !== "string") {
      return { status: "malformed" };
    }

    payload = { issuedAtMs, nonce };
  } catch {
    return { status: "malformed" };
  }

  const futureSkewMs = 30_000;
  if (payload.issuedAtMs > nowMs + futureSkewMs) {
    return { status: "future", payload };
  }
  if (nowMs - payload.issuedAtMs > ttlMs) {
    return { status: "expired", payload };
  }

  return { status: "valid", payload };
}
