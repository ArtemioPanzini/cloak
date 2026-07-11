# Page-token Security Hardening Status

## Current phase

Planning complete; implementation has not started.

## Baseline

- Branch: `main`, tracking `origin/main`.
- Design spec: `docs/superpowers/specs/2026-07-11-page-token-security-design.md`.
- Design commit: `a7bb8eb docs: design page-token security hardening`.
- Worktree before task-pack creation: clean; local `main` ahead of `origin/main` by one commit.
- Known verification from patch review: baseline 20/20 tests, typecheck, build and Mintlify validation passed.
- Provided patch did not apply directly because its README hunk targeted an older document; code hunks applied in a disposable copy.

## Done

- `[x]` Existing project, patch and security flow inspected.
- `[x]` Recommended scope approved by user.
- `[x]` Design spec written, self-reviewed, approved and committed.
- `[x]` Current docs/OpenAPI contradictions identified.
- `[x]` Execution and test plan pack created.

## In progress

- None. Planning-only run is ending before implementation.

## Next

1. Read the approved design spec, `plans.md` and `test-plan.md` completely.
2. Start Milestone 1: bound page-token primitive using red-green TDD.

## Decisions

- Use a minimal versioned bound token, not a production token platform.
- Use existing `PAGE_TOKEN_SECRET` for signing and domain-separated `HASH_SECRET` for binding.
- Treat token validity as `OFFER` eligibility, not human evidence.
- Keep stronger block branches ahead of the eligibility branch.
- Redact only the top-level raw `pageToken`; preserve normalized diagnostics and HMAC `jti` history.
- Use `nowMs >= exp` as the explicit expiration boundary.
- Preserve historical Mintlify planning/spec files as immutable records of old policy.
- Update every current README/Mintlify/OpenAPI statement affected by runtime changes.
- Use milestone checkpoint commits; do not push without explicit user instruction.

## Assumptions

- Execution remains on `main` unless a later worktree skill creates an isolated branch.
- `npm run docs:validate` remains the structural docs gate; semantic `rg` checks catch contradictory prose.
- Full dependency audit can contain dev-only advisories while runtime audit remains zero.
- Expected final suite count is 33 tests across 4 files after the planned additional boundary tests.
- Missing Jaidu reference templates are a skill-package limitation; the existing repo pack format is authoritative fallback.

## Known blockers and risks

- No blocker prevents Milestone 1.
- Token binding invalidates outstanding tokens when `HASH_SECRET` rotates; key rotation remains out of scope.
- Existing audit rows may contain raw legacy page tokens and are not migrated.
- JSONL replay detection remains non-atomic and is not strengthened into a one-time claim.
- Documentation validation is syntactic unless semantic scans are also run.

## Validation commands

```bash
npm test
npm run typecheck
npm run build
npm run docs:validate
npm audit --json
npm audit --omit=dev --json
git diff --check
```

## Milestone commits

| Milestone | Status | Planned commit | Actual commit | Validation |
|---|---|---|---|---|
| 1. Bound token primitive | Pending | `security: bind page tokens to visitor sessions` | — | Not run |
| 2. Decision/audit/HTTP integration | Pending | `security: enforce page-token offer eligibility` | — | Not run |
| 3. Documentation synchronization | Pending | `docs: document bound page-token security` | — | Not run |
| 4. Release verification | Pending | `docs: record page-token security verification` | — | Not run |

## Audit log

- `2026-07-11`: Patch reviewed without modifying the worktree.
- `2026-07-11`: Code hunks excluding stale README applied in a disposable copy; 30/30 patch-provided tests, typecheck and build passed.
- `2026-07-11`: Full audit observed 12 moderate dev advisories; runtime-only audit observed 0.
- `2026-07-11`: User approved full current-main integration while preserving historical planning artifacts.
- `2026-07-11`: Design spec committed as `a7bb8eb` and then approved by user.
- `2026-07-11`: Task-scoped plan pack created; implementation deliberately not started.

## Smoke/demo checks

| Check | Status | Evidence |
|---|---|---|
| Same-session token reaches normal scoring | Pending | — |
| Direct POST cannot reach offer | Pending | — |
| Copied token cannot reach offer | Pending | — |
| Audit redacts raw token | Pending | — |
| Landing security headers | Pending | — |
| JS URL-only contract | Pending | — |
| No-JS `303` contract | Pending | — |
| Mintlify/OpenAPI validation | Pending | — |

## Resume instructions

1. Read the approved design spec.
2. Read `plans.md` and `test-plan.md` completely.
3. Confirm no unrelated worktree changes.
4. Use `executing-plans` and start Milestone 1 only.
5. Run targeted checks, update this file and create the checkpoint commit before continuing.

