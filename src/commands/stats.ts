import type { Context } from "../context.js";
import { csvTable } from "../output/csv.js";
import { emit, resolveFormat, type FormatOptions } from "../output/format.js";
import { toJson } from "../output/json.js";
import { countTable } from "../output/table.js";
import { formatRegisterDate } from "../register/freshness.js";
import { registerStats } from "../register/query.js";
import { loadRegister } from "./load.js";

export async function runStats(ctx: Context, options: FormatOptions): Promise<void> {
  const format = resolveFormat(options);
  const stats = registerStats(await loadRegister(ctx));

  let text: string;
  if (format === "json") {
    text = toJson(stats);
  } else if (format === "csv") {
    const rows: (string | number)[][] = [
      ["total", "companies", stats.companies],
      ["total", "rows", stats.rows],
      ...stats.topCities.map((r) => ["city", r.label, r.count]),
      ...stats.types.map((r) => ["type", r.label, r.count]),
      ...stats.ratings.map((r) => ["rating", r.label, r.count]),
      ...stats.routes.map((r) => ["route", r.label, r.count]),
    ];
    text = csvTable(["section", "label", "count"], rows);
  } else {
    const downloaded = formatRegisterDate(stats.downloadedAt.slice(0, 10));
    text = [
      `Register dated ${formatRegisterDate(stats.registerDate)} (downloaded ${downloaded})`,
      `${stats.companies.toLocaleString("en-GB")} licensed sponsors on ${stats.rows.toLocaleString("en-GB")} rows`,
      "A company can hold several routes, so route counts add up to more than the total.",
      "",
      countTable("Top towns/cities", stats.topCities),
      countTable("Licence type", stats.types),
      countTable("Rating", stats.ratings),
      countTable("Route", stats.routes),
    ].join("\n");
  }
  await emit(text, format, options.out, ctx.stdout);
  if (options.out) ctx.stderr.write(`Saved to ${options.out}\n`);
}
