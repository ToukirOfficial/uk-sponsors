import type { Context } from "../context.js";
import { UserError } from "../errors.js";
import { companiesCsv } from "../output/csv.js";
import { emit, resolveFormat, type FormatOptions } from "../output/format.js";
import { toJson } from "../output/json.js";
import { toRecord } from "../output/records.js";
import { paint } from "../output/style.js";
import { companiesTable } from "../output/table.js";
import { checkCompany } from "../register/query.js";
import { loadRegister } from "./load.js";

export async function runCheck(
  ctx: Context,
  nameParts: string[],
  options: FormatOptions,
): Promise<void> {
  const query = nameParts.join(" ").trim();
  if (query === "") {
    throw new UserError(
      "Give a company name to check.",
      'For example: uk-sponsors check "Acme Ltd"',
    );
  }
  const format = resolveFormat(options);
  const register = await loadRegister(ctx);
  const result = checkCompany(register, query);

  let text: string;
  if (format === "json") {
    text = toJson({
      query: result.query,
      found: result.found,
      matches: result.matches.map(toRecord),
      closeMatches: result.closeMatches.map(toRecord),
    });
  } else if (format === "csv") {
    text = companiesCsv(
      result.found ? result.matches : result.closeMatches,
      register.companiesHouse !== null,
    );
  } else {
    const color = !options.out && (ctx.stdoutColor ?? false);
    const s = paint(color);
    const table = { width: options.out ? undefined : ctx.stdoutColumns, color };
    if (result.found) {
      const ch = result.matches
        .map((c) => c.companiesHouse)
        .find((info) => info !== undefined && info !== null);
      const chLine = ch
        ? s.dim(
            `Companies House: ${ch.number}, ${ch.status}${ch.sicCodes.length > 0 ? `, SIC ${ch.sicCodes.join(", ")}` : ""}\n`,
          )
        : "";
      text = `${s.green(s.bold("Yes"))}: "${query}" is a licensed sponsor.\n\n${companiesTable(result.matches, table)}${chLine}`;
    } else if (result.closeMatches.length > 0) {
      text = `${s.red(s.bold("No"))}: "${query}" isn't on the register under that exact name. Close matches:\n\n${companiesTable(result.closeMatches, table)}`;
    } else {
      text = `${s.red(s.bold("No"))}: "${query}" isn't on the register, and nothing similar was found.\nTry part of the name: uk-sponsors search --name "${query.split(" ")[0] ?? query}"\n`;
    }
  }
  await emit(text, format, options.out, ctx.stdout);
  if (options.out) ctx.stderr.write(`Saved to ${options.out}\n`);
}
