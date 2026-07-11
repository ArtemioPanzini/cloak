# Mintlify Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать русскоязычный Mintlify-сайт в `docs/` с отдельными маршрутами проверяющему и интегратору, точным OpenAPI-контрактом и воспроизводимой локальной проверкой.

**Architecture:** Mintlify работает из подпапки `docs/` как monorepo documentation root. MDX разделён на reviewer, integrator и API reference; TypeScript-код остаётся источником runtime-поведения, ручной OpenAPI 3.1 YAML — источником транспортного контракта, а contract tests контролируют внешние инварианты.

**Tech Stack:** Mintlify CLI `mint@4.2.687`, MDX, `docs.json`, OpenAPI 3.1 YAML, Node.js 20+, TypeScript, Fastify, Vitest.

## Global Constraints

- Документация на русском; HTTP-термины, field names и decision names остаются на английском, когда это точнее.
- Documentation root — `docs/`; будущий Mintlify monorepo path — `/docs`.
- Приложение использует порт `3000`, Mintlify preview — `3333`.
- Runtime scoring policy не меняется ради документации.
- Invalid page token документируется как `+35` риска, а не как абсолютный запрет `OFFER`.
- Runtime policy management, shadow mode и cohorts не описываются как существующие функции.
- `/api/decision` — `200 text/plain` с единственным URL; `/submit` — `303 Location`.
- `README.md` остаётся автономной точкой входа.
- Generated output, `data/*.jsonl`, `.env`, secrets и caches не коммитятся.

## Execution analysis

- Milestone 1 устраняет приватные registry URL и повторный запуск `dist/tests`.
- Milestone 2 создаёт минимально валидный Mintlify shell.
- Milestones 3 и 4 добавляют reviewer и integrator content отдельными checkpoints.
- Milestone 5 добавляет OpenAPI после согласования терминологии в prose pages.
- Milestone 6 синхронизирует README и выполняет release gates.

## Assumptions

- `mint@4.2.687` закреплён на время реализации.
- Mintlify deployment и GitHub App не входят в scope.
- `mint validate` — основной docs/OpenAPI validator.
- Jaidu template files отсутствуют; pack следует структуре `SKILL.md`.
- Выполнение идёт на `main`; push требует отдельного запроса.

## File map

Create:

- `tsconfig.build.json`, `vitest.config.ts`;
- `docs/docs.json`, `docs/index.mdx`;
- восемь файлов в `docs/reviewer/`;
- шесть файлов в `docs/integrator/`;
- `docs/api-reference/overview.mdx`, `docs/api-reference/openapi.yaml`.

Modify:

- `package.json`, `package-lock.json`, `tests/app.test.ts`, `README.md`;
- `docs/task-plans/main-mintlify-documentation/status.md` после каждого milestone.

---

## Milestone 1: Reproducible toolchain

**Status:** `[x]`

**Goal:** Обеспечить публичный clean install, source-only build и уникальный test discovery.

**Risk:** Lock regeneration может изменить transitive dependencies; Mint CLI увеличивает dev dependency tree.

**Stop-and-fix:** Не переходить к docs shell, пока clean `npm ci` не использует публичные URL и tests не запускаются по одному разу.

### Task 1.1: Build and test boundaries

**Files:**
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Modify: `package.json`

**Produces:** `docs:dev`, `docs:validate`, source-only build, exclusion `dist/**`.

- [x] **Step 1: Capture the failing baseline**

```bash
npm run build
npm test
```

Expected before fix: `dist/tests` exists and Vitest can report 8 files/38 executions rather than 4 files/19 unique tests.

