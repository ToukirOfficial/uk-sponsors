import { beforeAll, describe, expect, test } from "vitest";
import { checkCompany, registerStats, searchCompanies } from "../src/register/query.js";
import type { LoadedRegister } from "../src/register/store.js";
import { fixtureRegister } from "./helpers.js";

let register: LoadedRegister;
beforeAll(async () => {
  register = await fixtureRegister();
});

const names = (list: { name: string; city: string }[]) => list.map((c) => `${c.name} (${c.city})`);

describe("searchCompanies", () => {
  test("no filters returns everything", () => {
    expect(searchCompanies(register, {})).toHaveLength(13);
  });

  test("--name is partial and case-insensitive", () => {
    expect(names(searchCompanies(register, { name: "acme" }))).toEqual([
      "Acme Software Ltd (Bristol)",
      "Acme Software Ltd (Leeds)",
    ]);
  });

  test("--name treats Limited/Ltd, &/and and punctuation as equal", () => {
    expect(names(searchCompanies(register, { name: "o'brien and sons ltd" }))).toEqual([
      "O’Brien & Sons Limited (Leeds)",
    ]);
    expect(names(searchCompanies(register, { name: "smith jones & partners" }))).toEqual([
      "Smith, Jones & Partners LLP (Manchester)",
    ]);
    expect(names(searchCompanies(register, { name: "cafe societe" }))).toEqual([
      "Café Société Limited (London)",
    ]);
  });

  test("--city matches whole words, any case", () => {
    expect(names(searchCompanies(register, { city: "leeds" }))).toEqual([
      "Acme Software Ltd (Leeds)",
      "Leeds Ballet Company (LEEDS)",
      "Northern Care & Health PLC (Leeds)",
      "O’Brien & Sons Limited (Leeds)",
    ]);
  });

  test("--county", () => {
    expect(searchCompanies(register, { county: "greater manchester" })).toHaveLength(2);
  });

  test("--route matches part of the route name", () => {
    expect(names(searchCompanies(register, { route: "global business" }))).toEqual([
      "Acme Software Ltd (Leeds)",
      "København Design ApS (London)",
    ]);
  });

  test('--route "Temporary Worker" finds Temporary Worker licences', () => {
    expect(names(searchCompanies(register, { route: "temporary worker" }))).toEqual([
      "Brighton Arts Trust (Brighton)",
      "Green Fields Farm Ltd (Hereford)",
      "Leeds Ballet Company (LEEDS)",
    ]);
  });

  test("--route finds Temporary Worker routes by name", () => {
    expect(names(searchCompanies(register, { route: "Seasonal" }))).toEqual([
      "Green Fields Farm Ltd (Hereford)",
    ]);
    expect(searchCompanies(register, { route: "creative worker" })).toHaveLength(2);
  });

  test("--rating", () => {
    expect(names(searchCompanies(register, { rating: "B" }))).toEqual([
      "Café Société Limited (London)",
      "O’Brien & Sons Limited (Leeds)",
    ]);
  });

  test("filters combine with AND", () => {
    expect(
      names(searchCompanies(register, { city: "Leeds", route: "Skilled Worker", rating: "A" })),
    ).toEqual([
      "Acme Software Ltd (Leeds)",
      "Leeds Ballet Company (LEEDS)",
      "Northern Care & Health PLC (Leeds)",
    ]);
    expect(searchCompanies(register, { name: "acme", city: "Glasgow" })).toEqual([]);
  });

  test("route and rating must match on the same route", () => {
    expect(searchCompanies(register, { route: "Creative", rating: "B" })).toEqual([]);
  });
});

describe("checkCompany", () => {
  test("exact match after normalising", () => {
    const result = checkCompany(register, "ACME SOFTWARE LIMITED");
    expect(result.found).toBe(true);
    expect(names(result.matches)).toEqual([
      "Acme Software Ltd (Bristol)",
      "Acme Software Ltd (Leeds)",
    ]);
  });

  test("handles & and punctuation", () => {
    expect(checkCompany(register, "Northern Care and Health plc").found).toBe(true);
    expect(checkCompany(register, "smith jones and partners llp").found).toBe(true);
    expect(checkCompany(register, "Zurich Data Ltd").found).toBe(true);
  });

  test("shows close matches when there's no exact one", () => {
    const result = checkCompany(register, "Acme Software");
    expect(result.found).toBe(false);
    expect(names(result.closeMatches)).toEqual([
      "Acme Software Ltd (Bristol)",
      "Acme Software Ltd (Leeds)",
    ]);
  });

  test("no match at all", () => {
    const result = checkCompany(register, "Totally Unknown Widgets");
    expect(result).toMatchObject({ found: false, matches: [], closeMatches: [] });
  });
});

describe("registerStats", () => {
  test("totals and breakdowns, including Temporary Worker", () => {
    const stats = registerStats(register);
    expect(stats).toMatchObject({ registerDate: "2026-11-02", companies: 13, rows: 17 });
    expect(stats.topCities.slice(0, 3)).toEqual([
      { label: "Leeds", count: 4 },
      { label: "London", count: 3 },
      { label: "Manchester", count: 2 },
    ]);
    expect(stats.types).toEqual([
      { label: "Worker", count: 11 },
      { label: "Temporary Worker", count: 3 },
    ]);
    expect(stats.ratings).toEqual([
      { label: "A", count: 11 },
      { label: "B", count: 2 },
    ]);
    expect(stats.routes[0]).toEqual({ label: "Skilled Worker", count: 9 });
    expect(stats.routes.map((r) => r.label)).toContain("Seasonal Worker");
  });
});
