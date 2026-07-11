# Pre-lander Scoring Gate

Минимальный pre-lander и объяснимый anti-automation / interaction-quality scoring backend на Node.js + TypeScript.

Поток:

```text
visitor -> GET / -> state dropdown -> POST /api/decision
        -> scoring -> OFFER | WHITEPAGE | BLOCK -> URL only
```

Решение **source-agnostic**: оно не определяет рекламных модераторов, crawler конкретной платформы, IP-диапазоны Meta и не меняет правила в зависимости от источника трафика. Один и тот же scoring применяется ко всем посетителям. Это защитный traffic-quality gate, а не механизм обхода review или показа разного рекламного контента проверяющим и пользователям.

## Запуск

Требуется Node.js 20+.

```bash
npm install && npm run dev
```

После запуска открыть:

```text
http://localhost:3000
```

Проект запускается без `.env`: по умолчанию используются локальные demo URL. Для своих адресов:

```bash
cp .env.example .env
```

Затем заменить secrets и destination URL.

Проверки:

```bash
npm test
npm run typecheck
npm run build
```

Последние audit-записи:

```bash
npm run audit:tail
npm run audit:tail -- 25
```

## HTTP-контракт

### `GET /`

Возвращает простую HTML-форму:

- dropdown со штатами US и District of Columbia;
- кнопку `Submit`;
- подписанный server-issued `pageToken`;
- небольшой telemetry collector.

### `POST /api/decision`

Пример входа:

```json
{
  "state": "CA",
  "pageToken": "signed-token",
  "telemetry": {
    "pageVisibleMs": 1750,
    "firstInteractionMs": 480,
    "stateChangedMs": 1050,
    "submittedMs": 1800,
    "pointerMoves": 12,
    "pointerDowns": 2,
    "touchStarts": 0,
    "keyDowns": 0,
    "stateChanges": 1,
    "webdriver": false,
    "timezone": "America/Los_Angeles",
    "languages": ["en-US", "en"],
    "screen": {
      "width": 1440,
      "height": 900,
      "colorDepth": 24
    },
    "hardwareConcurrency": 8,
    "deviceMemory": 8,
    "maxTouchPoints": 0,
    "fingerprintId": "0123456789abcdef0123456789abcdef"
  }
}
```

Ответ содержит **только URL**:

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Cache-Control: no-store

https://example.test/offer
```

`score`, причины и отдельные сигналы клиенту не возвращаются.

### `POST /submit`

No-JS fallback. Принимает обычный `application/x-www-form-urlencoded` и возвращает `303 Location`. Из-за отсутствующей клиентской телеметрии такой запрос обычно получает `WHITEPAGE`, а не `BLOCK`.

### Demo destinations

По умолчанию доступны:

```text
/demo/offer
/demo/whitepage
/demo/blocked
```

Они нужны только для локального запуска. Реальные адреса задаются через environment variables.

## Архитектура

```text
GET /
  -> signed visit cookie
  -> signed page token { issuedAtMs, nonce }
  -> HTML + telemetry.js

POST /api/decision
  -> normalize untrusted payload
  -> verify page token
  -> add server-side request signals
  -> hash visitor/fingerprint/IP identifiers
  -> load previous decisions and velocity
  -> pure scoring engine
  -> policy resolver
  -> append complete JSONL audit record
  -> return destination URL only