- [x] **Step 2: Create source-only build config**

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist/src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests", "dist", "node_modules"]
}
```

- [x] **Step 3: Exclude generated tests**

`vitest.config.ts`:

```ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**"]
  }
});
```

- [x] **Step 4: Update scripts and pin Mint CLI**

Set these `package.json` values:

```json
{
  "scripts": {
    "build": "node --eval \"require('node:fs').rmSync('dist', { recursive: true, force: true })\" && tsc -p tsconfig.build.json",
    "docs:dev": "cd docs && mint dev --port 3333",
    "docs:validate": "cd docs && mint validate"
  },
  "devDependencies": {
    "mint": "4.2.687"
  }
}
```

Preserve all other scripts and dependencies unchanged.

- [x] **Step 5: Verify boundaries**

```bash
npm run build
test ! -d dist/tests
npm test
npm run typecheck
```

Expected: no `dist/tests`; 4 files and 19 tests pass; typecheck/build exit 0.

### Task 1.2: Public package lock

**Files:**
- Modify: `package-lock.json`

- [x] **Step 1: Preserve the stale lock outside Git**

```bash
mv package-lock.json /tmp/prelander-package-lock.internal.json
```

- [x] **Step 2: Generate from public npm**

```bash
npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org
```

Expected: new lock includes `mint@4.2.687`.

- [x] **Step 3: Reject private hosts**

```bash
if rg -n 'packages\.applied-caas-gateway1|internal\.api\.openai\.org' package-lock.json; then exit 1; fi
```

Expected: no output, exit 0.

- [x] **Step 4: Test with empty cache**

```bash
tmp_dir=$(mktemp -d)
cp package.json package-lock.json "$tmp_dir/"
npm ci --ignore-scripts --cache="$tmp_dir/npm-cache" --prefix="$tmp_dir" --registry=https://registry.npmjs.org
test -x "$tmp_dir/node_modules/.bin/mint"
```

Expected: install exits 0; Mint binary exists.

- [x] **Step 5: Validate milestone**

```bash
npm ci --registry=https://registry.npmjs.org
npm test
npm run typecheck
npm run build
git diff --check
```

**Definition of done:** Public lock, pinned Mint CLI, docs scripts, source-only build, unique tests.

**Commit gate:**

```bash
git add package.json package-lock.json tsconfig.build.json vitest.config.ts docs/task-plans/main-mintlify-documentation
git commit -m "build: make docs toolchain reproducible"
```

---

## Milestone 2: Mintlify shell

**Status:** `[ ]`

**Goal:** Создать валидный docs root и базовую 60-секундную landing page без ссылок на ещё не созданные разделы.

**Risk:** Invalid schema или route path сломает preview.

**Stop-and-fix:** Не писать audience sections, пока `mint validate` и landing smoke не проходят.

### Task 2.1: Minimal config and landing

**Files:**
- Create: `docs/docs.json`
- Create: `docs/index.mdx`

- [ ] **Step 1: Create `docs.json`**

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "mint",
  "name": "Pre-lander Scoring Gate",
  "colors": {
    "primary": "#0F766E",
    "light": "#14B8A6",
    "dark": "#5EEAD4"
  },
  "navigation": {
    "tabs": [
      {
        "tab": "Обзор",
        "icon": "house",
        "pages": ["index"]
      }
    ]
  }
}
```

- [ ] **Step 2: Create the initial landing page**

Frontmatter:

```mdx
---
title: "Pre-lander Scoring Gate"
description: "Объяснимый pre-lander для оценки качества взаимодействия и выбора destination URL."
---
```

Body requirements:

- source-agnostic defensive boundary;
- five-step flow from landing request to audit;
- three short audience summaries without links; final linked cards are added in Milestone 6 after every destination exists;
- note that client signals are untrusted;
- no full quickstart and no weight table.

- [ ] **Step 3: Validate and preview**

```bash
npm run docs:validate
npm run docs:dev
```

Expected: validator exits 0; preview listens on 3333.

- [ ] **Step 4: Smoke landing in a second shell**

```bash
curl -fsS http://127.0.0.1:3333/ > /tmp/mintlify-index.html
rg -n 'Pre-lander Scoring Gate' /tmp/mintlify-index.html
```

**Definition of done:** Valid config, initial landing content, preview on 3333, no link to a missing route.

**Commit gate:**

```bash
git add docs/docs.json docs/index.mdx docs/task-plans/main-mintlify-documentation
git commit -m "docs: scaffold Mintlify navigation"
```

---

## Milestone 3: Reviewer documentation

**Status:** `[ ]`

**Goal:** Дать проверяющему reproducible checklist и полное объяснение rubric decisions.

**Risk:** Content может повторять README вместо reviewer workflow.

**Stop-and-fix:** Каждая страница отвечает на отдельный reviewer question и содержит проверяемые code/test links.

### Task 3.1: Evaluation and architecture

**Files:**
- Create: `docs/reviewer/evaluation-guide.mdx`
- Create: `docs/reviewer/architecture.mdx`

- [ ] **Step 1: Write evaluation guide**

Use title `Проверка решения за 10 минут`. Include exact commands `npm ci`, `npm test`, typecheck, build and dev; expected unique test count; JS/no-JS results; audit path; rubric-to-code mapping with these paths:

```text
src/security/page-token.ts -> tests/page-token.test.ts
src/scoring/ -> tests/scoring.scenarios.test.ts
src/storage/decision-repository.ts -> tests/repository.test.ts
src/app.ts -> tests/app.test.ts
```

- [ ] **Step 2: Write architecture page**

Include module responsibility table, pipeline, pure scorer/policy boundary, I/O orchestration, JSONL limitations and links to implementation/tests.

