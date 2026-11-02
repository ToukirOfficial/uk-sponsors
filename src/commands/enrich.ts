import type { Context } from "../context.js";
import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";
import { CH_ALLOWED_ORIGINS, CH_PAGE_URL, locateSnapshot } from "../companies-house/locate.js";
import { SponsorMatcher, type MatchSummary } from "../companies-house/match.js";
import { readCompaniesHouseRows } from "../companies-house/parse.js";
import { enrichmentPath, writeEnrichmentFile } from "../companies-house/store.js";
import { firstZipEntry } from "../companies-house/unzip.js";
import { openDownload } from "../register/download.js";
import { formatRegisterDate } from "../register/freshness.js";
import { readIndexFile } from "../register/store.js";
import { indexPath } from "../register/paths.js";
import { paint } from "../output/style.js";

/** The real snapshot has about 5.5 million companies; far fewer means something's wrong. */
export const DEFAULT_MIN_CH_ROWS = 1_000_000;

function percent(part: number, whole: number): string {
  return whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

const n = (value: number) => value.toLocaleString("en-GB");

export function matchReport(summary: MatchSummary): string[] {
  return [
    `Matched ${n(summary.matched)} of ${n(summary.sponsors)} sponsors (${percent(summary.matched, summary.sponsors)}):`,
    `  ${n(summary.byNameAndTown)} by name and town`,
    `  ${n(summary.byNameOnly)} by name only (one company with that name, registered in another town)`,
    `  ${n(summary.byPreviousName)} by a former company name, in the same town`,
    "Unmatched sponsors are mostly not companies (NHS trusts, universities, charities, partnerships, sole traders) or use a trading name.",
  ];
}

/**
 * Downloads Companies House's free "Basic Company Data" snapshot, streams it
 * straight through unzip and the CSV parser, and saves the company number,
 * status and SIC codes for every sponsor it can match.
 */
export async function runEnrich(ctx: Context): Promise<MatchSummary> {
  const register = await readIndexFile(indexPath(ctx.cacheDir));
  const allowedOrigins = ctx.source?.companiesHouseOrigins ?? CH_ALLOWED_ORIGINS;
  const minRows = ctx.source?.minCompaniesHouseRows ?? DEFAULT_MIN_CH_ROWS;

  ctx.stderr.write("Finding the latest Companies House snapshot…\n");
  const snapshot = await locateSnapshot(ctx.source?.companiesHousePageUrl ?? CH_PAGE_URL);
  ctx.stderr.write(
    `Found the free Basic Company Data snapshot dated ${formatRegisterDate(snapshot.dataDate)} (about 470 MB; it's read as it downloads, not saved).\n`,
  );

  const matcher = new SponsorMatcher(register.companies);
  let last = 0;
  let mb = "0";
  const download = await openDownload(snapshot.url, {
    allowedOrigins,
    serverName: "the Companies House file server",
    maxBytes: 2 * 1024 * 1024 * 1024,
    onProgress(received, total) {
      mb = (received / 1024 / 1024).toFixed(0);
      if (!ctx.stderrIsTTY) return;
      const now = Date.now();
      if (now - last < 200) return;
      last = now;
      const pct = total ? ` (${Math.floor((received / total) * 100)}%)` : "";
      ctx.stderr.write(`\rReading… ${mb} MB${pct}, ${n(matcher.rowsRead)} companies checked   `);
    },
  });
  try {
    for await (const row of readCompaniesHouseRows(firstZipEntry(download.body))) matcher.add(row);
  } finally {
    download.close();
    if (ctx.stderrIsTTY) ctx.stderr.write("\n");
  }

  if (matcher.rowsRead < minRows) {
    throw new SourceError(
      `The Companies House snapshot only had ${n(matcher.rowsRead)} companies, but it normally has millions.`,
      SOURCE_CHANGED_HINT,
    );
  }

  const { matches, summary } = matcher.results();
  await writeEnrichmentFile(enrichmentPath(ctx.cacheDir), {
    meta: {
      formatVersion: 1,
      dataDate: snapshot.dataDate,
      downloadedAt: ctx.now().toISOString(),
      sourceUrl: snapshot.url,
      registerDate: register.meta.registerDate,
      companiesHouseRows: matcher.rowsRead,
      ...summary,
    },
    matches,
  });

  const s = paint(ctx.stderrColor ?? false);
  ctx.stderr.write(`Read ${n(matcher.rowsRead)} companies (${mb} MB).\n`);
  const [first, ...rest] = matchReport(summary);
  ctx.stderr.write(`${s.green("Done.")} ${first ?? ""}\n${rest.map((l) => s.dim(l)).join("\n")}\n`);
  ctx.stderr.write(
    `Try: uk-sponsors search --city Leeds --route "Skilled Worker" --industry software\n`,
  );
  return summary;
}
