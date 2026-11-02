import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";

/** The columns uk-sponsors needs, as GOV.UK names them. */
export const REQUIRED_COLUMNS = {
  name: "Organisation Name",
  city: "Town/City",
  county: "County",
  typeRating: "Type & Rating",
  route: "Route",
} as const;

export type ColumnKey = keyof typeof REQUIRED_COLUMNS;
export type ColumnMap = Record<ColumnKey, number>;

function headerKey(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Works out which position each required column is in.
 * Extra columns are fine; missing ones stop the load with a message naming them.
 */
export function mapColumns(header: readonly string[]): ColumnMap {
  const positions = new Map<string, number>();
  header.forEach((h, i) => {
    const key = headerKey(h);
    if (!positions.has(key)) positions.set(key, i);
  });

  const map: Partial<ColumnMap> = {};
  const missing: string[] = [];
  for (const [key, label] of Object.entries(REQUIRED_COLUMNS) as [ColumnKey, string][]) {
    const pos = positions.get(headerKey(label));
    if (pos === undefined) missing.push(label);
    else map[key] = pos;
  }

  if (missing.length > 0) {
    const found = header.map((h) => `"${h.trim()}"`).join(", ") || "(none)";
    throw new SourceError(
      `The sponsor register's columns have changed. Missing: ${missing.map((m) => `"${m}"`).join(", ")}. Found: ${found}.`,
      SOURCE_CHANGED_HINT,
    );
  }
  return map as ColumnMap;
}
