# 3. How names, places and routes match

**Names** (`--name` and `check`): lower case, accents removed (Café = Cafe), apostrophes and full stops dropped (O'Brien = OBrien, P.L.C. = PLC), `&` = `and`, other punctuation and repeated spaces collapsed, and `Limited` = `Ltd`.
`--name` matches any part of the name. `check` needs the whole name to match; otherwise it shows up to 5 close matches (shared words, or one name containing the other).

**Places** (`--city`, `--county`): whole words, any case, so `--city York` doesn't match "Yorkshire".

**Companies:** the same name in the same town (after normalising) is one company, with all its routes. The same name in different towns stays separate, as on the register.

**Routes:** the register covers Worker and Temporary Worker licences. Each route keeps its own type and rating. `--route` matches part of the route name ("Creative Worker") or the type ("Temporary Worker"). `--route` and `--rating` must match on the same route.
