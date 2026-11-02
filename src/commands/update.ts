import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "../context.js";
import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";
import { downloadFile } from "../register/download.js";
import { formatRegisterDate } from "../register/freshness.js";
import { ALLOWED_ORIGINS, locateRegister } from "../register/locate.js";
import { readRegisterRows } from "../register/parse.js";
import { indexPath } from "../register/paths.js";
import { buildIndex, installIndexFile, readIndexFile, writeIndexFile } from "../register/store.js";

/** The real register has 100,000+ rows; far fewer means something is wrong. */
export const DEFAULT_MIN_ROWS = 1000;
const TEMP_PREFIX = "tmp-";

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function progressPrinter(ctx: Context): {
  update: (received: number, total: number | null) => void;
  done: () => void;
} {
  let last = 0;
  return {
    update(received, total) {
      if (!ctx.stderrIsTTY) return;
      const now = Date.now();
      if (now - last < 100 && received !== total) return;
      last = now;
      const pct = total ? ` (${Math.floor((received / total) * 100)}%)` : "";
      const of = total ? ` of ${megabytes(total)}` : "";
      ctx.stderr.write(`\rDownloading… ${megabytes(received)}${of} MB${pct}   `);
    },
    done() {
      if (ctx.stderrIsTTY) ctx.stderr.write("\n");
    },
  };
}

/** Removes temp folders left by an update that crashed more than a day ago. */
async function cleanOldTempFolders(dir: string, now: Date): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PREFIX)) continue;
    const path = join(dir, entry.name);
    const info = await stat(path);
    if (now.getTime() - info.mtimeMs > 24 * 60 * 60 * 1000) {
      await rm(path, { recursive: true, force: true });
    }
  }
}

export interface UpdateResult {
  registerDate: string | null;
  rows: number;
  companies: number;
}

/**
 * Downloads the register and builds the index in a temp folder, checks it,
 * then swaps it in with one rename. If anything fails, the old data stays.
 */
export async function runUpdate(ctx: Context): Promise<UpdateResult> {
  const dir = ctx.cacheDir;
  const livePath = indexPath(dir);
  const allowedOrigins = ctx.source?.allowedOrigins ?? ALLOWED_ORIGINS;
  const minRows = ctx.source?.minRows ?? DEFAULT_MIN_ROWS;

  await mkdir(dir, { recursive: true });
  await cleanOldTempFolders(dir, ctx.now());

  try {
    ctx.stderr.write("Finding the latest register on GOV.UK…\n");
    const source = await locateRegister({
      ...(ctx.source?.apiUrl ? { apiUrl: ctx.source.apiUrl } : {}),
      allowedOrigins,
    });
    ctx.stderr.write(`Found the register dated ${formatRegisterDate(source.registerDate)}.\n`);

    const temp = await mkdtemp(join(dir, TEMP_PREFIX));
    try {
      const csvPath = join(temp, "register.csv");
      const progress = progressPrinter(ctx);
      let bytes: number;
      try {
        bytes = await downloadFile(source.url, csvPath, {
          allowedOrigins,
          onProgress: progress.update,
        });
      } finally {
        progress.done();
      }
      ctx.stderr.write(`Downloaded ${megabytes(bytes)} MB. Building the search index…\n`);

      const index = await buildIndex(readRegisterRows(createReadStream(csvPath)), {
        registerDate: source.registerDate,
        downloadedAt: ctx.now().toISOString(),
        sourceUrl: source.url,
      });
      if (index.meta.rowCount < minRows) {
        throw new SourceError(
          `The register only had ${index.meta.rowCount} rows, but it normally has over 100,000.`,
          SOURCE_CHANGED_HINT,
        );
      }

      const tempIndex = join(temp, "index.json");
      await writeIndexFile(tempIndex, index);
      const check = await readIndexFile(tempIndex);
      if (check.companies.length !== index.companies.length) {
        throw new SourceError(
          "The new search index didn't save correctly.",
          "Try running the update again.",
        );
      }
      await installIndexFile(tempIndex, livePath);

      ctx.stderr.write(
        `Done. ${index.meta.companyCount.toLocaleString("en-GB")} sponsors (${index.meta.rowCount.toLocaleString("en-GB")} rows) from the register dated ${formatRegisterDate(source.registerDate)}.\n`,
      );
      return {
        registerDate: source.registerDate,
        rows: index.meta.rowCount,
        companies: index.meta.companyCount,
      };
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  } catch (err) {
    try {
      const old = await readIndexFile(livePath);
      ctx.stderr.write(
        `Your existing data (register dated ${formatRegisterDate(old.meta.registerDate)}) has not been changed.\n`,
      );
    } catch {
      // No usable old data to mention.
    }
    throw err;
  }
}
