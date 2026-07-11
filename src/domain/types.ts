export type Decision = "OFFER" | "WHITEPAGE" | "BLOCK";

export type EvidenceGroup =
  | "form"
  | "token"
  | "automation"
  | "behavior"
  | "device"
  | "network"
  | "velocity"
  | "history"
  | "request";

export type PageTokenStatus =
  | "valid"
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "future";

export type NetworkType = "residential" | "vpn" | "proxy" | "hosting" | "unknown";

export interface ClientScreen {
  width?: number;
  height?: number;
  colorDepth?: number;
}

export interface ClientTelemetry {
  pageVisibleMs?: number;
  firstInteractionMs?: number;
  stateChangedMs?: number;
  submittedMs?: number;
  pointerMoves?: number;
  pointerDowns?: number;
  touchStarts?: number;
  keyDowns?: number;
  stateChanges?: number;
  focusCount?: number;
  blurCount?: number;
  visibilityChanges?: number;
  webdriver?: boolean;
  timezone?: string;
  languages?: string[];
  screen?: ClientScreen;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
  fingerprintId?: string;
}

export interface ServerSignals {
  receivedAtMs: number;
  ip: string;
  ipHash: string;
  userAgent?: string;
  accept?: string;
  acceptLanguage?: string;
  referer?: string;
  secFetchSite?: string;
  secFetchMode?: string;
  secFetchDest?: string;
  clientHintUa?: string;
  clientHintMobile?: boolean;
  clientHintPlatform?: string;
  pageTokenStatus: PageTokenStatus;
  serverDwellMs?: number;
  pageTokenNonceHash?: string;
  hadValidVisitCookie: boolean;
  geoRegion?: string;
  networkType: NetworkType;
}

export interface HistorySignals {
  lookupSucceeded: boolean;
  previousVisitorDecisions: number;
  previousFingerprintDecisions: number;
  previousIpDecisions: number;
  visitorSubmitsLast30Seconds: number;
  fingerprintSubmitsLast30Seconds: number;
  ipSubmitsLast30Seconds: number;
  fingerprintSubmitsLast5Minutes: number;
  pageTokenPreviousUses: number;
  lastDecisionAtMs?: number;
}

export interface NormalizedDecisionInput {
  form: {
    state: string;
    validState: boolean;
  };
  client?: ClientTelemetry;
  server: ServerSignals;
  payloadIssues: string[];
}

export interface ScoreAdjustment {
  code: string;
  group: EvidenceGroup;
  automationDelta: number;
  intentDelta: number;
  detail?: string;
}

export interface ScoreResult {
  automationRisk: number;
  intentScore: number;
  coverage: number;
  suspiciousGroups: EvidenceGroup[];
  reasonCodes: string[];
  adjustments: ScoreAdjustment[];
}

export interface DecisionResolution {
  decision: Decision;
  primaryReason: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  timestampMs: number;
  requestId: string;
  identifiers: {
    visitorKey: string;
    fingerprintKey?: string;
    ipHash: string;
    pageTokenNonceHash?: string;
  };
  incoming: {
    rawBody: unknown;
    normalized: NormalizedDecisionInput;
    history: HistorySignals;
  };
  score: ScoreResult;
  decision: Decision;
  destinationUrl: string;
  primaryReason: string;
}

export interface HistoryLookupKeys {
  visitorKey: string;
  fingerprintKey?: string;
  ipHash: string;
  pageTokenNonceHash?: string;
}
