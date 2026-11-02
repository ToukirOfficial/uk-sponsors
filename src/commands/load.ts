import { sponsorKey } from "../companies-house/match.js";
import {
  enrichmentPath,
  readEnrichmentFile,
  type EnrichmentMeta,
} from "../companies-house/store.js";
import type { Context } from "../context.js";
import { paint } from "../output/style.js";
import { staleReminder } from "../register/freshness.js";
import { indexPath } from "../register/paths.js";
import { readIndexFile, type LoadedRegister } from "../register/store.js";

export interface Loaded extends LoadedRegister {
  /** Set if "uk-sponsors enrich" has been run. */
  companiesHouse: EnrichmentMeta | null;
}

/**
 * Loads the local index (and Companies House matches, if enrich has been
 * run) and prints the stale-data reminder if needed.
 */
export async function loadRegister(ctx: Context): Promise<Loaded> {
  const dir = ctx.cacheDir;
  const [register, enrichment] = await Promise.all([
    readIndexFile(indexPath(dir)),
    readEnrichmentFile(enrichmentPath(dir)),
  ]);
  const reminder = staleReminder(register.meta, ctx.now());
  if (reminder) ctx.stderr.write(`${paint(ctx.stderrColor ?? false).yellow(reminder)}\n`);
  if (enrichment) {
    for (const company of register.companies) {
      company.companiesHouse = enrichment.matches.get(sponsorKey(company)) ?? null;
    }
  }
  return { ...register, companiesHouse: enrichment?.meta ?? null };
}