```

Основные границы ответственности:

- `telemetry/` — нормализация недоверенного payload и server signals;
- `security/` — HMAC identifiers и подписанный page token;
- `scoring/rules.ts` — декларативные правила;
- `scoring/scorer.ts` — расчёт `automationRisk`, `intentScore`, `coverage`;
- `scoring/policy.ts` — финальное решение;
- `storage/` — audit/history repository;
- `services/decision-service.ts` — orchestration без HTTP-деталей;
- `app.ts` — Fastify routes и внешний контракт.

## Дизайн сигналов

### Серверные сигналы

| Сигнал | Зачем |
|---|---|
| Подписанный `pageToken` | Подтверждает, что перед submit была получена landing page |
| Время от выдачи token до POST | Нельзя полностью подменить клиентским payload |
| User-Agent | Даёт известные headless/scripted признаки |
| `Accept`, `Accept-Language` | Coverage и грубая полнота browser request |
| `Sec-Fetch-*` и Client Hints | Дополнительный контекст и слабые consistency checks |
| IP | История/velocity; в identifiers хранится HMAC hash |
| Signed visit cookie | Нормальный repeat visit и per-visitor velocity |
| Referer | Только audit/аналитический контекст, не strong bot proof |
| Trusted enrichment headers | Опциональные `x-geo-region`, `x-network-type` от собственного proxy |

IP, User-Agent, network type и geo не принимаются из JSON клиента.

`x-geo-region` и `x-network-type` читаются только при:

```env
TRUST_ENRICHMENT_HEADERS=true
```

Их следует включать исключительно за доверенным reverse proxy, который удаляет входящие пользовательские значения и записывает свои.

### Клиентские сигналы

Collector отправляет агрегаты, а не полный behavioural trace:

- относительные времена взаимодействий;
- количество pointer/touch/keyboard/change events;
- focus/blur/visibility counts;
- `navigator.webdriver`;
- timezone и languages;
- screen dimensions и color depth;
- hardware concurrency, device memory, touch points;
- coarse fingerprint hash.

Полные координаты мыши, последовательность клавиш и содержимое ввода не собираются.

### History signals

Из audit storage вычисляются:

- предыдущие решения для signed visitor cookie;
- предыдущие решения для fingerprint;
- per-identity submits за 30 секунд;
- submits с fingerprint за 5 минут;
- IP velocity как слабый shared-network сигнал;
- повторное использование одного page token.

## Что сознательно не используется как сильное доказательство

Следующие признаки сами по себе не приводят к block:

- VPN;
- несовпадение IP region и выбранного штата;
- отсутствие mouse movement;
- мобильный touch без pointer movement;
- один необычный fingerprint;
- один повторный визит;
- медленный submit;
- отсутствие `fbclid` или другого campaign parameter;
- принадлежность к определённому рекламному источнику.

В MVP также отсутствуют canvas/audio/font fingerprinting, battery API и запрос точной геолокации. Они повышают privacy cost и нестабильность сильнее, чем качество решения для страницы с одним dropdown.

## Scoring model

Используются три независимых измерения.

### 1. `automationRisk`, 0–100

Примеры текущих весов:

| Правило | Delta |
|---|---:|
| Валидный page token | `-5` |
| Token отсутствует | `+15` |
| Token malformed / bad signature / from future | `+35` |
| Headless UA | `+45` |
| Scripted UA (`curl`, `wget`, requests и подобные) | `+30` |
| `navigator.webdriver === true` | `+35` |
| Server dwell `< 250 ms` | `+45` |
| Server dwell `250–599 ms` | `+18` |
| Противоречивый порядок client events | `+35` |
| Client telemetry есть, но interaction events нет | `+8` |
| 3+ device/fingerprint anomalies | `+45` |
| VPN | `+5` |
| Proxy | `+8` |
| Hosting network | `+12` |
| 4–9 identity submits за 30 секунд | `+45` |
| 10+ identity submits за 30 секунд | `+80` |
| Обычный повторный visit | `-5` |

Score ограничивается диапазоном `0..100`.

Положительные правила сгруппированы в независимые evidence groups: `automation`, `behavior`, `device`, `token`, `velocity` и другие. Для hard block одной группы недостаточно, даже если внутри неё сработали и headless UA, и webdriver.

### 2. `intentScore`, 0–100

Стартовое значение — `40`.

| Правило | Delta |
|---|---:|
| Валидный state | `+5` |
| Реальный `change` dropdown | `+20` |
| Pointer/touch/keyboard input | `+10` |
| Coherent event order | `+15` |
| Dwell `800 ms – 20 s` | `+15` |
| Dwell `20–120 s` | `+8` |
| Страница преимущественно visible | `+5` |
| Обычный repeat visit | `+5` |
| Dwell `< 250 ms` | `-30` |
| Malformed telemetry | `-10` |

Это не настоящий purchase-intent prediction. При одном dropdown система может оценить только proxy: осмысленность и последовательность короткого взаимодействия.

### 3. `coverage`, 0–1

Coverage отражает наличие evidence, а не подозрительность посетителя.

Весовые компоненты:

- валидный page token — `0.20`;
- request headers — до `0.15`;
- server/client timing — до `0.20`;
- interaction counters — до `0.20`;
- device context — до `0.15`;
- успешный history lookup — `0.10`.

Отсутствующая телеметрия не увеличивает bot score автоматически. Она уменьшает coverage. Поэтому пользователь с отключённым JavaScript получает fallback, но не объявляется ботом.

## Decision policy

```text
invalid state
  -> BLOCK

extreme identity burst
  -> BLOCK

automationRisk >= 75 AND >= 2 independent suspicious groups
  -> BLOCK

coverage < 0.60
  -> WHITEPAGE

automationRisk >= 40
  -> WHITEPAGE

intentScore < 35
  -> WHITEPAGE

otherwise
  -> OFFER
