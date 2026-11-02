import type { Context } from "../context.js";
import { staleReminder } from "../register/freshness.js";
import { indexPath } from "../register/paths.js";
import { readIndexFile, type LoadedRegister } from "../register/store.js";

/** Loads the local index and prints the stale-data reminder if needed. */
export async function loadRegister(ctx: Context): Promise<LoadedRegister> {
  const register = await readIndexFile(indexPath(ctx.cacheDir));
  const reminder = staleReminder(register.meta, ctx.now());
  if (reminder) ctx.stderr.write(`${reminder}\n`);
  return register;
}
