# Дизайн Mintlify-документации

## Контекст

Проект реализует pre-lander и объяснимый scoring backend на Node.js и TypeScript. Текущий `README.md` содержит подробное описание запуска, архитектуры, сигналов, scoring policy, edge cases, audit log, тестов, trade-offs и работы с AI. Mintlify-документации пока нет.

Документация должна одновременно решать две задачи:

1. Дать проверяющему короткий маршрут оценки решения по критериям тестового задания.
2. Дать интегратору практические инструкции по запуску, конфигурации, HTTP-потокам, audit storage и диагностике.

## Цели

- Разместить русскоязычную Mintlify-документацию в `docs/` текущего репозитория.
- Разделить навигацию по задачам проверяющего и интегратора.
- Добавить формальный OpenAPI-контракт без искажения фактического HTTP-поведения.
- Сохранить `README.md` автономной точкой входа для GitHub.
- Обеспечить воспроизводимый локальный preview и автоматическую валидацию.
- Исключить расхождение между кодом, README, MDX и OpenAPI.

## Не входит в scope

- Публикация на `*.mintlify.app` и подключение GitHub App.
- Пользовательский домен, authentication и personalization Mintlify.
- Реализация runtime policy management, versioning, shadow mode или cohort assignment.
- Изменение текущей scoring policy ради документации.
- Production deployment приложения.
- Добавление ML или внешнего network enrichment provider.

## Аудитория и язык

- Основной язык: русский.
- Аудитория 1: проверяющий тестового задания.
- Аудитория 2: разработчик или оператор, интегрирующий и запускающий приложение.
- Технические идентификаторы, имена полей, HTTP-термины и названия решений остаются на английском там, где перевод ухудшает точность.

## Размещение и локальная разработка

Mintlify-проект размещается в `docs/`:

```text
repo/
├── docs/
│   ├── docs.json
│   ├── index.mdx
│   └── ...
├── package.json
└── src/
```

Для будущего deployment в Mintlify dashboard documentation path должен быть настроен как `/docs`.

Mintlify CLI добавляется как закреплённая root dev dependency. Корневой `package.json` предоставляет команды:

```json
{
  "docs:dev": "cd docs && mint dev --port 3333",
  "docs:validate": "cd docs && mint validate"
}
```

Приложение продолжает использовать `http://localhost:3000`, документация — `http://localhost:3333`.

## Информационная архитектура

Верхнеуровневая навигация:

1. Обзор.
2. Проверка решения.
3. Интеграция.
4. Справочник API.

Структура файлов:

```text
docs/
├── docs.json
├── index.mdx
├── reviewer/
│   ├── evaluation-guide.mdx
│   ├── architecture.mdx
│   ├── signals.mdx
│   ├── scoring.mdx
│   ├── edge-cases.mdx
│   ├── testing.mdx
│   ├── tradeoffs.mdx
│   └── ai-usage.mdx
├── integrator/
│   ├── quickstart.mdx
│   ├── configuration.mdx
│   ├── request-lifecycle.mdx
│   ├── audit-log.mdx
│   ├── privacy-and-security.mdx
│   └── troubleshooting.mdx
└── api-reference/
    ├── overview.mdx
    └── openapi.yaml
```

`policy-management.mdx` не создаётся: соответствующая runtime-функциональность отсутствует. Versioning, shadow mode и cohorts упоминаются только как дальнейшее развитие в `reviewer/tradeoffs.mdx`.

## Ответственность страниц

### `index.mdx`

60-секундное знакомство:

- что делает система;
- defensive и source-agnostic boundary;
- короткая схема `GET -> telemetry -> score -> decision -> audit`;
- карточки перехода в проверку решения, интеграцию и API.

Страница не дублирует подробный quickstart или scoring rules.

### `reviewer/evaluation-guide.mdx`

Маршрут проверки примерно за 10 минут:

1. Чистая установка.
2. Тесты.
3. Typecheck и build.
4. Запуск сервера.
5. Обычный submit.
6. No-JS submit.
7. Проверка audit record.
8. Переход к ключевому коду.

Страница содержит mapping «критерий задания -> документация -> код -> тест» с фактическими путями:

