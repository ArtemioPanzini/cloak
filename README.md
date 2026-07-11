# Pre-lander Scoring Gate

Минимальный pre-lander и объяснимый traffic-quality scoring backend на Node.js + TypeScript. Посетитель выбирает штат US, система оценивает browser, server и history signals и возвращает только destination URL: `OFFER`, `WHITEPAGE` или `BLOCK`.

```text
Facebook Ads → GET / → state dropdown → submit
             → scoring → audit → destination URL
```

Решение source-agnostic: оно не пытается распознавать модераторов конкретной рекламной платформы и применяет одинаковые правила ко всем посетителям. Это защитный anti-automation и interaction-quality gate, а не механизм обхода review.

## Быстрый запуск

Требуется Node.js 20+.

```bash
npm ci && npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Проект работает без `.env` и использует локальные demo destinations.

Для собственной конфигурации:

```bash
cp .env.example .env
```

Как минимум замените secrets и адреса:

```env
PAGE_TOKEN_SECRET=replace-with-at-least-24-characters
HASH_SECRET=replace-with-at-least-24-characters
COOKIE_SECRET=replace-with-at-least-24-characters

OFFER_URL=https://example.com/offer
WHITEPAGE_URL=https://example.com/whitepage
BLOCK_URL=https://example.com/blocked
```

Полный список переменных находится в [`.env.example`](.env.example) и в [руководстве по конфигурации](docs/integrator/configuration.mdx).

## Проверки

```bash
npm test
npm run typecheck
npm run build
```

Тесты включают обязательные сценарии задания: чистого пользователя, быстрого кликера, headless-бота, VPN, медленный mobile submit, подозрительный fingerprint, no-JS и повторный визит. Дополнительно проверяются HTTP-контракт, page token и audit/history behavior.

## HTTP-контракт

| Endpoint | Назначение | Ответ |
|---|---|---|
| `GET /` | HTML pre-lander и page token | `200 text/html` |
| `POST /api/decision` | JavaScript flow | `200 text/plain` — только URL |
| `POST /submit` | No-JS form fallback | `303 Location` |
| `GET /health` | Health check | `200 application/json` |

`POST /api/decision` никогда не возвращает `score`, причины или исходные сигналы. Эти данные доступны только в audit log. Точный транспортный контракт описан в [OpenAPI 3.1](docs/api-reference/openapi.yaml).

## Как устроено решение

```text
GET /
  → signed visitor cookie
  → signed page token
  → HTML + telemetry collector

POST
  → normalize untrusted payload
  → verify page token and build server signals
  → load visitor/fingerprint/IP history
  → score automation risk, intent and coverage
  → resolve OFFER | WHITEPAGE | BLOCK
  → append audit record
  → return URL or redirect
```

Скоринг rule-based и детерминированный. Сильные automation evidence повышают risk; нормальные взаимодействия повышают intent; отсутствующие данные снижают coverage, но сами по себе не доказывают автоматизацию. VPN, отсутствие движения мыши, медленный mobile submit и обычный повторный визит не являются самостоятельными причинами block.

Основные модули:

- `src/telemetry/` — нормализация недоверенного payload и server signals;
- `src/security/` — HMAC identifiers и signed page token;
- `src/scoring/` — декларативные правила, score и policy;
- `src/storage/` — JSONL audit/history repository;
- `src/services/decision-service.ts` — orchestration;
- `src/app.ts` — Fastify routes и внешний контракт.

## Audit storage

По умолчанию каждое решение дописывается в `data/audit.jsonl`. Запись содержит timestamp, входные данные и нормализованные сигналы, score, финальное решение и reason codes. History indexes используют HMAC для visitor ID, fingerprint и IP, но текущий diagnostic payload также сохраняет raw server IP. Перед внешним использованием его нужно удалить или зашифровать и задать retention policy.

Последние записи:

```bash
npm run audit:tail
npm run audit:tail -- 25
```

JSONL выбран как простой portable storage для тестового задания; для нескольких процессов или долгого retention нужен transactional database backend.

## Документация

Полная русскоязычная документация начинается с [`docs/index.mdx`](docs/index.mdx) и разделена на маршруты проверки решения, интеграции и API.

Локальный Mintlify preview:

```bash
npm run docs:dev
```

Документация будет доступна на [http://localhost:3333](http://localhost:3333). Проверка без запуска preview:

```bash
npm run docs:validate
```

## Ограничения

- weights и thresholds — инженерная гипотеза, а не ML-модель, обученная на размеченном production-трафике;
- client telemetry считается недоверенной и используется только совместно с другими evidence;
- low-intent оценивается через interaction proxies, а не через downstream conversion;
- JSONL не рассчитан на concurrent multi-process writes;
- runtime policy versioning, shadow mode и cohorts остаются roadmap, а не существующими функциями.

Подробные design decisions, edge cases, trade-offs и описание работы с AI находятся в [маршруте проверяющего](docs/reviewer/evaluation-guide.mdx).
