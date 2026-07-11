import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AuditRecord,
  HistoryLookupKeys,
  HistorySignals
} from "../domain/types.js";

export interface DecisionRepository {
  initialize(): Promise<void>;
  getHistory(keys: HistoryLookupKeys, nowMs: number): Promise<HistorySignals>;
  append(record: AuditRecord): Promise<void>;
  getAll(): Promise<AuditRecord[]>;
  close(): Promise<void>;
}

function countSince(records: AuditRecord[], sinceMs: number): number {
  return records.reduce((count, record) => count + (record.timestampMs >= sinceMs ? 1 : 0), 0);
}

export class JsonlDecisionRepository implements DecisionRepository {
  private readonly records: AuditRecord[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  public constructor(private readonly filePath: string) {}

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (this.filePath === ":memory:") return;

    await mkdir(dirname(this.filePath), { recursive: true });

    let content = "";
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      await appendFile(this.filePath, "", "utf8");
      return;
    }

    for (const line of content.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as AuditRecord;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof parsed.timestampMs === "number" &&
          typeof parsed.decision === "string"
        ) {
          this.records.push(parsed);
        }
      } catch {
        // A damaged line is ignored so one partial write does not prevent startup.
      }
    }
  }

  public async getHistory(keys: HistoryLookupKeys, nowMs: number): Promise<HistorySignals> {
    await this.writeChain;

    const byVisitor = this.records.filter(
      (record) => record.identifiers.visitorKey === keys.visitorKey
    );
    const byFingerprint = keys.fingerprintKey
      ? this.records.filter(
          (record) => record.identifiers.fingerprintKey === keys.fingerprintKey
        )
      : [];
    const byIp = this.records.filter((record) => record.identifiers.ipHash === keys.ipHash);
    const byToken = keys.pageTokenNonceHash
      ? this.records.filter(
          (record) => record.identifiers.pageTokenNonceHash === keys.pageTokenNonceHash
        )
      : [];

    const latest = [...byVisitor, ...byFingerprint]
      .map((record) => record.timestampMs)
      .sort((left, right) => right - left)[0];

    return {
      lookupSucceeded: true,
      previousVisitorDecisions: byVisitor.length,
      previousFingerprintDecisions: byFingerprint.length,
      previousIpDecisions: byIp.length,
      visitorSubmitsLast30Seconds: countSince(byVisitor, nowMs - 30_000),
      fingerprintSubmitsLast30Seconds: countSince(byFingerprint, nowMs - 30_000),
      ipSubmitsLast30Seconds: countSince(byIp, nowMs - 30_000),
      fingerprintSubmitsLast5Minutes: countSince(byFingerprint, nowMs - 300_000),
      pageTokenPreviousUses: byToken.length,
      ...(latest !== undefined ? { lastDecisionAtMs: latest } : {})
    };
  }

  public async append(record: AuditRecord): Promise<void> {
    const operation = this.writeChain.then(async () => {
      if (this.filePath !== ":memory:") {
        await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
      }
      this.records.push(record);
    });

    this.writeChain = operation.catch(() => undefined);
    await operation;
  }

  public async getAll(): Promise<AuditRecord[]> {
    await this.writeChain;
    return structuredClone(this.records);
  }

  public async close(): Promise<void> {
    await this.writeChain;
  }
}
