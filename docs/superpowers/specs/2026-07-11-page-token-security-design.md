# Page-token security hardening design

## Goal

Strengthen the existing pre-lander page-token flow without turning the take-home
project into a distributed token platform. A request may reach `OFFER` only after
presenting a valid, unexpired page token issued for the same signed visitor
session. The external URL-only and no-JS contracts remain unchanged.

## Scope

The implementation will:

- replace the current `{ issuedAtMs, nonce }` payload with a versioned
  `{ v, jti, iat, exp, binding }` payload;
- sign the token with `PAGE_TOKEN_SECRET` and derive the visitor binding with a
  domain-separated HMAC using `HASH_SECRET`;
- require a valid page token for `OFFER` eligibility while preserving stronger
  `BLOCK` decisions for invalid state or independent automation evidence;
- calculate server dwell only from a fully verified token;
- redact the top-level raw `pageToken` value before writing an audit record;
- add private/no-store caching, CSP, and frame-protection headers to the landing;
- update all current README, Mintlify, and OpenAPI descriptions of token,
  scoring, audit, lifecycle, testing, and HTTP header behavior;
- preserve completed files under `docs/task-plans/` and earlier design specs as
  historical records of the previous policy.

The implementation intentionally will not add one-time token claims, idempotent
retry storage, key rotation, distributed locking, or a legacy audit migration.

## Token lifecycle

`GET /` resolves or creates the signed visitor cookie, creates a random `jti`,
embeds issue and expiry times in milliseconds, computes a binding over visitor ID
and `jti`, signs the encoded payload, and renders it into the hidden form field.

On submit, `DecisionService` normalizes the body, verifies token structure and
signature, checks future skew and embedded expiry, requires an already-valid
visitor cookie, and recomputes the binding for the current visitor. Verification
returns `visitor_mismatch` when the cookie is absent, invalid, or belongs to a
different visitor.

Only a `valid` result contributes server dwell. Trusted token identifiers remain
available to history through an HMAC of `jti`; the raw token does not enter the
audit body.

## Decision behavior

Token validity is an eligibility gate, not evidence that the visitor is human.
A valid token therefore has automation delta `0`, while invalid statuses retain
their risk adjustments. Policy order remains:

1. invalid state, extreme burst, and multi-group automation may produce `BLOCK`;
2. any non-valid page token produces `WHITEPAGE` if no stronger block applies;
3. coverage, automation risk, and interaction intent determine the remaining
   `WHITEPAGE` or `OFFER` result.

This keeps direct POSTs and copied tokens away from the offer without treating a
missing token alone as proof of automation.

## Error handling and compatibility

The JavaScript endpoint continues to return `200 text/plain` with only a
destination URL. The no-JS form continues to return `303 Location`. Parser and
internal failures retain the existing fail-safe whitepage behavior.

Existing audit rows remain readable. They may contain the legacy token shape and
unredacted historical request bodies; the patch changes newly written rows only.
Changing `HASH_SECRET` invalidates outstanding bindings as well as breaking
history continuity, which is acceptable for the current explicit secret-rotation
limitations.

## Documentation

Current product documentation will be updated together with code, including:

- README and patch notes;
- architecture, signals, scoring, edge cases, testing, and trade-offs;
- lifecycle, audit, privacy/security, troubleshooting, and configuration;
- API overview and OpenAPI response/header descriptions.

Semantic searches will verify that current docs no longer claim that valid token
reduces risk, that tokens are unbound, that invalid tokens may receive `OFFER`, or
that raw page tokens are stored in new audit records.

## Tests and acceptance gates

Tests will cover same-session validity, signature tampering, embedded expiry,
future issue time, malformed and oversized tokens, visitor mismatch, missing
cookie, direct POST, copied token, audit redaction, security headers, and the
eligibility policy for every token status. Expiry boundary semantics will be
explicitly fixed by a test.

Acceptance commands:

```bash
npm test
npm run typecheck
npm run build
npm run docs:validate
git diff --check
```

The full dependency audit and runtime-only audit will be reported separately so
dev-only advisories are not described as runtime vulnerabilities.
