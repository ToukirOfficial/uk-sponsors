# 4. Safe CSV output

**Formula guard:** company names come from an outside source. A cell starting with `=`, `+`, `-` or `@` gets a `'` in front, so Excel or Sheets won't run it as a formula.

**BOM only in files:** `--out file.csv` adds a UTF-8 byte order mark so Excel shows accents correctly. CSV printed to the screen or a pipe has no BOM, so other tools aren't confused.
