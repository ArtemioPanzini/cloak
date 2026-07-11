# Mintlify Documentation Status

## Current phase

Planning complete; implementation not started.

## Baseline

- Branch: `main`.
- Design spec commit: `1065047 docs: design Mintlify documentation`.
- Remote baseline: `origin/main` at `46cc31b` when planning started.
- Worktree before task-pack creation: clean, with local branch ahead by the design-spec commit.
- Existing Mintlify files before implementation: none outside the design spec and this planning pack.

## Done

- `[x]` Project context and README analyzed.
- `[x]` Audience: reviewer plus integrator.
- `[x]` Language: Russian.
- `[x]` Documentation root: `docs/` in this repository.
- `[x]` Navigation: Overview, solution review, integration, API reference.
- `[x]` OpenAPI plus conceptual MDX approach.
- `[x]` Local-only readiness; deployment excluded.
- `[x]` Invalid page token documented as current `+35` behavior without an absolute offer prohibition.
- `[x]` Design spec written, approved and committed.
- `[x]` Execution and validation pack created.

## In progress

- None. This run is planning-only.

## Next

1. Execute Milestone 1 from `plans.md`: make package installation, build output and test discovery reproducible.
2. Record validation and checkpoint commit before Milestone 2.

## Decisions

- Keep reviewer and integrator content in separate Mintlify tabs.
- Use neutral tab names rather than temporary role labels.
- Keep `README.md` autonomous and shorter than the full docs site.
- Maintain OpenAPI manually; do not add Fastify Swagger solely for docs generation.
- Do not add `policy-management.mdx` until runtime policy management exists.
- Add a standalone privacy/security page.
- Run Mintlify on port `3333`; the app stays on `3000`.
- Pin Mint CLI to `4.2.687` for this plan.
- Use milestone checkpoint commits; do not push without explicit user instruction.

## Assumptions

- Public npm registry is reachable during execution.
- `mint validate` is the primary docs and OpenAPI validator.
- No Mintlify account action is required for local validation.
- Jaidu template reference files are absent; this pack follows the required structure from `SKILL.md`.

## Known blockers and risks

- `package-lock.json` contains private OpenAI Artifactory URLs.
- `npm run build` emits `dist/tests`; Vitest can execute compiled test copies.
- Mintlify is not installed or configured.
- Manual OpenAPI can drift unless contract assertions remain a release gate.

## Validation commands

```bash
npm ci --registry=https://registry.npmjs.org
npm test
npm run typecheck
npm run build
npm run docs:validate
git diff --check
```

## Milestone commits

| Milestone | Status | Planned commit | Actual commit | Validation |
|---|---|---|---|---|
| 1. Reproducible toolchain | Pending | `build: make docs toolchain reproducible` | — | Pending |
| 2. Mintlify shell | Pending | `docs: scaffold Mintlify navigation` | — | Pending |
| 3. Reviewer docs | Pending | `docs: add reviewer evaluation guide` | — | Pending |
| 4. Integrator docs | Pending | `docs: add integration guides` | — | Pending |
| 5. OpenAPI | Pending | `docs: add OpenAPI contract` | — | Pending |
| 6. Finalization | Pending | `docs: finalize Mintlify documentation` or no commit | — | Pending |

## Audit log

- `2026-07-11`: Design spec approved by user.
- `2026-07-11`: Planning pack created; implementation deliberately not started.
- `2026-07-11`: Missing Jaidu template files recorded as a skill-package limitation.

## Smoke/demo checks

| Check | Status | Evidence |
|---|---|---|
| App on port 3000 | Deferred | Execution phase |
| Mintlify on port 3333 | Not run | Mintlify not implemented |
| Four navigation tabs | Not run | Mintlify not implemented |
| OpenAPI pages | Not run | OpenAPI not implemented |
| JS decision flow | Deferred | Final smoke |
| No-JS redirect flow | Deferred | Final smoke |

## Resume instructions

1. Read the approved design spec.
2. Read `plans.md` and `test-plan.md` completely.
3. Confirm no unrelated worktree changes.
4. Start Milestone 1 only.
5. Validate, update this file and commit the checkpoint before continuing.