| Тема | Код | Тест |
|---|---|---|
| Page token | `src/security/page-token.ts` | `tests/page-token.test.ts` |
| Scoring | `src/scoring/` | `tests/scoring.scenarios.test.ts` |
| Audit/history | `src/storage/decision-repository.ts` | `tests/repository.test.ts` |
| HTTP-контракт | `src/app.ts` | `tests/app.test.ts` |

### Reviewer pages

- `architecture.mdx`: модули, границы ответственности и полный server-side decision pipeline.
- `signals.mdx`: server, client и history signals; причины выбора; сигналы, сознательно не используемые как сильное доказательство.
- `scoring.mdx`: `automationRisk`, `intentScore`, `coverage`, веса и decision thresholds.
- `edge-cases.mdx`: mobile/slow submit, VPN, no mouse, no JS, repeat fingerprint, malformed payload.
- `testing.mdx`: обязательные и дополнительные сценарии, уровни тестов, известные пробелы.
- `tradeoffs.mdx`: rule-based против ML, JSONL, fingerprint limitations, concurrency, planned improvements.
- `ai-usage.mdx`: применённые AI-инструменты, ручные исправления, проверенные и отвергнутые предложения.

### Integrator pages

- `quickstart.mdx`: prerequisites, `npm ci`, `.env`, первый запуск, destination URLs и audit file.
- `configuration.mdx`: полный перечень environment variables, defaults и deployment caveats.
- `request-lifecycle.mdx`: раздельные JS и no-JS потоки от `GET /` до navigation/redirect.
- `audit-log.mdx`: JSONL schema, storage path, history rebuild, просмотр записей и ограничения.
- `privacy-and-security.mdx`: собираемые данные, scoring/audit/history categories, HMAC identifiers, raw IP, retention и threat model.
- `troubleshooting.mdx`: порты, secrets, malformed input, storage, cookies, proxy settings и диагностика audit.

### API pages

- `api-reference/overview.mdx`: общие инварианты, URL-only response, два submit flow, page token semantics и error behavior.
- `api-reference/openapi.yaml`: формальный OpenAPI 3.1 контракт.

## Источники истины

| Артефакт | Ответственность |
|---|---|
| TypeScript-код | Фактическое runtime-поведение и scoring |
| `openapi.yaml` | Методы, параметры, статусы, headers и response content types |
| Contract tests | Проверка внешнего HTTP-контракта реализации |
| Mintlify MDX | Объяснение архитектуры, использования и ограничений |
| `README.md` | Автономный краткий запуск и ссылка на полную документацию |

Правила согласованности:

- Веса и thresholds берутся из `src/scoring/rules.ts` и `src/scoring/policy.ts`.
- OpenAPI не заменяет `text/plain` или `303 Location` удобным, но несуществующим JSON.
- Planned-функции не описываются как доступные.
- Общие темы имеют одну каноническую страницу; остальные страницы ссылаются на неё.
- Каждая MDX-страница содержит как минимум `title` и `description` в frontmatter.

## OpenAPI strategy

OpenAPI 3.1 YAML поддерживается вручную. Генерация из Fastify не вводится, потому что текущие routes не имеют route schemas и добавление Swagger расширило бы scope.

Спецификация охватывает:

- `GET /health`;
- `GET /` как получение HTML pre-lander и page token;
- `POST /api/decision` как JavaScript flow;
- `POST /submit` как no-JS form flow.

`GET /telemetry.js` и demo destinations описываются в overview или lifecycle, но не перегружают основной API reference.

Contract assertions должны подтверждать:

- `POST /api/decision` возвращает `200 text/plain` и только destination URL;
- response не раскрывает `score`, `reason`, `decision` или signals;
- `POST /submit` возвращает `303` и `Location`;
- `/health` возвращает JSON status;
- malformed JSON и invalid state сохраняют заявленный внешний контракт.

## Page token semantics

Документация отражает текущую scoring policy без её изменения:

- valid token: `automationRisk -5`;
- missing token: `automationRisk +15`;
- expired token: `automationRisk +5`;
- malformed, future или invalid signature: `automationRisk +35`.

Invalid token сам по себе не является абсолютным запретом `OFFER`: финальное решение зависит от coverage, остальных adjustments и policy thresholds. Документация не должна утверждать обратное.

## Request lifecycle

### JavaScript flow

```text
GET /
-> signed visitor cookie + page token
-> telemetry collection
-> POST /api/decision
-> normalization
-> history lookup
-> scoring
-> audit append
-> text/plain destination URL
-> browser navigation
```

