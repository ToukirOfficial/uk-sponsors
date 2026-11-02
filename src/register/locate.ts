import { SOURCE_CHANGED_HINT, SourceError } from "../errors.js";
import { httpError, networkError } from "./network.js";

export const CONTENT_API_URL =
  "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";

/** The only place the register CSV may be downloaded from. */
export const ALLOWED_ORIGINS = ["https://assets.publishing.service.gov.uk"];

export interface RegisterSource {
  url: string;
  filename: string;
  /** YYYY-MM-DD, from the file name or the page's last update. */
  registerDate: string | null;
  size: number | null;
}

function shapeChanged(detail: string): SourceError {
  return new SourceError(`GOV.UK's publication data has changed: ${detail}.`, SOURCE_CHANGED_HINT);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validDate(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m}-${d}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

/** "SP_-_Worker_..._Register_-_2026-11-02.csv" → "2026-11-02". */
export function dateFromFilename(filename: string): string | null {
  const matches = [...filename.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)];
  const last = matches.at(-1);
  return last?.[1] && last[2] && last[3] ? validDate(last[1], last[2], last[3]) : null;
}

/** Checks the download link points at GOV.UK's file host over HTTPS. */
export function checkDownloadUrl(url: string, allowedOrigins: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw shapeChanged(`the CSV link "${url}" isn't a valid web address`);
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new SourceError(
      `Refusing to download the register from ${parsed.origin}. It should come from ${allowedOrigins.join(" or ")}.`,
      SOURCE_CHANGED_HINT,
    );
  }
  return parsed;
}

/**
 * Reads the Content API JSON and returns the CSV attachment.
 * Expects details.attachments[] with a text/csv entry (attachments[0] today).
 */
export function parseContentApi(data: unknown, allowedOrigins: readonly string[]): RegisterSource {
  if (!isObject(data) || !isObject(data.details)) throw shapeChanged('"details" is missing');
  const attachments = data.details.attachments;
  if (!Array.isArray(attachments)) throw shapeChanged('"details.attachments" is missing');
  if (attachments.length === 0) throw shapeChanged('"details.attachments" is empty');

  const csv = attachments.find(
    (a): a is Record<string, unknown> =>
      isObject(a) && a.content_type === "text/csv" && typeof a.url === "string",
  );
  if (!csv) {
    const types = attachments
      .map((a) => (isObject(a) ? String(a.content_type) : typeof a))
      .join(", ");
    throw shapeChanged(`no CSV in "details.attachments" (found: ${types})`);
  }

  const url = checkDownloadUrl(String(csv.url), allowedOrigins);
  const filename =
    typeof csv.filename === "string" && csv.filename !== ""
      ? csv.filename
      : decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  const updated = typeof data.public_updated_at === "string" ? data.public_updated_at : "";
  const updatedDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(updated);
  const registerDate =
    dateFromFilename(filename) ??
    (updatedDate?.[1] && updatedDate[2] && updatedDate[3]
      ? validDate(updatedDate[1], updatedDate[2], updatedDate[3])
      : null);

  return {
    url: url.href,
    filename,
    registerDate,
    size: typeof csv.file_size === "number" ? csv.file_size : null,
  };
}

export interface LocateOptions {
  apiUrl?: string;
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
}

/** Asks the GOV.UK Content API where today's register CSV is. */
export async function locateRegister(options: LocateOptions = {}): Promise<RegisterSource> {
  const apiUrl = options.apiUrl ?? CONTENT_API_URL;
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (err) {
    throw networkError(err, "GOV.UK");
  }
  if (!response.ok) throw httpError(response.status, "GOV.UK");

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw networkError(err, "GOV.UK");
    }
    throw shapeChanged("the publication data isn't valid JSON");
  }
  return parseContentApi(data, options.allowedOrigins ?? ALLOWED_ORIGINS);
}
