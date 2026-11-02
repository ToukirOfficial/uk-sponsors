# 6. The Provisional rating

**Found:** 97 sponsors showed a rating of "Unknown" in `stats` (register dated 2 November 2026). They all have the type and rating `Worker (UK Expansion Worker: Provisional )`. The Home Office gives new UK Expansion Worker sponsors a provisional rating until they've traded in the UK for a while, so it isn't an A or a B.

**Fix:** the parser now reads it as `Provisional`. `--rating provisional` (or `--rating p`) finds these sponsors. The index format went from version 1 to 2, so an older index asks you to run `update` once.

Anything the parser still can't read keeps showing as "Unknown" in `stats`, so a new rating on the register is easy to spot.
