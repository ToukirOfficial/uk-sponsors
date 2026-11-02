# uk-sponsors — build plan

Source of truth: `PRD.md`. Stack and rules: the project rules.

## Commands

| Command | What it does |
| --- | --- |
| `update` | Finds the CSV link on GOV.UK, streams the download, checks columns, builds the index. Shows progress. Only command that uses the network. |
| `search` | Filters (AND): `--name`, `--city`, `--county`, `--route`, `--rating A\|B`, `--limit` (default 50). |
| `check "<name>"` | Yes/no for one company, with routes, city, rating. Shows up to 5 close matches if no exact match. |
| `stats` | Total companies and rows, top 10 cities, counts by route and by rating. |

Shared flags: `--json`, `--csv`, `--out <file>`. Every command prints a one-line hint if the cache is over 7 days old. `--help` has examples plus the OGL v3.0 credit and disclaimer.

## Modules

```
src/cli.ts               commander setup, exit codes (0 ok, 1 user error, 2 network/source error)
src/errors.ts            UserError / SourceError with plain-English "what to do next"
src/commands/            update.ts, search.ts, check.ts, stats.ts
src/register/paths.ts    OS cache folder (XDG on Linux, ~/Library/Caches on macOS, %LOCALAPPDATA% on Windows) — no extra library
src/register/locate.ts   find the CSV link: GOV.UK Content API JSON first, page HTML as fallback
src/register/download.ts streaming fetch → temp file, progress from content-length, atomic rename
src/register/columns.ts  required headers: Organisation Name, Town/City, County, Type & Rating, Route; names any missing
src/register/parse.ts    streaming CSV → rows (csv-parse), trims odd whitespace/BOM
src/register/index.ts    group rows into companies, write/read index.json + meta (download date, source URL, row count)
src/register/query.ts    filters, check matching (exact normalised, then contains/token overlap), stats
src/output/              table.ts, json.ts, csv.ts
```

## Data flow

`update`: GOV.UK page → CSV URL → stream to `register.csv.tmp` → stream-parse + column check → group by normalised name + town → write `index.json` (one entry per company: name, city, county, ratings[], routes[]) and `meta.json` → rename into place. Old cache is kept if anything fails.
`search`/`check`/`stats`: read `index.json` (small, pre-grouped) → filter in memory → print. No network. Target: under 1 s.

Rating is read from "Type & Rating" (e.g. `Worker (A rating)`, `Worker (A (SME+))`) → `A` or `B`.

## Dependencies

Runtime: `commander`, `csv-parse` (streaming), `cli-table3` (table). Dev: TypeScript, Vitest, ESLint, Prettier, `@types/node`. Build with `tsc` (no bundling needed).

## Phases

- [ ] **1. Scaffold** — package.json (bin, ESM, engines ≥22), tsconfig strict, ESLint, Prettier, Vitest, CI workflow for checks.
- [ ] **2. Parse + columns** — fake fixture CSV (quoted commas, accents, `&`, BOM, multi-route companies), parser, column check with clear error. Tests.
- [ ] **3. Index + query** — grouping, filters, check matching, stats. Tests.
- [ ] **4. Output** — table, JSON, CSV (with correct escaping), `--out`. Tests.
- [ ] **5. Update** — cache paths, link discovery, streaming download with progress, atomic write, stale-cache hint. Tests with a local fake server only (no real network).
- [ ] **6. CLI wiring** — commands, help with examples, friendly errors, exit codes. End-to-end test against the fixture.
- [ ] **7. Docs + release** — README (per PRD §5; GIF placeholder), `docs/decisions/` notes, publish workflow on `v*` tag with provenance using `NPM_TOKEN`.
- [ ] **8. Finish** — open PR, merge once checks pass.

## Risks / can't verify here

- This cloud sandbox can't reach gov.uk (proxy 403), so the real download is tested only via a local fake server. First real `update` should be run on your Mac.
- GOV.UK may change the page or columns — handled by link fallback and the column check.
