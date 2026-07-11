import { readFile } from "node:fs/promises";
import { loadConfig } from "../config.js";
import type { AuditRecord } from "../domain/types.js";

const config = loadConfig();
const requested = Number.parseInt(process.argv[2] ?? "10", 10);
const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 100)) : 10;

try {
  const content = await readFile(config.dataFile, "utf8");
  const records = content
    .split(/\r?\n/u)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as AuditRecord];
      } catch {
        return [];
      }
    })
    .slice(-limit)
    .map((record) => ({
      timestamp: record.timestamp,
      requestId: record.requestId,
      state: record.incoming.normalized.form.state,
      decision: record.decision,
      automationRisk: record.score.automationRisk,
      intentScore: record.score.intentScore,
      coverage: record.score.coverage,
      reason: record.primaryReason
    }));

  console.table(records);
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    console.log(`No audit file found at ${config.dataFile}`);
  } else {
    throw error;
  }
}
