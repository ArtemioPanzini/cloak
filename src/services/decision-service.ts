import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { AppConfig } from "../config.js";
import type {
  AuditRecord,
  Decision,
  NormalizedDecisionInput
} from "../domain/types.js";
import { resolveDecision } from "../scoring/policy.js";
import { scoreVisitor } from "../scoring/scorer.js";
import { hmacHex } from "../security/hash.js";
import { verifyPageToken } from "../security/page-token.js";
import type { DecisionRepository } from "../storage/decision-repository.js";
import { normalizeDecisionPayload } from "../telemetry/normalize.js";
import { buildServerSignals } from "../telemetry/request-signals.js";

export interface DecisionRequestContext {
  requestId: string;
  rawBody: unknown;
  headers: IncomingHttpHeaders;
  ip: string;
  visitorId: string;
  hadValidVisitCookie: boolean;
}

export interface DecisionOutcome {
  decision: Decision;
  url: string;
  primaryReason: string;
  score: ReturnType<typeof scoreVisitor>;
  auditRecord: AuditRecord;
}

export class DecisionService {
  public constructor(
    private readonly config: AppConfig,
    private readonly repository: DecisionRepository,
    private readonly clock: () => number = Date.now
  ) {}

  public async decide(context: DecisionRequestContext): Promise<DecisionOutcome> {
    const nowMs = this.clock();
    const payload = normalizeDecisionPayload(context.rawBody);
    const tokenVerification = verifyPageToken(
      payload.pageToken,
      nowMs,
      context.visitorId,
      context.hadValidVisitCookie,
      this.config.pageTokenSecret,
      this.config.hashSecret
    );
    const server = buildServerSignals({
      headers: context.headers,
      ip: context.ip,
      nowMs,
      hadValidVisitCookie: context.hadValidVisitCookie,
      tokenVerification,
      config: this.config
    });

    const visitorKey = hmacHex(this.config.hashSecret, `visitor:${context.visitorId}`);
    const fingerprintKey = payload.client?.fingerprintId
      ? hmacHex(this.config.hashSecret, `fingerprint:${payload.client.fingerprintId.toLowerCase()}`)
      : undefined;

    const history = await this.repository.getHistory(
      {
        visitorKey,
        ...(fingerprintKey !== undefined ? { fingerprintKey } : {}),
        ipHash: server.ipHash,
        ...(server.pageTokenNonceHash !== undefined
          ? { pageTokenNonceHash: server.pageTokenNonceHash }
          : {})
      },
      nowMs
    );

    const normalized: NormalizedDecisionInput = {
      form: {
        state: payload.state,
        validState: payload.validState
      },
      ...(payload.client !== undefined ? { client: payload.client } : {}),
      server,
      payloadIssues: payload.payloadIssues
    };

    const score = scoreVisitor(normalized, history);
    const resolution = resolveDecision(normalized, score);
    const url = this.destinationFor(resolution.decision);

    const auditRecord: AuditRecord = {
      id: randomUUID(),
      timestamp: new Date(nowMs).toISOString(),
      timestampMs: nowMs,
      requestId: context.requestId,
      identifiers: {
        visitorKey,
        ...(fingerprintKey !== undefined ? { fingerprintKey } : {}),
        ipHash: server.ipHash,
        ...(server.pageTokenNonceHash !== undefined
          ? { pageTokenNonceHash: server.pageTokenNonceHash }
          : {})
      },
      incoming: {
        rawBody: payload.rawBody,
        normalized,
        history
      },
      score,
      decision: resolution.decision,
      destinationUrl: url,
      primaryReason: resolution.primaryReason
    };

    await this.repository.append(auditRecord);

    return {
      decision: resolution.decision,
      url,
      primaryReason: resolution.primaryReason,
      score,
      auditRecord
    };
  }

  private destinationFor(decision: Decision): string {
    switch (decision) {
      case "OFFER":
        return this.config.offerUrl;
      case "WHITEPAGE":
        return this.config.whitepageUrl;
      case "BLOCK":
        return this.config.blockUrl;
    }
  }
}
