# Pre-lander Scoring Gate

Минимальный pre-lander и объяснимый traffic-quality scoring backend на Node.js + TypeScript. Посетитель выбирает штат US, система оценивает browser, server и history signals и возвращает только URL: `OFFER`, `WHITEPAGE` или `BLOCK`.

```text
Facebook Ads → pre-lander → scoring → audit → destination URL
```

Решение source-agnostic: одинаковые правила применяются ко всем посетителям. Проект конечно же не пытается распознавать модераторов рекламной платформы и не предназначен для обхода review.

## Быстрый запуск

Требуется Node.js 20+.

```bash
npm ci && npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Без `.env` используются локальные demo destinations.

## Проверка решения

```bash
npm test
npm run typecheck
npm run build
```

| Критерий задания | Документация | Код | Тест |
|---|---|---|---|
| Дизайн сигналов | [Signals](docs/reviewer/signals.mdx) | [`src/telemetry/`](src/telemetry/) | [`fixtures.ts`](tests/fixtures.ts) |
| Scoring и неопределённость | [Scoring](docs/reviewer/scoring.mdx) | [`src/scoring/`](src/scoring/) | [`scoring.scenarios.test.ts`](tests/scoring.scenarios.test.ts) |
| Edge cases | [Edge cases](docs/reviewer/edge-cases.mdx) | [`src/scoring/`](src/scoring/) | [`scoring.scenarios.test.ts`](tests/scoring.scenarios.test.ts) |
| Audit и history | [Audit log](docs/integrator/audit-log.mdx) | [`src/storage/`](src/storage/) | [`repository.test.ts`](tests/repository.test.ts) |
| HTTP contract | [API](docs/api-reference/overview.mdx) | [`src/app.ts`](src/app.ts) | [`app.test.ts`](tests/app.test.ts) |
| Работа с AI | [AI usage](docs/reviewer/ai-usage.mdx) | — | — |

Обязательные сценарии включают чистого пользователя, быстрого кликера, headless-бота, VPN, медленный mobile submit, подозрительный fingerprint, no-JS и повторный визит.

## Конфигурация

```bash
cp .env.example .env
```

Для внешних destinations замените secrets и URL:

```env
OFFER_URL=https://example.com/offer
WHITEPAGE_URL=https://example.com/whitepage
BLOCK_URL=https://example.com/blocked
```

Полный список переменных и требования к secrets находятся в [`.env.example`](.env.example) и [Configuration](docs/integrator/configuration.mdx).

## HTTP-контракт

| Endpoint | Ответ |
|---|---|
| `GET /` | `200 text/html` — форма и page token, привязанный к signed visitor cookie |
| `POST /api/decision` | `200 text/plain` — только destination URL |
| `POST /submit` | `303 Location` — no-JS fallback |
| `GET /health` | `200 application/json` |

Score, причины и сигналы клиенту не возвращаются. Точный контракт зафиксирован в [OpenAPI 3.1](docs/api-reference/openapi.yaml).

## Как принимается решение

Rule engine рассчитывает `automationRisk`, `intentScore` и `coverage`. Valid page token обязателен для `OFFER`, но не считается доказательством человека. Отсутствующие данные уменьшают coverage, а VPN, нулевая мышь, медленный mobile submit и обычный repeat visit не являются самостоятельными причинами `BLOCK`.

```text
normalize payload → verify token → load history → score → audit → URL/redirect
```

## Audit

Каждое решение дописывается в `data/audit.jsonl`: входные данные, нормализованные сигналы, score, decision и reason codes.

```bash
npm run audit:tail
npm run audit:tail -- 25
```

History indexes используют HMAC identifiers. Новый audit заменяет top-level `pageToken` на `[REDACTED]`, но diagnostic payload текущей версии всё ещё хранит raw server IP. Перед внешним использованием нужны минимизация данных, encryption/retention policy и более надёжное storage.

## Документация

Полная документация начинается с [`docs/index.mdx`](docs/index.mdx). Локальный Mintlify preview:

```bash
npm run docs:dev
```

Откройте [http://localhost:3333](http://localhost:3333). Статическая проверка: `npm run docs:validate`.

## Ограничения

- weights и thresholds — инженерная гипотеза без production labels;
- client telemetry считается недоверенной;
- `intentScore` измеряет interaction quality, а не вероятность покупки;
- JSONL не рассчитан на multi-process writes и долгий retention;
- page token не имеет atomic one-time claim, idempotent retries и key rotation;
- runtime policy versioning, shadow mode и cohorts пока не реализованы.



## AI conversations
https://chatgpt.com/share/6a5289fb-a7dc-83eb-9c87-208164445fd9
https://chatgpt.com/share/6a5289de-9608-83ed-ba4d-a2f82d665af7
Также был codex 5.6 sol max