- [ ] **Step 3: Validate entry pages directly**

```bash
npm run docs:validate
rg -n 'src/security/page-token.ts|src/storage/decision-repository.ts' docs/reviewer/evaluation-guide.mdx
```

### Task 3.2: Signals, scoring and edge cases

**Files:**
- Create: `docs/reviewer/signals.mdx`
- Create: `docs/reviewer/scoring.mdx`
- Create: `docs/reviewer/edge-cases.mdx`

- [ ] **Step 1: Document signal categories**

Create server/client/history tables with signal, trust level, purpose, use and limitation. Explicitly cover VPN, geo mismatch, no mouse, unusual fingerprint, repeat visit and campaign parameters as weak/neutral evidence.

- [ ] **Step 2: Document exact scoring**

Copy current deltas from `src/scoring/rules.ts`, base intent `40`, coverage components, evidence groups and thresholds from `src/scoring/policy.ts`. State invalid/future/malformed token `+35` without absolute `OFFER` prohibition.

- [ ] **Step 3: Document required edge cases**

For each of the eight required scenarios include inputs, important adjustments, expected decision and false-positive rationale.

- [ ] **Step 4: Check numbers and scenarios**

```bash
rg -n '45|35|15|0\.60|75|40' docs/reviewer/scoring.mdx
npm test -- tests/scoring.scenarios.test.ts
npm run docs:validate
```

### Task 3.3: Testing, trade-offs and AI

**Files:**
- Create: `docs/reviewer/testing.mdx`
- Create: `docs/reviewer/tradeoffs.mdx`
- Create: `docs/reviewer/ai-usage.mdx`
- Modify: `docs/docs.json`

- [ ] **Step 1: Document tests**

Describe suites, eight required cases, 19-test baseline, HTTP/token/repository coverage, duplicate-test fix and gaps: browser E2E, isolated fingerprint case, real repeat-request integration and boundary tests.

- [ ] **Step 2: Document trade-offs**

Cover rules versus ML, JSONL, fingerprint, interaction-quality proxy, concurrency, enrichment and planned policy versioning clearly marked unimplemented.

- [ ] **Step 3: Document AI usage**

Describe AI-assisted tasks, rejected/corrected suggestions, human decisions and tests. Include only public share links; exclude `chatgpt.com/c/`.

- [ ] **Step 4: Add the complete reviewer tab**

Add tab `Проверка решения` with icon `clipboard-check` and groups:

```text
Быстрая проверка: reviewer/evaluation-guide
Дизайн решения: reviewer/architecture, reviewer/signals, reviewer/scoring, reviewer/edge-cases
Качество и процесс: reviewer/testing, reviewer/tradeoffs, reviewer/ai-usage
```

- [ ] **Step 5: Validate reviewer section**

```bash
npm run docs:validate
if rg -n 'TBD|TODO|FIXME|chatgpt\.com/c/' docs/reviewer; then exit 1; fi
```

**Definition of done:** Every assignment criterion maps to rationale, code and tests.

**Commit gate:**

```bash
git add docs/docs.json docs/reviewer docs/task-plans/main-mintlify-documentation
git commit -m "docs: add reviewer evaluation guide"
```

---

## Milestone 4: Integrator documentation

**Status:** `[ ]`

**Goal:** Дать точные startup, configuration, lifecycle, audit, privacy и troubleshooting guides.

**Risk:** Guides могут обещать production guarantees или planned features.

**Stop-and-fix:** Команды проверяются; recommendations отделяются от current behavior.

### Task 4.1: Quickstart and configuration

**Files:**
- Create: `docs/integrator/quickstart.mdx`
- Create: `docs/integrator/configuration.mdx`

- [ ] **Step 1: Write verified quickstart**

Include Node.js 20+, `npm ci`, optional `.env`, `npm run dev`, landing/health URLs, destination replacement, audit path, tests and development-secret warning.

- [ ] **Step 2: Write configuration reference**

Document every `.env.example`/`src/config.ts` variable with type, default, purpose, trust boundary and deployment note. Give extra detail to proxy, enrichment, cookie, body-size and destination settings.

- [ ] **Step 3: Verify config completeness**

```bash
for key in PORT HOST PUBLIC_BASE_URL PAGE_TOKEN_SECRET HASH_SECRET COOKIE_SECRET DATA_FILE OFFER_URL WHITEPAGE_URL BLOCK_URL PAGE_TOKEN_TTL_MS TRUST_PROXY TRUST_ENRICHMENT_HEADERS COOKIE_SECURE LOG_LEVEL MAX_BODY_BYTES; do rg -q "$key" docs/integrator/configuration.mdx || exit 1; done
npm run docs:validate
```

