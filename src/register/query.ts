import { sicMatches } from "../companies-house/industries.js";
import { containsWords, normaliseName, normaliseText } from "./normalise.js";
import type { Rating } from "./parse.js";
import type { IndexedCompany, LoadedRegister, RouteEntry } from "./store.js";

export interface SearchFilters {
  name?: string | undefined;
  city?: string | undefined;
  county?: string | undefined;
  route?: string | undefined;
  rating?: Rating | undefined;
  /** SIC code patterns (5 digits exact, fewer = prefix). Needs enrich data. */
  sic?: readonly string[] | undefined;
  /** With sic: also include companies that aren't "Active" at Companies House. */
  includeInactive?: boolean | undefined;
}

// Route names repeat across thousands of companies, so normalise each once.
const routeKeys = new Map<string, string>();
function routeKeyOf(text: string): string {
  let key = routeKeys.get(text);
  if (key === undefined) {
    key = normaliseText(text);
    routeKeys.set(text, key);
  }
  return key;
}

function routeMatches(entry: RouteEntry, routeKey: string, rating: Rating | undefined): boolean {
  if (rating && entry.rating !== rating) return false;
  if (routeKey === "") return true;
  // Match the route name ("Skilled Worker", "Creative Worker") or the
  // licence type ("Worker", "Temporary Worker").
  return (
    routeKeyOf(entry.route).includes(routeKey) ||
    (entry.type !== null && routeKeyOf(entry.type).includes(routeKey))
  );
}

/** All companies matching every filter given (AND), in name order. */
export function searchCompanies(
  register: LoadedRegister,
  filters: SearchFilters,
): IndexedCompany[] {
  const nameKey = filters.name ? normaliseName(filters.name) : "";
  const cityKey = filters.city ? normaliseText(filters.city) : "";
  const countyKey = filters.county ? normaliseText(filters.county) : "";
  const routeKey = filters.route ? normaliseText(filters.route) : "";
  const rating = filters.rating;
  const checkRoutes = routeKey !== "" || rating !== undefined;
  const sic = filters.sic && filters.sic.length > 0 ? filters.sic : undefined;
  const sicOk = (c: IndexedCompany): boolean => {
    if (!sic) return true;
    const ch = c.companiesHouse;
    if (!ch) return false;
    if (!filters.includeInactive && ch.status !== "Active") return false;
    return sicMatches(ch.sicCodes, sic);
  };

  return register.companies.filter(
    (c) =>
      (nameKey === "" || c.nameKey.includes(nameKey)) &&
      (cityKey === "" || containsWords(c.cityKey, cityKey)) &&
      (countyKey === "" || containsWords(c.countyKey, countyKey)) &&
      (!checkRoutes || c.routes.some((r) => routeMatches(r, routeKey, rating))) &&
      sicOk(c),
  );
}

export interface CheckResult {
  query: string;
  found: boolean;
  matches: IndexedCompany[];
  closeMatches: IndexedCompany[];
}

function wordSimilarity(a: string, b: string): number {
  const aw = new Set(a.split(" "));
  const bw = new Set(b.split(" "));
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared++;
  return (2 * shared) / (aw.size + bw.size);
}

/** Is this exact company (after normalising) on the register? If not, what's close? */
export function checkCompany(register: LoadedRegister, query: string, maxClose = 5): CheckResult {
  const key = normaliseName(query);
  const matches = register.companies.filter((c) => c.nameKey === key);
  if (matches.length > 0 || key === "") {
    return { query, found: matches.length > 0, matches, closeMatches: [] };
  }

  const scored: { company: IndexedCompany; score: number }[] = [];
  for (const company of register.companies) {
    let score = wordSimilarity(key, company.nameKey);
    if (company.nameKey.includes(key) || key.includes(company.nameKey)) score += 0.5;
    if (score >= 0.5) scored.push({ company, score });
  }
  scored.sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name));
  return {
    query,
    found: false,
    matches: [],
    closeMatches: scored.slice(0, maxClose).map((s) => s.company),
  };
}

export interface CountRow {
  label: string;
  count: number;
}

export interface RegisterStats {
  registerDate: string | null;
  downloadedAt: string;
  companies: number;
  rows: number;
  topCities: CountRow[];
  routes: CountRow[];
  types: CountRow[];
  ratings: CountRow[];
}

function sortedCounts(counts: Map<string, number>): CountRow[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Totals and breakdowns. Route, type and rating counts are numbers of companies. */
export function registerStats(register: LoadedRegister, topCities = 10): RegisterStats {
  const cityCounts = new Map<string, number>();
  const cityNames = new Map<string, Map<string, number>>();
  const routes = new Map<string, number>();
  const types = new Map<string, number>();
  const ratings = new Map<string, number>();

  for (const c of register.companies) {
    if (c.cityKey !== "") {
      bump(cityCounts, c.cityKey);
      let spellings = cityNames.get(c.cityKey);
      if (!spellings) {
        spellings = new Map<string, number>();
        cityNames.set(c.cityKey, spellings);
      }
      bump(spellings, c.city);
    }
    for (const r of new Set(c.routes.map((r) => r.route || "(none)"))) bump(routes, r);
    for (const t of new Set(c.routes.map((r) => r.type ?? "Unknown"))) bump(types, t);
    for (const g of new Set(c.routes.map((r) => r.rating ?? "Unknown"))) bump(ratings, g);
  }

  // Show each city by its most common spelling ("Leeds" rather than "LEEDS").
  const cities = sortedCounts(cityCounts)
    .slice(0, topCities)
    .map(({ label, count }) => {
      const spellings = cityNames.get(label);
      return { label: spellings ? (sortedCounts(spellings)[0]?.label ?? label) : label, count };
    });

  return {
    registerDate: register.meta.registerDate,
    downloadedAt: register.meta.downloadedAt,
    companies: register.companies.length,
    rows: register.meta.rowCount,
    topCities: cities,
    routes: sortedCounts(routes),
    types: sortedCounts(types),
    ratings: sortedCounts(ratings),
  };
}
