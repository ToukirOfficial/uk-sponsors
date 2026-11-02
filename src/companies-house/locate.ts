import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";
import { httpError, networkError } from "../register/network.js";

/** Companies House's page for the free "Basic Company Data" snapshot. No key needed. */
export const CH_PAGE_URL = "https://download.companieshouse.gov.uk/en_output.html";

/** The only place the snapshot may be downloaded from. */
export const CH_ALLOWED_ORIGINS = ["https://download.companieshouse.gov.uk"];

export interface SnapshotSource {
  url: string;
  /** YYYY-MM-DD, from the file name. */
  dataDate: string;
}

/**
 * Finds the one-file zip ("BasicCompanyDataAsOneFile-2026-11-01.zip") in the
 * download page's HTML. The page has no API, so this looks for the file name
 * pattern only, not the page layout.
 */
export function parseDownloadPage(html: string, pageUrl: string): SnapshotSource {
  const links = [
    ...html.matchAll(
      /href\s*=\s*["']([^"']*BasicCompanyDataAsOneFile-(\d{4}-\d{2}-\d{2})\.zip)["']/gi,
    ),
  ];
  const latest = links
    .map((m) => ({ href: m[1] ?? "", dataDate: m[2] ?? "" }))
    .sort((a, b) => b.dataDate.localeCompare(a.dataDate))[0];
  if (!latest) {
    throw new SourceError(
      'Companies House\'s download page has changed: no "BasicCompanyDataAsOneFile" zip link found.',
      SOURCE_CHANGED_HINT,
    );
  }
  return { url: new URL(latest.href, pageUrl).href, dataDate: latest.dataDate };
}

export async function locateSnapshot(
  pageUrl: string = CH_PAGE_URL,
  timeoutMs = 30_000,
): Promise<SnapshotSource> {
  let response: Response;
  try {
    response = await fetch(pageUrl, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw networkError(err, "Companies House");
  }
  if (!response.ok) throw httpError(response.status, "Companies House");
  let html: string;
  try {
    html = await response.text();
  } catch (err) {
    throw networkError(err, "Companies House");
  }
  return parseDownloadPage(html, pageUrl);
}
