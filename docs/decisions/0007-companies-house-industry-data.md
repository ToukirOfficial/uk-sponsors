# 7. Industry data from Companies House

**Source:** Companies House's [Free Company Data Product](https://download.companieshouse.gov.uk/en_output.html) ("Basic Company Data"): free, no account or API key, Open Government Licence v3.0. It's one zip of about 470 MB holding a CSV of every live company (about 5.7 million). `enrich` finds the newest `BasicCompanyDataAsOneFile-YYYY-MM-DD.zip` link on that page and only downloads from `https://download.companieshouse.gov.uk`.

**Streaming:** the zip is never saved. The download goes straight into Node's built-in `zlib` (the snapshot is a single deflated file, so the zip header is skipped and the rest inflated), then the CSV parser, then the matcher. Only rows whose name matches a sponsor are kept. No new library was needed. On a home connection the whole run takes about a minute and a half.

**Matching**, using the same name normalisation as `check`, in order of confidence:

1. Same name and same town (registered office post town) → `name+town`.
2. Same name, and only one live company has it → `name`. Companies House doesn't allow two companies with the same name, so this is the same legal company with a branch or head office somewhere else.
3. A former name of the company, in the same town → `previous-name+town`.

Anything less certain (two companies with the name, neither in the sponsor's town) is left unmatched. For `Foo Ltd T/A Bar`, the legal name before `T/A` is tried too.

**Result on 2 Nov 2026:** 104,118 of 127,486 sponsors matched (81.7%): 71,665 by name and town, 31,490 by name only, 963 by former name. Most of the rest aren't companies (NHS trusts, universities, schools, charities, partnerships, sole traders).

**Storage:** `companies-house.json` in the cache folder, keyed by each sponsor's normalised name and town. It lives next to `index.json` rather than inside it, so `update` doesn't wipe it. New sponsors are picked up on the next `enrich`.

**Filters:** `--sic` takes 5-digit codes, or `62xxx` / `62*` for a prefix. `--industry` presets are lists of UK SIC 2007 codes. Both only show companies whose status is exactly `Active` unless `--include-inactive` is given. SIC codes are what each company tells Companies House, so presets are a guide, not a guarantee.
