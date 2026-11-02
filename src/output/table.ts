import { stripVTControlCharacters } from "node:util";
import Table from "cli-table3";
import type { Company } from "../register/store.js";
import { routeLabel, toRecord } from "./records.js";
import { paint, type Style } from "./style.js";

// Borderless: columns separated by two spaces, a rule under the header.
const NO_BORDERS = {
  top: "",
  "top-mid": "",
  "top-left": "",
  "top-right": "",
  bottom: "",
  "bottom-mid": "",
  "bottom-left": "",
  "bottom-right": "",
  left: "",
  "left-mid": "",
  mid: "",
  "mid-mid": "",
  right: "",
  "right-mid": "",
  middle: "  ",
};
const GAP = 2;
const STYLE = { head: [], border: [], "padding-left": 0, "padding-right": 0 };

export interface TableOptions {
  /** Terminal width, or undefined to let the table size itself. */
  width?: number | undefined;
  color?: boolean;
  /** Add a column with Companies House SIC codes. */
  showSic?: boolean;
}

function ratingText(rating: string, s: Style): string {
  if (rating === "A") return s.green(rating);
  if (rating === "B") return s.yellow(rating);
  if (rating === "Provisional") return s.cyan(rating);
  return rating;
}

/** SIC codes, two to a line: "62012 62020". */
function sicCell(codes: readonly string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < codes.length; i += 2) lines.push(codes.slice(i, i + 2).join(" "));
  return lines.join("\n");
}

/** Column widths that fit the terminal, or undefined if it's narrow or unknown. */
function companyColumnWidths(width: number | undefined, showSic: boolean): number[] | undefined {
  if (!width || width < 80) return undefined;
  const city = 14;
  const county = 16;
  const rating = 11;
  const sic = showSic ? 11 : 0;
  const columns = showSic ? 6 : 5;
  const inner = width - 1 - GAP * (columns - 1) - city - county - rating - sic;
  const routes = Math.floor(inner * 0.5);
  const name = inner - routes;
  return showSic ? [name, city, county, rating, sic, routes] : [name, city, county, rating, routes];
}

/** Renders rows; adds a blank line between rows if any row wraps onto more lines. */
function render(table: Table.Table, header: string[], rowLines: number[], s: Style): string {
  const lines = table
    .toString()
    .split("\n")
    .map((l) => l.trimEnd());
  const headerLines = 1;
  const out = [...lines.slice(0, headerLines)];
  const width = Math.max(
    ...lines.map((l) => stripVTControlCharacters(l).length),
    header.join("  ").length,
  );
  out.push(s.dim("─".repeat(width)));
  const spaced = rowLines.some((n) => n > 1);
  let at = headerLines;
  rowLines.forEach((n, i) => {
    if (spaced && i > 0) out.push("");
    out.push(...lines.slice(at, at + n));
    at += n;
  });
  return out.join("\n") + "\n";
}

export function companiesTable(companies: Company[], options: TableOptions | number = {}): string {
  const opts: TableOptions = typeof options === "number" ? { width: options } : options;
  const s = paint(opts.color ?? false);
  const showSic = opts.showSic ?? false;
  const colWidths = companyColumnWidths(opts.width, showSic);
  const header = [
    "Company",
    "Town/City",
    "County",
    "Rating",
    ...(showSic ? ["SIC"] : []),
    "Routes",
  ];
  const make = () =>
    new Table({
      head: header.map((h) => s.bold(h)),
      chars: NO_BORDERS,
      style: STYLE,
      wordWrap: true,
      ...(colWidths ? { colWidths } : {}),
    });

  const rows = companies.map((company) => {
    const r = toRecord(company);
    return [
      r.name,
      r.city,
      r.county,
      r.ratings.map((g) => ratingText(g, s)).join(", "),
      ...(showSic ? [sicCell(company.companiesHouse?.sicCodes ?? [])] : []),
      company.routes.map(routeLabel).join("\n"),
    ];
  });

  const table = make();
  for (const row of rows) table.push(row);
  // Work out how many lines each row takes, so rows can be spaced apart.
  const rowLines = rows.map((row) => {
    const single = make();
    single.push(row);
    return single.toString().split("\n").length - 1;
  });
  return render(table, header, rowLines, s);
}

export function countTable(
  heading: string,
  rows: { label: string; count: number }[],
  color = false,
): string {
  const s = paint(color);
  const table = new Table({
    head: [s.bold(heading), s.bold("Companies")],
    chars: NO_BORDERS,
    style: STYLE,
    colAligns: ["left", "right"],
  });
  for (const row of rows) table.push([row.label, row.count.toLocaleString("en-GB")]);
  return render(
    table,
    [heading, "Companies"],
    rows.map(() => 1),
    s,
  );
}
