# Page-token Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать valid, unexpired, same-visitor page token обязательным условием `OFFER`, не меняя URL-only и no-JS HTTP-контракты.

**Architecture:** Page token становится versioned HMAC-signed receipt с embedded expiry и visitor binding. `DecisionService` проверяет receipt до scoring, policy использует token validity как eligibility gate, audit хранит только redacted raw body и HMAC `jti`, а текущая README/Mintlify/OpenAPI документация обновляется вместе с runtime.

**Tech Stack:** Node.js 20+, TypeScript, Fastify 5, `@fastify/cookie`, Node `crypto`, Vitest 4, Mintlify/OpenAPI 3.1.

## Global Constraints

- Утверждённый design spec: `docs/superpowers/specs/2026-07-11-page-token-security-design.md`.
- `OFFER` возможен только при `pageTokenStatus === "valid"`.
- Invalid state, extreme burst и multi-group automation сохраняют более сильный `BLOCK` приоритет.
- Valid token имеет automation delta `0`; он подтверждает flow, а не человека.
- Token payload содержит только `v`, `jti`, `iat`, `exp`, `binding`; timestamps измеряются в milliseconds.
- `PAGE_TOKEN_SECRET` подписывает token; `HASH_SECRET` создаёт domain-separated visitor binding.
- Новый audit редактирует только top-level `pageToken`; старые JSONL rows не мигрируются.
- `/api/decision` остаётся `200 text/plain URL`; `/submit` остаётся `303 Location`.
- Исторические `docs/task-plans/main-mintlify-documentation/` и прежний Mintlify design spec не переписываются.
- One-time claim, idempotent retry storage, key rotation и distributed replay protection остаются вне scope.
- Generated `dist/`, `data/*.jsonl`, `.env`, secrets и dependency caches не коммитятся.

## Execution analysis

- Milestone 1 сначала фиксирует token primitive и его boundary semantics независимо от Fastify.
- Milestone 2 подключает primitive к scoring, audit и HTTP pipeline; он зависит от точных interfaces Milestone 1.
- Milestone 3 синхронизирует только текущую product documentation после стабилизации runtime behavior.
- Milestone 4 выполняет полный release gate и записывает фактические результаты, test count и audit distinction.
- Каждый milestone использует loop: failing test -> minimal implementation -> targeted validation -> status update -> checkpoint commit.

## Assumptions

- Выполнение продолжится на текущей ветке `main`; push не входит в scope.
- Baseline перед planning pack был clean, `main` опережал `origin/main` на design-spec commit `a7bb8eb`.
- Текущий baseline: 4 test files и 20 tests; полный `npm audit` показывает 12 moderate dev advisories, runtime-only audit — 0.
- `docs:validate` проверяет структуру, но semantic drift дополнительно контролируется `rg` checks из Milestone 3.
- Jaidu reference templates отсутствуют; pack следует существующему repo convention.

## File map

Create:

- `PATCH_NOTES.md` — точный scope, exclusions и verification evidence security patch.
- `docs/task-plans/main-page-token-security/{plans,status,test-plan}.md` — durable execution state.

Modify runtime:

- `src/domain/types.ts` — добавить `visitor_mismatch` в `PageTokenStatus`.
- `src/security/page-token.ts` — issue/verify versioned bound token.
- `src/services/decision-service.ts` — передавать visitor context и secrets verifier-у.
- `src/telemetry/request-signals.ts` — использовать verified `iat` и HMAC `jti`.
- `src/telemetry/normalize.ts` — redact top-level raw token.
- `src/scoring/rules.ts` — valid delta `0`, mismatch delta `+35`.
- `src/scoring/policy.ts` — valid-token eligibility gate.
- `src/app.ts` — issue bound token и добавить landing security headers.
- `.env.example` — исправить комментарий про все три secrets.

Modify tests:

- `tests/page-token.test.ts` — primitive, boundaries, malformed input, binding.
- `tests/scoring.scenarios.test.ts` — eligibility для всех invalid statuses.
- `tests/app.test.ts` — direct POST, copied token, audit redaction, headers.

Modify current documentation:

- `README.md`.
- `docs/reviewer/{architecture,signals,scoring,edge-cases,testing,tradeoffs}.mdx`.
- `docs/integrator/{configuration,request-lifecycle,audit-log,privacy-and-security,troubleshooting}.mdx`.
- `docs/api-reference/{overview.mdx,openapi.yaml}`.
- `docs/reviewer/evaluation-guide.mdx` только если exact test count или audit wording требует обновления.

---

## Milestone 1: Bound page-token primitive

**Status:** `[ ]`

**Goal:** Выпускать и проверять versioned token с embedded expiry и binding к visitor ID.

**Risk:** Ошибка boundary comparison или binding input может принимать expired/copied token либо отклонять normal submit.

**Stop-and-fix:** Не подключать primitive к `DecisionService`, пока targeted unit suite не проходит и tampered/copied/future/malformed tokens не имеют ожидаемые statuses.

### Task 1.1: Specify token contract with failing tests

**Files:**
- Modify: `tests/page-token.test.ts`
- Modify later in milestone: `src/domain/types.ts`, `src/security/page-token.ts`

**Interfaces:**
- Produces: `issuePageToken(nowMs, ttlMs, visitorId, signingSecret, bindingSecret): string`.
- Produces: `verifyPageToken(token, nowMs, visitorId, hadValidVisitCookie, signingSecret, bindingSecret): PageTokenVerification`.

- [ ] **Step 1: Replace the old helper calls with the new contract**

Use these shared fixtures and helpers:

```ts
const signingSecret = "test-page-token-secret-long-enough";
const bindingSecret = "test-binding-secret-long-enough-for-use";
const visitorId = "visitor-a";
const ttlMs = 60_000;

function issue(nowMs = 10_000): string {
  return issuePageToken(nowMs, ttlMs, visitorId, signingSecret, bindingSecret);
}

function verify(
  token: string | undefined,
  nowMs = 11_500,
  currentVisitorId = visitorId,
  hadValidVisitCookie = true
) {
  return verifyPageToken(
    token,
    nowMs,
    currentVisitorId,
    hadValidVisitCookie,
    signingSecret,
    bindingSecret
  );
}
```

- [ ] **Step 2: Add exact security and boundary cases**

The suite must assert:

```ts
expect(verify(issue()).status).toBe("valid");
expect(verify(issue(), 70_000).status).toBe("expired");
expect(verify(issue(100_000), 69_999).status).toBe("future");
expect(verify("not-a-token").status).toBe("malformed");
expect(verify("x".repeat(4_097)).status).toBe("malformed");
expect(verify(issue(), 11_500, "visitor-b").status).toBe("visitor_mismatch");
expect(verify(issue(), 11_500, visitorId, false).status).toBe("visitor_mismatch");
```

Keep the signature-tampering test, but replace the last character with a guaranteed different character:

```ts
const token = issue();
const replacement = token.endsWith("a") ? "b" : "a";
expect(verify(`${token.slice(0, -1)}${replacement}`).status).toBe("invalid_signature");
```

Expiry semantics are explicit: `nowMs >= exp` is expired.

- [ ] **Step 3: Run the new suite and confirm red**

```bash
npm test -- tests/page-token.test.ts
```

Expected: compile/test failure because old issue/verify signatures and payload do not support binding or embedded expiry.

### Task 1.2: Implement strict token issue and verification

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/security/page-token.ts`
- Test: `tests/page-token.test.ts`

**Interfaces:**
- Consumes: fixtures and signatures from Task 1.1.
- Produces: verified `PageTokenPayload` with `{ v: 1; jti: string; iat: number; exp: number; binding: string }`.

- [ ] **Step 1: Extend the status union**

Add exactly:

```ts
export type PageTokenStatus =
  | "valid"
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "future"
  | "visitor_mismatch";
```

- [ ] **Step 2: Replace the token payload and public signatures**

Use these constants and types in `src/security/page-token.ts`:

```ts
const TOKEN_VERSION = 1;
const MAX_TOKEN_LENGTH = 4_096;
const MAX_TOKEN_LIFETIME_MS = 86_400_000;
const FUTURE_SKEW_MS = 30_000;