### No-JS flow

```text
GET /
-> signed visitor cookie + hidden page token
-> HTML form POST /submit
-> normalization without client telemetry
-> reduced coverage
-> scoring
-> audit append
-> 303 Location
```

## Ошибки и fail-safe поведение

Документация должна различать normal decisions и технические ошибки.

| Ситуация | Фактическое внешнее поведение |
|---|---|
| Invalid state | Block destination URL |
| Missing token | Risk adjustment; решение зависит от остальных сигналов |
| Invalid/future token | `+35` риска; не абсолютный запрет `OFFER` |
| Expired token | `+5` риска |
| Malformed JSON | Synthetic audit input и destination URL |
| Insufficient coverage | Whitepage destination |
| Storage/internal decision error | Fail-safe whitepage; audit текущего решения может отсутствовать |
| Body/parser error | Error handler сохраняет URL-only или redirect contract, когда возможно |

Security recommendations, которые не реализованы, маркируются как production guidance, а не current behavior.

## Privacy и security content

Страница разделяет данные на категории:

1. Участвующие в scoring.
2. Участвующие в coverage/history.
3. Сохраняемые для audit и диагностики.

Она явно описывает:

- client telemetry и её подделываемость;
- signed visitor cookie;
- coarse fingerprint;
- HMAC identifiers;
- сохранение raw body и raw IP в текущем audit;
- page token signing, TTL и replay limitations;
- отсутствие canvas/audio/font/geolocation collection;
- рекомендуемые retention, access control и secret rotation;
- причину, по которой score и reason не возвращаются клиенту.

## README strategy

`README.md` остаётся самодостаточным и содержит:

- назначение и defensive boundary;
- проверенную команду запуска;
- команды тестов/typecheck/build;
- destination URL configuration;
- краткую архитектуру;
- ссылку на Mintlify-документацию.

Подробные таблицы весов, edge cases и эксплуатационные детали переносятся в MDX, чтобы README не дублировал весь docs site.

## Воспроизводимость установки

До публикации quickstart текущий `package-lock.json` должен быть пересоздан через публичный npm registry. Документация не заявляет поддержку `npm ci`, пока чистая установка не подтверждена.

Release gate для этого пункта:

```bash
npm ci
```

в чистой временной директории без существующего `node_modules` и приватного npm cache.

## Валидация

### Code gates

```bash
npm ci
npm test
npm run typecheck
npm run build
```

### Docs gates

```bash
npm run docs:validate
npm run docs:dev
```

`docs:validate` должен проверять `docs.json`, navigation paths, frontmatter, MDX и OpenAPI.

### Smoke checks

- Приложение доступно на `http://localhost:3000`.
- Mintlify preview доступен на `http://localhost:3333`.
- Открываются все четыре верхнеуровневые вкладки.
- Работают внутренние ссылки между reviewer и integrator pages.
- OpenAPI endpoints отображают фактические content types и statuses.
- Русские заголовки и поиск отображаются корректно.
- Code links указывают на существующие файлы.
- Обычный JS submit создаёт `OFFER` audit record.
- No-JS submit создаёт `WHITEPAGE` audit record и отвечает `303`.

## Риски и ограничения

- Manual OpenAPI может расходиться с кодом; риск снижается contract assertions и `mint validate`.
- Разделение по аудиториям может создавать дублирование; страницы должны ссылаться на канонический материал.
- Mintlify и приложение по умолчанию используют порт 3000; docs preview закрепляется на 3333.
- Runtime policy management отсутствует и не должен выглядеть реализованным.
- Текущий lock-файл блокирует воспроизводимый quickstart до регенерации.
- Тесты после `npm run build` сейчас могут находиться дважды из-за скомпилированных копий в `dist/tests`; это должно быть исправлено или исключено из docs acceptance output.

## Definition of done

- В `docs/` существует валидный Mintlify-проект с согласованной навигацией.
- Все перечисленные MDX-страницы содержат конкретный материал без placeholders.
- OpenAPI отражает текущий URL-only/redirect контракт.
- README остаётся автономным и ссылается на docs.
- Публичный lock-файл обеспечивает чистый `npm ci`.
- Уникальные tests, typecheck и build проходят.
- `npm run docs:validate` проходит.
- Приложение и docs preview одновременно запускаются на 3000 и 3333.
- Git diff не содержит generated output, audit data или secrets.
