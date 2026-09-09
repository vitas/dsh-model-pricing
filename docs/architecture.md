# Архитектура — dsh-model-pricing

Статус: черновик v0.1 после закрытия Q1–Q4 из
[feature-map.md](feature-map.md). Дизайн UI — следующий документ после ревью этого.

## 1. Контекст и жёсткие ограничения платформы

1. **Out-of-tree.** Плагин живёт вне репо DSH, ставится в профиль
   (`dsh plugin --profile web add dsh-model-pricing`). Следствия:
   - нельзя делать value-импорты из клиентских пакетов DSH (bundle-purity gate);
     типы чужих слотов — только `import type`;
   - кодогенерация typert `/remote`-артефактов пресетом репо не покрыта —
     транспорт выбираем без неё (решение Q1);
   - клиентский бандл обязан воспроизвести формат «lazy-CJS factory artifact»
     лоадера `dsh-client-modules` (свой tsdown-конфиг, S1 в спайках).
2. **Две половины в одном пакете** (по cookbook `adding-a-settings-card`):
   host — `src/`, экспорт `.`; browser — `src/client/`, экспорт `./client` +
   манифест `dsh.client` с `inject` на пакет-хост слота.
3. **Монтаж слотов:** клиент регистрируется в
   `settings.models.footer` (list) и `settings.models.provider-card`
   (keyed, `entryKey = settingsNs` провайдера) через `ctx.slots.inject`;
   активен только когда смонтирован `dsh-client-ui-settings-models`
   (декларация `dsh.client.inject` гарантирует порядок).
4. **Данные моделей для «моих провайдеров»** клиент берёт из тех же сервисов,
   что и страница Models: settings-снапшот + credential-описания +
   `llm/adapters-updated` forwarded event; свою копию каталога не держим.

## 2. Транспорт Host→Client (решение Q1)

Выбран **вариант B: именованный HTTP-роут хоста + embedded-снапшот**, а не
typert Remote и не чистый браузерный fetch.

```
                    ┌────────────────────────── host (Node) ──────────────────────────┐
 models.dev ──fetch──┤ PricingCatalog service ── TTL cache ── prune/merge ── GET       │
 pi-catalog ──import─┤   (ctx.webServer.register('/model-pricing/snapshot'))           │
 (dsh-llm-pi-ai)     └───────────────┬──────────────────────────────────────────────┘
                                     │ same-origin fetch (gzip)
   браузер: client-половина плагина ─┤ 404/офлайн → embedded data/snapshot.json (npm)
                                     └─ promo feed: raw.githubusercontent (CORS *, напрямую)
```

Почему не альтернативы:

- **чистый client fetch models.dev** (CORS `*` проверен curl'ом): каждый браузер
  тянет 4.5 МБ загрузкой страницы, кэш не персистентен, системный прокси
  (`dsh-web-fetch-http`/launch environment) не наследуется, а позже `/pricing`
  (D1) всё равно нужен хостовый доступ к тем же данным. Оставлен только как
  опция «live refresh» и для promo-фида (мелкий файл).
- **typert Remote** — канонический путь, но упирается в недоступную вне репо
  кодогенерацию дeклараций/кодеков. Дорожная карта: переезд на Remote когда
  DSH опубликует генератор для out-of-tree (адаптер транспорта изолирован —
  см. §5 `SnapshotSource`).

Seam подтверждён в установленном бандле: `dsh-client-connection` и
`dsh-host-frontend-static` регистрируют роуты через `ctx.webServer.register`;
webserver — чистый реестр (exact → longest prefix → fallback), gzip по config
профиля web. В headless/SDK-профилях `webServer` нет → host-половина обязана
монтироваться без него (опциональный inject), клиент тогда живёт на embedded
снапшоте.

## 3. Пакет и дерево репозитория

```
dsh-model-pricing/
├── src/
│   ├── index.ts            # apply(ctx): settings.installSection + PricingCatalog + роут
│   ├── config.ts           # z-схема секции model-pricing
│   ├── catalog/
│   │   ├── sources.ts      # SnapshotSource: fetch models.dev | openrouter (опц.)
│   │   ├── merge.ts        # merge с pi-catalog; source stamps; divergence flags
│   │   ├── prune.ts        # поля только для UI (+ белый список провайдеров)
│   │   └── cache.ts        # TTL + persist в storage плагина ($DSH_HOME/storages/...)
│   ├── tags.ts             # движок правил A3 (дефолты + user rules из settings)
│   └── client/
│       ├── index.tsx       # apply(): slots.inject footer + provider-card
│       ├── PricingSection.tsx / PricingTable.tsx / FilterBar.tsx / Badges.tsx
│       ├── store.ts        # client-store слайс: snapshot, filters, refresh-state
│       ├── snapshot-data.ts# import embedded data/snapshot.json (фолбэк)
│       └── locales.ts      # en/ru подписи (ctx.locale)
├── data/snapshot.json      # build-time artifact (генератор ниже), едет в npm
├── promos/<provider>.json  # курируемый вход (PR-контрибуции, B3)
├── promo-dist/index.json   # CI-скомпилированный фид (источник для плагина)
├── scripts/build-snapshot.ts
├── .github/workflows/      # validate-promos.yml, publish-snapshot.yml, release.yml
└── package.json            # exports . / ./client, dsh.client, files+data
```

Единая нейминг-область: `dsh-model-pricing` (settings ns `model-pricing`,
роут `/model-pricing/*`, storage-ключ `model-pricing`, locale ns `model-pricing`).

## 4. Модель данных

### 4.1 Строка прайс-таблицы (`PricingRow`)

```ts
interface PricingRow {
  provider: string; providerName: string;      // id провайдера каталога + display
  modelId: string; name: string; description?: string;
  family?: string;                              // ключ сравнения одной модели (B1)
  cost: { input: number; output: number; cacheRead?: number; cacheWrite?: number;
          tiers?: { inputTokensAbove: number; input: number; output: number }[] };
  context?: number; maxOutput?: number;
  caps: { reasoning: boolean; toolCall: boolean; structuredOutput: boolean;
          attachment: boolean; openWeights: boolean;
          inputModalities: ('text'|'image'|'audio'|'video')[] };
  tags: string[];                                // вычислены тег-движком на хосте
  sources: { origin: 'models.dev'|'pi-catalog'|'override';
             updated?: string; divergent?: boolean }[]; // A2/⚠-иконка
  status?: string;                               // catalog status (deprecated и т.п.)
}
```

Хост отдаёт `{ generatedAt, ttl, rows }` — только просцененные строки включённых
источников. Оценка прореженного снапшота: 213 provider × ~60 полей-минимум ≈
0.8–1.2 МБ raw / ~40–60 КБ gzip; embedded-версия дополнительно режется до
«каталог как у pi-ai + топ-100 по агентной популярности» (~300 КБ raw).

### 4.2 Merge-политика источников

1. Для `(provider, model)`, присутствующих в локальном pi-catalog (т.е. реальных
   маршрутах DSH), цена берётся из pi-catalog — она та, по которой пойдёт запрос.
2. Остальное — models.dev.
3. Расхождение цен > 10% на совпадающей паре → `divergent: true` (иконка ⚠ в UI,
   tooltip с обоими значениями).
4. `status: 'beta'|'deprecated'` и отключённые источники фильтруются до merge.

### 4.3 Promo-фид (B3, контрибуции через PR)

`promos/<provider>.json` (исходник, ревьюится):

```jsonc
[{ "model": "glm-5.2", "promo": "GLM Coding Lite — 50% first month",
   "discountPct": 50, "until": "2026-10-01", "url": "https://z.ai/promo",
   "verifiedAt": "2026-09-01", "by": "github-handle" }]
```

CI (`validate-promos.yml`): zod/ajv-схема, обязательные поля, `until` в будущем,
уникальность `(provider, model, promo)`; на merge в main пересобирает
`promo-dist/index.json` (список активных) — его и фетчит клиент
(CORS `*` подтверждён). Плагин гасит всё, где `until < now` (B4), даже если CI
проспал; свой `until` у строки не бесконечный — mandatory по схеме.

### 4.4 Тег-правила (A3, настраиваемые)

```ts
interface TagRule { tag: string; when: Predicate; }
type Predicate =
  | { field: 'toolCall'|'reasoning'|'structuredOutput'|'openWeights'|'attachment'; equals: boolean }
  | { field: 'context'|'maxOutput'; gte: number }
  | { field: 'description'; contains: string[] }        // lowercase substring
  | { field: 'inputModalities'; includes: string }
  | { all: Predicate[] } | { any: Predicate[] };
```

Дефолтный набор = правила из feature-map A3. В settings: `tagRules.extend`
(дополнить дефолты) и `tagRules.override` (заменить целиком). В v1 редактируется
только JSON-полем карточки настроек — UI-конструктор не делаем.

## 5. Компоненты и контракты

### 5.1 `PricingCatalog` (host, Cordis Service `modelPricing`)

- `inject`: `['settings']` обязательные; `webServer`, `llm` — опциональные
  (через `ctx.inject([...])`, деградация без них).
- `SnapshotSource`-интерфейс (`fetch(): Promise<PricingRow[]>`) — сюда
  models.dev, позже openrouter и (m2) типертовские потребители; merge —
  чистая функция над массивами источников.
- Кэш: память + JSON в `storages`; инвалидация по TTL (default 6h) и по
  `settings`-мутации; `?fresh=1` — force-refresh.
- ETag-кэширование ответа: sha256 снапшота, `304` — страница Models
  обновляется на forwarded events, без If-None-Match не грузим тело.

### 5.2 Роут

`GET /model-pricing/snapshot[?fresh=1]` → `{ generatedAt, ttl, rows }`
(+ `Cache-Control: private, max-age=TTL`); `POST /model-pricing/refresh` (без
тела) — инвалидация, для кнопки Refresh. Оба exact-роута, префиксов не берём
(коллизия с чужими роутами = throw, реестр это проверяет сам).

### 5.3 Клиент

- `apply(ctx)` с `inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope', ...]`
  (ровно как в cookbook, плюс `clientStore`).
- Footer-секция: fetch роута (same-origin) → store → `<PricingTable>` на
  `dsh-client-ui-primitives` (type-import только для контракта слота; примитивы
  рендерим свои — purity gate запрещает value-импорты).
- Провайдер-бейджи: keyed-слот `settings.models.provider-card` с
  `entryKey = settingsNs`: из owner-props берём `ConfigurableProviderView`
  (модельный список карточки) → min/max цены, `cheapest`-чип, активные промо.
- Состояние таблицы — `ctx.clientStore` (тот же сервис, что у страницы Models),
  персист фильтров не делаем.
- Локализация: ключи `model-pricing.table.*` через `ctx.locale`, en + ru.

## 6. Build/CI pipeline

| Workflow | Триггер | Делает |
|----------|---------|--------|
| `build-snapshot.yml` | релиз / weekly cron | `scripts/build-snapshot.ts`: скачивает models.dev + pi-catalog, merge/prune → `data/snapshot.json`, коммит artifact в release + PR с diff цен |
| `validate-promos.yml` | PR в `promos/**` | схема, `until`-гейт, дубликаты |
| `publish-promos.yml` | push main | компиляция `promo-dist/index.json`, push |
| `test.yml` | PR | vitest (merge/prune/cache/tag-engine), typecheck host+client |

`weekly` cron на снапшот — чтобы embedded-фолбэк не протухал между релизами.

## 7. Монтаж в профиль

```sh
dsh plugin --profile web add dsh-model-pricing
```

- Что делает команда из доков: pnpm-установка в профиль; попадёт ли пакет
  автоматически в `dsh.profile.bundles` — **S4 spike**; если нет — в инструкции
  второй шаг: вписать имя пакета в `bundles` профиля или
  `cordis.patch.yml`: `- insert: [{ id: model-pricing, name: dsh-model-pricing }]`.
- Обновление/удаление — стандартный pnpm-цикл профиля; storage-файл плагина
  остаётся (документировать путь очистки).

## 8. Тест-стратегия

- **Чистые функции в приоритете:** merge (pi-vs-models authority, divergent),
  prune, tag-движок (дефолты + extend/override), кэш-политика TTL, парсер
  promo-фида (просрочка/схема).
- Хост-роуты: supertest-подобный прогон над `WebServer`-таблицей (etag, 304,
  `fresh=1`, отсутствие webServer в композиции).
- Клиент: рендер-смоук на `dsh-client-test-runtime`-двойках (`TestRemote`,
  слоты, locale) + golden-разметка пустого/офлайн/ошибочного состояний.
- Контракт снапшота: фикстура `tests/fixtures/modelsdev.sample.json` — защита
  от дрейфа формата models.dev (риск-таблица спеки).
- Ручная приёмка DoD-чеклиста MVP на реальном профиле web.

## 9. Эволюция (согласована с дорожной картой фич)

| Веха | Что добавляет в архитектуру |
|------|------------------------------|
| **M1 = v0.1 (A+E)** | всё вышеперечисленное |
| **M2 (B-auto, C)** | family-группировка в merge (`byFamily: Map` на хосте), blended-метрика A6 в `PricingRow.effective`, промо-колонка в таблице (данные уже есть в `promo-dist`), бейджи карточек |
| **M3 (B-curated UI, D)** | `ctx.commandUi` popup `/pricing` (тот же store), D2-оценка сессии: `ctx.tokenMeter.measure()` доступен только на хосте → маленький Remote-хост-хелпер; если к тому времени появится публичная typert-кодогенерация — это её первый потребитель (S5), иначе — временный роут `POST /model-pricing/session-cost` c id-сессии |

## 10. Спайки (снять до кода M1)

| # | Гипотеза | Успех |
|---|----------|-------|
| S1 | Наш `./client` бандл формата lazy-CJS factory принимается `dsh-client-modules` и доходит до страницы | секция рендерится с HMR |
| S2 | `dsh.client.inject` на `dsh-client-ui-settings-models` гарантирует монтирование после хоста слота | слот не «unknown slot» |
| S3 | Регистрация `ctx.webServer.register('/model-pricing/snapshot')` из out-of-tree плагина в web-профиле | 200/304 из браузера |
| S4 | Поведение `dsh plugin add`: автозапись в `bundles` или нужен патч | documented install path |
| S5 | (для M3) применимость typert-кодогенерации вне репо | отложить с планом B (§9) |

## 11. Риски архитектуры

- **Формат lazy-CJS бандла нигде не задокументирован публично** (только
  tsdown-конфиг репо) — главный технический риск; снимается S1 на 1-й день, фолбэк
  — копировать артефакт-форм с пакета-примера `ui-theme` из npm-dists.
- Фолбэк-роут SPA (`registerFallback`) не даёт префиксу `/model-pricing/`
  провалиться в index.html — exact-регистрация конфликтует только с собой.
- 4.5 МБ парсинг на хосте при старте — ленивый, только по первому запросу
  клиента/Refresh, не на activate.
- models.dev без SLA: схема через `unknown`-валидатор, любая деградация —
  к предыдущему кэш-снапшоту, затем к embedded, UI честно показывает origin+age.