export interface PageTokenPayload {
  v: 1;
  jti: string;
  iat: number;
  exp: number;
  binding: string;
}
```

Issue a 16-byte base64url `jti`, validate safe integer inputs, calculate
`binding = HMAC-SHA256(bindingSecret, "page-token-binding\\0" + visitorId + "\\0" + jti)`,
and sign the encoded JSON with `signingSecret`.

- [ ] **Step 3: Parse and verify in security order**

Implement this order without returning untrusted payload before signature verification:

```ts
if (!token) return { status: "missing" };
if (token.length > MAX_TOKEN_LENGTH) return { status: "malformed" };
// require exactly encodedPayload.signature
// compare the canonical HMAC string with timingSafeEqual after equal-length check
// parse and validate v, jti, iat, exp and binding
if (payload.iat > nowMs + FUTURE_SKEW_MS) return { status: "future", payload };
if (nowMs >= payload.exp) return { status: "expired", payload };
if (!hadValidVisitCookie) return { status: "visitor_mismatch", payload };
// recompute and timing-safe compare binding
return { status: "valid", payload };
```

Parser requirements: safe integer non-negative `iat`; safe integer `exp > iat`;
lifetime at most 24 hours; `jti` length `20..64`; binding length `32..128`; object
must not be an array.

- [ ] **Step 4: Run targeted tests and typecheck**

```bash
npm test -- tests/page-token.test.ts
npm run typecheck
git diff --check
```

Expected: 8 page-token tests pass; typecheck and diff check exit 0.

- [ ] **Step 5: Update status and commit Milestone 1**

```bash
git add src/domain/types.ts src/security/page-token.ts tests/page-token.test.ts docs/task-plans/main-page-token-security/status.md
git commit -m "security: bind page tokens to visitor sessions"
```

**Definition of done:** Token primitive rejects expired-at-boundary, future, malformed, oversized, tampered, copied and cookie-less inputs; same-session token verifies.

---

## Milestone 2: Decision, audit and HTTP integration

**Status:** `[ ]`

**Goal:** Подключить bound token ко всему request pipeline и harden landing response.

**Risk:** Policy ordering может превратить automation block в whitepage; redaction может удалить диагностические поля или пропустить credential.

**Stop-and-fix:** Не обновлять docs, пока targeted scoring and HTTP suites не подтверждают external contract, eligibility, binding и audit shape.

### Task 2.1: Add eligibility and verified-signal tests

**Files:**
- Modify: `tests/scoring.scenarios.test.ts`
- Modify later: `src/scoring/policy.ts`, `src/scoring/rules.ts`, `src/services/decision-service.ts`, `src/telemetry/request-signals.ts`

- [ ] **Step 1: Add the policy matrix**

Add one table-driven test over:

```ts
const ineligibleStatuses: PageTokenStatus[] = [
  "missing",
  "malformed",
  "invalid_signature",
  "expired",
  "future",
  "visitor_mismatch"
];
```

For each status, build otherwise-clean input and assert `WHITEPAGE` plus
`VALID_PAGE_TOKEN_REQUIRED`. Preserve the existing test that a multi-group
automation case can still produce `BLOCK` before the eligibility gate.

- [ ] **Step 2: Confirm the policy test is red**

```bash
npm test -- tests/scoring.scenarios.test.ts
```

Expected: at least the missing/expired cases fail because current policy can still reach `OFFER`.

### Task 2.2: Wire token verification into decision and scoring

**Files:**
- Modify: `src/services/decision-service.ts`
- Modify: `src/telemetry/request-signals.ts`
- Modify: `src/scoring/rules.ts`
- Modify: `src/scoring/policy.ts`
- Test: `tests/scoring.scenarios.test.ts`

- [ ] **Step 1: Pass visitor context to verification**

Call the Milestone 1 interface exactly:

```ts
verifyPageToken(
  payload.pageToken,
  nowMs,
  context.visitorId,
  context.hadValidVisitCookie,
  this.config.pageTokenSecret,
  this.config.hashSecret
);
```

- [ ] **Step 2: Trust timing only after complete verification**

In `buildServerSignals`, derive `serverDwellMs` from `payload.iat` only when
`tokenVerification.status === "valid"`. Hash `payload.jti` with the existing
`hmacHex(config.hashSecret, "token:" + jti)` domain for replay history.

- [ ] **Step 3: Update scoring and policy**

Return `VALID_PAGE_TOKEN` with delta `0`; return
`PAGE_TOKEN_VISITOR_MISMATCH` with automation delta `35`. Insert this policy
branch after existing block branches and before coverage:

```ts
if (input.server.pageTokenStatus !== "valid") {
  return { decision: "WHITEPAGE", primaryReason: "VALID_PAGE_TOKEN_REQUIRED" };
}
```

- [ ] **Step 4: Verify scoring integration**

```bash
npm test -- tests/scoring.scenarios.test.ts tests/page-token.test.ts
npm run typecheck
git diff --check
```

Expected: token primitive and all scoring cases pass; clean user remains `OFFER`.

### Task 2.3: Redact audit body and harden HTTP issuance

**Files:**
- Modify: `tests/app.test.ts`
- Modify: `src/telemetry/normalize.ts`
- Modify: `src/app.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add failing HTTP assertions**

