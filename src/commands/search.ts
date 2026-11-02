import type { Context } from "../context.js";
import { UserError } from "../errors.js";
import { companiesCsv } from "../output/csv.js";
import { emit, resolveFormat, type FormatOptions } from "../output/format.js";
import { toJson } from "../output/json.js";
import { toRecord } from "../output/records.js";
import { companiesTable } from "../output/table.js";
import type { Rating } from "../register/parse.js";
import { searchCompanies } from "../register/query.js";
import { loadRegister } from "./load.js";

export interface SearchOptions extends FormatOptions {
  name?: string;
  city?: string;
  county?: string;
  route?: string;
  rating?: string;
  limit?: string;
}

export function parseRating(value: string | undefined): Rating | undefined {
  if (value === undefined) return undefined;
  const upper = value.trim().toUpperCase();
  if (upper === "A" || upper === "B") return upper;
  if (upper === "P" || upper === "PROVISIONAL") return "Provisional";
  throw new UserError(
    `"${value}" isn't a rating. Use --rating A, --rating B or --rating provisional.`,
  );
}

export function parseLimit(value: string | undefined): number {
  if (value === undefined) return 50;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new UserError(
      `"${value}" isn't a valid limit. Use a whole number of 1 or more, e.g. --limit 100.`,
    );
  }
  return n;
}

export async function runSearch(ctx: Context, options: SearchOptions): Promise<void> {
  const format = resolveFormat(options);
  const rating = parseRating(options.rating);
  const limit = parseLimit(options.limit);
  const register = await loadRegister(ctx);

  const all = searchCompanies(register, {
    name: options.name,
    city: options.city,
    county: options.county,
    route: options.route,
    rating,
  });
  const shown = all.slice(0, limit);

  let text: string;
  if (format === "json") text = toJson(shown.map(toRecord));
  else if (format === "csv") text = companiesCsv(shown);
  else if (shown.length === 0)
    text = "No sponsors match those filters. Try a shorter name or fewer filters.\n";
  else text = companiesTable(shown, options.out ? undefined : ctx.stdoutColumns);
  await emit(text, format, options.out, ctx.stdout);

  if (all.length > shown.length) {
    ctx.stderr.write(
      `Showing ${shown.length.toLocaleString("en-GB")} of ${all.length.toLocaleString("en-GB")} sponsors. Use --limit to see more.\n`,
    );
  } else if (format === "table" && all.length > 0) {
    ctx.stderr.write(
      `${all.length.toLocaleString("en-GB")} sponsor${all.length === 1 ? "" : "s"} found.\n`,
    );
  }
  if (options.out) ctx.stderr.write(`Saved to ${options.out}\n`);
}
