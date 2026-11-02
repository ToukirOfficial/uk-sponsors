import Table from "cli-table3";
import type { Company } from "../register/store.js";
import { routeLabel, toRecord } from "./records.js";

const PLAIN = { head: [], border: [] };

/** Column widths that fit the terminal, or undefined to let the table size itself. */
function companyColumnWidths(width: number | undefined): number[] | undefined {
  if (!width || width < 80) return undefined;
  const inner = width - 16; // borders and padding for 5 columns
  const city = 14;
  const county = 16;
  const rating = 8;
  const routes = Math.floor((inner - city - county - rating) * 0.5);
  const name = inner - city - county - rating - routes;
  return [name, city, county, rating, routes];
}

export function companiesTable(companies: Company[], width?: number): string {
  const colWidths = companyColumnWidths(width);
  const table = new Table({
    head: ["Company", "Town/City", "County", "Rating", "Routes"],
    style: PLAIN,
    wordWrap: true,
    ...(colWidths ? { colWidths } : {}),
  });
  for (const company of companies) {
    const r = toRecord(company);
    table.push([
      r.name,
      r.city,
      r.county,
      r.ratings.join(", "),
      company.routes.map(routeLabel).join("\n"),
    ]);
  }
  return table.toString() + "\n";
}

export function countTable(heading: string, rows: { label: string; count: number }[]): string {
  const table = new Table({
    head: [heading, "Companies"],
    style: PLAIN,
    colAligns: ["left", "right"],
  });
  for (const row of rows) table.push([row.label, row.count.toLocaleString("en-GB")]);
  return table.toString() + "\n";
}
