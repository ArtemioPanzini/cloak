import { isUsStateCode } from "../constants/us-states.js";
import type { ClientScreen, ClientTelemetry } from "../domain/types.js";

interface NormalizedPayload {
  state: string;
  validState: boolean;
  pageToken?: string;
  client?: ClientTelemetry;
  payloadIssues: string[];
  rawBody: unknown;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

export function redactDecisionBody(rawBody: unknown): unknown {
  const source = asRecord(rawBody);
  if (!source || !("pageToken" in source)) return rawBody;

  return {
    ...source,
    pageToken: "[REDACTED]"
  };
}

function readString(
  source: UnknownRecord,
  key: string,
  issues: string[],
  maxLength: number
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    issues.push(`${key}:not_string`);
    return undefined;
  }
  if (value.length > maxLength) {
    issues.push(`${key}:too_long`);
    return value.slice(0, maxLength);
  }
  return value;
}

function readBoolean(source: UnknownRecord, key: string, issues: string[]): boolean | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    issues.push(`${key}:not_boolean`);
    return undefined;
  }
  return value;
}

function readNumber(
  source: UnknownRecord,
  key: string,
  issues: string[],
  options: { min: number; max: number; integer?: boolean }
): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${key}:not_finite_number`);
    return undefined;
  }
  if (value < options.min || value > options.max) {
    issues.push(`${key}:out_of_range`);
    return value;
  }
  if (options.integer && !Number.isInteger(value)) {
    issues.push(`${key}:not_integer`);
    return value;
  }
  return value;
}

function readStringArray(
  source: UnknownRecord,
  key: string,
  issues: string[],
  maxItems: number,
  maxItemLength: number
): string[] | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    issues.push(`${key}:not_array`);
    return undefined;
  }

  const strings = value
    .slice(0, maxItems)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, maxItemLength));

  if (strings.length !== Math.min(value.length, maxItems)) {
    issues.push(`${key}:contains_non_string`);
  }
  if (value.length > maxItems) issues.push(`${key}:too_many_items`);
  return strings;
}

function normalizeScreen(value: unknown, issues: string[]): ClientScreen | undefined {
  const source = asRecord(value);
  if (!source) {
    if (value !== undefined && value !== null) issues.push("screen:not_object");
    return undefined;
  }

  const width = readNumber(source, "width", issues, { min: 0, max: 100_000, integer: true });
  const height = readNumber(source, "height", issues, { min: 0, max: 100_000, integer: true });
  const colorDepth = readNumber(source, "colorDepth", issues, { min: 0, max: 1_024, integer: true });

  if (width === undefined && height === undefined && colorDepth === undefined) return undefined;

  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(colorDepth !== undefined ? { colorDepth } : {})
  };
}

function normalizeTelemetry(value: unknown, issues: string[]): ClientTelemetry | undefined {
  const source = asRecord(value);
  if (!source) {
    if (value !== undefined && value !== null) issues.push("telemetry:not_object");
    return undefined;
  }

  const timeOptions = { min: 0, max: 86_400_000 };
  const countOptions = { min: 0, max: 1_000_000, integer: true };

  const pageVisibleMs = readNumber(source, "pageVisibleMs", issues, timeOptions);
  const firstInteractionMs = readNumber(source, "firstInteractionMs", issues, timeOptions);
  const stateChangedMs = readNumber(source, "stateChangedMs", issues, timeOptions);
  const submittedMs = readNumber(source, "submittedMs", issues, timeOptions);
  const pointerMoves = readNumber(source, "pointerMoves", issues, countOptions);
  const pointerDowns = readNumber(source, "pointerDowns", issues, countOptions);
  const touchStarts = readNumber(source, "touchStarts", issues, countOptions);
  const keyDowns = readNumber(source, "keyDowns", issues, countOptions);
  const stateChanges = readNumber(source, "stateChanges", issues, countOptions);
  const focusCount = readNumber(source, "focusCount", issues, countOptions);
  const blurCount = readNumber(source, "blurCount", issues, countOptions);
  const visibilityChanges = readNumber(source, "visibilityChanges", issues, countOptions);
  const webdriver = readBoolean(source, "webdriver", issues);
  const timezone = readString(source, "timezone", issues, 128);
  const languages = readStringArray(source, "languages", issues, 16, 64);
  const screen = normalizeScreen(source.screen, issues);
  const hardwareConcurrency = readNumber(source, "hardwareConcurrency", issues, {
    min: 0,
    max: 10_000
  });
  const deviceMemory = readNumber(source, "deviceMemory", issues, { min: 0, max: 10_000 });
  const maxTouchPoints = readNumber(source, "maxTouchPoints", issues, {
    min: 0,
    max: 10_000,
    integer: true
  });
  const fingerprintId = readString(source, "fingerprintId", issues, 128);

  return {
    ...(pageVisibleMs !== undefined ? { pageVisibleMs } : {}),
    ...(firstInteractionMs !== undefined ? { firstInteractionMs } : {}),
    ...(stateChangedMs !== undefined ? { stateChangedMs } : {}),
    ...(submittedMs !== undefined ? { submittedMs } : {}),
    ...(pointerMoves !== undefined ? { pointerMoves } : {}),
    ...(pointerDowns !== undefined ? { pointerDowns } : {}),
    ...(touchStarts !== undefined ? { touchStarts } : {}),
    ...(keyDowns !== undefined ? { keyDowns } : {}),
    ...(stateChanges !== undefined ? { stateChanges } : {}),
    ...(focusCount !== undefined ? { focusCount } : {}),
    ...(blurCount !== undefined ? { blurCount } : {}),
    ...(visibilityChanges !== undefined ? { visibilityChanges } : {}),
    ...(webdriver !== undefined ? { webdriver } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    ...(languages !== undefined ? { languages } : {}),
    ...(screen !== undefined ? { screen } : {}),
    ...(hardwareConcurrency !== undefined ? { hardwareConcurrency } : {}),
    ...(deviceMemory !== undefined ? { deviceMemory } : {}),
    ...(maxTouchPoints !== undefined ? { maxTouchPoints } : {}),
    ...(fingerprintId !== undefined ? { fingerprintId } : {})
  };
}

export function normalizeDecisionPayload(rawBody: unknown): NormalizedPayload {
  const payloadIssues: string[] = [];
  const source = asRecord(rawBody);

  if (!source) {
    return {
      state: "",
      validState: false,
      payloadIssues: ["body:not_object"],
      rawBody: redactDecisionBody(rawBody)
    };
  }

  const rawState = readString(source, "state", payloadIssues, 16) ?? "";
  const state = rawState.trim().toUpperCase();
  const pageToken = readString(source, "pageToken", payloadIssues, 4_096);
  const client = normalizeTelemetry(source.telemetry, payloadIssues);

  return {
    state,
    validState: isUsStateCode(state),
    ...(pageToken !== undefined ? { pageToken } : {}),
    ...(client !== undefined ? { client } : {}),
    payloadIssues,
    rawBody: redactDecisionBody(rawBody)
  };
}
