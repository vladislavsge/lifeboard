# Мой трекер (lifeboard)

Личный трекер-конфигуратор: финансы и карты, тренировки и программы, курение, покупки для дома, записи к врачам и **свои трекеры** с произвольными полями. Mobile-first PWA, без сервера — все данные в IndexedDB браузера.

## Стек и команды

- Svelte 5 (руны) + TypeScript + Vite. Без UI-библиотек, без роутер-библиотек, без chart-библиотек.
- `npm run dev` — dev-сервер (порт 5173, `--host` для проверки с телефона в той же сети)
- `npm run check` — svelte-check (должно быть 0 ошибок и 0 предупреждений)
- `npm run build` — сборка в `dist/` (статичные файлы, относительные пути — можно хостить где угодно)
- `npm run icons` — перегенерировать PNG-иконки из `scripts/gen-icons.mjs`
- TypeScript закреплён на 6.x: svelte-check пока не работает с TS 7.

## Архитектура

- `src/lib/store.svelte.ts` — единое `$state`-хранилище `data` (коллекции-массивы + `settings`). Автосохранение в IndexedDB через `$effect` по каждой коллекции (debounce 300 мс + flush на `visibilitychange`/`pagehide`). CRUD-хелперы `add/find/update/upsert/remove`, справочники, реестр модулей, экспорт/импорт JSON.
- `src/lib/nav.svelte.ts` — hash-роутер (`router.path`, `go`, `goBack`, `replaceRoute`), стек нижних шторок (`openSheet/replaceSheet/closeSheet` — пишут в history, системная «назад» закрывает шторку), `toast`, `ask` (диалог подтверждения).
- `src/lib/types.ts` — все сущности. **Деньги — целые центы. Даты — локальная строка `YYYY-MM-DDTHH:mm`** (сравниваются как строки; периоды — `periodRange` + `inPeriod` из `utils.ts`).
- `src/App.svelte` — разбор маршрута и выбор страницы; рендерит `BottomNav`, `SheetHost`, тост и диалог.
- `src/modules/<module>/` — страницы и формы каждого раздела. Формы — компоненты шторок: принимают `close` и открываются через `openSheet(Form, props)`, верстка через `SheetFrame`.
- `src/data/` — стартовые справочники (категории, магазинные категории, специальности врачей, пресеты трекеров) и библиотека упражнений + шаблоны программ. **id встроенных упражнений стабильны** — на них ссылаются тренировки.
- Стили — `src/app.css` (токены в `:root`, светлая тема через `[data-theme='light']`, утилитарные классы `.card .list .row .btn .chip .seg .stat …`).

## Связи между модулями

Курение (покупки), Покупки (чеки), Врачи (стоимость визита) и свои трекеры (поле «Деньги») создают операции в финансах через `syncLinkedTx()` — у операции есть `source: { module, refId }`, у записи-источника — `txId`. Служебные категории (`system: 'smoking' | 'groceries' | 'health'`) находятся через `systemCategoryId()`. При удалении операции ссылки снимаются (`removeTransaction`).

## Финансы: бюджеты и регулярные платежи

- `data.budgets` — месячные лимиты (`categoryId` пустой = на все расходы). Расчёт прогресса, остатка в день и прогноза — `budgetStatuses()` в `modules/finance/finance.ts`.
- `data.recurring` — подписки/аренда/зарплата. `processRecurring()` (store) при запуске и при смене дня создаёт операции с `source.module = 'recurring'` для `auto`-платежей и сдвигает `nextDate` через `advanceDate()` (поле `day` держит «якорное» число месяца). Ручные (`auto: false`) подтверждаются через `payRecurring()`.
- `frequentTx()` — частые операции для чипов в форме, `previousPeriod()/deltaPct()` — сравнение с прошлым периодом, `exportCsv()` — выгрузка (`;` + BOM для Excel).
- Страница `/stats` (`pages/Stats.svelte`) собирает сводку и автоматические выводы по всем включённым разделам.

## Свои трекеры: цели

`Tracker.goal` + `goalMode` ('min' | 'max') — дневная цель по первому полю «число/деньги/длительность» (иначе по числу записей). Логика в `modules/custom/tracker.ts` (`goalDayValue`, `goalMet`, `goalStreak`, `goalProgress`), отображение — `GoalProgress.svelte`.

## Модули и «конфигуратор»

`settings.modules` — упорядоченный список `{ id, enabled }`: встроенные (`finance`, `workouts`, `smoking`, `groceries`, `health`) и `tracker:<id>` для своих трекеров. Порядок = порядок карточек на главной. Новый встроенный модуль: добавить id в `BUILTIN_MODULE_IDS` и `BUILTIN_MODULES`, маршрут в `App.svelte`, виджет в `pages/Home.svelte`, действия в `pages/QuickAdd.svelte`, при необходимости — в `History`/`Calendar`.

## Соглашения

- Интерфейс полностью на русском, обращение на «вы».
- Поля ввода не меньше 16px (иначе iOS зумит), цели касания ≥ 40px, учитывать `safe-area`.
- Новые поля данных — необязательные, с миграцией в `migrate()` (store), чтобы старые бэкапы импортировались.
- Предупреждение `state_referenced_locally` отключено намеренно: формы берут начальные значения пропсов один раз.
