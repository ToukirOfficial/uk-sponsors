# uk-sponsors

A free command-line tool to search the UK Home Office register of licensed visa sponsors. Find which companies can sponsor you by name, town or city, and visa route, in under a second.

<!-- Terminal GIF goes here: docs/demo.gif (record with `vhs` or `asciinema` on a Mac). -->

```text
$ uk-sponsors search --city Leeds --route "Skilled Worker"
┌────────────────────────────┬───────────┬────────────────┬────────┬───────────────────────────────────────────────────────┐
│ Company                    │ Town/City │ County         │ Rating │ Routes                                                │
├────────────────────────────┼───────────┼────────────────┼────────┼───────────────────────────────────────────────────────┤
│ Acme Software Ltd          │ Leeds     │ West Yorkshire │ A      │ Global Business Mobility: Senior or Specialist Worker │
│                            │           │                │        │ Skilled Worker                                        │
├────────────────────────────┼───────────┼────────────────┼────────┼───────────────────────────────────────────────────────┤
│ Northern Care & Health PLC │ Leeds     │                │ A      │ Skilled Worker                                        │
└────────────────────────────┴───────────┴────────────────┴────────┴───────────────────────────────────────────────────────┘
```

_(Example rows from the test fixture.)_

## Why

If you need a UK work visa, only a company on the Home Office "Register of licensed sponsors: workers" can hire you. GOV.UK publishes it as a CSV file with over 100,000 rows that changes almost every day. It's slow to open in Excel and impossible on a phone. uk-sponsors turns it into one command.

## Install

You need [Node.js](https://nodejs.org) 22.12 or newer.

```sh
npm install -g uk-sponsors
uk-sponsors update
```

Or run it without installing:

```sh
npx uk-sponsors update
npx uk-sponsors search --city Leeds --route "Skilled Worker"
```

`update` downloads about 11 MB from GOV.UK. Run it whenever you want the latest data. If your data is more than 7 days old, every command reminds you.

## Examples

**Software companies in Manchester that sponsor Skilled Worker visas**

```sh
uk-sponsors search --name software --city Manchester --route "Skilled Worker"
```

**Is this company a licensed sponsor?**

```sh
uk-sponsors check "Acme Software Ltd"
```

Matching ignores case and punctuation, and treats `Ltd`/`Limited` and `&`/`and` as the same. If there's no exact match, you'll see close matches.

**A-rated sponsors in Leeds, saved as a spreadsheet**

```sh
uk-sponsors search --city Leeds --rating A --limit 5000 --out leeds.csv
```

**Temporary Worker sponsors (Creative Worker, Charity Worker, Seasonal Worker and others)**

```sh
uk-sponsors search --route "Temporary Worker"
uk-sponsors search --route "Creative Worker" --city London
```

**Totals, top cities, and counts by route and rating**

```sh
uk-sponsors stats
```

## Commands and options

| Command          | What it does                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `update`         | Downloads the latest register. The **only** command that uses the internet.               |
| `search`         | Finds sponsors. Filters combine (all must match).                                         |
| `check "<name>"` | Yes or no for one company, with its routes, town and rating, or close matches.            |
| `stats`          | Register date, totals, top 10 towns and cities, counts by route, licence type and rating. |

`search` filters:

| Option            | Matches                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `--name <text>`   | Any part of the company name                                                                     |
| `--city <text>`   | Town or city (whole words, any case)                                                             |
| `--county <text>` | County                                                                                           |
| `--route <text>`  | Part of a route name (`"Skilled Worker"`, `"Global Business Mobility"`), or `"Temporary Worker"` |
| `--rating <A\|B>` | Sponsor rating                                                                                   |
| `--limit <n>`     | Most results to show (default 50)                                                                |

Add `--help` to any command for more examples.

## Output formats

- **Table** (default): easy to read in a terminal.
- **`--json`**: for scripts, e.g. `uk-sponsors search --city Leeds --json | jq '.[].name'`.
- **`--csv`**: for spreadsheets and other tools.
- **`--out <file>`**: saves to a file instead of printing. The format comes from `--json`/`--csv`, or the file extension (`.json`, `.csv`).

Messages and reminders go to stderr, so piped JSON and CSV stay clean.

Exit codes: `0` success, `1` something to fix on your side (e.g. no data yet, a bad option), `2` a network problem or a change on GOV.UK.

## How it works

1. **Find the file.** `update` asks the [GOV.UK Content API](https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers) for the publication. It takes the CSV attachment and checks the link is on `https://assets.publishing.service.gov.uk` before downloading.
2. **Stream it.** The CSV is downloaded and parsed as a stream, never loaded into memory all at once.
3. **Check the columns.** Every load checks for `Organisation Name`, `Town/City`, `County`, `Type & Rating` and `Route`. If GOV.UK renames or removes one, you get a clear message naming it instead of wrong results.
4. **Build a small index.** Rows for the same company (one row per route) are grouped into one company with a list of routes. The result is saved as one file in your user cache folder.
5. **Swap it in safely.** The new index is built in a temp folder, checked, then moved over the old one in one step. A failed update leaves your existing data working.
6. **Search locally.** `search`, `check` and `stats` only read the index, so they work offline and answer in well under a second.

Cache folder: `~/.cache/uk-sponsors` on Linux, `~/Library/Caches/uk-sponsors` on macOS, `%LOCALAPPDATA%\uk-sponsors\Cache` on Windows. Set `UK_SPONSORS_CACHE_DIR` to use another folder. Nothing is written to your current folder unless you use `--out`.

## Hard problems and decisions

- **The source can change at any time.** Both the API shape and the CSV columns are checked on every update. Changes are reported by name, with exit code 2.
- **One company, many rows.** The register has one row per route. Rows with the same name in the same town become one company. The same name in a different town stays separate, as it does on the register.
- **Messy names.** "O'Brien & Sons Limited", "OBRIEN AND SONS LTD" and "O’Brien & Sons Ltd." all match each other. Accents, extra spaces and punctuation don't get in the way.
- **Worker and Temporary Worker.** The register covers both licence types. Each route keeps its own type and rating, so `--route` and `--rating` combine correctly.
- **Safe CSV.** Names that start with `=`, `+`, `-` or `@` get a `'` in front so spreadsheets can't run them as formulas.
- **Speed.** The index stores each company's normalised name, so 100,000+ companies load in about 0.3 s.

Short notes on each decision are in [`docs/decisions/`](docs/decisions/).

## Tests

```sh
pnpm install
pnpm test
```

The tests use a small fake CSV ([`test/fixtures/register.csv`](test/fixtures/register.csv)) with a UTF-8 BOM, Windows line endings, accented names, quoted commas and Temporary Worker routes. They never download the real register or use the internet. `update` is tested against a local fake server.

All checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Privacy

No telemetry, no tracking. The only network calls are to GOV.UK, and only when you run `update`.

## Data licence and disclaimer

Data: Home Office, [Register of licensed sponsors: workers](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers), published on GOV.UK under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

**Disclaimer:** the register lists companies that are licensed to sponsor workers. It doesn't mean a company is hiring, or that it will sponsor a particular role. Always check with the employer, and see [GOV.UK](https://www.gov.uk/browse/visas-immigration/work-visas) for visa rules. This tool isn't affiliated with the Home Office.

## Licence

MIT. See [LICENSE](LICENSE).
