import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import {
  buildIndex,
  readIndexFile,
  writeIndexFile,
  type LoadedRegister,
} from "../src/register/store.js";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { readRegisterRows, type RegisterRow } from "../src/register/parse.js";

export const FIXTURE = fileURLToPath(new URL("./fixtures/register.csv", import.meta.url));

export async function collect(input: Readable): Promise<RegisterRow[]> {
  const rows: RegisterRow[] = [];
  for await (const row of readRegisterRows(input)) rows.push(row);
  return rows;
}

export function fixtureRows(): Promise<RegisterRow[]> {
  return collect(createReadStream(FIXTURE));
}

export function csv(text: string): Readable {
  return Readable.from([Buffer.from(text, "utf8")]);
}

export async function fixtureRegister(): Promise<LoadedRegister> {
  const dir = await mkdtemp(join(tmpdir(), "uk-sponsors-test-"));
  try {
    const index = await buildIndex(await fixtureRows(), FIXTURE_SOURCE);
    await writeIndexFile(join(dir, "index.json"), index);
    return await readIndexFile(join(dir, "index.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const FIXTURE_SOURCE = {
  registerDate: "2026-11-02",
  downloadedAt: "2026-11-02T10:00:00.000Z",
  sourceUrl: "https://assets.publishing.service.gov.uk/media/x/register.csv",
};
