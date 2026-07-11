import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditRecord } from "../src/domain/types.js";
import { resolveDecision } from "../src/scoring/policy.js";
import { scoreVisitor } from "../src/scoring/scorer.js";
import { JsonlDecisionRepository } from "../src/storage/decision-repository.js";
import { makeHistory, makeInput } from "./fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("JSONL decision repository", () => {
  it("persists audit records and rebuilds history after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "prelander-audit-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "audit.jsonl");
    const input = makeInput();
    const history = makeHistory();
    const score = scoreVisitor(input, history);
    const resolution = resolveDecision(input, score);

    const record: AuditRecord = {
      id: "record-1",
      timestamp: new Date(1_700_000_000_000).toISOString(),
      timestampMs: 1_700_000_000_000,
      requestId: "request-1",
      identifiers: {
        visitorKey: "visitor-key",
        fingerprintKey: "fingerprint-key",
        ipHash: "ip-hash",
        pageTokenNonceHash: "token-hash"
      },
      incoming: {
        rawBody: { state: "CA" },
        normalized: input,
        history
      },
      score,
      decision: resolution.decision,
      destinationUrl: "https://dest.test/offer",
      primaryReason: resolution.primaryReason
    };

    const first = new JsonlDecisionRepository(filePath);
    await first.initialize();
    await first.append(record);
    await first.close();

    const second = new JsonlDecisionRepository(filePath);
    await second.initialize();
    const restored = await second.getAll();
    const restoredHistory = await second.getHistory(
      {
        visitorKey: "visitor-key",
        fingerprintKey: "fingerprint-key",
        ipHash: "ip-hash",
        pageTokenNonceHash: "token-hash"
      },
      1_700_000_010_000
    );

    expect(restored).toHaveLength(1);
    expect(restored[0]?.primaryReason).toBe("HUMAN_LIKE_INTERACTION");
    expect(restoredHistory.previousVisitorDecisions).toBe(1);
    expect(restoredHistory.previousFingerprintDecisions).toBe(1);
    expect(restoredHistory.pageTokenPreviousUses).toBe(1);
    await second.close();
  });
});
