import type {
  HistorySignals,
  NormalizedDecisionInput,
  ScoreAdjustment
} from "../domain/types.js";

export interface ScoringContext {
  input: NormalizedDecisionInput;
  history: HistorySignals;
}

export interface ScoringRule {
  code: string;
  evaluate(context: ScoringContext): ScoreAdjustment | null;
}

function adjustment(
  code: string,
  group: ScoreAdjustment["group"],
  automationDelta: number,
  intentDelta: number,
  detail?: string
): ScoreAdjustment {
  return {
    code,
    group,
    automationDelta,
    intentDelta,
    ...(detail !== undefined ? { detail } : {})
  };
}

function hasActiveInteraction(input: NormalizedDecisionInput): boolean {
  const client = input.client;
  if (!client) return false;
  return (
    (client.pointerDowns ?? 0) > 0 ||
    (client.touchStarts ?? 0) > 0 ||
    (client.keyDowns ?? 0) > 0
  );
}

function hasAnyInteractionSignal(input: NormalizedDecisionInput): boolean {
  const client = input.client;
  if (!client) return false;
  return (
    hasActiveInteraction(input) ||
    (client.pointerMoves ?? 0) > 0 ||
    (client.stateChanges ?? 0) > 0
  );
}

function timingIsContradictory(input: NormalizedDecisionInput): boolean {
  const client = input.client;
  if (!client) return false;

  const submitted = client.submittedMs;
  if (submitted !== undefined) {
    if (client.firstInteractionMs !== undefined && client.firstInteractionMs > submitted) return true;
    if (client.stateChangedMs !== undefined && client.stateChangedMs > submitted) return true;
    if (client.pageVisibleMs !== undefined && client.pageVisibleMs > submitted + 500) return true;
  }

  if (
    client.firstInteractionMs !== undefined &&
    client.stateChangedMs !== undefined &&
    client.stateChangedMs < client.firstInteractionMs
  ) {
    return true;
  }

  return false;
}

function countDeviceAnomalies(input: NormalizedDecisionInput): number {
  const client = input.client;
  if (!client) return 0;

  let anomalies = 0;
  const screen = client.screen;
  if (screen?.width !== undefined && (screen.width < 100 || screen.width > 20_000)) anomalies += 1;
  if (screen?.height !== undefined && (screen.height < 100 || screen.height > 20_000)) anomalies += 1;
  if (
    screen?.colorDepth !== undefined &&
    (screen.colorDepth < 1 || screen.colorDepth > 64)
  ) {
    anomalies += 1;
  }
  if (
    client.hardwareConcurrency !== undefined &&
    (client.hardwareConcurrency < 1 || client.hardwareConcurrency > 256)
  ) {
    anomalies += 1;
  }
  if (
    client.deviceMemory !== undefined &&
    (client.deviceMemory < 0.25 || client.deviceMemory > 1_024)
  ) {
    anomalies += 1;
  }
  if (
    client.maxTouchPoints !== undefined &&
    (client.maxTouchPoints < 0 || client.maxTouchPoints > 64)
  ) {
    anomalies += 1;
  }
  if (
    client.fingerprintId !== undefined &&
    !/^[a-f0-9]{16,64}$/iu.test(client.fingerprintId)
  ) {
    anomalies += 1;
  }

  const uaLooksMobile = /Android|iPhone|iPad|Mobile/iu.test(input.server.userAgent ?? "");
  if (
    input.server.clientHintMobile !== undefined &&
    input.server.clientHintMobile !== uaLooksMobile
  ) {
    anomalies += 1;
  }

  return anomalies;
}

const formRule: ScoringRule = {
  code: "FORM_STATE",
  evaluate({ input }) {
    return input.form.validState
      ? adjustment("VALID_STATE", "form", 0, 5)
      : adjustment("INVALID_STATE", "form", 100, -50);
  }
};

const payloadRule: ScoringRule = {
  code: "PAYLOAD_SHAPE",
  evaluate({ input }) {
    if (input.payloadIssues.length === 0) return null;
    const risk = input.payloadIssues.length >= 3 ? 25 : 10;
    return adjustment(
      "MALFORMED_TELEMETRY",
      "request",
      risk,
      -10,
      input.payloadIssues.join(",")
    );
  }
};