### Task 4.2: Lifecycle and audit

**Files:**
- Create: `docs/integrator/request-lifecycle.mdx`
- Create: `docs/integrator/audit-log.mdx`

- [ ] **Step 1: Write JS and no-JS lifecycles**

Use separate diagrams including cookie, token, telemetry, normalization, history, scoring, audit, URL navigation and `303` redirect.

- [ ] **Step 2: Write audit guide**

Document `DATA_FILE`, JSONL record categories, HMAC identifiers, raw body/IP, write chain, history rebuild, `audit:tail`, memory/linear lookup and single-process limits.

- [ ] **Step 3: Verify audit command and docs**

```bash
npm run audit:tail -- 2
npm run docs:validate
```

If observed empty-file behavior differs, correct the guide before commit.

### Task 4.3: Privacy and troubleshooting

**Files:**
- Create: `docs/integrator/privacy-and-security.mdx`
- Create: `docs/integrator/troubleshooting.mdx`
- Modify: `docs/docs.json`

- [ ] **Step 1: Write data categories and threat model**

Separate scoring, coverage/history and audit use. Cover untrusted telemetry, signed cookie/token, HMAC, spoofable fingerprint, raw IP, retention, replay, excluded invasive collection and hidden internal reasons.

- [ ] **Step 2: Write troubleshooting tree**

Cover ports, secrets, secure cookie, proxy trust, missing telemetry, malformed payload, unwritable storage, unexpected whitepage, audit inspection and docs preview.

- [ ] **Step 3: Add the complete Integration tab**

Add tab `Интеграция`, icon `plug`, with pages in this order:

```text
integrator/quickstart
integrator/configuration
integrator/request-lifecycle
integrator/audit-log
integrator/privacy-and-security
integrator/troubleshooting
```

- [ ] **Step 4: Validate claims**

```bash
rg -n 'raw IP|+35|3333|TRUST_ENRICHMENT_HEADERS|COOKIE_SECURE' docs/integrator
npm run docs:validate
```

**Definition of done:** A new integrator can run, configure, inspect and diagnose current behavior without reviewer pages.

**Commit gate:**

```bash
git add docs/docs.json docs/integrator docs/task-plans/main-mintlify-documentation
git commit -m "docs: add integration guides"
```

---

## Milestone 5: OpenAPI and contract verification

**Status:** `[ ]`

**Goal:** Add accurate OpenAPI 3.1 and tests for published HTTP invariants.

**Risk:** Manual YAML drift; playground cannot reproduce full cookie/token lifecycle alone.

**Stop-and-fix:** Do not accept mismatched status, content type, body or redirect headers.

### Task 5.1: Contract assertions

**Files:**
- Modify: `tests/app.test.ts`

- [ ] **Step 1: Add health contract test**

```ts
expect(response.statusCode).toBe(200);
expect(response.headers["content-type"]).toContain("application/json");
expect(response.json()).toEqual({ status: "ok" });
```

- [ ] **Step 2: Strengthen URL-only test**

```ts
for (const internalKey of ["score", "reason", "decision", "signals"]) {
  expect(response.body).not.toContain(internalKey);
}
```

- [ ] **Step 3: Strengthen no-JS test**

