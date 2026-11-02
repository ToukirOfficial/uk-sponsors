import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { beforeAll, describe, expect, test } from "vitest";
import { UserError } from "../src/errors.js";
import { companiesCsv, csvCell } from "../src/output/csv.js";
import { emit, resolveFormat } from "../src/output/format.js";
import { toJson } from "../src/output/json.js";
import { toRecord } from "../src/output/records.js";
import { companiesTable, countTable } from "../src/output/table.js";
import { searchCompanies } from "../src/register/query.js";
import type { LoadedRegister } from "../src/register/store.js";
import { fixtureRegister } from "./helpers.js";

let register: LoadedRegister;
beforeAll(async () => {
  register = await fixtureRegister();
});

describe("csv", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("Smith, Jones")).toBe('"Smith, Jones"');
    expect(csvCell('The "Quoted" Co')).toBe('"The ""Quoted"" Co"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(42)).toBe("42");
  });

  test("stops spreadsheet formulas", () => {
    expect(csvCell("=cmd|calc!A1")).toBe("'=cmd|calc!A1");
    expect(csvCell("+44")).toBe("'+44");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-1")).toBe("'-1");
  });

  test("company CSV reads back to the same values", () => {
    const text = companiesCsv(register.companies);
    const rows = parse(text, { columns: true }) as Record<string, string>[];
    expect(rows).toHaveLength(13);
    expect(rows.find((r) => r.name === "Smith, Jones & Partners LLP")).toEqual({
      name: "Smith, Jones & Partners LLP",
      city: "Manchester",
      county: "Greater Manchester",
      ratings: "A",
      types: "Worker",
      routes: "Skilled Worker",
    });
    expect(rows.map((r) => r.name)).toContain('The "Quoted" Company Ltd');
    expect(rows.map((r) => r.name)).toContain("'=cmd|calc!A1");
    const brighton = rows.find((r) => r.name === "Brighton Arts Trust");
    expect(brighton?.routes).toBe(
      "Charity Worker (Temporary Worker); Creative Worker (Temporary Worker)",
    );
  });
});

describe("json", () => {
  test("company records list routes with type and rating", () => {
    const ballet = searchCompanies(register, { name: "leeds ballet" })[0];
    expect(ballet).toBeDefined();
    if (!ballet) return;
    expect(JSON.parse(toJson(toRecord(ballet)))).toEqual({
      name: "Leeds Ballet Company",
      city: "LEEDS",
      county: "West Yorkshire",
      ratings: ["A"],
      types: ["Temporary Worker", "Worker"],
      routes: [
        { route: "Creative Worker", type: "Temporary Worker", rating: "A" },
        { route: "Skilled Worker", type: "Worker", rating: "A" },
      ],
    });
  });
});

describe("table", () => {
  test("shows one row per company with its routes", () => {
    const text = companiesTable(searchCompanies(register, { name: "brighton" }));
    expect(text).toContain("Brighton Arts Trust");
    expect(text).toContain("Charity Worker (Temporary Worker)");
    expect(text).toContain("Creative Worker (Temporary Worker)");
    // No colour codes in plain output.
    expect(text).not.toContain("\u001b[");
  });

  test("fits a given terminal width", () => {
    const text = companiesTable(register.companies, 100);
    for (const line of text.trimEnd().split("\n")) expect(line.length).toBeLessThanOrEqual(100);
  });

  test("count table formats numbers", () => {
    expect(countTable("Route", [{ label: "Skilled Worker", count: 12345 }])).toContain("12,345");
  });
});

describe("resolveFormat", () => {
  test("flags and file extensions", () => {
    expect(resolveFormat({})).toBe("table");
    expect(resolveFormat({ json: true })).toBe("json");
    expect(resolveFormat({ csv: true })).toBe("csv");
    expect(resolveFormat({ out: "leeds.CSV" })).toBe("csv");
    expect(resolveFormat({ out: "leeds.json" })).toBe("json");
    expect(resolveFormat({ out: "leeds.txt" })).toBe("table");
    expect(resolveFormat({ csv: true, out: "x.json" })).toBe("csv");
    expect(() => resolveFormat({ json: true, csv: true })).toThrow(UserError);
  });
});

describe("emit", () => {
  test("writes to the screen or a file; CSV files get a BOM for Excel", async () => {
    let screen = "";
    await emit("a,b\n", "csv", undefined, { write: (t) => (screen += t) });
    expect(screen).toBe("a,b\n");

    const dir = await mkdtemp(join(tmpdir(), "uk-sponsors-out-"));
    try {
      await emit("a,b\n", "csv", join(dir, "x.csv"), { write: () => undefined });
      expect(await readFile(join(dir, "x.csv"), "utf8")).toBe(
        String.fromCharCode(0xfeff) + "a,b\n",
      );
      await expect(
        emit("x", "json", join(dir, "missing", "x.json"), { write: () => undefined }),
      ).rejects.toThrow(/Couldn't save/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
