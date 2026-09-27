# S6 — Nightly backup on the free plan

Code: `apps/worker/src/backup/` (tar writer + `runBackup`). Seed: `pnpm exec tsx seed.mts` (from `spikes/S2-S3-cpu`)
writes `seed.sql`; `cleanup.sql` removes it.

## Design constraints found
- Free plan: **50 subrequests per invocation, including every D1/R2 call**, and 10ms CPU for Cron runs.
  One file per page (500 R2 puts) is impossible → one D1 `batch()` + one tar object ≈ 5 subrequests.
- Korean paths exceed tar's 100-byte name field → PAX `path` headers. Verified with macOS `tar`.

## Remote run (2026-09-27, Cron `* * * * *` temporarily)

| Data | Result | cpuTime | wallTime |
|---|---|---|---|
| 500 pages × 10KB (5.36MB), 50 parents × 9 children | ✅ `outcome: ok`, 6.4MB tar, 501 entries, tree paths correct | **106ms** | 6,984ms |

Conclusion: **functionally passes, but uses ~10× the nominal 10ms CPU**. It succeeded only through the
platform's leniency, the same behaviour seen in S2/S3.

## Chunked backup (decision: D-30 revised)

`runBackupStep` archives the next chunk of pages per Cron run (size cut done inside D1 with a running
`SUM() OVER (ORDER BY rowid)`), records a cursor in `backup/{date}/state.json`, and writes `meta.json`
in the final run. Measured by calling the same function through a temporary, secret-guarded endpoint,
because the per-minute Cron did not fire for 30+ minutes after one redeploy (schedule changes
propagate with a delay of minutes, sometimes much longer). CPU for the first two rows comes from the GraphQL Analytics API (`workersInvocationsAdaptive`, which is
sampled); the adopted variant was measured per run with `wrangler tail` (run the binary directly — launched
through `pnpm exec` in a background subshell it silently captured nothing).

| Variant | Runs for 500 pages | CPU P50 | CPU max seen |
|---|---|---|---|
| ~357KB chunks, full page metadata every run | 18 | 9.95ms | 15.1ms |
| ~150KB chunks, full page metadata every run | 34 | 7.86ms | 8.39ms |
| **~150KB chunks, 6 path columns per run, full metadata once (adopted)** | 34 | **5.5ms** | **9ms** (P90 7ms, all 34 `ok`) |

Cost model from the first two rows: ~0.01ms per KB of content + a fixed ~6ms per run, most of it
loading metadata for every page. Narrowing that query is what keeps the fixed part from growing
with the wiki. All 34 parts extracted together rebuild the full tree (50 parents + 450 children).
