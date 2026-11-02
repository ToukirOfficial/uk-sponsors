import { createReadStream } from "node:fs";
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
