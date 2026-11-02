import type { Context } from "../context.js";
import { csvTable } from "../output/csv.js";
import { emit, resolveFormat, type FormatOptions } from "../output/format.js";
import { toJson } from "../output/json.js";
import { paint } from "../output/style.js";
import { countTable } from "../output/table.js";
import { formatRegisterDate } from "../register/freshness.js";
import { registerStats } from "../register/query.js";
import { loadRegister } from "./load.js";

export async function runStats(ctx: Context, options: FormatOptions): Promise<void> {
  const format = resolveFormat(options);
  const register = await loadRegister(ctx);
  const stats = registerStats(register);
  const ch = register.companiesHouse;

  let text: string;
  if (format === "json") {
    text = toJson({
      ...stats,
      companiesHouse: ch
        ? {
            dataDate: ch.dataDate,
            matched: ch.matched,
            byNameAndTown: ch.byNameAndTown,
            byNameOnly: ch.byNameOnly,
            byPreviousName: ch.byPreviousName,
          }
        : null,
    });
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
    const color = !options.out && (ctx.stdoutColor ?? false);
    const s = paint(color);
    const downloaded = formatRegisterDate(stats.downloadedAt.slice(0, 10));
    const n = (v: number) => v.toLocaleString("en-GB");
    text = [
      `${s.bold(n(stats.companies))} licensed sponsors on ${n(stats.rows)} rows`,
      s.dim(`Register dated ${formatRegisterDate(stats.registerDate)} (downloaded ${downloaded})`),
      ch
        ? s.dim(
            `Companies House data dated ${formatRegisterDate(ch.dataDate)}: ${n(ch.matched)} sponsors matched (${((ch.matched / Math.max(stats.companies, 1)) * 100).toFixed(1)}%)`,
          )
        : s.dim('Industry data: not downloaded (run "uk-sponsors enrich")'),
      s.dim("A company can hold several routes, so route counts add up to more than the total."),
      "",
      countTable("Top towns/cities", stats.topCities, color),
      countTable("Licence type", stats.types, color),
      countTable("Rating", stats.ratings, color),
      countTable("Route", stats.routes, color),
    ].join("\n");
  }
  await emit(text, format, options.out, ctx.stdout);
  if (options.out) ctx.stderr.write(`Saved to ${options.out}\n`);
}