Extend the successful landing/decision test to assert:

```ts
expect(landing.headers["cache-control"]).toBe("private, no-store");
expect(landing.headers["content-security-policy"]).toContain("form-action 'self'");
expect(landing.headers["x-frame-options"]).toBe("DENY");
expect(records[0]?.incoming.rawBody).toMatchObject({
  state: "CA",
  pageToken: "[REDACTED]"
});
expect(JSON.stringify(records[0]?.incoming.rawBody)).not.toContain(pageToken);
```

Add a direct POST without token and a copied-token/different-cookie HTTP case;
both must return `whitepageUrl` with the existing URL-only response contract.

- [ ] **Step 2: Confirm HTTP tests are red**

```bash
npm test -- tests/app.test.ts
```

Expected: headers, redaction, direct POST or copied-token assertions fail before integration.

- [ ] **Step 3: Add pure shallow redaction**

Export and use:

```ts
export function redactDecisionBody(rawBody: unknown): unknown {
  const source = asRecord(rawBody);
  if (!source || !("pageToken" in source)) return rawBody;
  return { ...source, pageToken: "[REDACTED]" };
}
```

Apply it to both object and non-object normalization return paths. Do not mutate
the request object and do not recursively rewrite telemetry.

- [ ] **Step 4: Issue the bound token and add headers**

`GET /` must retain the resolved visitor and call:

```ts
issuePageToken(
  clock(),
  config.pageTokenTtlMs,
  visitor.id,
  config.pageTokenSecret,
  config.hashSecret
);
```

Set `Cache-Control: private, no-store`, `X-Frame-Options: DENY`, and this CSP:

```text
default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'
```

Change `.env.example` wording from “both secrets” to “all secrets”.

- [ ] **Step 5: Verify and commit Milestone 2**

```bash
npm test -- tests/app.test.ts tests/scoring.scenarios.test.ts tests/page-token.test.ts
npm run typecheck
git diff --check
git add .env.example src/app.ts src/services/decision-service.ts src/telemetry/normalize.ts src/telemetry/request-signals.ts src/scoring/policy.ts src/scoring/rules.ts tests/app.test.ts tests/scoring.scenarios.test.ts docs/task-plans/main-page-token-security/status.md
git commit -m "security: enforce page-token offer eligibility"
```

Expected after Milestone 2: 4 files and 33 tests pass when the full suite is run.

**Definition of done:** Direct/copy submissions cannot reach offer; valid JS flow still does; no-JS remains a `303`; new audit body redacts token; landing headers are hardened.

---

## Milestone 3: Current documentation synchronization

**Status:** `[ ]`

**Goal:** Сделать README, Mintlify и OpenAPI точным отражением новой runtime policy.

**Risk:** Static validation passes even when prose retains obsolete semantics.

**Stop-and-fix:** Не переходить к release gate, пока semantic scans не находят current-doc claims `valid=-5`, unbound token или invalid-token offer eligibility.

### Task 3.1: Update product documentation and patch notes

**Files:**
- Create: `PATCH_NOTES.md`
- Modify: `README.md`
- Modify: current docs listed in File map

- [ ] **Step 1: Update token and policy descriptions**

Across current docs, state consistently:

```text
token payload = { v, jti, iat, exp, binding }
valid token automation delta = 0
missing / forged / expired / visitor-mismatched token => OFFER ineligible
server dwell exists only for fully valid token
```

Describe `HASH_SECRET` as serving both HMAC history identifiers and the
domain-separated visitor binding. Preserve the warning that a valid token does
not prove humanity and replay is not atomically claimed.

- [ ] **Step 2: Update audit and HTTP documentation**

