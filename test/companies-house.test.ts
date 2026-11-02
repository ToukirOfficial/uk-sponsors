import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runEnrich } from "../src/commands/enrich.js";
import { industryCodes, parseSicCodes, sicMatches } from "../src/companies-house/industries.js";
import { parseDownloadPage } from "../src/companies-house/locate.js";
import { lookupNames, SponsorMatcher } from "../src/companies-house/match.js";
import { readCompaniesHouseRows, sicCode, type ChRow } from "../src/companies-house/parse.js";
import { readEnrichmentFile } from "../src/companies-house/store.js";
import { firstZipEntry } from "../src/companies-house/unzip.js";
import type { Context } from "../src/context.js";
import { SourceError, UserError } from "../src/errors.js";
import { run } from "../src/program.js";
import { buildIndex, writeIndexFile } from "../src/register/store.js";
import { FIXTURE_SOURCE, fixtureRegister, fixtureRows } from "./helpers.js";
import { startServer, type FakeServer } from "./server.js";

const CH_CSV = readFileSync(
  fileURLToPath(new URL("./fixtures/companies-house.csv", import.meta.url)),
);

/** A one-file zip like Companies House's, plus a fake directory after the data. */
function zipOf(name: string, data: Buffer): Buffer {
  const body = deflateRawSync(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  const directory = Buffer.from("PK\u0001\u0002 central directory would be here");
  return Buffer.concat([header, Buffer.from(name), body, directory]);
}

/** Splits a buffer into small chunks, as a slow download would arrive. */
function chunked(data: Buffer, size = 7): Readable {
  const parts: Buffer[] = [];
  for (let i = 0; i < data.length; i += size) parts.push(data.subarray(i, i + size));
  return Readable.from(parts);
}

async function rows(input: Readable): Promise<ChRow[]> {
  const out: ChRow[] = [];
  for await (const row of readCompaniesHouseRows(input)) out.push(row);
  return out;
}

describe("SIC codes and industry presets", () => {
  test("reads the code from Companies House's SIC text", () => {
    expect(sicCode("62012 - Business and domestic software development")).toBe("62012");
    expect(sicCode("None Supplied")).toBeNull();
    expect(sicCode("")).toBeNull();
  });

  test("--sic accepts lists, wildcards and prefixes", () => {
    expect(parseSicCodes("62012,62020")).toEqual(["62012", "62020"]);
    expect(parseSicCodes("62012 62020")).toEqual(["62012", "62020"]);
    expect(parseSicCodes("62xxx")).toEqual(["62"]);
    expect(parseSicCodes("620*")).toEqual(["620"]);
    for (const bad of ["abc", "6", "620123", "62xxxx", ""]) {
      expect(() => parseSicCodes(bad)).toThrow(UserError);
    }
  });

  test("codes match exactly, short codes by prefix", () => {
    expect(sicMatches(["62012"], ["62012"])).toBe(true);
    expect(sicMatches(["62090"], ["62"])).toBe(true);
    expect(sicMatches(["63110"], ["62"])).toBe(false);
    expect(sicMatches([], ["62"])).toBe(false);
  });

  test("presets", () => {
    expect(industryCodes("software")).toEqual(["62012", "62020", "62090", "63110", "58290"]);
    expect(industryCodes("IT-Services")).toEqual(["62"]);
    for (const p of ["fintech", "health-tech", "legal-services"]) {
      expect(industryCodes(p).length).toBeGreaterThan(0);
    }
    expect(() => industryCodes("rockets")).toThrow(/isn't an industry preset/);
  });
});

describe("Companies House download page", () => {
  test("finds the newest one-file zip", () => {
    const html = `
      <a href="BasicCompanyDataAsOneFile-2026-10-01.zip">old</a>
      <li><a href="BasicCompanyDataAsOneFile-2026-11-01.zip">BasicCompanyDataAsOneFile-2026-11-01.zip (471Mb)</a></li>
      <a href="BasicCompanyData-2026-11-01-part1_7.zip">part 1</a>`;
    expect(
      parseDownloadPage(html, "https://download.companieshouse.gov.uk/en_output.html"),
    ).toEqual({
      url: "https://download.companieshouse.gov.uk/BasicCompanyDataAsOneFile-2026-11-01.zip",
      dataDate: "2026-11-01",
    });
  });

  test("names the problem if the link is gone", () => {
    expect(() => parseDownloadPage("<html>moved</html>", "https://x.test/")).toThrow(
      /no "BasicCompanyDataAsOneFile" zip link/,
    );
  });
});

describe("streaming unzip and parse", () => {
  test("reads the CSV out of a zip arriving in small chunks", async () => {
    const list = await rows(firstZipEntry(chunked(zipOf("BasicCompanyData.csv", CH_CSV))));
    expect(list).toHaveLength(9);
    expect(list[0]).toEqual({
      name: "ACME SOFTWARE LIMITED",
      number: "01234567",
      town: "LEEDS",
      status: "Active",
      sicCodes: ["62012"],
      previousNames: [],
    });
    expect(list.find((r) => r.number === "04567890")?.sicCodes).toEqual(["62020", "63110"]);
    expect(list.find((r) => r.number === "06000001")?.previousNames).toEqual([
      "OLD NAME LTD",
      "KØBENHAVN DESIGN APS",
    ]);
    expect(list.find((r) => r.number === "08000001")?.sicCodes).toEqual([]);
  });

  test("rejects something that isn't a zip", async () => {
    await expect(
      rows(firstZipEntry(Readable.from([Buffer.from("<html>error page</html>")]))),
    ).rejects.toThrow(/isn't the zip we expected/);
  });

  test("names missing columns", async () => {
    const zip = zipOf("x.csv", Buffer.from("CompanyName,CompanyNumber\nFoo,1\n"));
    await expect(rows(firstZipEntry(Readable.from([zip])))).rejects.toThrow(
      /Companies House data's columns have changed. Missing: "RegAddress.PostTown", "CompanyStatus"/,
    );
  });
});

describe("matching sponsors to companies", () => {
  test("T/A names are looked up by their legal name too", () => {
    expect(lookupNames("foo ltd t a bar")).toEqual(["foo ltd t a bar", "foo ltd"]);
    expect(lookupNames("foo ltd")).toEqual(["foo ltd"]);
  });

  test("by name and town, name only, former name; ambiguous names are skipped", async () => {
    const register = await fixtureRegister();
    const matcher = new SponsorMatcher(register.companies);
    for (const row of await rows(firstZipEntry(Readable.from([zipOf("x.csv", CH_CSV)])))) {
      matcher.add(row);
    }
    const { matches, summary } = matcher.results();
    const byName = (name: string, city: string) => {
      const c = register.companies.find((x) => x.name === name && x.city === city);
      return c ? matches.get(`${c.nameKey}\u0000${c.cityKey}`) : undefined;
    };

    expect(byName("Acme Software Ltd", "Leeds")).toEqual({
      number: "01234567",
      status: "Active",
      sicCodes: ["62012"],
      matchedBy: "name+town",
    });
    // Same legal entity, a branch in another town.
    expect(byName("Acme Software Ltd", "Bristol")?.matchedBy).toBe("name");
    expect(byName("Northern Care & Health PLC", "Leeds")?.matchedBy).toBe("name");
    expect(byName("O’Brien & Sons Limited", "Leeds")?.status).toBe("Liquidation");
    expect(byName("Zürich Data Ltd.", "Manchester")?.number).toBe("04567890");
    expect(byName("København Design ApS", "London")?.matchedBy).toBe("previous-name+town");
    // Two companies with that name, neither in Glasgow: too uncertain.
    expect(byName('The "Quoted" Company Ltd', "Glasgow")).toBeUndefined();
    expect(byName("Brighton Arts Trust", "Brighton")).toBeUndefined();

    expect(summary).toEqual({
      sponsors: 13,
      matched: 7,
      byNameAndTown: 4,
      byNameOnly: 2,
      byPreviousName: 1,
    });
  });
});

describe("enrich command and industry search", () => {
  let dir: string;
  let server: FakeServer | undefined;
  let log: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "uk-sponsors-enrich-"));
    log = "";
    await writeIndexFile(
      join(dir, "index.json"),
      await buildIndex(await fixtureRows(), FIXTURE_SOURCE),
    );
  });
  afterEach(async () => {
    await server?.close();
    server = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  function context(origin: string, extra: Partial<Context> = {}): Context {
    return {
      stdout: { write: () => undefined },
      stderr: { write: (t: string) => (log += t) },
      stdoutColumns: undefined,
      stderrIsTTY: false,
      cacheDir: dir,
      now: () => new Date("2026-11-02T12:00:00.000Z"),
      source: {
        apiUrl: "http://127.0.0.1:9/api",
        allowedOrigins: [],
        companiesHousePageUrl: `${origin}/en_output.html`,
        companiesHouseOrigins: [origin],
        minCompaniesHouseRows: 1,
      },
      ...extra,
    };
  }

  async function fakeCompaniesHouse(zip: Buffer): Promise<string> {
    server = await startServer((req, res) => {
      if (req.url === "/en_output.html") {
        res.end('<a href="BasicCompanyDataAsOneFile-2026-11-01.zip">zip (471Mb)</a>');
      } else if (req.url === "/BasicCompanyDataAsOneFile-2026-11-01.zip") {
        res.setHeader("content-type", "application/zip");
        res.end(zip);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    return server.origin;
  }

  async function cli(origin: string, args: string[], extra: Partial<Context> = {}) {
    let out = "";
    let err = "";
    const code = await run(
      args,
      context(origin, {
        stdout: { write: (t: string) => (out += t) },
        stderr: { write: (t: string) => (err += t) },
        ...extra,
      }),
    );
    return { code, out, err };
  }

  test("search --industry explains how to get the data first", async () => {
    const { code, err } = await cli("http://127.0.0.1:9", ["search", "--industry", "software"]);
    expect(code).toBe(1);
    expect(err).toContain('Run "uk-sponsors enrich"');
  });

  test("enrich saves matches and reports the match rate; search filters by industry", async () => {
    const origin = await fakeCompaniesHouse(zipOf("BasicCompanyData-2026-11-01.csv", CH_CSV));
    const summary = await runEnrich(context(origin));
    expect(summary.matched).toBe(7);
    expect(log).toContain("Matched 7 of 13 sponsors (53.8%)");
    const saved = await readEnrichmentFile(join(dir, "companies-house.json"));
    expect(saved?.meta).toMatchObject({
      dataDate: "2026-11-01",
      companiesHouseRows: 9,
      matched: 7,
    });

    // The example from the README.
    const leeds = await cli(origin, [
      "search",
      "--city",
      "Leeds",
      "--route",
      "Skilled Worker",
      "--industry",
      "software",
    ]);
    expect(leeds.code).toBe(0);
    expect(leeds.out).toContain("Acme Software Ltd");
    expect(leeds.out).toContain("62012");
    expect(leeds.out).not.toContain("Northern Care");
    expect(leeds.err).toBe("1 sponsor found.\n");

    const software = await cli(origin, ["search", "--industry", "software", "--json"]);
    expect(
      (JSON.parse(software.out) as { name: string; city: string }[]).map(
        (c) => `${c.name} ${c.city}`,
      ),
    ).toEqual([
      "Acme Software Ltd Bristol",
      "Acme Software Ltd Leeds",
      "København Design ApS London",
      "Zürich Data Ltd. Manchester",
    ]);

    // Only active companies, unless asked.
    const legal = await cli(origin, ["search", "--industry", "legal-services", "--json"]);
    expect(JSON.parse(legal.out)).toEqual([]);
    const legalAll = await cli(origin, [
      "search",
      "--industry",
      "legal-services",
      "--include-inactive",
      "--json",
    ]);
    expect(JSON.parse(legalAll.out)).toMatchObject([
      {
        name: "O’Brien & Sons Limited",
        companiesHouse: { number: "03456789", status: "Liquidation" },
      },
    ]);

    const sic = await cli(origin, ["search", "--sic", "86xxx", "--csv"]);
    expect(sic.out.split("\n")[0]).toBe(
      "name,city,county,ratings,types,routes,company_number,company_status,sic_codes",
    );
    expect(sic.out).toContain(
      "Northern Care & Health PLC,Leeds,,A,Worker,Skilled Worker,02345678,Active,86900",
    );

    const check = await cli(origin, ["check", "Acme Software Limited"]);
    expect(check.out).toContain("Companies House: 01234567, Active, SIC 62012");

    const stats = await cli(origin, ["stats", "--json"]);
    expect(JSON.parse(stats.out)).toMatchObject({
      companiesHouse: { dataDate: "2026-11-01", matched: 7 },
    });
  });

  test("a cut-off or wrong download leaves no half-written data", async () => {
    const origin = await fakeCompaniesHouse(Buffer.from("<html>Service unavailable</html>"));
    await expect(runEnrich(context(origin))).rejects.toThrow(SourceError);
    await expect(readFile(join(dir, "companies-house.json"))).rejects.toThrow(/ENOENT/);
  });

  test("refuses to download from anywhere else", async () => {
    server = await startServer((_req, res) => {
      res.end('<a href="https://evil.example/BasicCompanyDataAsOneFile-2026-11-01.zip">x</a>');
    });
    await expect(runEnrich(context(server.origin))).rejects.toThrow(/Refusing to download/);
  });
});

describe("colour", () => {
  test("tables are coloured only when asked; NO_COLOR and pipes get plain text", async () => {
    const { colorEnabled } = await import("../src/output/style.js");
    expect(colorEnabled(true, {})).toBe(true);
    expect(colorEnabled(false, {})).toBe(false);
    expect(colorEnabled(undefined, {})).toBe(false);
    expect(colorEnabled(true, { NO_COLOR: "1" })).toBe(false);
    expect(colorEnabled(true, { TERM: "dumb" })).toBe(false);
    expect(colorEnabled(false, { FORCE_COLOR: "1" })).toBe(true);
    expect(colorEnabled(true, { FORCE_COLOR: "0" })).toBe(false);
  });
});
