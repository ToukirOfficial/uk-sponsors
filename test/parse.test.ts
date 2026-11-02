import { describe, expect, test } from "vitest";
import { SourceError } from "../src/errors.js";
import { mapColumns } from "../src/register/columns.js";
import { cleanField, parseTypeRating } from "../src/register/parse.js";
import { collect, csv, fixtureRows } from "./helpers.js";

describe("readRegisterRows", () => {
  test("reads every data row of the fixture (BOM, CRLF, blank line skipped)", async () => {
    const rows = await fixtureRows();
    expect(rows).toHaveLength(17);
    expect(rows[0]).toEqual({
      name: "Acme Software Ltd",
      city: "Leeds",
      county: "West Yorkshire",
      type: "Worker",
      rating: "A",
      route: "Skilled Worker",
    });
  });

  test("keeps quoted commas, quotes and accents in names", async () => {
    const names = (await fixtureRows()).map((r) => r.name);
    expect(names).toContain("Smith, Jones & Partners LLP");
    expect(names).toContain('The "Quoted" Company Ltd');
    expect(names).toContain("Café Société Limited");
    expect(names).toContain("København Design ApS");
    expect(names).toContain("O’Brien & Sons Limited");
  });

  test("trims and collapses odd whitespace", async () => {
    const rows = await fixtureRows();
    expect(rows.map((r) => r.name)).toContain("Green Fields Farm Ltd");
    expect(rows.filter((r) => r.name === "Leeds Ballet Company").map((r) => r.city)).toEqual([
      "LEEDS",
      "LEEDS",
    ]);
  });

  test("reads Temporary Worker rows", async () => {
    const row = (await fixtureRows()).find((r) => r.route === "Seasonal Worker");
    expect(row?.type).toBe("Temporary Worker");
    expect(row?.rating).toBe("A");
  });

  test("works with LF line endings, no BOM and columns in another order", async () => {
    const rows = await collect(
      csv(
        "Route,County,Organisation Name,Type & Rating,Town/City\nSkilled Worker,,Foo Ltd,Worker (B rating),York\n",
      ),
    );
    expect(rows).toEqual([
      {
        name: "Foo Ltd",
        city: "York",
        county: "",
        type: "Worker",
        rating: "B",
        route: "Skilled Worker",
      },
    ]);
  });

  test("names the missing columns when GOV.UK changes them", async () => {
    const run = collect(
      csv(
        "Organisation Name,City,Type & Rating,Route\nFoo,York,Worker (A rating),Skilled Worker\n",
      ),
    );
    await expect(run).rejects.toBeInstanceOf(SourceError);
    await expect(
      collect(
        csv(
          "Organisation Name,City,Type & Rating,Route\nFoo,York,Worker (A rating),Skilled Worker\n",
        ),
      ),
    ).rejects.toThrow(/Missing: "Town\/City", "County"/);
  });

  test("fails clearly on an empty file", async () => {
    await expect(collect(csv(""))).rejects.toThrow(/empty/);
  });

  test("fails clearly on broken CSV", async () => {
    await expect(
      collect(csv('Organisation Name,Town/City,County,Type & Rating,Route\n"Unclosed,York,,,\n')),
    ).rejects.toBeInstanceOf(SourceError);
  });
});

describe("mapColumns", () => {
  test("ignores case, extra spaces and extra columns", () => {
    expect(
      mapColumns([
        "Extra",
        " organisation  name ",
        "TOWN/CITY",
        "County",
        "Type & Rating",
        "Route",
      ]),
    ).toEqual({
      name: 1,
      city: 2,
      county: 3,
      typeRating: 4,
      route: 5,
    });
  });
});

describe("parseTypeRating", () => {
  test.each([
    ["Worker (A rating)", "Worker", "A"],
    ["Worker (B rating)", "Worker", "B"],
    ["Worker (A (SME+))", "Worker", "A"],
    ["Worker (A (Premium))", "Worker", "A"],
    ["Temporary Worker (A rating)", "Temporary Worker", "A"],
    ["Temporary Worker (B rating)", "Temporary Worker", "B"],
    // 97 sponsors on the 2 Nov 2026 register; these used to show as "Unknown".
    ["Worker (UK Expansion Worker: Provisional )", "Worker", "Provisional"],
    ["Temporary Worker (A (SME+))", "Temporary Worker", "A"],
    ["Something new", null, null],
  ])("%s", (input, type, rating) => {
    expect(parseTypeRating(input)).toEqual({ type, rating });
  });
});

test("cleanField removes control characters", () => {
  expect(cleanField("Evil\u001b[31m Co\u0007 ")).toBe("Evil [31m Co");
});
