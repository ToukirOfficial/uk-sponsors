import { containsWords, normaliseName, normaliseText } from "../register/normalise.js";
import type { IndexedCompany } from "../register/store.js";
import type { ChRow } from "./parse.js";

export type MatchedBy = "name+town" | "name" | "previous-name+town";

export interface CompanyInfo {
  number: string;
  status: string;
  sicCodes: string[];
  matchedBy: MatchedBy;
}

interface Candidate {
  number: string;
  status: string;
  sicCodes: string[];
  townKey: string;
  previous: boolean;
}

/** The key enrichment data is stored under: the sponsor's normalised name and town. */
export function sponsorKey(company: Pick<IndexedCompany, "nameKey" | "cityKey">): string {
  return `${company.nameKey}\u0000${company.cityKey}`;
}

/**
 * Names to look a sponsor up by: the name itself and, for "Foo Ltd T/A Bar",
 * the legal name before "T/A" or "trading as".
 */
export function lookupNames(nameKey: string): string[] {
  const keys = [nameKey];
  const legal = nameKey.split(/ (?:t a|ta|trading as) /)[0];
  if (legal && legal !== nameKey) keys.push(legal);
  return keys;
}

function townsMatch(a: string, b: string): boolean {
  return a !== "" && b !== "" && (containsWords(a, b) || containsWords(b, a));
}

function pickActive(list: Candidate[]): Candidate | undefined {
  return list.find((c) => c.status === "Active") ?? list[0];
}

export interface MatchSummary {
  sponsors: number;
  matched: number;
  byNameAndTown: number;
  byNameOnly: number;
  byPreviousName: number;
}

/**
 * Matches sponsors to Companies House companies as the rows stream past.
 * Only rows whose name matches a sponsor are kept, so memory stays small.
 */
export class SponsorMatcher {
  private readonly byName = new Map<string, number[]>();
  private readonly candidates = new Map<number, Candidate[]>();
  rowsRead = 0;

  constructor(private readonly sponsors: readonly IndexedCompany[]) {
    sponsors.forEach((s, i) => {
      for (const key of lookupNames(s.nameKey)) {
        const list = this.byName.get(key);
        if (list) list.push(i);
        else this.byName.set(key, [i]);
      }
    });
  }

  add(row: ChRow): void {
    this.rowsRead++;
    this.addName(row, normaliseName(row.name), false);
    for (const old of row.previousNames) this.addName(row, normaliseName(old), true);
  }

  private addName(row: ChRow, key: string, previous: boolean): void {
    const hits = this.byName.get(key);
    if (!hits) return;
    const candidate: Candidate = {
      number: row.number,
      status: row.status,
      sicCodes: row.sicCodes,
      townKey: normaliseText(row.town),
      previous,
    };
    for (const i of hits) {
      const list = this.candidates.get(i);
      if (list) list.push(candidate);
      else this.candidates.set(i, [candidate]);
    }
  }

  /**
   * Picks one company per sponsor, in order of confidence:
   * 1. same name and same town;
   * 2. same name, and only one company has it (Companies House names are unique);
   * 3. a former name of the company, in the same town.
   * Anything less certain is left unmatched.
   */
  results(): { matches: Map<string, CompanyInfo>; summary: MatchSummary } {
    const matches = new Map<string, CompanyInfo>();
    const summary: MatchSummary = {
      sponsors: this.sponsors.length,
      matched: 0,
      byNameAndTown: 0,
      byNameOnly: 0,
      byPreviousName: 0,
    };
    for (const [i, list] of this.candidates) {
      const sponsor = this.sponsors[i];
      if (!sponsor) continue;
      const current = list.filter((c) => !c.previous);
      const sameTown = current.filter((c) => townsMatch(c.townKey, sponsor.cityKey));
      const distinct = new Set(current.map((c) => c.number));
      const oldSameTown = list.filter((c) => c.previous && townsMatch(c.townKey, sponsor.cityKey));

      let chosen: Candidate | undefined;
      let matchedBy: MatchedBy;
      if (sameTown.length > 0) {
        chosen = pickActive(sameTown);
        matchedBy = "name+town";
        summary.byNameAndTown++;
      } else if (distinct.size === 1) {
        chosen = current[0];
        matchedBy = "name";
        summary.byNameOnly++;
      } else if (current.length === 0 && new Set(oldSameTown.map((c) => c.number)).size === 1) {
        chosen = oldSameTown[0];
        matchedBy = "previous-name+town";
        summary.byPreviousName++;
      } else {
        continue;
      }
      if (!chosen) continue;
      summary.matched++;
      matches.set(sponsorKey(sponsor), {
        number: chosen.number,
        status: chosen.status,
        sicCodes: chosen.sicCodes,
        matchedBy,
      });
    }
    return { matches, summary };
  }
}
