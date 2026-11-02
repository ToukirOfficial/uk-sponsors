import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";
import { findColumns, headerKey } from "../register/columns.js";
import { cleanField } from "../register/parse.js";

/** The Companies House columns enrich needs. Their headers have stray spaces, so names are trimmed. */
export const CH_COLUMNS = {
  name: "CompanyName",
  number: "CompanyNumber",
  town: "RegAddress.PostTown",
  status: "CompanyStatus",
  sic1: "SICCode.SicText_1",
  sic2: "SICCode.SicText_2",
  sic3: "SICCode.SicText_3",
  sic4: "SICCode.SicText_4",
} as const;

export interface ChRow {
  name: string;
  number: string;
  town: string;
  status: string;
  sicCodes: string[];
  /** Earlier names of the company, newest first. */
  previousNames: string[];
}

/** "62012 - Business and domestic software development" → "62012". "None Supplied" → null. */
export function sicCode(text: string): string | null {
  const match = /^\s*(\d{5})\b/.exec(text);
  return match?.[1] ?? null;
}

/** Reads the Companies House CSV as a stream, one company at a time. */
export async function* readCompaniesHouseRows(input: Readable): AsyncGenerator<ChRow> {
  const parser = input.pipe(parse({ bom: true, relax_column_count: true, skip_empty_lines: true }));
  input.on("error", (err) => parser.destroy(err));

  let columns: Record<keyof typeof CH_COLUMNS, number> | undefined;
  let previous: number[] = [];
  try {
    for await (const record of parser as AsyncIterable<string[]>) {
      if (!columns) {
        columns = findColumns(record, CH_COLUMNS, "The Companies House data");
        // Optional: "PreviousName_1.CompanyName" … "PreviousName_10.CompanyName".
        previous = record
          .map((h, i) => (/^previousname_\d+\.companyname$/.test(headerKey(h)) ? i : -1))
          .filter((i) => i >= 0);
        continue;
      }
      const name = cleanField(record[columns.name]);
      if (name === "") continue;
      const sicCodes: string[] = [];
      for (const col of [columns.sic1, columns.sic2, columns.sic3, columns.sic4]) {
        const code = sicCode(record[col] ?? "");
        if (code && !sicCodes.includes(code)) sicCodes.push(code);
      }
      const previousNames: string[] = [];
      for (const col of previous) {
        const old = cleanField(record[col]);
        if (old !== "") previousNames.push(old);
      }
      yield {
        name,
        number: cleanField(record[columns.number]),
        town: cleanField(record[columns.town]),
        status: cleanField(record[columns.status]),
        sicCodes,
        previousNames,
      };
    }
  } catch (err) {
    if (err instanceof SourceError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new SourceError(`Couldn't read the Companies House data: ${detail}`, SOURCE_CHANGED_HINT);
  }
  if (!columns) throw new SourceError("The Companies House data was empty.", SOURCE_CHANGED_HINT);
}
