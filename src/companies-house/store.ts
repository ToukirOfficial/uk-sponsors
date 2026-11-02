import { readFile, rename, writeFile } from "node:fs/promises";
import { posix, win32 } from "node:path";
import { UserError } from "../errors.js";
import type { CompanyInfo, MatchedBy, MatchSummary } from "./match.js";

export const CH_FORMAT_VERSION = 1;

export interface EnrichmentMeta extends MatchSummary {
  formatVersion: number;
  /** Date of the Companies House snapshot (YYYY-MM-DD). */
  dataDate: string;
  downloadedAt: string;
  sourceUrl: string;
  /** Register date the matching was done against. */
  registerDate: string | null;
  companiesHouseRows: number;
}

export interface Enrichment {
  meta: EnrichmentMeta;
  /** Keyed by sponsorKey(): normalised name + town. */
  matches: Map<string, CompanyInfo>;
}

export function enrichmentPath(dir: string): string {
  return (process.platform === "win32" ? win32 : posix).join(dir, "companies-house.json");
}

// On disk: [sponsorKey, number, status, sicCodes, matchedBy code]
type Stored = [string, string, string, string[], "t" | "n" | "p"];
const TO_CODE = { "name+town": "t", name: "n", "previous-name+town": "p" } as const;
const FROM_CODE: Record<Stored[4], MatchedBy> = {
  t: "name+town",
  n: "name",
  p: "previous-name+town",
};

export async function writeEnrichmentFile(path: string, data: Enrichment): Promise<void> {
  const matches: Stored[] = [...data.matches].map(([key, m]) => [
    key,
    m.number,
    m.status,
    m.sicCodes,
    TO_CODE[m.matchedBy],
  ]);
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify({ meta: data.meta, matches }), "utf8");
  await rename(temp, path);
}

const RERUN_HINT = 'Run "uk-sponsors enrich" to download it again.';

function isStored(v: unknown): v is Stored {
  return (
    Array.isArray(v) &&
    typeof v[0] === "string" &&
    typeof v[1] === "string" &&
    typeof v[2] === "string" &&
    Array.isArray(v[3]) &&
    v[3].every((c) => typeof c === "string") &&
    (v[4] === "t" || v[4] === "n" || v[4] === "p")
  );
}

/** Reads the Companies House matches, or null if enrich has never been run. */
export async function readEnrichmentFile(path: string): Promise<Enrichment | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const damaged = new UserError(
    "The local Companies House data is damaged or from an older version.",
    RERUN_HINT,
  );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw damaged;
  }
  const { meta, matches } = (data ?? {}) as { meta?: Record<string, unknown>; matches?: unknown };
  if (
    typeof meta !== "object" ||
    meta.formatVersion !== CH_FORMAT_VERSION ||
    typeof meta.dataDate !== "string" ||
    !Array.isArray(matches)
  ) {
    throw damaged;
  }
  const map = new Map<string, CompanyInfo>();
  for (const m of matches) {
    if (!isStored(m)) throw damaged;
    map.set(m[0], { number: m[1], status: m[2], sicCodes: m[3], matchedBy: FROM_CODE[m[4]] });
  }
  return { meta: meta as unknown as EnrichmentMeta, matches: map };
}
