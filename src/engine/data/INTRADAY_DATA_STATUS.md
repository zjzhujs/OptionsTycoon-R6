# V27 Offline Intraday Data Status

Runtime policy: **zero network**. Historical gameplay data ships locally; no runtime market/news/option-chain/content-pack fetch is allowed.

## R1 coverage ledger

Machine-readable truth source: `content_packs/r1_intraday_v1/R1_MARKET_DATA_COVERAGE_V27.json`.

- 2025-01-23 — REAL canonical daily only. Complete intraday path: **DATA_UNAVAILABLE**.
- 2025-01-24 — REAL canonical daily + seven real regular-session hourly/final-partial NVDA bars. **DATA_ONLY**: no material decision windows are created just because the data exists.
- 2025-01-27 — REAL canonical daily + real intraday Golden Trading Day. Material reveal windows: 10:30 / 11:30 / 14:30 / 15:30 ET, plus the 08:00 EVENT_ONLY DeepSeek beat.
- 2025-01-28 — REAL canonical daily. Complete intraday path: **DATA_UNAVAILABLE**; the rebound must not be reconstructed from daily O/H/L/C.
- 2025-01-29 — REAL canonical daily + verified FOMC EVENT_ONLY timing where used. Complete NVDA intraday path: **DATA_UNAVAILABLE**.
- 2025-01-30 — REAL canonical daily only. Complete intraday path: **DATA_UNAVAILABLE**.
- 2025-01-31 — REAL canonical daily + real intraday Golden Trading Day. Material reveal windows: 10:30 / 11:30 / 13:30 / 15:30 ET.

## Jan 24 data-only session

`nvda_2025-01-24.json` stores the cited StatMuse session rows verbatim. Source display basis uses Jan-23 close 147.00; the campaign canonical Jan-23 close is 147.22. A frozen pre-session factor `147.22 / 147.00` normalizes OHLC into the same basis as the campaign daily nodes. No Jan-24 bar participates in that factor. The normalized open/high/low cross-check the canonical Jan-24 daily node within the engine tolerance.

`material_windows` is intentionally empty. This is a permanent design separation:

**data coverage != dramatic pacing**.

A richer historical path may exist for Review, future direction, or pricing context without forcing the PM through mechanical hourly quizzes.

## Truth / anti-lookahead rules

- Never infer an intraday path from a daily O/H/L/C bar.
- Future bundled bars remain private until an explicit reveal window authorizes them.
- EVENT_ONLY windows do not claim a current executable price.
- Daily campaign nodes remain authoritative settlement.
- `DO NOTHING` / `HOLD` remain official PM decisions.
- Option marks/Greeks remain DERIVED/OFFLINE MODEL unless a separately verified historical option chain is bundled.
