# Minimal page-token security patch

Этот patch усиливает page-token flow без добавления production-only distributed
infrastructure.

## Что входит

- `OFFER` невозможен без fully valid page token.
- Token содержит только `v`, `jti`, `iat`, `exp` и session `binding`.
- HMAC signature использует `PAGE_TOKEN_SECRET`.
- Session binding использует domain-separated `HASH_SECRET` и связывает token с
  signed visitor cookie.
- Server dwell рассчитывается только для fully valid token.
- Top-level raw `pageToken` заменяется на `[REDACTED]` в новых audit records.
- Landing получает `private, no-store`, CSP и frame protection.
- Unit, policy и HTTP tests покрывают expiry/future boundaries, malformed и
  oversized input, tampering, direct POST, visitor binding и redaction.

## Что намеренно не входит

- signing-key rotation и keyring;
- отдельный binding secret;
- atomic one-time token claim;
- idempotent retry records;
- distributed replay protection;
- legacy audit migration;
- runtime policy versioning.

Эти механизмы требуют shared transactional storage и отдельного operational
lifecycle. Текущий JSONL repository сохраняет replay history, но не может
гарантировать атомарное однократное использование token.

## Проверка

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run docs:validate
npm audit --json
npm audit --omit=dev --json
```

Ожидаемый suite: 4 files, 33 tests. Dependency audits сообщаются раздельно:
текущий full tree содержит 12 moderate dev advisories, runtime-only audit — 0.
Фактические release results записываются в
`docs/task-plans/main-page-token-security/status.md`.
