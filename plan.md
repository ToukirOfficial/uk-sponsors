# uk-sponsors — build plan

Source of truth: `PRD.md`. Stack and rules: the project rules.

## Commands

| Command | What it does |
| --- | --- |
| `update` | Finds the CSV through the GOV.UK Content API, streams the download, checks columns, builds the index. Shows progress. Only command that uses the network. |
| `search` | Filters (AND): `--name`, `--city`, `--county`, `--route`, `--rating A\|B`, `--limit` (default 50). |
| `check "<name>"` | Yes/no for one company, with routes, city, rating. Shows up to 5 close matches if no exact match. |
| `stats` | Register date, total companies and rows, top 10 cities, counts by route, by type (Worker / Temporary Worker) and by rating. |

Shared flags: `--json`, `--csv`, `--out <file>`. If the data is over 7 days old, every command prints a one-line reminder that names the register date. `--help` has examples plus the OGL v3.0 credit and disclaimer.

## Modules

```
src/cli.ts               entry point (shebang) → program.ts
src/program.ts           commander setup, exit codes (0 ok, 1 user error, 2 network/source error)
src/errors.ts            UserError / SourceError with plain-English "what to do next"
src/commands/            update.ts, search.ts, check.ts, stats.ts
src/register/paths.ts    OS cache folder (XDG on Linux, ~/Library/Caches on macOS, %LOCALAPPDATA% on Windows)
src/register/locate.ts   GET https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers
                         → details.attachments → first text/csv attachment (attachments[0] today).
                         Checks the URL host is assets.publishing.service.gov.uk. Fails clearly if the JSON shape changes.
src/register/download.ts streaming fetch → temp file, progress from content-length, re-checks host after redirects
src/register/columns.ts  required headers: Organisation Name, Town/City, County, Type & Rating, Route; names any missing
src/register/parse.ts    streaming CSV (csv-parse): strips UTF-8 BOM, handles CRLF, keeps accents, drops control characters
src/register/normalise.ts name matching key: case-insensitive; Ltd = Limited, & = and, PLC = plc; ignores punctuation,
                         accents and repeated spaces
src/register/store.ts    group rows into companies; write/read one index file (meta + companies)
src/register/query.ts    filters, check matching, stats
src/output/              table.ts, json.ts, csv.ts
```

## Data flow

`update`: Content API → CSV URL (host checked) → stream into a temp folder in the cache → stream-parse + column check → group by name + town → write `index.json` (meta + companies) in the temp folder → validate it reads back → **rename over** the live `index.json` → remove temp folder. Meta and data live in one file, so the swap is a single atomic rename. Any failure leaves the old cache working.
`search`/`check`/`stats`: read `index.json` (pre-grouped) → filter in memory → print. No network. Target: under 1 s.

Each route row keeps its own type and rating, so filters combine correctly. `Type & Rating` (e.g. `Worker (A rating)`, `Temporary Worker (A rating)`, `Worker (A (SME+))`) → type `Worker`/`Temporary Worker` + rating `A`/`B`. `--route` matches the route name or the type, so `--route "Temporary Worker"` works too. **Register date**: taken from the CSV filename (`..._-_2026-11-02.csv`), falling back to the API's `public_updated_at`.

## Dependencies

Runtime: `commander`, `csv-parse`, `cli-table3` (approved). Dev: TypeScript, Vitest, ESLint (+ typescript-eslint), Prettier, `@types/node`. Build with `tsc`.

## Phases

- [ ] **1. Scaffold** — package.json (bin, ESM, engines ≥22), tsconfig strict, ESLint, Prettier, Vitest, CI workflow for checks.
- [ ] **2. Parse + columns + normalise** — fake fixture CSV (BOM, CRLF, accents, quoted commas, `&`, Ltd/Limited, Temporary Worker routes, multi-route companies), parser, column check, name normalisation. Tests.
- [ ] **3. Index + query** — grouping, atomic index write, filters, check matching, stats. Tests.
- [ ] **4. Output** — table, JSON, CSV (escaping + spreadsheet-formula guard), `--out`. Tests.
- [ ] **5. Update** — cache paths, Content API lookup, host check, streaming download with progress, atomic swap, stale reminder. Tests use a local fake server only.
- [ ] **6. CLI wiring** — commands, help with examples, friendly errors, exit codes. End-to-end test against the fixture.
- [ ] **7. Docs + release** — README (per PRD §5; GIF placeholder), `docs/decisions/` notes, publish workflow on `v*` tag with provenance using `NPM_TOKEN`.
- [ ] **8. Finish** — open PR, merge once checks pass.

## Risks / can't verify here

- This cloud sandbox can't reach gov.uk directly (proxy 403). The Content API shape was confirmed via a scrape on 2 Nov 2026; the real download is only tested via a local fake server. First real `update` should run on your Mac.
- GOV.UK may change the API shape or columns — both are checked and named in the error.
