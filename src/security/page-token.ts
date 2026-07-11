import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PageTokenStatus } from "../domain/types.js";

const TOKEN_VERSION = 1;
const MAX_TOKEN_LENGTH = 4_096;
const MAX_TOKEN_LIFETIME_MS = 86_400_000;
const FUTURE_SKEW_MS = 30_000;

export interface PageTokenPayload {
  v: 1;
  jti: string;
  iat: number;
  exp: number;
  binding: string;
}

export interface PageTokenVerification {
  status: PageTokenStatus;
  payload?: PageTokenPayload;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createBinding(visitorId: string, jti: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`page-token-binding\u0000${visitorId}\u0000${jti}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parsePayload(encodedPayload: string): PageTokenPayload | undefined {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    const { v, jti, iat, exp, binding } = record;
    if (
      v !== TOKEN_VERSION ||
      typeof jti !== "string" ||
      jti.length < 20 ||
      jti.length > 64 ||
      typeof iat !== "number" ||
      !Number.isSafeInteger(iat) ||
      iat < 0 ||
      typeof exp !== "number" ||
      !Number.isSafeInteger(exp) ||
      exp <= iat ||
      exp - iat > MAX_TOKEN_LIFETIME_MS ||
      typeof binding !== "string" ||
      binding.length < 32 ||
      binding.length > 128
    ) {
      return undefined;
    }

    return { v: TOKEN_VERSION, jti, iat, exp, binding };
  } catch {
    return undefined;
  }
}

export function issuePageToken(
  nowMs: number,
  ttlMs: number,
  visitorId: string,
  signingSecret: string,
  bindingSecret: string
): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("page token nowMs must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TOKEN_LIFETIME_MS) {
    throw new Error("page token ttlMs is outside the supported range");
  }

  const jti = randomBytes(16).toString("base64url");
  const payload: PageTokenPayload = {
    v: TOKEN_VERSION,
    jti,
    iat: nowMs,
    exp: nowMs + ttlMs,
    binding: createBinding(visitorId, jti, bindingSecret)
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, signingSecret)}`;
}

export function verifyPageToken(
  token: string | undefined,
  nowMs: number,
  visitorId: string,
  hadValidVisitCookie: boolean,
  signingSecret: string,
  bindingSecret: string
): PageTokenVerification {
  if (!token) return { status: "missing" };
  if (token.length > MAX_TOKEN_LENGTH) return { status: "malformed" };

  const parts = token.split(".");
  const encodedPayload = parts[0];
  const suppliedSignature = parts[1];
  if (parts.length !== 2 || !encodedPayload || !suppliedSignature) {
    return { status: "malformed" };
  }

  const expectedSignature = sign(encodedPayload, signingSecret);
  if (!safeEqual(expectedSignature, suppliedSignature)) {
    return { status: "invalid_signature" };
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) return { status: "malformed" };

  if (payload.iat > nowMs + FUTURE_SKEW_MS) {
    return { status: "future", payload };
  }
  if (nowMs >= payload.exp) {
    return { status: "expired", payload };
  }
  if (!hadValidVisitCookie) {
    return { status: "visitor_mismatch", payload };
  }

  const expectedBinding = createBinding(visitorId, payload.jti, bindingSecret);
  if (!safeEqual(expectedBinding, payload.binding)) {
    return { status: "visitor_mismatch", payload };
  }

  return { status: "valid", payload };
}
