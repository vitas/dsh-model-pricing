# UX-дизайн — секция прайсинга на странице Models

Статус: черновик v0.1. Скоуп: эпик A (MVP) + визуальный язык бейджей, который
переиспользуют B/C из последующих вех. Опираться на
[feature-map.md](feature-map.md) (что делает) и [architecture.md](architecture.md) (откуда данные).

## 1. Принципы

1. **Честность данных важнее красоты.** У каждой цифры виден или моментально
   достижим источник и возраст; «примерно» сказано словами «примерно».
2. **Не мешать основной задаче страницы.** Models — про ключи и списки моделей;
   прайс-секция живёт ниже всего, свёрнута по умолчанию до заголовка+строки
   статуса и никогда не перехватывает скролл/фокус.
3. **Плотность терминала, а не лендинга.** Табличные цифры, моноширинные цены,
   никаких hero-блогов; вертикальный ритм страницы Models сохраняется.
4. **Тёмная/светлая темы из коробки** — только токены `--dsw-alias-*`
   (перечислены в §7), собственных цветовых литералов не заводим.
5. **Клавиатура и screen reader — первый класс**, секция не должна быть «картинкой
   с фильтрами, до которых не дотянуться tab'ом».

## 2. Размещение и структура

Слот `settings.models.footer` рендерится после строк провайдеров и контролов
добавления — секция прижимается к низу страницы, отсек `Model pricing` отделён
общим разделителем страниц (`--dsw-alias-border-l1`).

Сверху вниз:

```
┌ Model pricing ────────────────────────────────────────────── [⟳ Refresh] [⚙]┐
│ Models.dev · updated 14 min ago · 213 providers / 4 486 models · est., not billing │
├─────────────────────────────────────────────────────────────────────────────┤
│ [⌕ filter by model or provider        ]  (Coding)(Agentic)(Vision)(1M ctx)  │
│ [Only mine ▾]  [Group: provider ▾]            sorted by Output price ▾      │
│                                                                             │
│ ▸ DeepSeek — from $0.14 / $0.28 per 1M · 3 models · ⚠ price differs         │
│ ▾ Z.ai — from $1.40 / $4.40 per 1M · 6 models                              │
│     GLM-5.2      $1.40  $4.40  $0.26   1M   (Coding)(Agentic)(1M ctx)       │
│     GLM-4.7      $0.60  $2.20  $0.11   200k (Coding)(Agentic)               │
│     GLM-4.6V     $0.30  $0.90    —     128k (Vision)                        │
│ ▸ MiniMax — from $0.30 / $1.20 per 1M · 5 models                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Заголовок-строка (всегда видна)

- Название секции — тем же style'ем, что `h`-заголовки карточек страницы.
- Справа: кнопка Refresh (иконка-стрелка, ghost-стиль как у тулбарных кнопок
  страницы), кнопка ⚙ → якорем скролл к карточке настроек плагина (она на
  вкладке Plugins, не здесь).
- Строка статуса: `источник · обновлено N мин назад · счётчики · дисклеймер`.
  Дисклеймер «est., not billing» — tertiary-цвет, сокращается до `est.` на
  узких вьюпортах.

## 3. Состояния секции

| Состояние | Заголовок | Тело |
|-----------|-----------|------|
| Свёрнуто (дефолт при первом визите) | строка статуса видима | `details`-складка: «Show pricing table» |
| Loading (первый fetch после раскрытия) | статус + спиннер в Refresh | skeleton 6 строк таблицы |
| Loaded | как §2 | — |
| Stale (кэш старше TTL) | чип `stale` warn-цветом, tooltip с причиной | таблица обычная |
| Offline (роут хоста недоступен) | `cached · 3 h ago` (or `bundled snapshot · built 2026-09-07`), warn | — |
| Source error (fetch упал на хосте) | error-цвет, tooltip с `code` | данные последней удачной копии |
| Filter empty | — | «No models match — Clear filters» |
| Host half не смонтирован | секции нет вообще | (правило слотов, проверять нечего) |

Пороги: `updated < 1h` — tertiary; `1h..TTL` — label-secondary; `> TTL` — чип
stale. TTL по умолчанию 6h из settings.

## 4. Таблица

### 4.1 Колонки (MVP)

| Колонка | Выравнивание | Формат |
|---------|--------------|--------|
| Provider | left | только в групповом заголовке, в строках не дублируется |
| Model | left | display-name; id — в tooltip; клик = вставить id в фильтр |
| Input $/1M | right | моноширинный, 2–4 знач. цифры, ведущий `$`; `<$0.01` → `0.004` без округления до 0 |
| Output $/1M | right | то же; **колонка сортировки по умолчанию** (решение Q4) |
| Cache read $/1M | right | `—` когда источник не декларирует |
| Context | right | `128k` / `1M` (k/M-суффиксы) |
| Tags | left | чипы §5, максимум 3 + `+N` (tooltip: полный список) |

Строка-детали (по клику на модель, `<details>`-行): description из каталога
(markdown-уважительный plain-text, 2 строки max), `output cap`, modalities
иконками, `structured output` ✓/—, tiered pricing (если `inputTokensAbove` —
поддиапазон «выше 200k: $X/$Y»), блок источников §6, ссылка `Docs`.

Для M2 сюда же приедет строка промо.

### 4.2 Группировка и объём

- Группы по провайдеру (`details`-складки), заголовок группы:
  `name — from $min / $max per 1M · N models · флаги`.
- Развёрнута по умолчанию — одна группа: провайдер текущей сессии, если он в
  каталоге, иначе первая группа по алфавиту.
- Домогательный рендер без виртуализации: всего в DOM строки только раскрытых
  групп (складки — естественная виртуализация для 4.5k моделей).
- Альтернативная группировка `Flat` в тулбаре — та же таблица без складок,
  колонка Provider появляется; нужна для «cheapest first» просмотра.

### 4.3 Сортировка/фильтр

- Клик по хедеру $in/$out/cache/context — циклически `asc→desc→none`; aria-sort.
- Поиск:debounce 150 мс, подстрока по model id/name/provider, без regex.
- Чипы тегов — AND-логика, клик по чипу-в-строке добавляет фильтр.
- `Only mine`: `off · configured · has key` (три состояния; «configured» — есть
  строка провайдера в settings, «has key» — credential confirmed, та же семантика
  зелёной/красной точки, что у строк страницы).

## 5. Язык бейджей (единый для A–C)

| Бейдж | Стиль | Появление |
|-------|-------|-----------|
| Тег (`Coding`, `Agentic`, `Vision`, `1M ctx`, `Open weights`, `Structured out`) | ghost-chip, label-secondary, border-l2 | A3 правила |
| `−N% vs <provider>` | success-tertiary fill | B1 (M2) |
| `cheapest` | success-primary outline | B1 (M2) |
| `PROMO` + подпись (`50% · until Oct 1`) | warn fill, моноширинный срок | B3/B4 (M2–M3) |
| ⚠ divergence | warn-иконка в ячейке цены, tooltip «catalog says $X, your route charges $Y» | §4.2 arch merge |
| `stale` | warn outline chip в статус-строке | §3 |
| `plan` (flat-rate) | brand-primary outline + `$N/mo` вместо $/1M | B2 (M2) |

Правила: не более одного статусного (not tag) бейджа на строку в плоском виде —
при конфликте приоритет `promo > cheapest > stale-flag`; теги считаются фоном,
конфликта не образуют.

## 6. Источник и достоверность (принцип 1)

Каждая цена кликабельна → popover:
`source: models.dev · fetched 14 min ago · route-local (pi-catalog): $1.40/$4.40 ·
license: attribution per row`. При divergent — обе цифры рядом с пометкой, какая
выбрал merge (§4.2 architecture). Popover — на `--dsw-alias-tooltip-bg`, без
своей подсистемы.

## 7. Визуальные токены (из установленного бандла DSH)

| Роль | Токен |
|------|-------|
| Текст основной / secondary / tertiary | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` |
| Фон секции / слоя карточек | `--dsw-alias-bg-base` / `--dsw-alias-bg-layer-1` |
| Бордеры строк/чипов | `--dsw-alias-border-l1` / `-l2` |
| Hover строк | `--dsw-alias-interactive-bg-hover` |
| Кнопка Refresh | `--dsw-alias-button-ghost-*` (как тулбар страницы) |
| Успех/варнинг/ошибка бейджей | `--dsw-alias-state-success-*` / `-warn-*` / `-error-primary` |
| Акцент `plan`/бренда | `--dsw-alias-brand-primary` |

