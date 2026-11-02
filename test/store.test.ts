import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { UserError } from "../src/errors.js";
import {
  buildIndex,
  installIndexFile,
  readIndexFile,
  writeIndexFile,
} from "../src/register/store.js";
import { FIXTURE_SOURCE, fixtureRegister, fixtureRows } from "./helpers.js";

describe("buildIndex", () => {
  test("groups several routes into one company", async () => {
    const index = await buildIndex(await fixtureRows(), FIXTURE_SOURCE);
    const acmeLeeds = index.companies.filter(
      (c) => c.name === "Acme Software Ltd" && c.city === "Leeds",
    );
    expect(acmeLeeds).toHaveLength(1);
    expect(acmeLeeds[0]?.routes).toEqual([
      {
        route: "Global Business Mobility: Senior or Specialist Worker",
        type: "Worker",
        rating: "A",
      },
      { route: "Skilled Worker", type: "Worker", rating: "A" },
    ]);
  });

  test("keeps the same name in different towns apart", async () => {
    const index = await buildIndex(await fixtureRows(), FIXTURE_SOURCE);
    expect(
      index.companies.filter((c) => c.name === "Acme Software Ltd").map((c) => c.city),
    ).toEqual(["Bristol", "Leeds"]);
  });

  test("treats a town's spelling case as the same town", async () => {
    const index = await buildIndex(await fixtureRows(), FIXTURE_SOURCE);
    const ballet = index.companies.filter((c) => c.name === "Leeds Ballet Company");
    expect(ballet).toHaveLength(1);
    expect(ballet[0]?.routes.map((r) => `${r.type}: ${r.route}`)).toEqual([
      "Temporary Worker: Creative Worker",
      "Worker: Skilled Worker",
    ]);
  });

  test("counts rows and companies", async () => {
    const index = await buildIndex(await fixtureRows(), FIXTURE_SOURCE);
    expect(index.meta).toMatchObject({
      rowCount: 17,
      companyCount: 13,
      registerDate: "2026-11-02",
    });
  });
});

describe("index file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "uk-sponsors-store-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("round-trips through disk", async () => {
    const register = await fixtureRegister();
    expect(register.companies).toHaveLength(13);
    const cafe = register.companies.find((c) => c.name === "Café Société Limited");
    expect(cafe).toMatchObject({ nameKey: "cafe societe ltd", cityKey: "london" });
  });

  test("says to run update when there's no data yet", async () => {
    const read = readIndexFile(join(dir, "index.json"));
    await expect(read).rejects.toBeInstanceOf(UserError);
    await expect(readIndexFile(join(dir, "index.json"))).rejects.toThrow(/No sponsor data/);
  });

  test("says the data is damaged when the file is broken", async () => {
    await writeFile(join(dir, "index.json"), "{not json");
    await expect(readIndexFile(join(dir, "index.json"))).rejects.toThrow(/damaged/);
    await writeFile(
      join(dir, "index.json"),
      JSON.stringify({ meta: { formatVersion: 99 }, companies: [] }),
    );
    await expect(readIndexFile(join(dir, "index.json"))).rejects.toThrow(/damaged/);
  });

  test("installIndexFile replaces the live file", async () => {
    const live = join(dir, "index.json");
    const temp = join(dir, "index.json.tmp");
    await writeFile(live, "old");
    await writeIndexFile(temp, await buildIndex(await fixtureRows(), FIXTURE_SOURCE));
    await installIndexFile(temp, live);
    expect((await readFile(live, "utf8")).startsWith('{"meta"')).toBe(true);
  });
});
