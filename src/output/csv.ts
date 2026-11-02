import type { Company } from "../register/store.js";
import { routeLabel, toRecord } from "./records.js";

/**
 * One CSV cell. Quotes when needed, and puts a ' in front of anything a
 * spreadsheet would run as a formula (=, +, -, @), because names come from
 * an outside source.
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text !== text.trim()) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvTable(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export const COMPANY_CSV_HEADER = ["name", "city", "county", "ratings", "types", "routes"];

export function companyCsvRow(company: Company): string[] {
  const r = toRecord(company);
  return [
    r.name,
    r.city,
    r.county,
    r.ratings.join("; "),
    r.types.join("; "),
    company.routes.map(routeLabel).join("; "),
  ];
}

export function companiesCsv(companies: Company[]): string {
  return csvTable(COMPANY_CSV_HEADER, companies.map(companyCsvRow));
}
