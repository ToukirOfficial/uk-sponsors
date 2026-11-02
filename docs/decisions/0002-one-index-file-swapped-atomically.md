# 2. One index file, swapped in with a single rename

**Decision:** `update` streams the CSV into a temp folder inside the cache. Then it parses the CSV as a stream, groups the rows into companies and writes `index.json` (meta and companies together) in that temp folder. It reads the file back to check it, then renames it over the live `index.json`.

**Why one file:** the meta (register date, download time) and the data can never get out of step. A rename on the same disk is atomic, so a failed or interrupted update leaves the old data working.

**Why JSON:** it needs no extra library, and with 100k+ companies it loads in about 0.3 s. Each company is a compact tuple. Its normalised name is saved so searches don't redo that work on every run. Measured on 140,000 fake rows: load 300 ms, search 30 ms, check 110 ms.

**Safety checks:** the column check names any missing column. A register with fewer than 1,000 rows is rejected, because the real one has 100,000+. A download shorter than its `Content-Length` is rejected. Temp folders left by a crash are cleaned up after a day.
