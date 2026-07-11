# Page-token Security Hardening Test Plan

## Scope

Validate token structure/signature/expiry/binding, offer eligibility, trusted
server timing, raw-token redaction, landing security headers, unchanged HTTP
contracts and synchronized current documentation.

## Out of scope

- Atomic one-time token consumption and idempotent retries.
- Distributed replay/velocity coordination.
- Keyring rotation or migration of legacy audit rows.
- Browser automation executing the real `public/telemetry.js`.
- Production load, multi-process JSONL safety and legal/privacy approval.

## Test levels

### 1. Token unit tests

```bash
npm test -- tests/page-token.test.ts
```

Required cases:

| Case | Expected status |
|---|---|
| Same visitor, valid cookie, before expiry | `valid` |
| Signature byte changed | `invalid_signature` |
| `nowMs === exp` | `expired` |
| `iat > nowMs + 30_000` | `future` |
| Non-token string | `malformed` |
| Length 4097 | `malformed` |
| Different visitor ID | `visitor_mismatch` |
| Missing/invalid signed cookie flag | `visitor_mismatch` |

Also assert issue rejects negative/unsafe time and TTL outside `1..86_400_000`
if implementation exposes those guards to unit calls.

### 2. Pure scoring/policy tests

```bash
npm test -- tests/scoring.scenarios.test.ts
```

For each of `missing`, `malformed`, `invalid_signature`, `expired`, `future` and
`visitor_mismatch`, otherwise-clean input must return:

```ts
{
  decision: "WHITEPAGE",
  primaryReason: "VALID_PAGE_TOKEN_REQUIRED"
}
```

Existing regression requirements remain:

- clean same-session user -> `OFFER`;
- headless multi-group automation -> `BLOCK`;
- extreme burst -> `BLOCK`;
- one correlated automation group alone -> `WHITEPAGE`;
- VPN, geo mismatch, no mouse movement and normal repeat remain weak/neutral.

### 3. Fastify integration tests

```bash
npm test -- tests/app.test.ts
```

| Flow | Expected |
|---|---|
| `GET /` | signed cookie, bound token, `private, no-store`, CSP, `DENY` |
| Same-cookie JSON submit | `200 text/plain`, configured offer URL |
| Direct JSON POST without token | configured whitepage URL |
| Token copied to another valid cookie | configured whitepage URL |
| Native same-cookie form | `303 Location`, empty body, normally whitepage from low coverage |
| Successful audit | raw top-level token is `[REDACTED]`; literal token absent |
| Malformed JSON | URL-only fail-safe and synthetic audit preserved |
| Invalid state | configured block URL without internal details |

### 4. Repository compatibility

```bash
npm test -- tests/repository.test.ts
```

Pass: legacy-compatible JSONL rows still load; history lookup uses the HMAC token
identifier without requiring raw token persistence.

### 5. Full code regression

```bash
npm test
npm run typecheck
npm run build
test ! -d dist/tests
```

Pass: 4 files and 33 tests; typecheck/build exit 0; source-only build emits no tests.

### 6. Documentation structure and semantics

```bash
npm run docs:validate
if rg -n 'Valid page token.*-5|Валидный page token.*-5|не связан криптографически|Invalid token.*не.*абсолют|invalid token.*не.*absolute|raw request body.*полностью' README.md docs/reviewer docs/integrator docs/api-reference; then exit 1; fi
rg -n 'visitor_mismatch|VALID_PAGE_TOKEN_REQUIRED|private, no-store|\[REDACTED\]' README.md docs/reviewer docs/integrator docs/api-reference PATCH_NOTES.md
```

Pass: Mintlify/OpenAPI validate; obsolete claims are absent from current docs;
new eligibility, binding, redaction and cache semantics are present. Historical
`docs/task-plans/main-mintlify-documentation/` and prior specs are excluded from
semantic scans intentionally.

### 7. Dependency audit reporting

```bash
npm audit --json
npm audit --omit=dev --json
```

Pass criterion is accurate reporting, not hiding dev advisories. Runtime audit
must remain at zero; full audit result is recorded exactly in `status.md` and
`PATCH_NOTES.md`.

## Negative cases

- Token signed for visitor A must not verify for visitor B.
- A missing cookie must not become valid merely because the route creates a new cookie.
- Invalid/future/expired token must not provide server dwell.
- Valid token must not reduce automation risk below zero or serve as human evidence.
- Invalid token must not override a stronger existing `BLOCK` branch.
- Redaction must not mutate the incoming object or erase state/telemetry diagnostics.
- CSP must allow the external same-origin `/telemetry.js` and same-origin fetch/form while denying other default sources.
- OpenAPI must not model `/api/decision` as JSON or `/submit` as `200`.
- Docs must not claim raw IP is removed; only raw page token is redacted.
- Historical planning files must not be rewritten to pretend the previous policy never existed.

## Boundary table

| Boundary | Expected |
|---|---|
| Token length `4096` | Parsed according to shape/signature |
| Token length `4097` | `malformed` |
| Lifetime `86_400_000` | Accepted by issuer |
| Lifetime `86_400_001` | Issuer throws |
| `iat = now + 30_000` | Not `future`; dwell omitted if `iat > now` |
| `iat = now + 30_001` | `future` |
| `now = exp - 1` | `valid` when all other checks pass |
| `now = exp` | `expired` |

## Smoke test

After `npm run build`, start `npm start` and verify:

```bash
curl -fsSI http://127.0.0.1:3000/ | rg -i 'cache-control: private, no-store|content-security-policy:|x-frame-options: DENY'
curl -fsS http://127.0.0.1:3000/health
```

Manual/HTTP-client checks:

- `[ ]` Normal landing and submit return the offer URL only.
- `[ ]` Reusing the token with a fresh visitor cookie returns whitepage.
- `[ ]` Submitting without JavaScript preserves `303 Location`.
- `[ ]` Latest audit row contains `[REDACTED]` instead of the literal token.
- `[ ]` No smoke-generated `data/audit.jsonl` change is staged.

## Acceptance gates

Before each milestone commit:

- targeted red/green evidence recorded in `status.md`;
- relevant tests and `git diff --check` pass;
- only milestone-owned files are staged;
- pending or skipped checks are explicit.

Release readiness:

- token, policy, app and repository suites pass;
- full suite reports 33/33 once;
- typecheck, build and Mintlify validation pass;
- semantic documentation scans pass;
- runtime dependency audit remains zero and full audit is reported accurately;
- live headers and health smoke pass;
- git status contains only intended task-pack or checkpoint changes;
- no secret, raw generated token, audit data or generated output is committed.

## Evidence to record

Record exact commands, exit codes, test counts, token boundary outcomes,
Mintlify result, full/runtime audit summaries, HTTP smoke output, checkpoint hashes
and any skipped/manual checks in `status.md`.
