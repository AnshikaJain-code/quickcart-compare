# QuickCart Compare

A location-aware prototype that compares the same grocery basket across quick-commerce providers by total estimated cost, delivery ETA and availability.

> **Status:** Phase 3 (compare API). The frontend arrives in Phase 4. Full documentation is written in the final phase.
>
> **Data policy:** all data is seeded and labelled SAMPLE. Providers are fictional (Demo Provider A/B/C). No scraping, no live provider integration.

## Quick start

```bash
cp .env.example .env     # set MONGODB_URI (Atlas) and JWT_SECRET
npm install
npm run seed             # loads the SAMPLE dataset into MongoDB
npm run dev              # server :4000, client :5173
npm run build && npm run test && npm run lint
npm run eval:matching    # matcher precision/recall, rewrites docs/evaluation.md
npm run bench:compare    # /compare latency against your database (seed first)
npm run docs:api         # regenerates docs/api.md from real responses
```

- **Database:** a free MongoDB Atlas (M0) cluster. Step-by-step setup and troubleshooting: [docs/atlas-setup.md](docs/atlas-setup.md).
- **Tests** use a temporary in-memory MongoDB and never touch Atlas. The first run downloads a `mongod` binary (cached afterwards).
- **Matching quality:** see [docs/evaluation.md](docs/evaluation.md) (what the numbers do and do not show).
- **Data:** see [docs/data-policy.md](docs/data-policy.md) for what the sample data contains and the rules around it.

## API

Full reference with real example responses: [docs/api.md](docs/api.md).

| Endpoint                                         | Purpose                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `GET /api/v1/health`                             | Liveness, version and database state                                |
| `GET /api/v1/locations/validate?pinCode`         | `SUPPORTED`, `UNSUPPORTED` or `UNKNOWN` for a PIN code              |
| `GET /api/v1/providers?pinCode`                  | Active providers with serviceability for that PIN                   |
| `GET /api/v1/products?query&category&page&limit` | Paginated, searchable canonical products                            |
| `POST /api/v1/compare`                           | Compare a basket across providers (rank by total, ETA or a balance) |
| `GET /api/v1/quotes/:quoteId`                    | The stored price snapshot behind a result                           |