Assert `303`, exact `Location`, empty body and `cache-control: no-store`.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- tests/app.test.ts
```

If current behavior differs, correct docs expectations rather than runtime scoring.

### Task 5.2: OpenAPI specification

**Files:**
- Create: `docs/api-reference/openapi.yaml`

- [ ] **Step 1: Define metadata**

Use OpenAPI `3.1.0`, title `Pre-lander Scoring Gate API`, version `1.0.0`, localhost server and URL-only warning.

- [ ] **Step 2: Define exact paths**

Document `GET /health`, `GET /`, `POST /api/decision`, `POST /submit`. Define JSON/form bodies, `text/html`, `text/plain`, JSON and redirect responses. Telemetry bounds come from `src/telemetry/normalize.ts`.

- [ ] **Step 3: Describe fail-safe behavior**

State that malformed input may still get a destination; internal fields stay hidden; invalid token adds risk without absolute prohibition.

- [ ] **Step 4: Validate OpenAPI file directly**

```bash
npm run docs:validate
```

### Task 5.3: API overview

**Files:**
- Create: `docs/api-reference/overview.mdx`
- Modify: `docs/docs.json`

- [ ] **Step 1: Document invariants**

Include exact plain-text response, submit comparison, token deltas, TTL/replay, cookie relation, malformed JSON, invalid state and storage limitation.

- [ ] **Step 2: Explain playground limitation**

State that normal decision flow gets token/cookie from `GET /`; an isolated playground call does not reproduce the browser lifecycle.

- [ ] **Step 3: Add the complete API tab**

Add `Справочник API`, icon `square-terminal`, with overview page and an OpenAPI-backed group referencing `api-reference/openapi.yaml`. Do not use standalone reserved label `API`.

- [ ] **Step 4: Run API gates**

```bash
npm test -- tests/app.test.ts tests/page-token.test.ts
npm run docs:validate
git diff --check
```

**Definition of done:** OpenAPI validates and matches tested Fastify behavior.

**Commit gate:**

```bash
git add docs/docs.json docs/api-reference tests/app.test.ts docs/task-plans/main-mintlify-documentation
git commit -m "docs: add OpenAPI contract"
```

---

## Milestone 6: README and release validation

**Status:** `[ ]`

**Goal:** Keep README autonomous, remove stale content and pass all release gates.

**Risk:** Over-shortening README; orphaned preview processes.

**Stop-and-fix:** No completion with broken links, private URLs, duplicate tests, placeholders or failed clean install.

### Task 6.1: Synchronize README

**Files:**
- Modify: `README.md`
- Modify: `docs/index.mdx`

- [ ] **Step 1: Finalize landing links**

Replace the three audience summaries in `docs/index.mdx` with Mintlify cards linking to `/reviewer/evaluation-guide`, `/integrator/quickstart` and `/api-reference/overview`. Run `npm run docs:validate` immediately to prove every destination exists.

- [ ] **Step 2: Remove stale top matter**

Remove private `chatgpt.com/c/`, ad-hoc `Todo` and trailing whitespace. Move verified public share links to AI page.

- [ ] **Step 3: Preserve autonomous core**

Keep purpose, defensive boundary, `npm ci && npm run dev`, checks, destination configuration, short architecture and signal/scoring summary. Link `docs/index.mdx` and `npm run docs:dev`. Replace duplicated detailed tables with canonical MDX links.

- [ ] **Step 4: Verify README**

```bash
rg -n 'npm ci && npm run dev|npm run docs:dev|docs/index.mdx' README.md
if rg -n 'chatgpt\.com/c/|Todo:' README.md; then exit 1; fi
git diff --check
```

### Task 6.2: Automated release gate

- [ ] **Step 1: Clean install and code checks**

```bash
npm ci --registry=https://registry.npmjs.org
npm test
npm run typecheck
npm run build
test ! -d dist/tests
```

Expected: existing 19 tests plus new contract tests pass once.

- [ ] **Step 2: Docs checks**

```bash
npm run docs:validate
git diff --check
```

- [ ] **Step 3: Scan unfinished/private content**

```bash
if rg -n 'TBD|TODO|FIXME|chatgpt\.com/c/' README.md docs/index.mdx docs/reviewer docs/integrator docs/api-reference; then exit 1; fi
if rg -n 'packages\.applied-caas-gateway1|internal\.api\.openai\.org' package-lock.json; then exit 1; fi
```

### Task 6.3: Dual-server smoke

- [ ] **Step 1: Start app and docs separately**

```bash
npm run dev
npm run docs:dev
```

Expected: ports 3000 and 3333.

- [ ] **Step 2: Smoke both surfaces**

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3333/ > /tmp/mintlify-final.html
rg -n 'Pre-lander Scoring Gate' /tmp/mintlify-final.html
```

- [ ] **Step 3: Manual navigation smoke**

Check four tabs, internal links, Russian titles, API operations, code paths, JS submit, no-JS redirect and audit. Record evidence in `status.md`.

- [ ] **Step 4: Stop previews and inspect scope**

```bash
git status -sb
git diff --check
```

Expected: only intended source/docs/task-pack changes; no audit, env, dist, cache or secrets.

**Definition of done:** All design and `test-plan.md` acceptance gates pass.

**Commit gate:**

```bash
git add README.md docs package.json package-lock.json tsconfig.build.json vitest.config.ts tests/app.test.ts
git commit -m "docs: finalize Mintlify documentation"
```

If no tracked changes remain after earlier commits, record `no commit: final validation produced no file changes` in `status.md`.

---

## Overall completion gate

- [ ] Six milestones are `[x]`.
- [ ] Checkpoint commits and validation are recorded in `status.md`.
- [ ] Automated and manual gates in `test-plan.md` pass or have an approved exception.
- [ ] No blocker, private registry URL, placeholder, duplicate test, generated file or secret remains.
- [ ] `git status -sb` is clean except intentional unpushed commits.
