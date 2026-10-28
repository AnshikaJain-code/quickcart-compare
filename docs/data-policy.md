# Data policy

This project is a **prototype**. It does not contain, scrape or fetch real prices, real stock or real delivery times from any company.

## Rules

1. **Everything is sample data.** The three providers are fictional (Demo Provider A, B and C). Brands are fictional too (for example "Meadow Fresh", "Golden Crust"). Prices, fees and delivery times are invented and are not market prices.
2. **No scraping, no unofficial APIs, no bypassing logins or rate limits.** Real data could only be added later through an official or authorised API, or manual entry that the data owner has agreed to.
3. **Every record says where it came from.** Providers carry `dataSourceType` (`SEED` for the sample set). Service areas, listings and quotes carry `source` (`seed`).
4. **Unknown is never zero.** A fee, ETA or coverage value that is not known is stored as `null` (or `UNKNOWN`). A confirmed zero is stored as `0`. Missing coverage rows mean UNKNOWN, not "not served".
5. **Quotes are immutable snapshots.** A new price check creates a new quote; old quotes are kept. Through Mongoose, quote updates and deletes are blocked.
6. **Links are only stored when valid** (https only). A provider without an official link stores `null`, and the UI must not show a link.
7. **Anywhere sample data is shown, the UI says so.** The API returns `isSampleData: true` for sample coverage so the client can show the "Demo data" banner.

## Source status values

| Status        | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `LIVE`        | Fetched from an authorised live source (not used in this prototype). |
| `VERIFIED`    | Checked by a person against an authorised source.                    |
| `SAMPLE`      | Invented demo data. Every seeded quote except one uses this.         |
| `ESTIMATED`   | Derived or approximated, not directly observed.                      |
| `STALE`       | Past its expiry time. Shown with a warning, never as current.        |
| `UNAVAILABLE` | The source could not provide a value.                                |

The single `VERIFIED` quote in the seed (Demo Provider A, PIN 110002) exists only so the status can be exercised in tests and the UI. Its data is still invented.

## What the sample data contains

**Providers and coverage** (`pinCode` x provider)

| PIN    | Demo A      | Demo B      | Demo C      | `locations/validate` |
| ------ | ----------- | ----------- | ----------- | -------------------- |
| 110001 | AVAILABLE   | AVAILABLE   | AVAILABLE   | SUPPORTED            |
| 110002 | AVAILABLE   | **UNKNOWN** | AVAILABLE   | SUPPORTED            |
| 110003 | AVAILABLE   | AVAILABLE   | UNAVAILABLE | SUPPORTED            |
| 999999 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNSUPPORTED          |
| 400001 | no rows     | no rows     | no rows     | UNKNOWN              |

**Products:** 40 canonical products across dairy, bakery, staples, snacks, beverages, produce and household. Sizes are separate products (Milk 500 ml and 1 L, Rice 1 kg and 5 kg, Cola 750 ml and 2.25 L, Eggs 6 and 12). Two (Toned Milk 500 ml and 1 L) carry fake internal-range GTINs for matching tests.

**Listings:** 119 provider listings. Each provider writes titles differently (`Meadow Fresh Toned Milk 500 ml`, `Milk - Toned (Meadow Fresh) 500ml`, `MEADOW FRESH MILK TONED 0.5 L`). Deliberate edge cases:

- Not listed by one provider: Pav Buns, Atta 10 kg and Oat Cookies (B), Spinach (C).
- `SUBSTITUTE` listing: Demo C offers a different brand of Full Cream Milk 500 ml.
- `LIKELY` listing: Demo C's butter title is close but needs review (confidence 0.8).
- Three `UNMATCHED` look-alikes with no canonical product: Toned Milk 250 ml (A), Brown Bread 600 g (B), Toned Milk 2 x 500 ml bundle (C).

**Quotes:** 8 snapshots (one provider x PIN each, plus an older one):

| Quote               | Status   | Edge case                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| A / 110001 (older)  | SAMPLE   | Superseded by the newer snapshot; the latest `retrievedAt` must win.      |
| A / 110001 (latest) | SAMPLE   | Eggs 6 out of stock; flat discount with a minimum order value.            |
| A / 110002          | VERIFIED | The one verified example.                                                 |
| A / 110003          | SAMPLE   | `etaMinutes` is `null` (unknown).                                         |
| B / 110001          | SAMPLE   | Percentage discount with a cap and a minimum order value.                 |
| B / 110003          | STALE    | Retrieved 3 days ago, expired 2 days ago.                                 |
| C / 110001          | SAMPLE   | `platformFee` is `null` (unknown), so a total cannot be exact.            |
| C / 110002          | SAMPLE   | `platformFee` is `0` (confirmed free); White Sandwich Bread out of stock. |

Prices are explicit per provider in `server/src/seed/data.ts`, so totals can be checked by hand. Prices are the same at every PIN for a provider; fees, ETA, discounts and status differ per quote.

## Resetting the data

`npm run seed` clears and reloads the sample collections (not admin users or audit logs). IDs are derived from stable keys, so a reseed does not change any product, listing or quote id.
