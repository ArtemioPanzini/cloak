import type {
  ClientTelemetry,
  HistorySignals,
  NormalizedDecisionInput,
  ServerSignals
} from "../src/domain/types.js";

export const cleanClient: ClientTelemetry = {
  pageVisibleMs: 1_750,
  firstInteractionMs: 480,
  stateChangedMs: 1_050,
  submittedMs: 1_800,
  pointerMoves: 12,
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

export const cleanServer: ServerSignals = {
  receivedAtMs: 1_700_000_001_800,
  ip: "203.0.113.10",
  ipHash: "ip-hash",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/json",
  acceptLanguage: "en-US,en;q=0.9",
  referer: "https://example.test/campaign",
  secFetchSite: "same-origin",
  secFetchMode: "cors",
  secFetchDest: "empty",
  clientHintMobile: false,
  clientHintPlatform: '"Windows"',
  pageTokenStatus: "valid",
  serverDwellMs: 1_800,
  pageTokenNonceHash: "token-hash",
  hadValidVisitCookie: true,
  geoRegion: "CA",
  networkType: "residential"
};

export const emptyHistory: HistorySignals = {
  lookupSucceeded: true,
  previousVisitorDecisions: 0,
  previousFingerprintDecisions: 0,
  previousIpDecisions: 0,
  visitorSubmitsLast30Seconds: 0,
  fingerprintSubmitsLast30Seconds: 0,
  ipSubmitsLast30Seconds: 0,
  fingerprintSubmitsLast5Minutes: 0,
  pageTokenPreviousUses: 0
};

interface MakeInputOptions {
  state?: string;
  validState?: boolean;
  withoutClient?: boolean;
  client?: Partial<ClientTelemetry>;
  clientReplacement?: ClientTelemetry;
  server?: Partial<ServerSignals>;
  payloadIssues?: string[];
}

export function makeInput(options: MakeInputOptions = {}): NormalizedDecisionInput {
  const client = options.withoutClient
    ? undefined
    : options.clientReplacement ?? ({ ...cleanClient, ...options.client } as ClientTelemetry);

  return {
    form: {
      state: options.state ?? "CA",
      validState: options.validState ?? true
    },
    ...(client !== undefined ? { client } : {}),
    server: { ...cleanServer, ...options.server },
    payloadIssues: options.payloadIssues ?? []
  };
}

export function makeHistory(overrides: Partial<HistorySignals> = {}): HistorySignals {
  return { ...emptyHistory, ...overrides };
}
