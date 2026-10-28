# Decisions

Recorded defaults and choices. Each entry says what was decided and why.

## Defaults from the project brief (CLAUDE.md "Defaults")

| Area           | Decision                                                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilot PINs     | 110001, 110002, 110003 supported. 999999 unsupported. One PIN has UNKNOWN coverage for one provider.                                                                                                                             |
| Providers      | Three fictional providers: Demo Provider A, B, C. Different fee structures. C does not serve 110003.                                                                                                                             |
| Products       | About 40 canonical products (dairy, bakery, staples, snacks, beverages, produce, household), including edge cases: Milk 500 ml vs 1 L, differing pack sizes, missing items, out-of-stock, STALE quote, unknown ETA, unknown fee. |
| Shopper auth   | No login for shoppers. Basket is kept in localStorage. JWT plus roles for admin only.                                                                                                                                            |
| Currency       | INR, formatted with `Intl` using `en-IN`.                                                                                                                                                                                        |
| Data           | All seeded, labelled SAMPLE. No scraping, no live provider integration.                                                                                                                                                          |
| Location input | PIN code only. Precise GPS is never stored.                                                                                                                                                                                      |

## Phase 0 choices

### D-001: npm workspaces monorepo

`client/` and `server/` are npm workspaces under one root `package.json`, so one `npm install` and one set of root scripts (`dev`, `build`, `test`, `lint`, `seed`) cover both packages. Lint and format config is shared at the root.

### D-002: Single `.env` at the repo root

The server loads `<repo>/.env` by resolving the path from its own file location, so it works the same from `npm run dev`, `node dist/index.js`, or any working directory. Real environment variables take priority over the file (needed for Render/hosting). `.env` is git-ignored; `.env.example` is committed.

### D-003: Fail fast on bad configuration

Env is validated with Zod at start-up. A missing or short `JWT_SECRET`, a missing `MONGODB_URI` or an invalid `CLIENT_ORIGIN` stops the server with a message listing every problem. There is deliberately no default secret, so a forgotten secret can never ship.

### D-004: Server test runner is Vitest (not Jest)

CLAUDE.md fixes the stack as Vitest for unit tests. The Phase 0 prompt said "Vitest/Jest"; we use Vitest in both packages so there is one runner, one config style and one set of matchers. Supertest is used for API tests.

### D-005: Server is CommonJS with `Node16` module resolution

The installed TypeScript version deprecates `moduleResolution: node`, so the server uses `module`/`moduleResolution` = `Node16`. The server package has no `"type": "module"`, so Node treats it as CommonJS, which keeps `tsx`, Vitest and `node dist/index.js` simple. The client and root config are ESM.

### D-006: Standard error shape from day one

All errors go through one handler and return `{ error: { code, message, details? } }`. Zod errors become 400 `VALIDATION_ERROR`, malformed JSON becomes 400 `INVALID_JSON`, oversized bodies 413 `PAYLOAD_TOO_LARGE`, unknown routes 404 `NOT_FOUND`. Unexpected errors are logged server-side and returned as a generic 500 with no stack trace.

### D-007: Baseline security middleware added early

`helmet`, CORS restricted to `CLIENT_ORIGIN`, `x-powered-by` disabled and a 100 kb JSON body limit are in from Phase 0. Rate limiting is added with the public routes in Phase 3 and re-checked in Phase 7.

### D-008: Dev proxy instead of open CORS

In development Vite proxies `/api` to `http://localhost:4000`, so the client calls a relative `/api/v1` URL. In production, set `VITE_API_BASE_URL` to the deployed API URL and set `CLIENT_ORIGIN` on the server to the deployed client URL.

### D-009: Accessibility linting from the start

`eslint-plugin-jsx-a11y` runs on all client TSX so basic accessibility mistakes fail `npm run lint` before the Phase 7 axe pass.

### D-010: Demo data banner already in the placeholder page

The Phase 0 placeholder shows the "Demo data" note so the honest-data rule is visible from the first screen. The reusable banner component arrives in Phase 4.

## Phase 1 choices

### D-011: A stored quote is a price sheet, not a basket total

A `Quote` is an immutable snapshot of one provider's prices (`items`), fees, discounts and ETA for one PIN code. `estimatedTotal` exists but is `null` in seeded quotes, because a total depends on the basket. The compare endpoint (Phase 3) computes totals per basket; an admin-supplied `estimatedTotal` is validated against its components in Phase 6.

### D-012: PIN coverage semantics

`SUPPORTED` means at least one provider is `AVAILABLE`. `UNSUPPORTED` means every active provider is explicitly `UNAVAILABLE`. Everything else is `UNKNOWN`, including a PIN with no rows at all. A missing row is never read as "not served" (absence of data is not data), and the UNKNOWN message says so. `/providers` returns 200 with all providers `UNKNOWN` for a valid PIN we have no data on, and 400 only for a malformed PIN. PINs are 6 digits and cannot start with 0.

