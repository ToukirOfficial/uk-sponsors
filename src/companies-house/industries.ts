import { UserError } from "../errors.js";

/**
 * Industry presets as UK SIC 2007 codes. A code with fewer than 5 digits
 * matches every code that starts with it ("62" = 62011 to 62090).
 * SIC codes are what a company tells Companies House, so presets are a
 * good guide, not a guarantee.
 */
export const INDUSTRIES = {
  software: {
    label: "Software and data",
    codes: ["62012", "62020", "62090", "63110", "58290"],
  },
  "it-services": {
    label: "All IT and computer services (62xxx)",
    codes: ["62"],
  },
  fintech: {
    label: "Financial services, payments and lending",
    codes: ["64191", "64921", "64929", "64999", "66110", "66120", "66190"],
  },
  "health-tech": {
    label: "Pharma, biotech and medical devices (not care homes or clinics)",
    codes: ["21100", "21200", "26600", "32500", "72110"],
  },
  "legal-services": {
    label: "Barristers, solicitors and other legal services",
    codes: ["69101", "69102", "69109"],
  },
} as const satisfies Record<string, { label: string; codes: readonly string[] }>;

export type Industry = keyof typeof INDUSTRIES;

export function isIndustry(value: string): value is Industry {
  return Object.hasOwn(INDUSTRIES, value);
}

export function industryCodes(value: string): string[] {
  const key = value.trim().toLowerCase();
  if (!isIndustry(key)) {
    throw new UserError(
      `"${value}" isn't an industry preset.`,
      `Use one of: ${Object.keys(INDUSTRIES).join(", ")}. Or give codes with --sic, e.g. --sic 62012,62020.`,
    );
  }
  return [...INDUSTRIES[key].codes];
}

/**
 * "62012, 62020" or "62xxx" or "62*" → code patterns. Fewer than 5 digits is
 * a prefix. Throws a friendly error for anything else.
 */
export function parseSicCodes(value: string): string[] {
  const tokens = value.split(/[\s,]+/).filter((t) => t !== "");
  if (tokens.length === 0) {
    throw new UserError("Give at least one SIC code, e.g. --sic 62012 or --sic 62xxx.");
  }
  return tokens.map((token) => {
    const match = /^(\d{2,5})(x*|\*)$/i.exec(token);
    const digits = match?.[1];
    if (
      !match ||
      !digits ||
      digits.length + (match[2]?.startsWith("*") ? 0 : (match[2]?.length ?? 0)) > 5
    ) {
      throw new UserError(
        `"${token}" isn't a SIC code.`,
        "SIC codes have 5 digits, e.g. 62012. Use 62xxx or 62* for every code starting 62.",
      );
    }
    return digits;
  });
}

/** True if any of the company's codes matches any pattern (exact, or by prefix). */
export function sicMatches(companyCodes: readonly string[], patterns: readonly string[]): boolean {
  return companyCodes.some((code) =>
    patterns.some((p) => (p.length === 5 ? code === p : code.startsWith(p))),
  );
}
