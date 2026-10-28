# Evaluation

Two generated sections. Do not edit by hand: re-run the scripts.

- Matching quality: `npm run eval:matching`
- /compare latency: `npm run bench:compare`

<!-- BEGIN:matching -->
## Matching evaluation

### Result

| Metric | Value |
| --- | --- |
| Labelled pairs | 130 |
| **EXACT precision** (gate: at least 95%) | **100.0%** |
| EXACT recall | 100.0% |
| Wrong EXACT predictions | 0 |
| Overall accuracy (status and product both right) | 100.0% (130 of 130) |

### Per class

| Class | Labelled | Predicted | Correct | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| EXACT | 49 | 49 | 49 | 100.0% | 100.0% |
| LIKELY | 22 | 22 | 22 | 100.0% | 100.0% |
| SUBSTITUTE | 8 | 8 | 8 | 100.0% | 100.0% |
| UNMATCHED | 51 | 51 | 51 | 100.0% | 100.0% |

### Confusion matrix

Rows are the label, columns are what the matcher said.

| label \ predicted | EXACT | LIKELY | SUBSTITUTE | UNMATCHED |
| --- | ---: | ---: | ---: | ---: |
| EXACT | 49 | 0 | 0 | 0 |
| LIKELY | 0 | 22 | 0 | 0 |
| SUBSTITUTE | 0 | 0 | 8 | 0 |
| UNMATCHED | 0 | 0 | 0 | 51 |

### Disagreements

None: every pair got the labelled status and product.

### How the matcher decides

1. **Barcode first.** A GTIN that matches a catalogue item is EXACT unless the title contradicts it (different size, a bundle, or a different product name), in which case the pair is UNMATCHED.
2. **Size is a hard gate.** Sizes are normalised to ml, g or pcs (0.5 L = 500 ml). A different size, or a different unit family, rules a candidate out. Bundles ("2 x 500 ml") are never matched to a single pack.
3. **EXACT** needs brand, variant, name and size all confirmed, with no unexplained words and no spelling fixes.
4. **Anything uncertain is at most LIKELY** (confidence 0.5 to 0.95, never 1): brand, variant or size not stated; an extra word; a one-letter typo; a shortened name.
5. **A different brand** of an otherwise identical item and size is SUBSTITUTE (confidence 0.6). It is only used in a comparison if the shopper opts in.
6. **Different-product words** (diet, decaf, organic, flavours, low fat and similar) rule a candidate out.
7. **Ties are not guessed.** If two candidates are equally good the result is UNMATCHED and the candidates are listed for an admin.

### Limitations (read before trusting the numbers)

- The labelled set (see `server/src/tests/fixtures/matchingSet.ts`) was written by the same developer who wrote the matcher, from the product rules in `CLAUDE.md`, before the matcher was implemented. It is a regression and sanity set, not an independent benchmark.
- The 34 pairs with ids starting `P` were added as adversarial probes after the matcher was implemented, labelled before being run. On their first run 33 of 34 were correct; the one miss (`P26`, "Dish Wash" written as two words) led to a rule fix, not a label change. The 96 `E`/`L`/`S`/`U` pairs were written before the matcher existed.
- It is small and synthetic: titles follow the three styles used in the sample data plus hand-written look-alikes, against a 40-product catalogue. Real provider titles are messier, so expect lower accuracy on real data.
- The matcher is rule-based and English only. It has no learning component, so adding labelled pairs changes nothing unless the rules are changed.
- The safety property that matters is that wrong auto-confirmations are rare. Anything the matcher is unsure about is LIKELY or UNMATCHED and goes to an admin for review (Phase 6).
<!-- END:matching -->

<!-- BEGIN:latency -->
## /compare latency

Run by `npm run bench:compare`. 300 requests after 20 warm-up requests, sequential, over HTTP, seeded data.

| Metric | Value |
| --- | ---: |
| **p50** | **12.5 ms** |
| **p95** (gate: under 2000 ms) | **22.5 ms** |
| p99 | 28.1 ms |
| max | 68.5 ms |
| Gate | PASS |

| Scenario | Requests | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| 3 items, 110001 | 60 | 16.1 ms | 24.3 ms | 68.5 ms |
| 3 items, 110002, balance | 60 | 12.9 ms | 21.8 ms | 28.1 ms |
| 3 items, 110003, eta | 60 | 10.3 ms | 19.1 ms | 25.5 ms |
| 15 items, 110001, partial | 60 | 14.1 ms | 24.8 ms | 33.3 ms |
| unsupported PIN 999999 | 60 | 5.4 ms | 11.0 ms | 16.5 ms |

Measured against: **MongoDB on the same machine**. Node v22.22.2, linux x64, 1 CPU(s).

**How to read this.** The server does its own work in a few milliseconds; almost all of the time is database round trips (about 4 sequential steps per request, with providers queried in parallel). A database on the same machine therefore flatters the result. Over the internet to Atlas, add the network round-trip time to each step. Re-run `npm run bench:compare` against your own Atlas cluster and use that number, not this one, when you quote latency for your deployment.
<!-- END:latency -->
