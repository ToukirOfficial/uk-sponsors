import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Context } from "../src/context.js";
import { run } from "../src/program.js";
import { buildIndex, writeIndexFile } from "../src/register/store.js";
import { FIXTURE_SOURCE, fixtureRows } from "./helpers.js";

let dir: string;
let emptyDir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "uk-sponsors-cli-"));
  emptyDir = await mkdtemp(join(tmpdir(), "uk-sponsors-empty-"));
  await writeIndexFile(
    join(dir, "index.json"),
    await buildIndex(await fixtureRows(), FIXTURE_SOURCE),
  );
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(emptyDir, { recursive: true, force: true });
});

async function cli(
  args: string[],
  options: { cacheDir?: string; now?: string } = {},
): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const ctx: Context = {
    stdout: { write: (t: string) => (out += t) },
    stderr: { write: (t: string) => (err += t) },
    stdoutColumns: undefined,
    stderrIsTTY: false,
    cacheDir: options.cacheDir ?? dir,
    now: () => new Date(options.now ?? "2026-11-03T09:00:00Z"),
    // Any network call in these tests would fail fast instead of reaching GOV.UK.
    source: { apiUrl: "http://127.0.0.1:9/api", allowedOrigins: [] },
  };
  const code = await run(args, ctx);
  return { code, out, err };
}

describe("search", () => {
  test("table output with grouped routes", async () => {
    const { code, out, err } = await cli([
      "search",
      "--city",
      "Leeds",
      "--route",
      "Skilled Worker",
    ]);
    expect(code).toBe(0);
    expect(out).toContain("Acme Software Ltd");
    expect(out).toContain("Global Business Mobility: Senior or Specialist Worker");
    expect(err).toBe("4 sponsors found.\n");
  });

  test("--json", async () => {
    const { code, out } = await cli(["search", "--route", "temporary worker", "--json"]);
    expect(code).toBe(0);
    const data = JSON.parse(out) as { name: string }[];
    expect(data.map((c) => c.name)).toEqual([
      "Brighton Arts Trust",
      "Green Fields Farm Ltd",
      "Leeds Ballet Company",
    ]);
  });

  test("--csv", async () => {
    const { out } = await cli(["search", "--name", "smith", "--csv"]);
    expect(out).toBe(
      'name,city,county,ratings,types,routes\n"Smith, Jones & Partners LLP",Manchester,Greater Manchester,A,Worker,Skilled Worker\n',
    );
  });

  test("--limit and the 'showing' note", async () => {
    const { out, err } = await cli(["search", "--limit", "2", "--json"]);
    expect(JSON.parse(out)).toHaveLength(2);
    expect(err).toContain("Showing 2 of 13 sponsors");
  });

  test("--out saves a file", async () => {
    const file = join(dir, "leeds.csv");
    const { code, out, err } = await cli(["search", "--city", "leeds", "--out", file]);
    expect(code).toBe(0);
    expect(out).toBe("");
    expect(err).toContain(`Saved to ${file}`);
    expect(await readFile(file, "utf8")).toContain("O’Brien & Sons Limited");
  });

  test("no results", async () => {
    const { code, out } = await cli(["search", "--city", "Atlantis"]);
    expect(code).toBe(0);
    expect(out).toContain("No sponsors match");
  });

  test.each([
    [["search", "--rating", "C"], /isn't a rating/],
    [["search", "--limit", "0"], /isn't a valid limit/],
    [["search", "--json", "--csv"], /--json or --csv, not both/],
  ])("user errors exit 1: %j", async (args, message) => {
    const { code, err } = await cli(args);
    expect(code).toBe(1);
    expect(err).toMatch(message);
  });
});

describe("check", () => {
  test("yes, with normalised name", async () => {
    const { code, out } = await cli(["check", "SMITH JONES AND PARTNERS LLP"]);
    expect(code).toBe(0);
    expect(out).toContain('Yes: "SMITH JONES AND PARTNERS LLP" is a licensed sponsor.');
  });

  test("words without quotes are joined", async () => {
    const { out } = await cli(["check", "Northern", "Care", "&", "Health", "plc"]);
    expect(out).toContain("Yes:");
  });

  test("no, with close matches", async () => {
    const { code, out } = await cli(["check", "Brighton Arts"]);
    expect(code).toBe(0);
    expect(out).toContain("Close matches");
    expect(out).toContain("Brighton Arts Trust");
  });

  test("no, nothing similar", async () => {
    const { out } = await cli(["check", "Nonexistent Widgets"]);
    expect(out).toContain("nothing similar");
  });

  test("--json", async () => {
    const { out } = await cli(["check", "Zurich Data Limited", "--json"]);
    expect(JSON.parse(out)).toMatchObject({ found: true, matches: [{ name: "Zürich Data Ltd." }] });
  });
});

describe("stats", () => {
  test("shows the register date and Temporary Worker counts", async () => {
    const { code, out } = await cli(["stats"]);
    expect(code).toBe(0);
    expect(out).toContain("Register dated 2 November 2026");
    expect(out).toContain("13 licensed sponsors on 17 rows");
    expect(out).toContain("Temporary Worker");
    expect(out).toContain("Seasonal Worker");
  });

  test("--json and --csv", async () => {
    const json = JSON.parse((await cli(["stats", "--json"])).out) as { registerDate: string };
    expect(json.registerDate).toBe("2026-11-02");
    const csv = (await cli(["stats", "--csv"])).out;
    expect(csv.split("\n")[0]).toBe("section,label,count");
    expect(csv).toContain("type,Temporary Worker,3");
  });
});

describe("general", () => {
  test("stale reminder names the register date", async () => {
    const { err } = await cli(["stats"], { now: "2026-11-20T09:00:00Z" });
    expect(err).toContain("register dated 2 November 2026");
    expect(err).toContain('Run "uk-sponsors update"');
  });

  test("no data yet: friendly message, exit 1", async () => {
    const { code, err } = await cli(["search", "--city", "Leeds"], { cacheDir: emptyDir });
    expect(code).toBe(1);
    expect(err).toContain("No sponsor data on this computer yet");
    expect(err).toContain("uk-sponsors update");
  });

  test("update with no network: exit 2", async () => {
    const { code, err } = await cli(["update"], { cacheDir: emptyDir });
    expect(code).toBe(2);
    expect(err).toContain("Couldn't reach GOV.UK");
  });

  test("help includes examples, data credit and disclaimer", async () => {
    const top = await cli(["--help"]);
    expect(top.code).toBe(0);
    expect(top.out).toContain("Open Government Licence v3.0");
    expect(top.out).toContain("doesn't mean the company is hiring");
    for (const cmd of ["update", "search", "check", "stats"]) {
      const { code, out } = await cli([cmd, "--help"]);
      expect(code).toBe(0);
      expect(out).toContain("Example");
    }
  });

  test("unknown command exits 1", async () => {
    expect((await cli(["frob"])).code).toBe(1);
  });

  test("--version", async () => {
    const { code, out } = await cli(["--version"]);
    expect(code).toBe(0);
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });
});
