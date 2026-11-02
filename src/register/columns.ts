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

export function headerKey(header: string): string {
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
  return findColumns(header, REQUIRED_COLUMNS, "The sponsor register");
}

/**
 * Finds each required column by name (ignoring case, spaces and a BOM).
 * Throws a SourceError naming the missing ones.
 */
export function findColumns<K extends string>(
  header: readonly string[],
  required: Readonly<Record<K, string>>,
  sourceName: string,
): Record<K, number> {
  const positions = new Map<string, number>();
  header.forEach((h, i) => {
    const key = headerKey(h);
    if (!positions.has(key)) positions.set(key, i);
  });

  const map: Partial<Record<K, number>> = {};
  const missing: string[] = [];
  for (const [key, label] of Object.entries(required) as [K, string][]) {
    const pos = positions.get(headerKey(label));
    if (pos === undefined) missing.push(label);
    else map[key] = pos;
  }

  if (missing.length > 0) {
    const found = header.map((h) => `"${h.trim()}"`).join(", ") || "(none)";
    throw new SourceError(
      `${sourceName}'s columns have changed. Missing: ${missing.map((m) => `"${m}"`).join(", ")}. Found: ${found}.`,
      SOURCE_CHANGED_HINT,
    );
  }
  return map as Record<K, number>;
}