const tokenRule: ScoringRule = {
  code: "PAGE_TOKEN",
  evaluate({ input }) {
    switch (input.server.pageTokenStatus) {
      case "valid":
        return adjustment("VALID_PAGE_TOKEN", "token", -5, 0);
      case "missing":
        return adjustment("MISSING_PAGE_TOKEN", "token", 15, 0);
      case "expired":
        return adjustment("EXPIRED_PAGE_TOKEN", "token", 5, 0);
      case "future":
        return adjustment("FUTURE_PAGE_TOKEN", "token", 35, 0);
      case "malformed":
        return adjustment("MALFORMED_PAGE_TOKEN", "token", 35, 0);
      case "invalid_signature":
        return adjustment("INVALID_PAGE_TOKEN_SIGNATURE", "token", 35, 0);
    }
  }
};

const headlessUaRule: ScoringRule = {
  code: "HEADLESS_USER_AGENT",
  evaluate({ input }) {
    const ua = input.server.userAgent ?? "";
    return /HeadlessChrome|PhantomJS|SlimerJS|Puppeteer|Playwright|Selenium/iu.test(ua)
      ? adjustment("HEADLESS_USER_AGENT", "automation", 45, 0)
      : null;
  }
};

const scriptedUaRule: ScoringRule = {
  code: "SCRIPTED_USER_AGENT",
  evaluate({ input }) {
    const ua = input.server.userAgent ?? "";
    if (/HeadlessChrome|PhantomJS|SlimerJS|Puppeteer|Playwright|Selenium/iu.test(ua)) {
      return null;
    }
    return /curl\/|wget\/|python-requests|Go-http-client|scrapy/iu.test(ua)
      ? adjustment("SCRIPTED_USER_AGENT", "automation", 30, 0)
      : null;
  }
};

const webdriverRule: ScoringRule = {
  code: "WEBDRIVER_ENABLED",
  evaluate({ input }) {
    return input.client?.webdriver === true
      ? adjustment("WEBDRIVER_ENABLED", "automation", 35, 0)
      : null;
  }
};

const dwellRule: ScoringRule = {
  code: "DWELL_TIME",
  evaluate({ input }) {
    const dwell = input.server.serverDwellMs;
    if (dwell === undefined) return null;
    if (dwell < 250) return adjustment("VERY_FAST_SUBMIT", "behavior", 45, -30, `${dwell}ms`);
    if (dwell < 600) return adjustment("FAST_SUBMIT", "behavior", 18, -15, `${dwell}ms`);
    if (dwell < 800) return adjustment("SHORT_DWELL", "behavior", 5, -5, `${dwell}ms`);
    if (dwell <= 20_000) return adjustment("NORMAL_DWELL", "behavior", 0, 15, `${dwell}ms`);
    if (dwell <= 120_000) return adjustment("SLOW_BUT_PLAUSIBLE_DWELL", "behavior", 0, 8, `${dwell}ms`);
    return adjustment("LONG_DWELL", "behavior", 0, 3, `${dwell}ms`);
  }
};

const timingOrderRule: ScoringRule = {
  code: "EVENT_ORDER",
  evaluate({ input }) {
    if (!input.client || input.client.submittedMs === undefined) return null;
    return timingIsContradictory(input)
      ? adjustment("CONTRADICTORY_EVENT_ORDER", "behavior", 35, -20)
      : adjustment("COHERENT_EVENT_ORDER", "behavior", 0, 15);
  }
};

const stateChangeRule: ScoringRule = {
  code: "STATE_CHANGE",
  evaluate({ input }) {
    return (input.client?.stateChanges ?? 0) > 0
      ? adjustment("STATE_CHANGED", "behavior", 0, 20)
      : null;
  }
};

const activeInteractionRule: ScoringRule = {
  code: "ACTIVE_INTERACTION",
  evaluate({ input }) {
    return hasActiveInteraction(input)
      ? adjustment("ACTIVE_INPUT_EVENT", "behavior", 0, 10)
      : null;
  }
};

const noInteractionRule: ScoringRule = {
  code: "NO_INTERACTION",
  evaluate({ input }) {
    if (!input.client || input.client.submittedMs === undefined) return null;
    return !hasAnyInteractionSignal(input)
      ? adjustment("NO_RECORDED_INTERACTION", "behavior", 8, 0)
      : null;
  }
};

const noMouseNeutralRule: ScoringRule = {
  code: "NO_MOUSE_NEUTRAL",
  evaluate({ input }) {
    const client = input.client;
    if (!client) return null;
    const hasAlternativeInput =
      (client.pointerDowns ?? 0) > 0 ||
      (client.touchStarts ?? 0) > 0 ||
      (client.keyDowns ?? 0) > 0 ||
      (client.stateChanges ?? 0) > 0;
    return (client.pointerMoves ?? 0) === 0 && hasAlternativeInput
      ? adjustment("NO_MOUSE_MOVEMENT_NOT_PENALIZED", "behavior", 0, 0)
      : null;
  }
};

