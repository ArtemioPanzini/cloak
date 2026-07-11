import type { IncomingHttpHeaders } from "node:http";
import type { AppConfig } from "../config.js";
import type { NetworkType, ServerSignals } from "../domain/types.js";
import { hmacHex } from "../security/hash.js";
import type { PageTokenVerification } from "../security/page-token.js";

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value.join(", ").slice(0, 2_048);
  if (typeof value === "string") return value.slice(0, 2_048);
  return undefined;
}

function parseClientHintMobile(value: string | undefined): boolean | undefined {
  if (value === "?1") return true;
  if (value === "?0") return false;
  return undefined;
}

function parseNetworkType(value: string | undefined): NetworkType {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "residential" ||
    normalized === "vpn" ||
    normalized === "proxy" ||
    normalized === "hosting"
  ) {
    return normalized;
  }
  return "unknown";
}

export interface RequestSignalOptions {
  headers: IncomingHttpHeaders;
  ip: string;
  nowMs: number;
  hadValidVisitCookie: boolean;
  tokenVerification: PageTokenVerification;
  config: AppConfig;
}

export function buildServerSignals(options: RequestSignalOptions): ServerSignals {
  const { headers, ip, nowMs, hadValidVisitCookie, tokenVerification, config } = options;
  const tokenIssuedAt = tokenVerification.payload?.issuedAtMs;
  const serverDwellMs =
    tokenIssuedAt !== undefined && tokenIssuedAt <= nowMs
      ? Math.max(0, nowMs - tokenIssuedAt)
      : undefined;

  const userAgent = headerValue(headers, "user-agent");
  const accept = headerValue(headers, "accept");
  const acceptLanguage = headerValue(headers, "accept-language");
  const referer = headerValue(headers, "referer");
  const secFetchSite = headerValue(headers, "sec-fetch-site");
  const secFetchMode = headerValue(headers, "sec-fetch-mode");
  const secFetchDest = headerValue(headers, "sec-fetch-dest");
  const clientHintUa = headerValue(headers, "sec-ch-ua");
  const clientHintMobile = parseClientHintMobile(headerValue(headers, "sec-ch-ua-mobile"));
  const clientHintPlatform = headerValue(headers, "sec-ch-ua-platform");
  const geoRegion = config.trustEnrichmentHeaders
    ? headerValue(headers, "x-geo-region")?.trim().toUpperCase().slice(0, 16)
    : undefined;
  const networkType = config.trustEnrichmentHeaders
    ? parseNetworkType(headerValue(headers, "x-network-type"))
    : "unknown";
  const pageTokenNonceHash = tokenVerification.payload?.nonce
    ? hmacHex(config.hashSecret, `token:${tokenVerification.payload.nonce}`)
    : undefined;

  return {
    receivedAtMs: nowMs,
    ip,
    ipHash: hmacHex(config.hashSecret, `ip:${ip}`),
    ...(userAgent !== undefined ? { userAgent } : {}),
    ...(accept !== undefined ? { accept } : {}),
    ...(acceptLanguage !== undefined ? { acceptLanguage } : {}),
    ...(referer !== undefined ? { referer } : {}),
    ...(secFetchSite !== undefined ? { secFetchSite } : {}),
    ...(secFetchMode !== undefined ? { secFetchMode } : {}),
    ...(secFetchDest !== undefined ? { secFetchDest } : {}),
    ...(clientHintUa !== undefined ? { clientHintUa } : {}),
    ...(clientHintMobile !== undefined ? { clientHintMobile } : {}),
    ...(clientHintPlatform !== undefined ? { clientHintPlatform } : {}),
    pageTokenStatus: tokenVerification.status,
    ...(serverDwellMs !== undefined ? { serverDwellMs } : {}),
    ...(pageTokenNonceHash !== undefined ? { pageTokenNonceHash } : {}),
    hadValidVisitCookie,
    ...(geoRegion !== undefined && geoRegion !== "" ? { geoRegion } : {}),
    networkType
  };
}
