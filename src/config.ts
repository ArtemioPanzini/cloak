import "dotenv/config";
import { z } from "zod";

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const rawConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  PUBLIC_BASE_URL: z.string().url().optional(),
  DATA_FILE: z.string().min(1).default("./data/audit.jsonl"),
  PAGE_TOKEN_SECRET: z.string().min(24).default("dev-page-token-secret-change-me-now"),
  HASH_SECRET: z.string().min(24).default("dev-hash-secret-change-me-right-now"),
  COOKIE_SECRET: z.string().min(24).default("dev-cookie-secret-change-me-right-now"),
  OFFER_URL: z.string().url().optional(),
  WHITEPAGE_URL: z.string().url().optional(),
  BLOCK_URL: z.string().url().optional(),
  PAGE_TOKEN_TTL_MS: z.coerce.number().int().min(30_000).max(86_400_000).default(600_000),
  TRUST_PROXY: booleanFromEnvironment.default(false),
  TRUST_ENRICHMENT_HEADERS: booleanFromEnvironment.default(false),
  COOKIE_SECURE: booleanFromEnvironment.default(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536)
});

export interface AppConfig {
  port: number;
  host: string;
  publicBaseUrl: string;
  dataFile: string;
  pageTokenSecret: string;
  hashSecret: string;
  cookieSecret: string;
  offerUrl: string;
  whitepageUrl: string;
  blockUrl: string;
  pageTokenTtlMs: number;
  trustProxy: boolean;
  trustEnrichmentHeaders: boolean;
  cookieSecure: boolean;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  maxBodyBytes: number;
  visitCookieName: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawConfigSchema.parse(environment);
  const publicBaseUrl = (parsed.PUBLIC_BASE_URL ?? `http://localhost:${parsed.PORT}`).replace(/\/$/, "");

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    publicBaseUrl,
    dataFile: parsed.DATA_FILE,
    pageTokenSecret: parsed.PAGE_TOKEN_SECRET,
    hashSecret: parsed.HASH_SECRET,
    cookieSecret: parsed.COOKIE_SECRET,
    offerUrl: parsed.OFFER_URL ?? `${publicBaseUrl}/demo/offer`,
    whitepageUrl: parsed.WHITEPAGE_URL ?? `${publicBaseUrl}/demo/whitepage`,
    blockUrl: parsed.BLOCK_URL ?? `${publicBaseUrl}/demo/blocked`,
    pageTokenTtlMs: parsed.PAGE_TOKEN_TTL_MS,
    trustProxy: parsed.TRUST_PROXY,
    trustEnrichmentHeaders: parsed.TRUST_ENRICHMENT_HEADERS,
    cookieSecure: parsed.COOKIE_SECURE,
    logLevel: parsed.LOG_LEVEL,
    maxBodyBytes: parsed.MAX_BODY_BYTES,
    visitCookieName: "prelander_visit"
  };
}