### D-013: Product search uses escaped regex tokens, not `$text`

`$text` only matches whole stemmed words, so a debounced search box would show nothing for "mil". Search splits the query into tokens (`milk 500ml` becomes `milk`, `500`, `ml`), requires every token to match name, brand, variant or pack label (case-insensitive, regex-escaped), and caps tokens at 6 and length at 64. At about 40 products this is fast. The text index is still defined so it is available if the catalogue grows. Express 5's simple query parser never builds objects, so `query[$ne]=x` is an ignored unknown key rather than an operator; repeated params become arrays and are rejected with 400.

### D-014: Fictional brands and reserved example links

Brands are invented so no real brand is shown next to made-up prices. Provider links use `https://example.com/...` (a reserved domain) for A and B, and `null` for C, so the "link only if valid" rule has both cases to exercise.

### D-015: Deterministic ids for seeded documents

Seed ids are derived from stable keys (SHA-1 of `namespace:key`, first 24 hex characters). Reseeding therefore keeps every product, listing and quote id identical, so a basket saved in a browser's localStorage survives a reseed.

### D-016: Tests use mongodb-memory-server-core, never Atlas

One in-memory MongoDB is started per test run and each test file gets its own database, so files run in parallel without interfering and nothing touches Atlas. `mongodb-memory-server-core` downloads its binary on first use rather than at install time. `MONGOMS_SYSTEM_BINARY` can point to an existing `mongod`.

### D-017: Append-only collections

`Quote` and `AdminAuditLog` block update and delete operations through Mongoose (and `save()` on an existing document). This guards against accidents; it is not a security boundary, because the raw driver can still modify data. The seed resets quotes through the raw collection on purpose.

### D-018: Derived fields on products, and a shared units helper

Products store `quantityBase`, `baseUnit` and `packLabel`, computed on validation (litres to ml, kg to g). They give correct size ordering (5 kg before 10 kg), make duplicate detection treat 500 ml and 0.5 l as the same size, and give Phase 2's matcher a normalised size. The conversion lives in `services/units.ts`, which Phase 2 extends rather than duplicates.

### D-019: Atlas-friendly connection handling

`MONGODB_URI` must be a `mongodb://` or `mongodb+srv://` URI that includes a database name (otherwise MongoDB silently uses `test`). Connection failures print a hint for the usual Atlas causes (IP not allow-listed, wrong password, bad host). Only host and database are ever logged, never the password.

### D-020: Honesty constraints in the schema

`verifiedAt` is required unless a service area is `UNKNOWN`. Money fields allow `null` (unknown) or a non-negative amount with at most two decimals, and `null` is the default so an unset fee is never silently `0`. Listings are either mapped (canonical product plus confidence) or `UNMATCHED` (neither). All outbound links must be https or `null`.

### D-021: Seed scope and safety

The seed replaces only the five sample collections. It never touches admin users or audit logs, and refuses to run with `NODE_ENV=production` unless `ALLOW_SEED=true`.

### D-022: Health reports database state without failing

`/health` stays a liveness check (`status: ok` while the process is up) and adds `database: connected | disconnected | ...` for diagnostics, so a database blip does not make a hosting platform restart a healthy process.

### Deferred

Rate limiting for the public routes arrives with the compare endpoint in Phase 3 and is re-checked in Phase 7.

## Phase 2 choices

### D-023: The engine is pure, in `server/src/services`

`money`, `units`, `titleParser`, `matching`, `pricing`, `status`, `ranking` and the shared `engineTypes` import only each other and type-only enums. No database, Express, clock, randomness or environment access. The current time is passed in (`resolveStatus(quote, now)`), so every function is deterministic and unit tested. Money is added in integer paise, so `0.10 + 0.20` is exactly `0.30` and percentages round to the nearest paisa. Invalid input (negative prices, non-integer quantities, weights not summing to 1) throws `RangeError`; Zod rejects it earlier at the API in Phase 3.

### D-024: Matching rules

