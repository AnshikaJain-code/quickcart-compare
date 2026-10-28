# Progress

## Phase 3: Adapters and compare API. DONE

### Done

- **`ProviderAdapter` interface** and `SeededDbAdapter` (service area, latest quote snapshot, listings), plus `LiveProviderAdapterTemplate` (documented, not implemented) and `DefaultAdapterRegistry`.
- **`POST /api/v1/compare`**: validates with Zod, queries every active provider in parallel with a 3 s limit (`Promise.allSettled`), computes coverage, totals, staleness and rankings with the Phase 2 engine, and returns `results`, `partialResults`, `unrankedResults`, `unavailableProviders` and `warnings`. Supports `sortBy` total, eta and balance, `mode` full-basket and partial, optional `allowSubstitutes` and `weights`.
- **`GET /api/v1/quotes/:quoteId`** returns a stored snapshot in full.
- **Rate limiting** (429 in the standard shape with `Retry-After`), `TRUST_PROXY`, `ADAPTER_TIMEOUT_MS` and `QUOTE_STALE_AFTER_MINUTES` settings.
- **Tests** (116 new): totals equal hand-calculated values on the seeded data (arithmetic in `fixtures/seedExpectations.ts`), all three sort orders including weight changes that reorder, full vs partial baskets, out of stock, substitutes, unsupported and unknown PINs, timeout, thrown error, unconfigured live adapter, corrupt data, all providers failing (502), rate limiting, and a wide set of malformed requests (clear 400s).
- `docs/api.md` is generated from real responses (`npm run docs:api`). `docs/evaluation.md` now also holds the latency result (`npm run bench:compare`). Decisions D-032 to D-039.

### Verification gate

- All server and client tests, build, lint and formatting pass (see the final numbers in the hand-off message).
- Ran the real seed, the benchmark and `docs:api` against a real standalone `mongod`. Live API output matches the hand-calculated totals (for example PIN 110002: Demo Provider A 363, Demo Provider C 369).
- Benchmark on a local MongoDB: p50 12.5 ms, p95 22.5 ms (gate under 2000 ms).

### Not verified here

- **Atlas latency.** The benchmark was run against a database on the same machine. Over the internet to Atlas each database step adds a network round trip. Run `npm run bench:compare` against your cluster to get your real number.
- Atlas itself has still not been connected (see Phase 1 notes and `docs/atlas-setup.md`).

### Assumptions

- Quotes are never fetched live: every number comes from stored (sample) snapshots (D-037).
- Rate-limit counters live in process memory (D-038).

### Next: Phase 4 (frontend: location, search, basket)

React pages for PIN entry and validation, product search with debounce, basket with localStorage, the always-visible Demo data banner, and loading, error and empty states, with accessibility checks. Needs no new setup from you.

---

## Phase 2: Core comparison engine. DONE

### Done

- **Pure engine functions** in `server/src/services` (no database, Express, clock or randomness): `normalizeUnit`, `parseProductTitle`, `matchListing`, `computeCoverage` (plus `isEligible`), `applyDiscounts`, `computeEstimatedTotal`, `resolveStatus`, `rankCheapest`, `rankFastest`, `rankBalanced` (plus `normalizeWeights`). Shared types are exported from `engineTypes.ts` for the Phase 3 API.
- **Tests first.** Fixtures with hand-worked arithmetic written before any implementation (`server/src/tests/fixtures`), then the suites were run and confirmed failing (8 of 8 files red), then the implementation was written.
- Every rule in `CLAUDE.md` "Core logic" is covered, including: 500 ml vs 1 L is never EXACT; fuzzy matches stop at LIKELY; a null fee gives `estimatedTotal: null` and `totalIncomplete: true`, never 0; an unknown ETA is excluded from Fastest and never treated as 0; STALE and SAMPLE statuses survive ranking; the balance score is checked by hand for five weight settings and does not divide by zero when all values are equal; ties; a single eligible provider; all providers ineligible.
- **Labelled matching set:** 130 pairs (96 written before the matcher, 34 adversarial probes written after). `npm run eval:matching` prints precision and recall and writes `docs/evaluation.md`.
- Decisions D-023 to D-031 recorded.

### Verification gate (all passed)

- Tests: server 350 passing (15 files), client 5 passing.
- `npm run eval:matching`: EXACT precision 100% (gate 95%), EXACT recall 100%, 0 wrong EXACTs, overall accuracy 130/130. The probes found one real gap on their first run (a compound written as two words); the rule was fixed, not the label.
- `npm run build`, `npm run lint` and `npm run format:check` are clean.
- The matcher agrees with all 119 seeded listings. That caught an error in the Phase 1 seed (see D-031); the seed was corrected.

### Honest limits

- The 100% matching score is on a set written by the same person who wrote the matcher. It guards against regressions and obvious mistakes, but real provider titles are messier, so do not read it as expected accuracy on real data (details in `docs/evaluation.md`).
- Nothing in the engine is wired to the database or an endpoint yet; that is Phase 3.

### Assumptions (see decisions for the reasoning)

- All eligible discounts stack (D-026); minimum order is checked on the item subtotal.
- All five fees are required for a total (D-027); `smallOrderFee` is applied as the stored amount.
- Coverage counts basket lines, not quantities (D-025).

### Next: Phase 3 (compare API and adapters)

`ProviderAdapter` interface with `SeededDbAdapter` and a documented live-adapter template, `POST /compare` and `GET /quotes/:id` with Zod validation, 3-second adapter timeouts via `Promise.allSettled`, partial results with warnings when one provider fails, rate limiting, and API tests. Phase 3 composes the Phase 2 functions with the Phase 1 data; it needs no new setup from you.

---

## Phase 1: Data layer. DONE

### Done