```

Это даёт три разных семантики:

- `OFFER` — достаточно evidence и human-like interaction;
- `WHITEPAGE` — неопределённость, низкое качество или одна сильная аномалия;
- `BLOCK` — invalid input, extreme velocity или несколько независимых automation-признаков.

## Работа с неопределённостью и противоречиями

1. Missing signal уменьшает `coverage`, а не автоматически увеличивает риск.
2. Слабые correlated signals не считаются независимыми. Headless UA и webdriver относятся к одной группе `automation`.
3. Hard block требует нескольких evidence groups, кроме явно invalid form и extreme burst.
4. Geo mismatch записывается как neutral reason и не добавляет риск.
5. VPN имеет маленький вес и не препятствует offer при нормальном взаимодействии.
6. Отсутствие mouse movement не штрафуется, если присутствует touch, keyboard, pointer down или dropdown change.
7. Signed server timing имеет больший вес, чем присланные клиентом времена.
8. Повторный fingerprint считается нормальным, пока не появляется abnormal velocity.

## Edge cases

### Мобильный пользователь с медленным submit

Touch считается активным input. Долгое ожидание не увеличивает automation risk. Dwell до двух минут получает положительный intent delta, ещё более долгий остаётся нейтрально-положительным.

### Живой пользователь под VPN

VPN добавляет только `+5`. При нормальном token, dwell и input итог остаётся `OFFER`.

### Submit без движения мыши

Mouse movement не обязателен. Dropdown можно использовать touch, keyboard или одним pointer click.

### Отключённый JavaScript

Hidden page token всё равно отправляется обычной формой. Клиентская telemetry отсутствует, coverage получается ниже threshold, поэтому решение — `WHITEPAGE`.

### Повторный visit

Signed cookie и fingerprint позволяют увидеть историю. Один обычный repeat уменьшает риск и немного повышает intent. Burst учитывается отдельно.

### Повреждённый JSON

Fastify parser error преобразуется в synthetic invalid payload, решение фиксируется в audit log, а endpoint всё равно возвращает только destination URL.

## Audit log

По умолчанию каждое решение дописывается одной JSON-строкой в:

```text
./data/audit.jsonl
```

Запись содержит:

- timestamp и request ID;
- raw request body;
- нормализованные form/client/server signals;
- history snapshot до текущего решения;
- pseudonymous visitor/fingerprint/IP identifiers;
- полный список rule adjustments;
- `automationRisk`, `intentScore`, `coverage`;
- финальное решение, URL и primary reason.

Пример сокращённой записи:

```json
{
  "timestamp": "2026-07-11T10:00:00.000Z",
  "incoming": {
    "normalized": {
      "form": { "state": "CA", "validState": true },
      "server": { "pageTokenStatus": "valid", "serverDwellMs": 1800 }
    }
  },
  "score": {
    "automationRisk": 0,
    "intentScore": 100,
    "coverage": 1,
    "reasonCodes": [
      "VALID_STATE",
      "VALID_PAGE_TOKEN",
      "NORMAL_DWELL",
      "COHERENT_EVENT_ORDER"
    ]
  },
  "decision": "OFFER",
  "primaryReason": "HUMAN_LIKE_INTERACTION"
}
```

JSONL выбран для portability тестового задания: нет native SQLite dependency, файл легко просматривать, а repository interface отделён от scoring. При старте индекс истории восстанавливается из audit log. Записи сериализуются через write chain, поэтому один process не перемешивает строки.

Production-замена на Postgres/SQLite реализуется через интерфейс `DecisionRepository` без изменения scoring engine.

## Тестовые сценарии

В `tests/scoring.scenarios.test.ts` находятся обязательные и дополнительные table-driven cases:

| Сценарий | Ожидается |
|---|---|
| Чистый живой пользователь | `OFFER` |
| Очень быстрый кликер | `WHITEPAGE` |
| Bot без mouse movement, headless UA | `BLOCK` |
| Живой пользователь под VPN | `OFFER` |
| Mobile с медленным submit | `OFFER` |
| Подозрительный fingerprint/device values | `WHITEPAGE` |
| JavaScript отключён | `WHITEPAGE` |
| Повторный visit с тем же fingerprint | `OFFER` |
| Extreme submit burst | `BLOCK` |
| Geo mismatch при нормальном поведении | `OFFER` |
| Высокий risk только из одной evidence group | `WHITEPAGE` |

Дополнительно тестируются:

- page token signing, tampering и expiry;
- URL-only HTTP response;
- no-JS redirect;
- malformed JSON audit;
- физическая запись JSONL и восстановление history после restart.

## Конфигурация

| Variable | Default | Назначение |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_BASE_URL` | `http://localhost:$PORT` | База для локальных demo URL |
| `DATA_FILE` | `./data/audit.jsonl` | Audit/history file |
| `PAGE_TOKEN_SECRET` | dev value | HMAC page token secret |
| `HASH_SECRET` | dev value | HMAC identifiers |
| `COOKIE_SECRET` | dev value | Signed visit cookie |
| `OFFER_URL` | `/demo/offer` | Real offer destination |
| `WHITEPAGE_URL` | `/demo/whitepage` | Fallback destination |
| `BLOCK_URL` | `/demo/blocked` | Block destination |
| `PAGE_TOKEN_TTL_MS` | `600000` | Token TTL |
| `TRUST_PROXY` | `false` | Использовать proxy-derived request IP |
| `TRUST_ENRICHMENT_HEADERS` | `false` | Читать trusted geo/network headers |
| `COOKIE_SECURE` | `false` | Secure cookie flag |
| `LOG_LEVEL` | `info` | Fastify/Pino log level |
| `MAX_BODY_BYTES` | `65536` | Body size limit |