const pageVisibilityRule: ScoringRule = {
  code: "PAGE_VISIBILITY",
  evaluate({ input }) {
    const visible = input.client?.pageVisibleMs;
    const submitted = input.client?.submittedMs;
    if (visible === undefined || submitted === undefined || submitted <= 0) return null;
    return visible / submitted >= 0.65
      ? adjustment("MOSTLY_VISIBLE_PAGE", "behavior", 0, 5)
      : null;
  }
};

const deviceRule: ScoringRule = {
  code: "DEVICE_CONSISTENCY",
  evaluate({ input }) {
    const anomalies = countDeviceAnomalies(input);
    if (anomalies >= 3) {
      return adjustment("MULTIPLE_DEVICE_ANOMALIES", "device", 45, 0, `${anomalies}`);
    }
    if (anomalies === 2) {
      return adjustment("DEVICE_ANOMALIES", "device", 30, 0, `${anomalies}`);
    }
    if (anomalies === 1) {
      return adjustment("DEVICE_ANOMALY", "device", 12, 0, "1");
    }
    return null;
  }
};

const networkRule: ScoringRule = {
  code: "NETWORK_TYPE",
  evaluate({ input }) {
    switch (input.server.networkType) {
      case "vpn":
        return adjustment("VPN_IS_WEAK_EVIDENCE", "network", 5, 0);
      case "proxy":
        return adjustment("PROXY_IS_WEAK_EVIDENCE", "network", 8, 0);
      case "hosting":
        return adjustment("HOSTING_NETWORK", "network", 12, 0);
      case "residential":
      case "unknown":
        return null;
    }
  }
};

const geoMismatchNeutralRule: ScoringRule = {
  code: "GEO_MISMATCH_NEUTRAL",
  evaluate({ input }) {
    const region = input.server.geoRegion;
    return region && input.form.validState && region !== input.form.state
      ? adjustment("GEO_MISMATCH_NOT_USED_AS_BOT_PROOF", "network", 0, 0)
      : null;
  }
};

const velocityRule: ScoringRule = {
  code: "SUBMIT_VELOCITY",
  evaluate({ history }) {
    const identityBurst = Math.max(
      history.visitorSubmitsLast30Seconds,
      history.fingerprintSubmitsLast30Seconds
    );
    if (identityBurst >= 10) {
      return adjustment("EXTREME_SUBMIT_BURST", "velocity", 80, 0, `${identityBurst}/30s`);
    }
    if (identityBurst >= 4) {
      return adjustment("ELEVATED_SUBMIT_BURST", "velocity", 45, 0, `${identityBurst}/30s`);
    }
    if (identityBurst >= 2) {
      return adjustment("REPEATED_FAST_SUBMITS", "velocity", 10, 0, `${identityBurst}/30s`);
    }
    if (history.ipSubmitsLast30Seconds >= 30) {
      return adjustment(
        "HIGH_SHARED_IP_VELOCITY",
        "network",
        20,
        0,
        `${history.ipSubmitsLast30Seconds}/30s`
      );
    }
    return null;
  }
};

const tokenReplayRule: ScoringRule = {
  code: "TOKEN_REPLAY",
  evaluate({ history }) {
    if (history.pageTokenPreviousUses >= 5) {
      return adjustment("HEAVY_PAGE_TOKEN_REUSE", "token", 45, 0);
    }
    if (history.pageTokenPreviousUses >= 2) {
      return adjustment("REUSED_PAGE_TOKEN", "token", 15, 0);
    }
    return null;
  }
};

const repeatVisitRule: ScoringRule = {
  code: "NORMAL_REPEAT_VISIT",
  evaluate({ history }) {
    const previous = Math.max(
      history.previousVisitorDecisions,
      history.previousFingerprintDecisions
    );
    const burst = Math.max(
      history.visitorSubmitsLast30Seconds,
      history.fingerprintSubmitsLast30Seconds
    );
    if (previous >= 1 && previous <= 3 && burst <= 1) {
      return adjustment("NORMAL_REPEAT_VISIT", "history", -5, 5);
    }
    return null;
  }
};

export const SCORING_RULES: readonly ScoringRule[] = [
  formRule,
  payloadRule,
  tokenRule,
  headlessUaRule,
  scriptedUaRule,
  webdriverRule,
  dwellRule,
  timingOrderRule,
  stateChangeRule,
  activeInteractionRule,
  noInteractionRule,
  noMouseNeutralRule,
  pageVisibilityRule,
  deviceRule,
  networkRule,
  geoMismatchNeutralRule,
  velocityRule,
  tokenReplayRule,
  repeatVisitRule
];