- **GTIN first.** A barcode that matches a catalogue item is EXACT unless the title contradicts it (different size, a bundle, or a different product name), which is UNMATCHED. A barcode that is not in the catalogue rules out catalogue items that have a different barcode of their own, and does not block items that have none.
- **Size is a hard gate.** Sizes normalise to ml, g or pcs. A different size or unit family rules a candidate out, so 500 ml never matches 1 L even as LIKELY. A title/`packSize` disagreement and bundles ("2 x 500 ml", "pack of 3") are UNMATCHED.
- **EXACT** needs name, variant, brand and size all confirmed with no extra words and no spelling fixes. Confidence is exactly 1.
- **LIKELY** is anything plausible but unconfirmed: brand, variant or size not stated; extra words; a one-letter typo (tokens of 5+ letters); a shortened name; a compound written as two words ("dish wash"). Confidence is `0.30 name + 0.20 variant + 0.25 size + 0.25 brand - 0.1 per extra word`, floored at 0.5 (below that, UNMATCHED) and capped at 0.95.
- **SUBSTITUTE** (confidence 0.6) is the same item and size under a different brand, which requires the listing's brand to be known. Without it, a different brand just looks like extra words and is LIKELY at best.
- **Words that make it a different product** (diet, zero, free, low, fat, double, organic, decaf, flavours and similar) rule a candidate out when the catalogue item does not contain them.
- **No guessing.** Two candidates of the same kind within 0.05 confidence give UNMATCHED, with the candidates returned for review.
- Normalisation also handles case, accents, punctuation, plural nouns, `ltr`/`gm`/`pcs` spellings and `tur`/`toor`, `dahi`/`curd`, `aata`/`atta`.

### D-025: Basket coverage

Coverage counts basket lines, not quantities (3 of 4 lines is 0.75). A line counts when an in-stock offer has a usable match: EXACT always, SUBSTITUTE only when the shopper opts in, LIKELY and UNMATCHED never. EXACT is preferred; a substitute is used only when no exact offer is in stock. Several usable offers: lowest price, then listing id. Each missing line gets a reason: `NOT_LISTED`, `OUT_OF_STOCK`, `UNCONFIRMED_MATCH` or `SUBSTITUTE_NOT_ALLOWED`. Duplicate basket lines are merged by summing quantities. Full-basket mode needs coverage exactly 1; partial mode needs at least one line (`isEligible`).

### D-026: Discounts

Every eligible discount is applied and they add up, matching the formula in `CLAUDE.md` ("minus eligible discounts"). A minimum order value is checked against the item subtotal (before fees and discounts) and a subtotal equal to the minimum counts as met. FLAT subtracts its value; PERCENT takes a percentage of the item subtotal, rounded to the paisa, then capped by `maxDiscount` when present. Total discount can never exceed the item subtotal, so a discount cannot cancel fees or make a total negative. Invalid discounts (zero, negative, over 100%) are skipped and reported, never guessed. Skipped discounts carry a reason (`MIN_ORDER_NOT_MET`, `INVALID`, `NO_ITEMS`). If stacking all discounts turns out to overstate savings for real providers, `applyDiscounts` is the single place to change.

### D-027: Which fees are required

All five (`deliveryFee`, `platformFee`, `smallOrderFee`, `otherFees`, `taxes`) are required by default. A null or missing required fee gives `estimatedTotal: null`, `totalIncomplete: true` and a `FEE_UNKNOWN` warning per fee; the known pieces (item subtotal, known fees total) are still returned. `requiredFees` can relax this; a skipped null fee is then left out of the sum and reported as `FEE_OMITTED`, never counted as 0. An empty line list also gives a null total (`NO_ITEMS`). `smallOrderFee` is applied as the stored amount, because quotes carry no threshold for it.

### D-028: Ranking

- Ranks use competition ranking: equal primary values share a rank (1, 1, 3). Order inside a tie is deterministic: cheaper total, then known ETA, then provider id.
- **Cheapest:** eligible providers with a total. **Fastest:** eligible, known and not-STALE ETA (a provider with an unknown total can still be fastest). **Balanced:** needs both a total and a known, not-STALE ETA.
- **Balanced** normalises price and ETA across the included providers only, with `max(max - min, 1e-9)` as the denominator, so equal values give 0, not NaN. Weights are named `priceWeight` and `timeWeight`, default 0.5/0.5, and must be non-negative and sum to 1 (`RangeError` otherwise). `normalizeWeights` scales arbitrary non-negative weights for UI sliders.
- Excluded providers come back with a reason (`NOT_ELIGIBLE`, `NULL_TOTAL`, `UNKNOWN_ETA`, `STALE_ETA`) and, for the three data reasons, a warning. If nothing can be ranked, a `NO_ELIGIBLE_PROVIDERS` warning is added.
- Ranked items are the original objects plus `rank` (and `score`, `priceNorm`, `timeNorm` for Balanced), so `status` and every other field survive ranking untouched.

### D-029: Status resolution

`resolveStatus` downgrades LIVE, VERIFIED, SAMPLE and ESTIMATED to STALE when `now` is strictly after `expiresAt` (equal is not stale), optionally also when older than `staleAfterMinutes`, and for invalid dates. A stored STALE is never upgraded; UNAVAILABLE is left alone. The result keeps `storedStatus` and `isSample`, so a sample quote that expired is shown as stale without losing the fact that it was sample data.

### D-030: How matching quality is measured