- **Models** for all seven collections with indexes and validation: `Provider`, `ServiceArea`, `CanonicalProduct`, `ProviderListing`, `Quote`, `AdminUser`, `AdminAuditLog` (`server/src/models`). Unknown (`null`) versus zero fees, https-only links, PIN format, listing match rules, derived product sizes, and append-only quotes and audit logs.
- **MongoDB Atlas support:** URI validation (scheme and database name required), connection helper with failure hints, host-only logging, and `docs/atlas-setup.md`.
- **Idempotent seed** (`npm run seed`): 3 fictional providers, 12 service-area rows, 40 products, 119 listings, 8 quotes, with deterministic ids. It covers every edge case in the brief (see `docs/data-policy.md`).
- **Endpoints:** `GET /locations/validate?pinCode` (SUPPORTED, UNSUPPORTED or UNKNOWN), `GET /providers?pinCode` (per-provider serviceability), `GET /products?query&category&page&limit` (token search, category filter, pagination). All validated with Zod and returning the standard error shape.
- `/health` now also reports `database` state. Server start-up connects to MongoDB first and exits with a clear message on failure.
- `docs/data-policy.md`, `docs/atlas-setup.md`, README quick start, `.env.example` updated; decisions D-011 to D-022 recorded.

### Verification gate (all passed)

- Server tests: 78 passing across 7 files (models, seed, locations, providers, products, db helpers, health, env). Client tests unchanged (5 passing).
- `npm run build`, `npm run lint` and `npm run format:check` are clean.
- Ran the real `npm run seed` twice against a real standalone `mongod` 7.0: identical counts both times.
- Ran the built server against that database and called each endpoint with `curl`: PIN 110002 is SUPPORTED (2 of 3, one UNKNOWN), 999999 is UNSUPPORTED, 400001 is UNKNOWN, `milk 500ml` returns exactly Milk Full Cream 500 ml and Milk Toned 500 ml, invalid input returns 400 `VALIDATION_ERROR`.
- Start-up failure messages checked for: pasted web link, missing database name, unreachable cluster, unresolvable Atlas host. The password never appears in output.

### Not verified here

- **Atlas itself.** The build sandbox cannot create or reach an Atlas cluster, so the Atlas connection has not been exercised. The code path is identical to a standalone `mongod` except for the `mongodb+srv://` scheme (DNS SRV lookup) and TLS, both handled by the driver. Follow `docs/atlas-setup.md`, run `npm run seed`, and check `/api/v1/health` shows `"database": "connected"`.

### Assumptions

- Tests run on an in-memory MongoDB (downloaded on first run), so they need network access once, or `MONGOMS_SYSTEM_BINARY` pointing to a local `mongod`.
- Prices are the same at every PIN for a provider; fees, ETA, discounts and status vary per quote.
- Quote `items` hold the provider's full price sheet; `estimatedTotal` stays `null` until a basket is priced (Phase 3).

### Next: Phase 2 (core comparison engine, tests first)

Pure functions with no database: `normalizeUnit`, title and pack-size parsing, product matching with confidence, fee and discount calculation, basket pricing, ranking and "why" explanations, with a labelled fixture set of about 60 title pairs and hand-calculated basket totals. Phase 2 needs no new setup from you.

---

## Phase 0: Foundations. DONE

### Done

- `CLAUDE.md` saved verbatim from the Master Context.
- Git repo initialised on `main`; monorepo structure created (`client/`, `server/`, `docs/`) matching CLAUDE.md.
- `.gitignore`, `.env.example` (PORT, MONGODB_URI, CLIENT_ORIGIN, JWT_SECRET, optional GEOCODING_API_KEY, PROVIDER_API_KEY), `.editorconfig`, README placeholder.
- **Server:** Express + TypeScript; Zod-validated config (`config/env.ts`); `GET /api/v1/health` returns `{ status, version }`; central error handler with the standard error shape; helmet, restricted CORS, 100 kb body limit; Vitest + Supertest (7 tests: health, 404 shape, invalid JSON, env validation).
- **Client:** Vite + React + TypeScript + Tailwind v4; placeholder page with Demo data note and live server-status check; typed `services/api.ts` (base URL from `VITE_API_BASE_URL`, `ApiError` parsing the standard error shape); Vitest + Testing Library (5 tests).
- ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier for both packages.
- Root scripts: `dev`, `build`, `test`, `lint`, `lint:fix`, `format`, `format:check`, `seed` (stub).
- `docs/decisions.md` records the Defaults and Phase 0 choices (D-001 to D-010).

### Verification gate (all passed)

- `npm run build`: server (tsc) and client (tsc + vite) build.
- `npm run test`: server 7/7, client 5/5.
- `npm run lint`: clean. `npm run format:check`: clean.
- Built server run from `server/`: `/api/v1/health` returned `{"status":"ok","version":"0.1.0"}`; unknown route and bad JSON return the standard error shape; CORS returns only the configured origin.
- `npm run dev`: client on :5173 proxies `/api/v1/health` to the server on :4000.
- Missing `.env` stops the server with a clear message listing each problem.
- Client bundle contains no secrets. `npm run seed` runs the stub.

### Assumptions

- Node 20+ and npm 10+. MongoDB is not needed until Phase 1 (config only checks that `MONGODB_URI` is set; no connection is made yet).
- Dependency versions are whatever npm resolved at install time and are locked in `package-lock.json`.

### Next: Phase 1

Mongoose models for all collections, idempotent seed script (3 demo providers, pilot PINs, ~40 products, listings, quotes with the listed edge cases), `GET /locations/validate`, `GET /products`, `GET /providers?pinCode=`, Supertest tests and `docs/data-policy.md`.
Phase 1 needs a MongoDB instance (local or Atlas) and a decision on how tests get one (planned: `mongodb-memory-server`).
