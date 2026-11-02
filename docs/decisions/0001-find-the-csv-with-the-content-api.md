# 1. Find the CSV with the GOV.UK Content API

**Decision:** `update` reads
`https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers`
and takes the first `text/csv` entry in `details.attachments` (that's `attachments[0]` today).

**Why:** the JSON is a published, stable interface. Scraping the HTML page would break whenever GOV.UK changes its design.

**Safety:** the CSV link must be `https://assets.publishing.service.gov.uk`. Redirects are checked too. Anything else is refused, so a changed or tampered API response can't point the tool at another server.

**If it changes:** missing `details`, missing or empty `attachments`, or no CSV each give an error that names what changed (exit code 2).

**Register date:** from the file name (`..._-_2026-11-02.csv`), or `public_updated_at` if the name has no date.
