# 5. Toolchain versions

- **TypeScript 6, not 7:** typescript-eslint doesn't support TypeScript 7 yet (Nov 2026).
- **Node 22.12+:** commander 15 needs it. CI tests Node 22 and 24, on Linux, macOS and Windows.
- **No bundler:** `tsc` output runs as is, with three small runtime libraries (`commander`, `csv-parse`, `cli-table3`).
