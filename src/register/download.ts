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
  /** Who we're downloading from, for error messages. */
  serverName?: string;
}

export interface OpenDownload {
  /** The response body. Fails if the transfer is cut short or grows too large. */
  body: Readable;
  total: number | null;
  /** Stops the idle timer. Call when finished, whether it worked or not. */
  close: () => void;
}

/**
 * Starts a download and returns the body as a stream, so callers can parse it
 * as it arrives without holding the file in memory.
 */
export async function openDownload(url: string, options: DownloadOptions): Promise<OpenDownload> {
  checkDownloadUrl(url, options.allowedOrigins);
  const server = options.serverName ?? "the GOV.UK file server";
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
  const close = () => {
    clearTimeout(timer);
  };

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw networkError(err, server);
    }
    // Redirects must not leave the allowed host either.
    if (response.url) checkDownloadUrl(response.url, options.allowedOrigins);
    if (!response.ok || !response.body) {
      throw httpError(response.status, server.charAt(0).toUpperCase() + server.slice(1));
    }

    const lengthHeader = Number(response.headers.get("content-length"));
    const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
    let received = 0;

    const counter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length;
        resetTimer();
        if (received > maxBytes) {
          done(
            new SourceError("The file is far larger than expected, so the download was stopped."),
          );
          return;
        }
        options.onProgress?.(received, total);
        done(null, chunk);
      },
      flush(done) {
        if (total !== null && received !== total) {
          done(
            new SourceError(
              `The download was cut short (${received} of ${total} bytes).`,
              "Check your internet connection and try again.",
            ),
          );
          return;
        }
        done();
      },
    });

    const source = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
    source.on("error", () => {
      counter.destroy(
        new SourceError(
          "The download was interrupted.",
          "Check your internet connection and try again.",
        ),
      );
    });
    return { body: source.pipe(counter), total, close };
  } catch (err) {
    close();
    throw err;
  }
}

/** Streams a file to disk without holding it in memory. Returns the byte count. */
export async function downloadFile(
  url: string,
  dest: string,
  options: DownloadOptions,
): Promise<number> {
  const download = await openDownload(url, options);
  let received = 0;
  try {
    await pipeline(
      download.body,
      new Transform({
        transform(chunk: Buffer, _enc, done) {
          received += chunk.length;
          done(null, chunk);
        },
      }),
      createWriteStream(dest),
    );
  } catch (err) {
    if (err instanceof SourceError) throw err;
    throw new SourceError(
      "The download was interrupted.",
      "Check your internet connection and try again.",
    );
  } finally {
    download.close();
  }
  return received;
}