Метрики: строка 32px, h-заголовок секции 15px semibold (как заголовки карточек
Models), цены — `ui-monospace` стека приложения, табличные цифры
`font-variant-numeric: tabular-nums`, боковые отступы — как у карточек страницы
(секция не «шире» карточек).

## 8. Микрокопия (en / ru)

| Ключ | en | ru |
|------|----|----|
| section.title | Model pricing | Цены моделей |
| status.updated | updated {rel} | обновлено {rel} |
| status.source.bundled | bundled snapshot · built {date} | встроенный снапшот · сбор {date} |
| status.est | est., not billing | оценка, не биллинг |
| group.from | from {min} / {max} per 1M | от {min} / {max} за 1M |
| empty.filters | No models match — Clear filters | Ничего не найдено — Сбросить фильтры |
| stale.chip | stale | устарело |
| promo.until | until {date} | до {date} |

## 9. A11y

- Секция — `region` с `aria-labelledby` на заголовок.
- Таблица настоящая (`table/caption/th scope`), складки групп — `th colspan` row
  с button-role внутри; `aria-expanded`.
- Refresh: `aria-busy` во время запроса, результат — `aria-live=polite` строка
  (`Updated 4 486 models · 14 min ago`), ошибки — тот же `aria-live`.
- Сортировка — `aria-sort`; чипы — toggle buttons с `aria-pressed`; popover
  источника — hovercard с focus-trap-free закрытием (Esc).
- Все кликабельные ячейки достижимы tab'ом; контраст чипов ≥ 4.5:1 в обеих темах
  (state-*-tertiary fill'ы это гарантируют).

## 10. Responsive

- `≥ 1280px`: полная таблица.
- `900–1280`: cache-read колонка прячется в строку-детали.
- `< 900`: карточный режим строки (Model / $in→$out одной строкой, контекст +
  теги второй); групповые заголовки остаются; тулбар — горизонтальный скролл
  чипов с gradient-mask (без переноса в 2 ряда).

## 11. Вне скоупа этого дока

- `/pricing` popup и стоимость сессии (D1/D2) — паттерны попапов унаследуют §5/§6
  в M3, отдельный mini-design тогда.
- Карточка настроек `model-pricing` — стандартный pattern cookbook-карт,
  fields = schema §4.4/§3 architecture; дизайн-нужды нулевые.
- Тёмный→светлый диффы скриншотов — появятся с первыми e2e.