Development defaults позволяют выполнить требуемую команду запуска. В любом внешнем окружении secrets необходимо заменить.

## Структура проекта

```text
.
├── public/
│   └── telemetry.js
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config.ts
│   ├── constants/
│   ├── domain/
│   ├── scoring/
│   ├── security/
│   ├── services/
│   ├── storage/
│   ├── telemetry/
│   ├── web/
│   └── scripts/
├── tests/
│   ├── scoring.scenarios.test.ts
│   ├── page-token.test.ts
│   ├── app.test.ts
│   ├── repository.test.ts
│   └── fixtures.ts
├── data/
├── .env.example
├── package.json
└── tsconfig.json
```

## Trade-offs

### Rule-based вместо ML

Нет размеченного dataset с реальными conversion/bot labels. Rule engine объясним, детерминирован и легко проверяется table-driven tests. ML без данных только создал бы ложную точность.

### JSONL вместо database server

Плюсы:

- установка без native bindings;
- одна команда запуска;
- audit легко инспектировать;
- достаточно для одного demo process.

Минусы:

- history загружается в память;
- нет multi-process locking;
- lookup линейный;
- нет retention/partitioning.

Для production нужен Postgres/ClickHouse или managed event pipeline.

### Coarse fingerprint

Fingerprint нужен только как слабый repeat/velocity identifier. Он вычисляется из небольшого набора browser attributes и не используется как единственное доказательство automation. Его можно подменить, поэтому server-side cookie и timing важнее.

### Low intent

С одним dropdown нельзя достоверно измерить коммерческое намерение. Текущий `intentScore` оценивает interaction quality, а не вероятность покупки.

## Что добавить при большем времени

- Postgres repository и migration layer;
- rate limiting на edge с shared Redis counters;
- ASN/network enrichment через проверенный server-side provider;
- rule configuration/versioning и shadow mode;
- статистику false positive / false negative по downstream conversion events;
- admin-only audit explorer;
- retention policy и HMAC key rotation;
- OpenTelemetry metrics/traces;
- property-based/fuzz testing payload normalization;
- browser E2E tests через Playwright;
- experiment framework для threshold calibration;
- graceful degradation при недоступности storage.

## Privacy и production notes

В audit сохраняется raw body и server IP, потому что задание требует все входящие сигналы. Отдельные index identifiers (`visitorKey`, `fingerprintKey`, `ipHash`) уже HMAC-hashed.

В production следует:

- не сохранять raw IP либо шифровать его;
- ввести короткий retention period;
- ограничить доступ к audit log;
- ротировать HMAC secrets;
- документировать lawful basis/consent для telemetry;
- минимизировать raw headers;
- не использовать собранные данные для unrelated profiling.

## Работа с AI

AI-инструменты использовались для:

- первичного разбиения проекта на модули;
- brainstorming возможных сигналов и edge cases;
- подготовки первого набора table-driven fixtures;
- проверки TypeScript interfaces и повторяющихся scoring rules;
- ревью README и trade-offs.

После генерации вручную были исправлены важные решения:

- отсутствие mouse movement перестало считаться bot proof;
- VPN и geo mismatch получили слабый/нулевой вес;
- client timestamp был дополнен signed server-issued page token;
- repeat fingerprint стал нормальным событием без abnormal velocity;
- missing telemetry теперь уменьшает coverage, а не напрямую увеличивает риск;
- hard block теперь требует независимых evidence groups;
- platform-specific reviewer/crawler detection полностью исключён;
- native SQLite dependency заменён на portable JSONL repository, чтобы команда установки была воспроизводимой.

Финальные правила проверены вручную и детерминированными тестами.
