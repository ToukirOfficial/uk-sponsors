import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestListener } from "node:http";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runUpdate } from "../src/commands/update.js";
import type { Context } from "../src/context.js";
import { SourceError } from "../src/errors.js";
import { readIndexFile } from "../src/register/store.js";
import { FIXTURE } from "./helpers.js";
import { contentApi, startServer, type FakeServer } from "./server.js";

const FIXTURE_BYTES = readFileSync(FIXTURE);
const CSV_PATH = "/media/abc/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-02.csv";

let dir: string;
let server: FakeServer | undefined;
let log: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "uk-sponsors-update-"));
  log = "";
});
afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(dir, { recursive: true, force: true });
});

function context(origin: string): Context {
  return {
    stdout: { write: () => undefined },
    stderr: { write: (t: string) => (log += t) },
    stdoutColumns: undefined,
    stderrIsTTY: false,
    cacheDir: dir,
    now: () => new Date("2026-11-02T12:00:00.000Z"),
    source: { apiUrl: `${origin}/api`, allowedOrigins: [origin], minRows: 1 },
  };
}

/** A fake GOV.UK: /api returns Content API JSON, the CSV path returns `csv`. */
async function fakeGovUk(
  csv: Buffer | string,
  apiOverride?: (origin: string) => unknown,
): Promise<string> {
  let origin = "";
  const handler: RequestListener = (req, res) => {
    if (req.url === "/api") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(apiOverride ? apiOverride(origin) : contentApi(`${origin}${CSV_PATH}`)),
      );
    } else if (req.url === CSV_PATH) {
      res.setHeader("content-type", "text/csv");
      res.end(csv);
    } else {
      res.statusCode = 404;
      res.end();
    }
  };
  server = await startServer(handler);
  origin = server.origin;
  return origin;
}

async function installGoodData(): Promise<void> {
  const origin = await fakeGovUk(FIXTURE_BYTES);
  await runUpdate(context(origin));
  await server?.close();
  server = undefined;
}

describe("runUpdate", () => {
  test("downloads, builds and installs the index", async () => {
    const origin = await fakeGovUk(FIXTURE_BYTES);
    const result = await runUpdate(context(origin));
    expect(result).toEqual({ registerDate: "2026-11-02", rows: 17, companies: 13 });

    const saved = await readIndexFile(join(dir, "index.json"));
    expect(saved.meta).toMatchObject({
      registerDate: "2026-11-02",
      downloadedAt: "2026-11-02T12:00:00.000Z",
      sourceUrl: `${origin}${CSV_PATH}`,
    });
    expect(log).toContain("register dated 2 November 2026");
    // Temp files are cleaned up; only the index stays.
    expect(await readdir(dir)).toEqual(["index.json"]);
  });

  test("a failed update leaves the old data working", async () => {
    await installGoodData();
    const before = await readIndexFile(join(dir, "index.json"));

    const origin = await fakeGovUk("Name,Town,Type\nFoo,Leeds,Worker\n");
    await expect(runUpdate(context(origin))).rejects.toThrow(/columns have changed/);

    const after = await readIndexFile(join(dir, "index.json"));
    expect(after).toEqual(before);
    expect(log).toContain("has not been changed");
    expect(await readdir(dir)).toEqual(["index.json"]);
  });

  test("fails clearly when the Content API shape changes", async () => {
    await installGoodData();
    const origin = await fakeGovUk(FIXTURE_BYTES, () => ({ details: { documents: [] } }));
    await expect(runUpdate(context(origin))).rejects.toThrow(/"details.attachments" is missing/);
    expect((await readIndexFile(join(dir, "index.json"))).companies).toHaveLength(13);
  });

  test("refuses a CSV link on another host", async () => {
    const origin = await fakeGovUk(FIXTURE_BYTES, () =>
      contentApi("https://evil.example.com/x.csv"),
    );
    await expect(runUpdate(context(origin))).rejects.toThrow(/Refusing to download/);
  });

  test("rejects a register with too few rows", async () => {
    const origin = await fakeGovUk(FIXTURE_BYTES);
    await expect(
      runUpdate({ ...context(origin), source: { ...context(origin).source, minRows: 1000 } }),
    ).rejects.toThrow(/only had 17 rows/);
  });

  test("HTTP errors from GOV.UK are source errors", async () => {
    const handler: RequestListener = (_req, res) => {
      res.statusCode = 503;
      res.end();
    };
    server = await startServer(handler);
    const run = runUpdate(context(server.origin));
    await expect(run).rejects.toBeInstanceOf(SourceError);
    await expect(runUpdate(context(server.origin))).rejects.toThrow(/HTTP 503/);
  });

  test("a download cut short is caught", async () => {
    let origin = "";
    const handler: RequestListener = (req, res) => {
      if (req.url === "/api") {
        res.end(JSON.stringify(contentApi(`${origin}${CSV_PATH}`)));
        return;
      }
      res.setHeader("content-length", String(FIXTURE_BYTES.length + 1000));
      res.write(FIXTURE_BYTES.subarray(0, 100));
      setTimeout(() => res.destroy(), 20);
    };
    server = await startServer(handler);
    origin = server.origin;
    await expect(runUpdate(context(origin))).rejects.toBeInstanceOf(SourceError);
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  test("no internet gives a friendly network error", async () => {
    server = await startServer((_req, res) => res.end());
    const origin = server.origin;
    await server.close();
    server = undefined;
    await expect(runUpdate(context(origin))).rejects.toThrow(/Couldn't reach GOV.UK/);
  });

  test("clears temp folders left by an old crashed update", async () => {
    const stale = join(dir, "tmp-old");
    await mkdir(stale);
    await writeFile(join(stale, "register.csv"), "partial");
    const old = new Date("2026-10-01T00:00:00Z");
    await utimes(stale, old, old);
    const origin = await fakeGovUk(FIXTURE_BYTES);
    await runUpdate(context(origin));
    expect(await readdir(dir)).toEqual(["index.json"]);
  });
});
