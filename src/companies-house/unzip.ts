import { once } from "node:events";
import type { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";

const LOCAL_FILE_HEADER = 0x04034b50;
const HEADER_SIZE = 30;
const DEFLATE = 8;

function badZip(detail: string): SourceError {
  return new SourceError(
    `The Companies House file isn't the zip we expected: ${detail}.`,
    SOURCE_CHANGED_HINT,
  );
}

/**
 * Streams the first file out of a zip as it downloads, using Node's own zlib.
 * Companies House's snapshot is one deflated CSV, so there's no need to wait
 * for the directory at the end of the zip, or to save the 470 MB zip to disk.
 */
export function firstZipEntry(input: Readable): Readable {
  const inflate = createInflateRaw();

  async function feed(): Promise<void> {
    let pending: Buffer = Buffer.alloc(0);
    let started = false;
    for await (const chunk of input as AsyncIterable<Buffer>) {
      let data = chunk;
      if (!started) {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length < HEADER_SIZE) continue;
        if (pending.readUInt32LE(0) !== LOCAL_FILE_HEADER) throw badZip("no zip header");
        if (pending.readUInt16LE(6) & 1) throw badZip("it's encrypted");
        const method = pending.readUInt16LE(8);
        if (method !== DEFLATE) throw badZip(`compression method ${method}`);
        const skip = HEADER_SIZE + pending.readUInt16LE(26) + pending.readUInt16LE(28);
        if (pending.length < skip) continue;
        started = true;
        data = pending.subarray(skip);
      }
      // The deflate stream ends before the zip's directory; ignore what follows.
      if (inflate.writableEnded || inflate.destroyed) break;
      // once() rejects if inflate errors while we wait, and cleans up its listeners.
      if (!inflate.write(data)) await once(inflate, "drain");
    }
    if (!started) throw badZip("the file is too short");
    if (!inflate.writableEnded) inflate.end();
  }

  feed().catch((err: unknown) => {
    inflate.destroy(
      err instanceof SourceError ? err : badZip(err instanceof Error ? err.message : String(err)),
    );
  });
  input.on("error", (err) => inflate.destroy(err));
  return inflate;
}
