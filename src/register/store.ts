import { readFile, rename, writeFile } from "node:fs/promises";
import { UserError } from "../errors.js";
import { normaliseName, normaliseText } from "./normalise.js";
import type { Rating, RegisterRow, SponsorType } from "./parse.js";

export const FORMAT_VERSION = 2;

export interface RouteEntry {
  route: string;
  type: SponsorType | null;
  rating: Rating | null;
}

export interface Company {
  name: string;
  city: string;
  county: string;
  routes: RouteEntry[];
}

export interface RegisterMeta {
  formatVersion: number;
  /** Date of the register itself (YYYY-MM-DD), from the file name or GOV.UK. */
  registerDate: string | null;
  /** When this computer downloaded it (ISO timestamp). */
  downloadedAt: string;
  sourceUrl: string;
  rowCount: number;
  companyCount: number;
}

export interface RegisterIndex {
  meta: RegisterMeta;
  companies: Company[];
}

/** A company plus its precomputed matching keys. */
export interface IndexedCompany extends Company {
  nameKey: string;
  cityKey: string;
  countyKey: string;
}

export interface LoadedRegister {
  meta: RegisterMeta;
  companies: IndexedCompany[];
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * Groups register rows into companies. One company (same name in the same
 * town) can appear on many rows, one per route; they become one entry.
 */
export async function buildIndex(
  rows: AsyncIterable<RegisterRow> | Iterable<RegisterRow>,
  source: { registerDate: string | null; downloadedAt: string; sourceUrl: string },
): Promise<RegisterIndex> {
  const byKey = new Map<string, Company & { seen: Set<string> }>();
  let rowCount = 0;

  for await (const row of rows) {
    rowCount++;
    const key = `${normaliseName(row.name)}\u0000${normaliseText(row.city)}`;
    let company = byKey.get(key);
    if (!company) {
      company = { name: row.name, city: row.city, county: row.county, routes: [], seen: new Set() };
      byKey.set(key, company);
    } else if (company.county === "" && row.county !== "") {
      company.county = row.county;
    }
    if (row.route === "" && row.type === null) continue;
    const routeKey = `${row.route}\u0000${row.type ?? ""}\u0000${row.rating ?? ""}`;
    if (company.seen.has(routeKey)) continue;
    company.seen.add(routeKey);
    company.routes.push({ route: row.route, type: row.type, rating: row.rating });
  }

  const companies: Company[] = [...byKey.values()].map((c) => ({
    name: c.name,
    city: c.city,
    county: c.county,
    routes: c.routes.sort((a, b) => collator.compare(a.route, b.route)),
  }));
  companies.sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.city, b.city));

  return {
    meta: { formatVersion: FORMAT_VERSION, ...source, rowCount, companyCount: companies.length },
    companies,
  };
}

// On disk each company is a compact tuple to keep the file small:
// [name, city, county, [[route, type, rating], ...], nameKey]
// The name key is saved so searches don't re-normalise 100,000+ names on every run.
type StoredRoute = [string, "W" | "T" | null, Rating | null];
type StoredCompany = [string, string, string, StoredRoute[], string];

const TYPE_TO_CODE = { Worker: "W", "Temporary Worker": "T" } as const;

export async function writeIndexFile(path: string, index: RegisterIndex): Promise<void> {
  const companies: StoredCompany[] = index.companies.map((c) => [
    c.name,
    c.city,
    c.county,
    c.routes.map((r) => [r.route, r.type ? TYPE_TO_CODE[r.type] : null, r.rating]),
    normaliseName(c.name),
  ]);
  await writeFile(path, JSON.stringify({ meta: index.meta, companies }), "utf8");
}

const NO_DATA_HINT = 'Run "uk-sponsors update" to download the register (about 11 MB).';

function damaged(): UserError {
  return new UserError("The local sponsor data is damaged or from an older version.", NO_DATA_HINT);
}

function isStoredRoute(v: unknown): v is StoredRoute {
  return (
    Array.isArray(v) &&
    typeof v[0] === "string" &&
    (v[1] === "W" || v[1] === "T" || v[1] === null) &&
    (v[2] === "A" || v[2] === "B" || v[2] === "Provisional" || v[2] === null)
  );
}

function isStoredCompany(v: unknown): v is StoredCompany {
  return (
    Array.isArray(v) &&
    typeof v[0] === "string" &&
    typeof v[1] === "string" &&
    typeof v[2] === "string" &&
    Array.isArray(v[3]) &&
    v[3].every(isStoredRoute) &&
    typeof v[4] === "string"
  );
}

function isMeta(v: unknown): v is RegisterMeta {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m.formatVersion === FORMAT_VERSION &&
    (typeof m.registerDate === "string" || m.registerDate === null) &&
    typeof m.downloadedAt === "string" &&
    typeof m.sourceUrl === "string" &&
    typeof m.rowCount === "number" &&
    typeof m.companyCount === "number"
  );
}

/** Reads the index file. Friendly errors if it's missing or damaged. */
export async function readIndexFile(path: string): Promise<LoadedRegister> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UserError("No sponsor data on this computer yet.", NO_DATA_HINT);
    }
    throw err;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw damaged();
  }
  if (typeof data !== "object" || data === null) throw damaged();
  const { meta, companies } = data as { meta?: unknown; companies?: unknown };
  if (!isMeta(meta) || !Array.isArray(companies)) throw damaged();

  // Towns and counties repeat a lot, so normalise each spelling once.
  const placeKeys = new Map<string, string>();
  const placeKey = (place: string): string => {
    let key = placeKeys.get(place);
    if (key === undefined) {
      key = normaliseText(place);
      placeKeys.set(place, key);
    }
    return key;
  };

  const loaded: IndexedCompany[] = [];
  for (const c of companies) {
    if (!isStoredCompany(c)) throw damaged();
    const [name, city, county, routes, nameKey] = c;
    loaded.push({
      name,
      city,
      county,
      routes: routes.map(([route, code, rating]) => ({
        route,
        type: code === "W" ? "Worker" : code === "T" ? "Temporary Worker" : null,
        rating,
      })),
      nameKey,
      cityKey: placeKey(city),
      countyKey: placeKey(county),
    });
  }
  return { meta, companies: loaded };
}

/** Moves a finished index into place. A rename is atomic on the same disk. */
export async function installIndexFile(tempPath: string, livePath: string): Promise<void> {
  await rename(tempPath, livePath);
}
