import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";
import { mapColumns } from "./columns.js";

/**
 * A and B are the normal ratings. "Provisional" is given to new UK Expansion
 * Worker sponsors: "Worker (UK Expansion Worker: Provisional )" on the register.
 */
export type Rating = "A" | "B" | "Provisional";
export type SponsorType = "Worker" | "Temporary Worker";

export interface RegisterRow {
  name: string;
  city: string;
  county: string;
  type: SponsorType | null;
  rating: Rating | null;
  route: string;
}

// eslint-disable-next-line no-control-regex -- removing control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Trims, turns control characters into spaces and collapses repeated spaces. */
export function cleanField(value: string | undefined): string {
  return (value ?? "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * "Temporary Worker (A rating)" → { type: "Temporary Worker", rating: "A" }.
 * Also reads "Worker (A (SME+))", "Worker (A (Premium))" and
 * "Worker (UK Expansion Worker: Provisional )".
 */
export function parseTypeRating(value: string): {
  type: SponsorType | null;
  rating: Rating | null;
} {
  const text = value.trim();
  const type: SponsorType | null = /^temporary\s+worker\b/i.test(text)
    ? "Temporary Worker"
    : /^worker\b/i.test(text)
      ? "Worker"
      : null;
  const match = /\(\s*([AB])\b/i.exec(text);
  const letter = match?.[1]?.toUpperCase();
  const rating: Rating | null =
    letter === "A" || letter === "B"
      ? letter
      : /\bprovisional\b/i.test(text)
        ? "Provisional"
        : null;
  return { type, rating };
}

/**
 * Reads the register CSV as a stream, one row at a time.
 * Handles a UTF-8 BOM, CRLF or LF line endings and quoted fields.
 */
export async function* readRegisterRows(input: Readable): AsyncGenerator<RegisterRow> {
  const parser = input.pipe(
    parse({
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
    }),
  );
  input.on("error", (err) => parser.destroy(err));

  let columns: ReturnType<typeof mapColumns> | undefined;
  try {
    for await (const record of parser as AsyncIterable<string[]>) {
      if (!columns) {
        columns = mapColumns(record);
        continue;
      }
      const name = cleanField(record[columns.name]);
      if (name === "") continue;
      const { type, rating } = parseTypeRating(cleanField(record[columns.typeRating]));
      yield {
        name,
        city: cleanField(record[columns.city]),
        county: cleanField(record[columns.county]),
        type,
        rating,
        route: cleanField(record[columns.route]),
      };
    }
  } catch (err) {
    if (err instanceof SourceError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new SourceError(`Couldn't read the sponsor register CSV: ${detail}`, SOURCE_CHANGED_HINT);
  }

  if (!columns) {
    throw new SourceError("The sponsor register CSV was empty.", SOURCE_CHANGED_HINT);
  }
}
