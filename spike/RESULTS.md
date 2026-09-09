# Spike results

Прогон: 2026-09-09, DSH 0.1.2-rc.1 (npx-установка), macOS, node v25.
Два стенда: **live** (`dsh web` на :3080 — GUI этой сессии, `patchReload: live`)
и **клон** (одноразовый `DSH_HOME=/tmp/dsh-probe-home dsh web --port 3099`).

## S3 — webServer-роут из out-of-tree плагина: ✅ PASS

- `spike/src/pricing-host.js` — ESM `.js`, `apply` → `ctx.inject(['webServer'])`
  → `webServer.register({kind:'exact', path, handler})`, disposer через `ctx.effect`.
- Монтаж absolute-path insert'ом в `~/.dsh/profiles/web/cordis.patch.yml`.
- Live-релоад патча: роут поднялся без рестарта, `200` + JSON; откат (`[]`) → `404`.

## S1 — клиентский бандл принимается dsh-client-modules: ✅ PASS (серверная часть)

Стенд: клон, пакет `spike/client-spike2` (name `dsh-model-pricing-spike2`,
exports `.`/`./client`, `dsh.client {platform: web, inject: [settings-models]}`),
смонтирован патчем **по имени пакета** (`name: dsh-model-pricing-spike2`).

- Хост-половина смонтирована при буте (маркеры в `/tmp/spike2.log`: module
  evaluated → apply ran → route registered), probe-роут `200`.
- `GET /` (с auth-cookie из boot-token) → в index есть комбо-строка
  `/plugins/??…46 ртов…,dsh-model-pricing-spike2/client.js&rev=…` — **наш бандл в
  графе**, 46 фабрик скачиваются одним curl'ом, `id: "dsh-model-pricing-spike2"`
  внутри совпадает с именем пакета.
- Формат `window.__ModuleLoader__.load({id, factory:(require)=>{…exports…}})`
  принят без ошибок; внешних `require("react")` достаточно (реакт в графе есть).

Не доказано серверной частью: рендер слота в браузере (см. S2 — проверка глазами).

## S2 — порядок монтирования и рендер в footer-слот: 🟡 ждёт eyeball-проверки

- Порядок в графе доказан: наша строка идёт после `dsh-client-ui-settings-models`
  (позиции 18 → 45 в комбо и после него в preload-реестре) — `dsh.client.inject`
  отработал как документировано.
- Сам `<div>⚡ spike</div>` в Settings → Models ниже карточек видно только из
  браузера: открыть на клоне `http://127.0.0.1:3099/?<boot-token>` → Settings →
  Models → прокрутить в футер.

## S4 — как ставить пакет: ⚠️ нюанс live-монтажа

- `dsh plugin --profile web add <dir>` → pnpm-link в node_modules профиля;
  пакет **не** попадает в `dsh.profile.bundles` без `dsh.bundle` манифеста
  (warning у команды дословный: «installed as a plain dependency, not a
  profile layer»).
- Монтаж по имени пакета работает при **буте**; вживую в долгоживущем live
  экземпляре runtime-patch insert по bare-name **не смонтировался** (probe 404,
  маркеров нет), хотя абсолютный path-монтаж в том же live поднимался.
- Практический вывод для dev-цикла: после `dsh plugin add` + патча по имени —
  рестарт сервера; live-редактирование допустимо только path-монтажом.
- Бонус-наблюдение платформы: ESM-модуль path-смонтированного плагина
  переживает перезапись файла (кэш по URL): после смены кода нужен новый id+путь
  либо рестарт; также live-релоад патча выбирается с неровной задержкой
  (единицы–десятки секунд) и частые перезаписи патча гонятся друг с другом.

## Итог для архитектуры

Ставка §2 architecture.md (host-роут + out-of-tree dual-face пакет + client
scan) подтверждена end-to-end на уровне сервера; браузерный шаг — один клик
пользователя. Никаких блокирующих неизвестных не осталось; S5 (typert-кодоген)
по-прежнему отложен до M3.

## Артефакты

- `spike/src/pricing-host.js` — S3 хост-роут (— live-проверка пройдена).
- `spike/client-spike2/` — S1/S2 dual-face пакет (host с probe-роутом и
  логированием в `/tmp/spike2.log`; client — div в footer-слот).
- Стенд-клон: убить `pkill -f 'dsh.*--port 3099'`; домашний каталог
  `/tmp/dsh-probe-home` — смывать руками.
- Профиль live-сервера после экспериментов возвращён к `[]` (проверить!).
