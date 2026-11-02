# uk-sponsors

[![CI](https://github.com/ToukirOfficial/uk-sponsors/actions/workflows/ci.yml/badge.svg)](https://github.com/ToukirOfficial/uk-sponsors/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/uk-sponsors.svg)](https://www.npmjs.com/package/uk-sponsors)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node.js 22.12+](https://img.shields.io/badge/node-%3E%3D22.12-blue.svg)](https://nodejs.org)

A free command-line tool to search the UK Home Office register of licensed visa sponsors. Find which companies can sponsor you by name, town or city, visa route and industry, in under a second.

![uk-sponsors checking a company, then finding software companies in Leeds that sponsor Skilled Worker visas](docs/demo.gif)

## Why

If you need a UK work visa, only a company on the Home Office "Register of licensed sponsors: workers" can hire you. GOV.UK publishes it as a CSV file with over 140,000 rows that changes almost every day. It's slow to open in Excel, impossible on a phone, and it doesn't say what each company does. uk-sponsors turns it into one command, and can add each company's industry from Companies House.

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

**Optional:** to search by industry, run this once as well:

```sh
uk-sponsors enrich
```

It reads Companies House's free company data (about 470 MB, no account or key needed) and takes a minute or two. See [Industry search](#industry-search).

## Common questions

**Which software companies in Leeds sponsor Skilled Worker visas?**

```sh
uk-sponsors search --city Leeds --route "Skilled Worker" --industry software
```

**Which IT companies in Manchester can sponsor me?**

```sh
uk-sponsors search --city Manchester --route "Skilled Worker" --industry it-services --limit 200
```

**Is this company a licensed sponsor?**

```sh
uk-sponsors check "Acme Software Ltd"
```

Matching ignores case and punctuation, and treats `Ltd`/`Limited` and `&`/`and` as the same. If there's no exact match, you'll see close matches. After `enrich`, you also see the company number, status and SIC codes.

**Which law firms in London sponsor visas?**

```sh
uk-sponsors search --city London --industry legal-services
```

**Which companies have "data" in their name?**

```sh
uk-sponsors search --name data --route "Skilled Worker"
```

**Can I get the list as a spreadsheet?**

```sh
uk-sponsors search --city Leeds --rating A --limit 5000 --out leeds.csv
```

**Who sponsors Creative Worker, Charity Worker or Seasonal Worker visas?**

```sh
uk-sponsors search --route "Temporary Worker"
uk-sponsors search --route "Creative Worker" --city London
```

**How many sponsors are there, and where?**

```sh
uk-sponsors stats
```

## Commands and options

| Command          | What it does                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `update`         | Downloads the latest register from GOV.UK.                                                |
| `enrich`         | Optional. Adds company number, status and industry (SIC) codes from Companies House.      |
| `search`         | Finds sponsors. Filters combine (all must match).                                         |
| `check "<name>"` | Yes or no for one company, with its routes, town and rating, or close matches.            |
| `stats`          | Register date, totals, top 10 towns and cities, counts by route, licence type and rating. |

`search` filters:

| Option                         | Matches                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `--name <text>`                | Any part of the company name                                                                     |
| `--city <text>`                | Town or city (whole words, any case)                                                             |
| `--county <text>`              | County                                                                                           |
| `--route <text>`               | Part of a route name (`"Skilled Worker"`, `"Global Business Mobility"`), or `"Temporary Worker"` |
| `--rating <A\|B\|provisional>` | Sponsor rating. New UK Expansion Worker sponsors have a provisional rating.                      |
| `--industry <preset>`          | An industry preset (below). Needs `enrich`.                                                      |
| `--sic <codes>`                | SIC codes, e.g. `62012,62020`, or `62xxx` for every code starting 62. Needs `enrich`.            |
| `--include-inactive`           | With `--industry`/`--sic`: also show companies in liquidation, being struck off and so on.       |
| `--limit <n>`                  | Most results to show (default 50)                                                                |

Add `--help` to any command for more examples.

## Industry search

The sponsor register only has names and towns. `uk-sponsors enrich` adds what each company does, from the free [Companies House Basic Company Data](https://download.companieshouse.gov.uk/en_output.html) snapshot:

1. It finds the newest snapshot on Companies House's download page and checks the link is on `download.companieshouse.gov.uk`.
2. It streams the 470 MB zip straight through unzip and the CSV parser. Nothing large is saved to disk.
3. It matches each sponsor to a company by name (the same matching as `check`) and town. If only one company in the UK has that name, a match in another town counts too, because company names are unique. A former company name in the same town is the last resort. Anything less certain is left unmatched.
4. It saves the company number, status and SIC codes in your cache folder, and reports the match rate.

On the register dated 2 November 2026, **104,118 of 127,486 sponsors (81.7%)** were matched. Most of the rest aren't companies: NHS trusts, universities, schools, charities, partnerships and sole traders.

Presets (UK SIC 2007 codes):

| Preset           | Codes                                           | What it covers                                        |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `software`       | 62012, 62020, 62090, 63110, 58290               | Software, IT consultancy, data processing and hosting |
| `it-services`    | 62xxx                                           | All computer programming and IT services              |
| `fintech`        | 64191, 64921, 64929, 64999, 66110, 66120, 66190 | Banks, lending, payments and other financial services |
| `health-tech`    | 21100, 21200, 26600, 32500, 72110               | Pharma, biotech and medical devices (not care homes)  |
| `legal-services` | 69101, 69102, 69109                             | Barristers, solicitors and other legal services       |

Only companies with the status **Active** are shown unless you add `--include-inactive`. SIC codes are what each company tells Companies House, so a preset is a good guide, not a guarantee. Run `enrich` again whenever you like; once a month is plenty.

## Output formats

- **Table** (default): easy to read in a terminal, with colour.
- **`--json`**: for scripts, e.g. `uk-sponsors search --city Leeds --json | jq '.[].name'`.
- **`--csv`**: for spreadsheets and other tools.
- **`--out <file>`**: saves to a file instead of printing. The format comes from `--json`/`--csv`, or the file extension (`.json`, `.csv`).

After `enrich`, JSON output has a `companiesHouse` object (number, status, SIC codes and how it was matched) and CSV output has `company_number`, `company_status` and `sic_codes` columns.

Colour is only used when printing to a terminal. Set `NO_COLOR=1` to turn it off, or `FORCE_COLOR=1` to keep it when piping. Messages and reminders go to stderr, so piped JSON and CSV stay clean.

Exit codes: `0` success, `1` something to fix on your side (e.g. no data yet, a bad option), `2` a network problem or a change on GOV.UK or Companies House.

## How it works

1. **Find the file.** `update` asks the [GOV.UK Content API](https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers) for the publication. It takes the CSV attachment and checks the link is on `https://assets.publishing.service.gov.uk` before downloading.
2. **Stream it.** The CSV is downloaded and parsed as a stream, never loaded into memory all at once.
3. **Check the columns.** Every load checks for `Organisation Name`, `Town/City`, `County`, `Type & Rating` and `Route`. If GOV.UK renames or removes one, you get a clear message naming it instead of wrong results. `enrich` does the same for the Companies House columns.
4. **Build a small index.** Rows for the same company (one row per route) are grouped into one company with a list of routes. The result is saved as one file in your user cache folder.
5. **Swap it in safely.** The new index is built in a temp folder, checked, then moved over the old one in one step. A failed update leaves your existing data working.
6. **Search locally.** `search`, `check` and `stats` only read the local files, so they work offline and answer in well under a second.

Cache folder: `~/.cache/uk-sponsors` on Linux, `~/Library/Caches/uk-sponsors` on macOS, `%LOCALAPPDATA%\uk-sponsors\Cache` on Windows. Set `UK_SPONSORS_CACHE_DIR` to use another folder. Nothing is written to your current folder unless you use `--out`.

## Hard problems and decisions

- **The source can change at any time.** The API shape, the download page and the CSV columns are all checked. Changes are reported by name, with exit code 2.
- **One company, many rows.** The register has one row per route. Rows with the same name in the same town become one company. The same name in a different town stays separate, as it does on the register.
- **Messy names.** "O'Brien & Sons Limited", "OBRIEN AND SONS LTD" and "O’Brien & Sons Ltd." all match each other. Accents, extra spaces and punctuation don't get in the way.
- **Ratings.** Besides A and B, 97 new UK Expansion Worker sponsors have a provisional rating. It used to show as "Unknown"; it's now read properly.
- **Worker and Temporary Worker.** The register covers both licence types. Each route keeps its own type and rating, so `--route` and `--rating` combine correctly.
- **A 470 MB zip without a zip library.** Companies House's snapshot is one deflated CSV, so `enrich` skips the zip header and inflates the rest with Node's built-in zlib as it downloads.
- **Safe CSV.** Names that start with `=`, `+`, `-` or `@` get a `'` in front so spreadsheets can't run them as formulas.
- **Speed.** The index stores each company's normalised name, so 100,000+ companies load in about 0.3 s.

Short notes on each decision are in [`docs/decisions/`](docs/decisions/).

## Tests

```sh
pnpm install
pnpm test
```

The tests use small fake files only: [`test/fixtures/register.csv`](test/fixtures/register.csv) (UTF-8 BOM, Windows line endings, accented names, quoted commas, Temporary Worker routes) and [`test/fixtures/companies-house.csv`](test/fixtures/companies-house.csv), zipped during the test. They never download the real data or use the internet. `update` and `enrich` are tested against a local fake server.

All checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

The GIF at the top is recorded with [vhs](https://github.com/charmbracelet/vhs) from [`docs/demo.tape`](docs/demo.tape): `vhs docs/demo.tape`.

## Privacy

No telemetry, no tracking. The only network calls are to GOV.UK when you run `update`, and to Companies House when you run `enrich`.

## Data sources and licences

- **Sponsor register:** Home Office, [Register of licensed sponsors: workers](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers), published on GOV.UK under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- **Company data** (only with `enrich`): Companies House, [Free Company Data Product](https://download.companieshouse.gov.uk/en_output.html) ("Basic Company Data"). Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## Disclaimer

The register lists companies that are licensed to sponsor workers. It doesn't mean a company is hiring, or that it will sponsor a particular role. Industry matches come from automated name matching and from the SIC codes companies give Companies House, so they can be wrong or out of date. Always check with the employer, and see [GOV.UK](https://www.gov.uk/browse/visas-immigration/work-visas) for visa rules. This tool isn't affiliated with the Home Office or Companies House.

## Licence

MIT. See [LICENSE](LICENSE).
