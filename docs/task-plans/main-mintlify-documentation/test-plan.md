# Mintlify Documentation Test Plan

## Scope

Validate reproducible installation, code checks, Mintlify content, OpenAPI accuracy, audience navigation and the dual-server local demo.

## Out of scope

- Deployment to `*.mintlify.app`, GitHub App, custom domain and DNS.
- Mintlify authentication or personalization.
- Runtime policy management.
- Production load or multi-process storage testing.

## Test levels

### 1. Clean install

```bash
tmp_dir=$(mktemp -d)
cp package.json package-lock.json "$tmp_dir/"
npm ci --ignore-scripts --cache="$tmp_dir/npm-cache" --prefix="$tmp_dir" --registry=https://registry.npmjs.org
test -x "$tmp_dir/node_modules/.bin/mint"
if rg -n 'packages\.applied-caas-gateway1|internal\.api\.openai\.org' package-lock.json; then exit 1; fi
```

Pass: clean install exits 0, Mint CLI exists, private hosts are absent.

### 2. Code regression

```bash
npm test
npm run typecheck
npm run build
test ! -d dist/tests
```

Pass:

- source test files execute once;
- 19 existing tests plus new contract tests pass;
- typecheck and build exit 0;
- production build does not emit `dist/tests`.

### 3. HTTP contract

| Behavior | Expected |
|---|---|
| `GET /health` | `200 application/json`, `{ "status": "ok" }` |
| `POST /api/decision` | `200 text/plain`, exact configured destination URL |
| Internal details | `score`, `reason`, `decision`, `signals` absent |
| `POST /submit` | `303`, exact `Location`, empty body, `no-store` |
| Malformed JSON | Destination contract preserved; audit written when storage works |
| Invalid state | Block URL without internal details |
| Invalid token | `+35` documented; no absolute offer-prohibition assertion |

```bash
npm test -- tests/app.test.ts tests/page-token.test.ts tests/scoring.scenarios.test.ts
```

### 4. Mintlify static validation

```bash
npm run docs:validate
```

Pass: `docs.json`, navigation, frontmatter, MDX and OpenAPI validate.

### 5. Content completeness

```bash
for file in \
  docs/index.mdx \
  docs/reviewer/evaluation-guide.mdx \
  docs/reviewer/architecture.mdx \
  docs/reviewer/signals.mdx \
  docs/reviewer/scoring.mdx \
  docs/reviewer/edge-cases.mdx \
  docs/reviewer/testing.mdx \
  docs/reviewer/tradeoffs.mdx \
  docs/reviewer/ai-usage.mdx \
  docs/integrator/quickstart.mdx \
  docs/integrator/configuration.mdx \
  docs/integrator/request-lifecycle.mdx \
  docs/integrator/audit-log.mdx \
  docs/integrator/privacy-and-security.mdx \
  docs/integrator/troubleshooting.mdx \
  docs/api-reference/overview.mdx \
  docs/api-reference/openapi.yaml; do
  test -s "$file" || exit 1
done

if rg -n 'TBD|TODO|FIXME|chatgpt\.com/c/' README.md docs/reviewer docs/integrator docs/api-reference; then exit 1; fi
```

## Critical fixtures

Reviewer mapping:

- page token → `src/security/page-token.ts` → `tests/page-token.test.ts`;
- scoring → `src/scoring/` → `tests/scoring.scenarios.test.ts`;
- audit/history → `src/storage/decision-repository.ts` → `tests/repository.test.ts`;
- HTTP contract → `src/app.ts` → `tests/app.test.ts`.

Required scoring cases:

1. Clean live user → `OFFER`.
2. Fast clicker → `WHITEPAGE`.
3. Headless bot without mouse → `BLOCK`.
4. Live VPN user → `OFFER`.
5. Slow mobile user → `OFFER`.
6. Suspicious fingerprint/device values → `WHITEPAGE`.
7. JavaScript disabled → `WHITEPAGE`.
8. Repeat fingerprint without burst → `OFFER`.

Page token table:

| Status | Delta |
|---|---:|
| valid | `-5` |
| missing | `+15` |
| expired | `+5` |
| malformed | `+35` |
| future | `+35` |
| invalid signature | `+35` |

## Negative cases

- Mintlify preview must not use port 3000.
- Navigation must not use a reserved standalone `API` title.
- Docs must not claim policy versioning, shadow mode or cohorts are implemented.
- OpenAPI must not model `/api/decision` as JSON or `/submit` as `200`.
- Docs must not claim raw IP is absent from current audit.
- Docs must not describe client fingerprint as trusted.
- README must remain sufficient for basic startup.
- Lock file must not contain private registry URLs.
- Test output must not include `dist/tests` copies.

## Dual-server smoke

Start separately:

```bash
npm run dev
npm run docs:dev
```

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3333/ > /tmp/mintlify-smoke.html
rg -n 'Pre-lander Scoring Gate' /tmp/mintlify-smoke.html
```

Manual checks:

- `[ ]` Overview routes to three destinations.
- `[ ]` Solution review contains the 10-minute guide.
- `[ ]` Integration contains quickstart, config, lifecycle, audit, privacy and troubleshooting.
- `[ ]` API reference displays overview and operations.
- `[ ]` Russian titles render correctly.
- `[ ]` Internal links and code paths resolve.
- `[ ]` JS submit returns offer URL and writes audit.
- `[ ]` No-JS submit returns `303` to whitepage and writes audit.
- `[ ]` Preview processes stop cleanly.

## Acceptance gates

Before each milestone commit:

- targeted checks pass or are recorded as pending/blocked in `status.md`;
- `git diff --check` passes;
- only milestone-owned files are staged;
- `status.md` records validation and commit boundary.

Release/demo readiness:

- clean public `npm ci` passes;
- all unique and contract tests pass once;
- typecheck and source-only build pass;
- `npm run docs:validate` passes;
- dual-server smoke passes on 3000/3333;
- manual navigation passes;
- README remains autonomous;
- no private URL, placeholder, generated output, audit data or secret is included.

## Evidence to record

Record exact commands, exit statuses, test counts, Mint CLI version, OpenAPI result, preview URLs, manual smoke results, commit hashes and skipped-check reasons in `status.md`.