The evaluation reports precision and recall per class, a confusion matrix and the number of wrong EXACT predictions. The headline gate is EXACT precision of at least 95%, because a wrong auto-confirmation is the harmful error. The 96 original pairs were labelled before the matcher existed. 34 adversarial probes were written afterwards and labelled before being run; one failed (a compound word) and the matcher was fixed, with the label left alone. Both sets are in the gate set (130 pairs). They were written by the person who wrote the matcher, so the 100% is a regression guarantee, not an independent benchmark; `docs/evaluation.md` says so.

### D-031: The engine and the seed data agree

A test runs the matcher over all 119 seeded listings and requires the same status and product as the seed labels. It caught a Phase 1 seed error (a title that said "salted" but was labelled LIKELY, which the matcher correctly calls EXACT), so the seeded LIKELY butter listing now omits the variant, with confidence 0.8.

## Phase 3 choices

### D-032: Adapters, registry and one failure never failing the request

The compare service talks to providers only through `ProviderAdapter` (`getServiceability`, `getQuote`, `getProductListings`). `SeededDbAdapter` reads MongoDB; `LiveProviderAdapterTemplate` is a documented template whose methods reject with `NotConfiguredError`. `DefaultAdapterRegistry` picks an adapter per provider: a registered override by slug, else by `dataSourceType` (SEED and MANUAL read stored data; AUTHORISED_API uses a live factory if set, else the template). Each provider is queried in parallel with `Promise.allSettled` under a per-provider time limit (default 3000 ms, `ADAPTER_TIMEOUT_MS`). A timeout, a thrown error, corrupt data or an unconfigured adapter puts that provider under `unavailableProviders` with a warning and never changes the others. Error text from adapters is logged server-side and never returned to the client. A timed-out call cannot be cancelled in JavaScript, so it keeps running in the background; its late result or failure is swallowed.

### D-033: When /compare answers 200, and when 502

502 `PROVIDERS_UNAVAILABLE` is returned only when at least one provider was queried and every one of them failed or timed out. A provider that is simply not serving the PIN, or has no data, is not a failure. An unsupported or unknown PIN is a valid question with an honest answer, so it is 200 with empty rankings and a `PIN_UNSUPPORTED` or `PIN_UNKNOWN` warning.

### D-034: Serviceability is checked first, and unknown is still asked

A provider whose service area is `UNAVAILABLE` is not asked for a quote (`NOT_SERVING`). A provider that is `UNKNOWN` (explicit or no row) is still asked: absence of data is not proof it does not deliver. If it has no quote the result is `NO_QUOTE` with `serviceability: UNKNOWN`, which the UI must word differently from "does not deliver".

### D-035: Where results go

- `results`: eligible providers ranked for the chosen `sortBy`.
- `partialResults`: in full-basket mode, providers with coverage below 1 (not ranked, with `missingItems` and reasons).
- `unrankedResults`: providers that cannot be ranked for this `sortBy`, with `unrankedReason`. A complete basket with an unknown fee is `NULL_TOTAL` and is not placed in the cheapest ranking, but a provider with an unknown total can still be ranked by ETA.
- In `partial` mode incomplete baskets are ranked (flagged, with a `PARTIAL_BASKET` warning, because their totals are not comparable with a full basket). Providers with nothing available are `NO_ITEMS`.

### D-036: `allowSubstitutes` added to the request

CLAUDE.md says a different-brand substitute is used only if the user opts in, but its request body has no way to say so. `allowSubstitutes` (boolean, default false) was added. Product ids are matched case-insensitively and each product may appear once (increase `quantity` instead). Limits: 25 lines, quantity 1 to 20. Unknown top-level or item fields are rejected so a typo cannot pass silently. `weights` is accepted with any `sortBy` but only used and echoed for `balance`.

### D-037: Quotes in the response

`quoteId` in each result is the stored snapshot used; `GET /quotes/:quoteId` returns it in full with staleness applied at read time. The compare service uses the LATEST snapshot per provider and PIN. Prices and stock come from the quote, but the product mapping and match status come from the listing, so an admin re-mapping (Phase 6) takes effect without creating a new quote.

### D-038: Rate limiting and proxies

`express-rate-limit` applies 300 requests per minute per IP to the API (not `/health`) and 60 per minute to `POST /compare`, returning 429 in the standard error shape with `Retry-After`. Counts are held in memory per server process, which is right for one instance; a multi-instance deployment would need a shared store. Behind a hosting proxy set `TRUST_PROXY=1` so the real client IP is used (Phase 8).

### D-039: Latency measurement

`npm run bench:compare` measures end-to-end HTTP latency (300 sequential requests, five scenarios) and writes p50/p95/p99 to `docs/evaluation.md`, failing if p95 is not under 2000 ms. The result records whether the database was local or Atlas, because a local database flatters the number. The figure in the repository was measured against a local MongoDB; re-run it against your Atlas cluster.
