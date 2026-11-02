# uk-sponsors — PRD

**One line:** a free command-line tool to search the UK Home Office register of licensed visa sponsors: find which companies can sponsor you, by name, city and visa route.

**Owner:** Toukir Ahmed Rony · **Licence:** MIT · **Repo:** public on GitHub · **Install:** `npm install -g uk-sponsors` (or `npx uk-sponsors`)

## 1. The problem

Anyone who needs a UK work visa can only be hired by a company on the Home Office "Register of licensed sponsors: workers", published on GOV.UK as a large CSV file (over 100,000 rows) that changes almost daily. Opening it in Excel is slow and painful on a laptop and impossible on a phone, and there's no simple way to ask "which software companies in Leeds can sponsor a Skilled Worker visa?". Job seekers, recruiters and advisers all need this. uk-sponsors makes it one command.

## 2. Users

- **Job seekers** who need visa sponsorship (international graduates, Graduate visa holders, people abroad).
- **Recruiters and immigration advisers** checking whether a company is a sponsor.
- **Developers** who want the data as JSON or CSV for their own tools.

## 3. Features (version 1)

1. `uk-sponsors update` — finds the current CSV link on the GOV.UK publication page (https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers), downloads it with streaming (never loading the whole file into memory), and saves a local cache with the download date. Shows progress.
2. Auto-hint: if the cache is older than 7 days, every command prints a one-line reminder to run `update`.
3. `uk-sponsors search` with filters, combined with AND:
   - `--name <text>` partial, case-insensitive company name
   - `--city <text>` and `--county <text>`
   - `--route <text>` e.g. "Skilled Worker", "Global Business Mobility"
   - `--rating <A|B>`
   - `--limit <n>` (default 50)
4. `uk-sponsors check "<company name>"` — quick yes/no: is this company a licensed sponsor, with its routes, city and rating; shows close matches if there's no exact one.
5. Output: a readable table by default; `--json` and `--csv` for piping to other tools or opening in Excel.
6. `uk-sponsors stats` — totals, top cities, counts by route and rating.
7. One company can appear on several rows (one per route); results group them into one company with a list of routes.
8. Clear, friendly errors: no cache yet ("run uk-sponsors update first"), no internet, GOV.UK page changed, CSV columns changed (detect and name the missing columns instead of crashing).
9. `--help` on every command with examples. Works on macOS, Linux and Windows.

## 4. Non-functional

- Search across the full register returns in under 1 second on a normal laptop after the first load (build a small local index on `update`).
- No telemetry, no network calls except `update`.
- Data source credited in the README and `--help`: Home Office, published on GOV.UK under the Open Government Licence v3.0.
- Clear disclaimer: the register shows companies licensed to sponsor; it doesn't mean a company is hiring or will sponsor a particular role.

## 5. README must include

What it does with a short terminal GIF, install, examples for common questions ("software companies in Manchester that sponsor Skilled Worker visas"), output formats, how it works (streaming, index, column-change detection), hard problems and decisions, tests, data licence and disclaimer. Plain, simple English, same standard as the Slotwise repo.

## 6. Out of scope for version 1

Matching against job adverts, company websites or careers links, SOC code or salary data, a web interface, notifications when companies are added or removed.

## 7. Done means

- Published on npm; `npx uk-sponsors update` then `npx uk-sponsors search --city Leeds --route "Skilled Worker"` works from a clean machine.
- Tests pass using a small fake CSV fixture (never the real register in tests).
- GitHub Actions runs checks on every push and publishes to npm (with provenance) when a version tag is pushed.
