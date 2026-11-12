# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Sales tracker for a small confectionery business ("Brigadeiro"). Users log product sales, set a sales goal, see weekly revenue, and ask an AI assistant about their data. All user-facing copy is Brazilian Portuguese (pt-BR, BRL currency); keep new UI text and error messages in pt-BR. Code identifiers are English.

There are two independent npm packages and no root `package.json` or workspace. Install and run each from its own directory:

- `frontend/`: React app. It still stores everything in localStorage; it is not wired to the backend yet.
- `backend/`: NestJS API implementing `BACKEND_SCOPE.md`.

**`BACKEND_SCOPE.md` (in pt-BR) is the authoritative API contract**: routes per page, PostgreSQL schema, validation, error format, auth, chat cancellation and acceptance criteria. Read it before backend or integration work.

## Commands

Frontend (`frontend/`):

- `npm run dev`: Vite dev server.
- `npm run build`: `tsc -b` then `vite build`. This is the only typecheck.
- `npm run lint`: ESLint (flat config in `eslint.config.js`).
- `npm run preview`: serves the production build.
- No test framework.

Backend (`backend/`):

```bash
npm run start:dev        # watch mode on PORT (default 3001); Swagger at /api/docs outside production
npm run build            # nest build; postbuild runs `node dist/main.js --validate` (DI wiring check, env from .env.test)
npm run typecheck        # tsc --noEmit over src/ and test/

npm test                 # unit specs (*.spec.ts)
npm run test:e2e         # HTTP specs (*.e2e-spec.ts): real pipeline, service layer mocked
npm run test:int         # integration specs (test/integration/*.int-spec.ts) against a real PostgreSQL
npm run test:all         # all three

npm run migrate:dev      # prisma migrate dev (needs DATABASE_URL); commit the generated migration
npm run migrate:deploy   # apply committed migrations
npx prisma generate      # after any schema.prisma change
```

Single test (extra args go to Jest): `npm test -- src/modules/sales/test/sales.service.spec.ts`, `npm test -- -t "snapshot"`, `npm run test:int -- test/integration/sales.int-spec.ts`.

Every test script loads `backend/.env.test` (dotenv-cli). It sets `TZ=Asia/Tokyo` on purpose, so any date logic that leaks the server's timezone fails.

`npm run test:int` needs no Docker or local Postgres. `test/integration/global-setup.mjs` starts a throwaway PostgreSQL 16 from the `embedded-postgres` package (real server binaries) on a free port and runs `prisma migrate deploy`. `test/integration/int-app.util.ts` then boots the full `AppModule`; only Clerk and Ollama are faked. For local development, `backend/docker-compose.yml` provides Postgres on 5432 (app) and 5433 (test).

Environment:

- `frontend/.env`: `VITE_CLERK_PUBLISHABLE_KEY` (required), `VITE_CHAT_API_URL` (optional; defaults to `http://localhost:3001`).
- `backend/.env`: copy `backend/.env.example`.
  - The app refuses to boot without `DATABASE_URL`, `FRONTEND_URL` (CORS), `CLERK_SECRET_KEY`, `CLERK_ISSUER`, `OLLAMA_URL`, `CHAT_MODEL` and `EMBEDDING_MODEL` (`src/config/configuration.ts`).
  - In production it also needs `CLERK_JWT_KEY`, so tokens are verified offline.
  - `NODE_ENV` must be `development`, `test` or `production`. Unset counts as production, and Swagger and debug logs run only under `development`.
  - Read env only through `EnvConfigService`; add new keys to its `REQUIRED_`/`OPTIONAL_ENV_VARIABLE` lists, `.env.example` and `.env.test`.
  - Ollama needs both models pulled (`BACKEND_SCOPE.md` §5).

## Backend architecture

NestJS 11, Prisma 6, PostgreSQL, Clerk (`@clerk/backend`), Ollama over `fetch`. CommonJS, path alias `@/*` → `src/*`. The layering mirrors the team's other NestJS services (`enliv-comercial-backend`, `enliv-backend-operacional`).

### Module anatomy

`src/modules/<module>/` contains:

- `<module>.module.ts`, `.controller.ts`, `.service.ts`.
- `entities/`, `dto/`, `mapper/`.
- `repository/`: `<name>.repository.ts` holds the interface plus a token such as `SALE_REPOSITORY`; `<name>-prisma.repository.ts` is the Prisma implementation.
- `test/`: specs, plus `test/utils/test.utils.ts` with `mockedXService`, `mockedXRepository` and `defaultX()` fixtures. Reuse and extend those.

Each layer has one job:

- **Controller**: routing, Swagger decorators and `@CurrentUser()`. No logic. The `api` prefix comes from `appConfig`, so write `@Controller('sales')`.
- **Service**: domain rules. Throws Nest exceptions whose message is an `ERROR_CODE` value, e.g. `throw new NotFoundException(ERROR_CODE.SALE_NOT_FOUND)`.
- **Repository**: the only layer that touches Prisma. Services never see Prisma types.
  - Modules wire mappers by string token with `useClass` and repositories with `useFactory`; see `users.module.ts`.
  - Raw SQL goes only through `Prisma.sql` or tagged `$queryRaw`, with parameters.
- **Entity**: snake_case domain class, money as `*_cents`. The constructor generates `id` with `crypto.randomUUID()`.
- **Response DTO**: the API shape: camelCase, money in reais, built with `fromEntity()`. Entities are never serialized directly.

Infrastructure adapters live in `src/infrastructure/<name>/`: `prisma`, `clerk` and `ollama`. Each external gateway has an interface, a token, an implementation and a `mock/` folder.

### Cross-cutting rules (where most bugs would come from)

- **Auth is deny-by-default.**
  - `AuthModule` registers `ClerkAuthGuard` as `APP_GUARD`. It verifies the Bearer token (signature, expiry, `CLERK_ISSUER`, `azp` from `CLERK_AUTHORIZED_PARTIES`, which defaults to `FRONTEND_URL`).
  - The guard then creates or loads the local `users` row from `sub`. There is no login endpoint and no Clerk webhook.
  - Opt a route out with `@Public()`; only `/api/health` does.
- **Identity and isolation.** The owner of any data is `@CurrentUser().id`, never a body or query field.
  - Every repository method takes `scope: UserScope` and puts `user_id` in every `where`, including updates, deletes, aggregates and raw SQL.
  - Another user's row must look exactly like a missing one (404).
  - Use `updateMany`/`deleteMany`/`findFirst` with `{ id, user_id }`; never update or delete by `id` alone.
