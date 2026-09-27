# S2 / S3 — CPU cost of save and lint

`pnpm bench` (full pipeline) and `pnpm exec tsx breakdown.ts` (per component). Node 24 on Apple Silicon;
Workers hardware may be slower, so treat these as lower bounds. Remote results below were measured on Cloudflare with a throwaway `clavis-bench` Worker (`worker.ts`, since deleted).

| Scenario | 10KB p95 | 50KB p95 | 100KB p95 |
|---|---|---|---|
| S2 save (blocking rules + link extraction) | 0.21ms | 0.31ms | 0.51ms |
| S3 full (Clavis rules + remark + markdownlint) | 12.9ms | 61.1ms | 120.7ms |

Breakdown at 100KB (p50): Clavis rules (line scan) 0.40ms · remark+gfm 49.8ms · markdownlint 59.1ms.

## Remote (Cloudflare, cpuTime from `wrangler tail`, 2026-09-27)

| Path | 10KB median / max | 50KB median / max | 100KB median / max |
|---|---|---|---|
| Save: all Clavis rules + link extraction | 2 / 12ms | 2 / 10ms | 3.5 / 6ms |
| remark + gfm parse | 25 / 63ms | 81 / 122ms | – |
| markdownlint | 28.5 / 50ms | 111.5 / 149ms | – |

- Cloudflare hardware ran these 5–7× slower than Apple Silicon.
- Max values on small docs are first-request JIT warm-up.
- The free plan tolerated occasional overruns (up to ~290ms) before killing an isolate (`exceededCpu`, HTTP 503). Do not design around this leniency.
- Benchmark pitfall: an O(n²) document generator inflated the first 100KB run; fixed in `gen.ts`.

Conclusion: S2 **pass** with a large margin. S3 **fail** — any AST-based parsing costs ~0.5ms/KB
and cannot run on the free plan even at 10KB. Clavis's line-scanning rules are ~100× cheaper.
