import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { SourceError } from "../errors.js";
import { checkDownloadUrl } from "./locate.js";
import { httpError, networkError } from "./network.js";

export type ProgressFn = (received: number, total: number | null) => void;

export interface DownloadOptions {
  allowedOrigins: readonly string[];
  onProgress?: ProgressFn;
  /** Give up if no data arrives for this long. */
  idleTimeoutMs?: number;
  maxBytes?: number;
}

/** Streams a file to disk without holding it in memory. Returns the byte count. */
export async function downloadFile(
  url: string,
  dest: string,
  options: DownloadOptions,
): Promise<number> {
  checkDownloadUrl(url, options.allowedOrigins);
  const idleMs = options.idleTimeoutMs ?? 60_000;
  const maxBytes = options.maxBytes ?? 500 * 1024 * 1024;
  const controller = new AbortController();
  let timer = setTimeout(() => {
    controller.abort();
  }, idleMs);
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort();
    }, idleMs);
  };

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw networkError(err, "the GOV.UK file server");
    }
    // Redirects must not leave GOV.UK's file host either.
    if (response.url) checkDownloadUrl(response.url, options.allowedOrigins);
    if (!response.ok || !response.body) throw httpError(response.status, "The GOV.UK file server");

    const lengthHeader = Number(response.headers.get("content-length"));
    const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
    let received = 0;

    const counter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length;
        resetTimer();
        if (received > maxBytes) {
          done(
            new SourceError(
              "The register file is far larger than expected, so the download was stopped.",
            ),
          );
          return;
        }
        options.onProgress?.(received, total);
        done(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
        counter,
        createWriteStream(dest),
      );
    } catch (err) {
      if (err instanceof SourceError) throw err;
      throw new SourceError(
        "The download was interrupted.",
        "Check your internet connection and try again.",
      );
    }

    if (total !== null && received !== total) {
      throw new SourceError(
        `The download was cut short (${received} of ${total} bytes).`,
        "Check your internet connection and try again.",
      );
    }
    return received;
  } finally {
    clearTimeout(timer);
  }
}