- **Error envelope.**
  - Every error is `{ error: { code, message, details? } }` (`AllExceptionsFilter`). The message always comes from `src/common/i18n/error-code.pt-BR.ts`, which is a `Record<ErrorCode, string>`, so a new code needs a translation to compile.
  - Unknown errors become a 500 without internals.
  - Validation is **400** (not the 422 used in the other Enliv services). `details` holds `{ field, message }` with dotted paths such as `messages.3.content`.
  - The `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so any undeclared field (`userId`, a sale `price`) is a 400.
- **DTO validators** (`src/common/validators`):
  - Money: `@IsMoney()` (finite, at most 2 decimals, at most `MAX_MONEY_REAIS`).
  - Calendar dates: `@IsCalendarDate()`.
  - Strings: `@TrimTransformer()`, and `@MaxCodePoints(n)` for DB length CHECKs, because class-validator's `MaxLength` miscounts emoji.
  - Ids: `new UuidParamPipe('id')`.
  - Optional body fields: `@IsOmittable()`, not `@IsOptional()`, which lets `null` through. For the same reason, write partial DTOs by hand instead of using `PartialType`.
- **Money.** Integer cents everywhere inside the backend.
  - Convert only at the edges: `reaisToCents` (DTO → entity) and `centsToReais` (response DTO).
  - SQL `SUM` results go through `aggregateToCents`.
- **Dates.** Calendar dates (`YYYY-MM-DD`) are wall-calendar values in the user's `users.timezone` (default `America/Sao_Paulo`); persisted instants are `timestamptz`.
  - Use only `src/common/utils/date.util.ts`, with `AuthUser.timezone`.
  - Day and range queries are half-open `[start, end)`, from `localDateRange`.
  - Weeks start on Monday (`mondayOf`); weekdays are ISO numbers, 1 = Monday … 7 = Sunday (`isoWeekdayOf`), never `getDay()`.
  - The year cap (`MAX_CALENDAR_YEAR`, 9998) applies to input dates only (`isCalendarDate`). The internal parse also accepts the exclusive end of a range, `9999-01-01`; reusing the capped check there made `?endDate=9998-12-31` a 500.
  - Never use server-local `Date` getters or setters.
- **Sale snapshots.** A sale stores `product_name_snapshot`, `unit_price_cents` and `unit_cost_cents` (the product's preparation cost), captured from the product in the same transaction as the write.
  - Editing a product never reprices or re-costs past sales. A sale recorded while the product's cost was 0 keeps cost 0 after the cost is filled in; 0 also means "cost not informed".
  - `lockProductForSnapshot` is a raw query cast to `ProductSnapshot`: a field missing from its SELECT list still compiles and silently reaches the sale as `undefined`. Add the column to the SELECT whenever the type grows.
  - Deleting a product sets `sales.product_id` to NULL (`ON DELETE SET NULL`); it never deletes sales.
  - A PATCH re-snapshots only when `productId` actually changes.
- **Pagination.** `GET /api/sales` uses keyset pagination on `(occurred_at, id)`, taking `limit` (max 100) and an opaque `cursor` (`src/common/pagination/cursor-page.ts`). It always returns `{ items, nextCursor }`.
  - Unfiltered, it pages by 50 by default ("sem filtros, retornar todas as vendas paginadas").
  - With `date` or `startDate`/`endDate`, it returns every match, because the Home day and week totals depend on it. Pagination applies only if the client sends `limit` or `cursor`.
  - Products are not paginated; each user can have at most 500 (`409 PRODUCT_LIMIT_REACHED`).
- **Dashboard metrics** (`GET /api/dashboard/metrics`, `dashboard/utils/sales-metrics.util.ts`).
  - Two scopes in one response: "the period" (the year, or one month of it) for totals, averages, best sellers, weekday and week-of-month; the whole year, always, for `monthlyProfit` and `annualProfit`.
  - One SQL query returns the year's totals per local day; everything else is pure TypeScript over those rows (at most 366), so the month view and the year view can't disagree. Best sellers are a second query, over the period.
  - `DashboardService.getMetrics` is the only place that reads the clock: the default year is the current year in the user's timezone, so the query DTO has no default for it.
  - "Week of the month" is a block of days of the month (1–7, 8–14, 15–21, 22–28, 29–31), unrelated to Monday weeks.
  - `bestWeekday` and `bestWeekOfMonth` are elected by average (per occurrence of the weekday inside the selling span; per month in which the block sold), compared exactly in BigInt, not by total: totals favour whatever the calendar gave more of.
  - A product in the ranking is its resolved name, case-folded by the database's `lower()`: the current catalog name while the sale still points to a product, else the snapshot. The integration cluster runs with `--locale=C`, which does not fold accented letters; grouping tests must differ only in ASCII case.
  - `revenueWithoutCost` is the revenue of sales with cost 0, returned so the screen can say the profit is overstated.
- **Chat cancellation.** The chat controller aborts an `AbortController` when the response closes before `writableEnded`.
  - The same signal reaches context building, embeddings and the Ollama call.
  - Aborts throw `RequestAbortedError`. The filter writes nothing to a closed connection and does not log aborts as failures.
  - Ollama failures are `502 LLM_UNAVAILABLE` or `502 LLM_INVALID_RESPONSE`.
  - In-flight chat requests are capped per user (default 1) and per process (default 4); above that the API returns `429 TOO_MANY_REQUESTS` (`chat/limiter/`).
- **Chat context.** It is built only from the authenticated user's products, sales and goal (`ChatContextPrismaRepository`).
  - Above a small catalog size, products are ranked by embedding cosine similarity, with a bounded in-process LRU of product embeddings.
  - The pt-BR system prompt treats user messages and product names as untrusted data.
  - Known gap: the assistant only sees each product's current preparation cost, groups products by id and ranks best sellers by revenue, so its profit and "best seller" answers can differ from the dashboard metrics (cost stored on each sale, grouping by resolved name, ranking by units).

### Schema notes

`prisma/schema.prisma` mirrors `BACKEND_SCOPE.md` §3, with tables `users`, `products`, `sales` and `sales_goals`.

- Product names are `citext` with a unique `(user_id, name)`, which is the spec's case-insensitive `lower(name)` index. A violation maps to `409 PRODUCT_NAME_CONFLICT`.
- CHECK constraints and the `citext`/`pgcrypto` extensions live in the migration SQL. Prisma doesn't model them and never drops them.
- `20261112000000_sale_unit_cost` is hand-written: it adds `sales.unit_cost_cents` (NOT NULL DEFAULT 0, CHECK `>= 0`) and backfills it with each product's cost at migration time; sales whose product was already deleted keep 0.
- When adding a migration, keep those parts by hand-editing the generated SQL if needed.

### Tests

- **Unit specs**: `Test.createTestingModule` with the repository token bound to `mockedXRepository`. Repository specs construct the repository with a hand-made `PrismaService` mock and assert the `where` clauses, including `user_id`.
- **E2E specs**: `createE2eApp({ imports: [XModule], overrides: [{ provide: XService, useValue: mockedXService }] })` (`src/common/test/e2e-app.util.ts`), then `authenticateAs(user)` and send `AUTH_HEADER`. Pin the clock with `jest.useFakeTimers({ now, doNotFake: [...] })`; full fake timers break supertest.
- **Integration specs**: `createIntegrationApp()`, `authAs('user_x')` and `resetDatabase()` from `test/integration/int-app.util.ts`. They run in band against one shared database.

## Frontend architecture

Stack: React 19, Vite 8, TypeScript, React Router 7, Clerk auth, Tailwind 4 and HeroUI 3. The React Compiler is enabled through the babel plugin in `vite.config.ts`, so don't add manual `useMemo`/`useCallback` for performance.

- **Auth gating**: `src/App.tsx` renders two separate route trees under Clerk's `<Show when="signed-in">` and `<Show when="signed-out">`. Signed-out users are redirected to `/login` from every path.
- **Data layer**: `src/data/*-repository.ts` are synchronous localStorage repositories, with keys `matheus.<name>.v1`.
  - They are seeded with demo data. `src/data/sales.ts` rebuilds the demo sales relative to the current week.
  - Pages call the repositories directly inside `useState` initializers, and each mutation returns the updated data (the full list, or the goal value).
  - Moving to the API makes them async, so page state initialization will need to change.
- **Sale snapshots**: a sale stores `productName` and `price` as a snapshot, with an optional `productId`. Home looks up preparation cost by lowercased product name, not by id.
- **Dates**: dates are local-time `YYYY-MM-DD` strings, and weeks start on Monday (`(getDay() + 6) % 7`). This logic is repeated in `pages/home.tsx`, `pages/dashboard.tsx` and `data/sales-repository.ts`; keep the copies consistent.
- **Header and chat drawer**: `components/common/header/login-button.tsx` has a misleading name. It is the page header *and* the AI chat drawer, and every authenticated page renders it.
  - It POSTs `{ messages }` (the last 20) to `${VITE_CHAT_API_URL}/api/chat` and expects `{ reply }` back.
  - The Stop button cancels the request through an `AbortController`.
- **Styling**: nearly all styles live in one file, `src/App.css` (~1500 lines). It uses semantic class names, not Tailwind utilities, and the brand colour tokens are on `:root`.
  - HeroUI is used only lightly (`Card`, `IconPlus`).
  - Icons come from the Google Material Icons font loaded in `index.html`, via `<span className="material-icons">`.
  - The dashboard line chart is hand-drawn SVG, with no chart library.
- **Undeclared dependency**: `@internationalized/date` (used in `pages/home.tsx`) is not a direct dependency; it arrives through HeroUI.

## Frontend ↔ backend gaps (to resolve when wiring the frontend)

- **Auth token**: the frontend sends no Clerk session token yet. Every backend route except `/api/health` returns 401 without one.
- **Error shape**: the chat drawer reads errors as `{ error: string }`; the API returns `{ error: { code, message, details? } }`.
- **Sale fields**: the API's sale is `{ id, productId, productName, unitPrice, unitCost, quantity, total, profit, date, time }`; the frontend type uses `price`.
- **Home profit**: Home looks up the catalog's current `preparationCost` by product name. With the API it must sum each sale's own `profit` instead, or it will disagree with the dashboard.
- **Dashboard metrics**: the Dashboard page computes its two charts from localStorage and does not call `GET /api/dashboard` or `GET /api/dashboard/metrics` yet.
- **Sale list**: `GET /api/sales` is paginated (`nextCursor`); load further pages where the UI needs every sale.
