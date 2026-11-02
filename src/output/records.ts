import type { CompanyInfo } from "../companies-house/match.js";
import type { Company, RouteEntry } from "../register/store.js";

/** The public shape of a company in JSON and CSV output. */
export interface CompanyRecord {
  name: string;
  city: string;
  county: string;
  ratings: string[];
  types: string[];
  routes: RouteEntry[];
  /** Only after "uk-sponsors enrich": the matched company, or null if none was found. */
  companiesHouse?: CompanyInfo | null;
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))];
}

export function toRecord(company: Company): CompanyRecord {
  return {
    name: company.name,
    city: company.city,
    county: company.county,
    ratings: unique(company.routes.map((r) => r.rating)).sort(),
    types: unique(company.routes.map((r) => r.type)),
    routes: company.routes.map((r) => ({ route: r.route, type: r.type, rating: r.rating })),
    ...(company.companiesHouse !== undefined ? { companiesHouse: company.companiesHouse } : {}),
  };
}

/** "Creative Worker (Temporary Worker)" for temporary routes, plain name otherwise. */
export function routeLabel(route: RouteEntry): string {
  const name = route.route || "(no route given)";
  return route.type === "Temporary Worker" ? `${name} (Temporary Worker)` : name;
}
