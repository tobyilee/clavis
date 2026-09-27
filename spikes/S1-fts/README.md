# S1 — D1 FTS5 trigram (Korean search)

Run against local D1 (workerd): `wrangler d1 execute DB --local --file spikes/S1-fts/fts.sql`, then `queries.sql`.
Remote D1 (2026-09-27): **identical results** — run each query with `--command`; remote `--file` executes
all statements but returns only import stats, not SELECT results.

| Query | Result |
|---|---|
| 3+ Korean chars, partial word (`데이터`, `리팩터`, `결제 A`) | ✅ matched |
| 2 Korean chars (`결제`) via MATCH | ❌ no match (trigram needs ≥ 3 chars) |
| 2 Korean chars via `LIKE '%결제%'` | ✅ matched (full scan) |
| English, case-insensitive (`postgresql`) | ✅ |
| Different spacing (`부분 환불` vs `부분환불`) | ❌ no match |
| AND, column filter (`title:`), frontmatter text | ✅ |
| `snippet()` / `bm25()` with external content | ✅ |
| UPDATE/DELETE via triggers, `rebuild`, `integrity-check` | ✅ |
| `sqlite_version()` | ⛔ not authorized in D1 |

Conclusion: **pass** with an external-content table (`content='pages'`) + triggers.
Queries under 3 characters fall back to `LIKE`. Spacing variants are a known limitation for P1.