State that new raw bodies replace top-level `pageToken` with `[REDACTED]`, while
raw server IP is still stored. Update landing cache header to
`private, no-store`; document CSP/frame protection without changing decision
endpoint contracts.

- [ ] **Step 3: Create accurate patch notes**

`PATCH_NOTES.md` must list included/excluded mechanisms, exact verification
commands, 33-test expectation, and separate dependency statements:

```text
npm audit                -> dev-inclusive result recorded separately
npm audit --omit=dev     -> runtime vulnerability result
```

Do not claim “0 known vulnerabilities” for the full dependency tree while dev advisories exist.

- [ ] **Step 4: Update OpenAPI invariants**

Change `GET /` cache header schema from `const: no-store` to
`const: private, no-store`; add CSP and frame headers; describe page token as
same-visitor required. Change `/api/decision` prose so invalid token is an
eligibility failure rather than only a risk adjustment.

- [ ] **Step 5: Run structural and semantic checks**

```bash
npm run docs:validate
if rg -n 'Valid page token.*-5|Валидный page token.*-5|не связан криптографически|Invalid token.*не.*абсолют|invalid token.*не.*absolute|raw request body.*полностью' README.md docs/reviewer docs/integrator docs/api-reference; then exit 1; fi
rg -n 'visitor_mismatch|VALID_PAGE_TOKEN_REQUIRED|private, no-store|\[REDACTED\]' README.md docs/reviewer docs/integrator docs/api-reference PATCH_NOTES.md
git diff --check
```

Expected: first scan produces no matches; second scan proves the new invariants are documented; validation and diff check exit 0.

- [ ] **Step 6: Update status and commit Milestone 3**

```bash
git add PATCH_NOTES.md README.md docs/reviewer docs/integrator docs/api-reference docs/task-plans/main-page-token-security/status.md
git commit -m "docs: document bound page-token security"
```

**Definition of done:** All current public docs and OpenAPI describe the same token, policy, audit and header behavior as runtime; historical plans remain unchanged.

---

## Milestone 4: Release verification

**Status:** `[ ]`

**Goal:** Подтвердить полный regression gate и записать воспроизводимые evidence.

**Risk:** Passing unit tests do not prove docs semantics, build cleanliness or live HTTP headers.

**Stop-and-fix:** Любая failure, unexpected test count, generated tracked file или current-doc contradiction возвращает работу в owning milestone.

### Task 4.1: Run full automated gates

**Files:**
- Modify: `docs/task-plans/main-page-token-security/status.md`
- Verify: all task-owned source, test and docs files

- [ ] **Step 1: Run clean automated checks**

```bash
npm test
npm run typecheck
npm run build
npm run docs:validate
npm audit --json
npm audit --omit=dev --json
git diff --check
git status --short
```

Expected: 4 files/33 tests pass; typecheck/build/docs/diff pass; runtime audit has
0 vulnerabilities; full audit reports dev-only advisories accurately; no
generated or unrelated changes appear.

- [ ] **Step 2: Run focused security regressions**

```bash
npm test -- tests/page-token.test.ts tests/scoring.scenarios.test.ts tests/app.test.ts
```

Expected: all token, eligibility, redaction, security-header and HTTP contract tests pass.

- [ ] **Step 3: Smoke the built app**

Start `npm start` with demo configuration, then verify in another shell:

```bash
curl -fsSI http://127.0.0.1:3000/ | rg -i 'cache-control: private, no-store|content-security-policy:|x-frame-options: DENY'
curl -fsS http://127.0.0.1:3000/health
```

Expected: all three security headers are present and health returns `{ "status": "ok" }`.
Stop the process after smoke and ensure no unintended audit row is tracked.

- [ ] **Step 4: Record exact evidence**

Update `status.md` with commands, exit results, exact test count, full/runtime
audit summaries, smoke results and checkpoint hashes. Mark milestones complete
only after their gates pass.

- [ ] **Step 5: Commit verification record**

```bash
git add docs/task-plans/main-page-token-security/status.md docs/task-plans/main-page-token-security/test-plan.md
git commit -m "docs: record page-token security verification"
```

**Definition of done:** Runtime, tests, docs and live HTTP behavior pass all acceptance gates; status contains enough evidence for a fresh reviewer to reproduce them.

