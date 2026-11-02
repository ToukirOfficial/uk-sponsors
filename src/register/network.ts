import { SourceError } from "../errors.js";

const OFFLINE_HINT = "Check your internet connection and try again.";

/** Turns fetch failures into plain-English errors. */
export function networkError(err: unknown, what: string): SourceError {
  if (err instanceof SourceError) return err;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new SourceError(`${what} took too long to respond.`, OFFLINE_HINT);
  }
  const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined) : undefined;
  const code = typeof cause?.code === "string" ? ` (${cause.code})` : "";
  return new SourceError(`Couldn't reach ${what}${code}.`, OFFLINE_HINT);
}

export function httpError(status: number, what: string): SourceError {
  return new SourceError(
    `${what} answered with HTTP ${status}.`,
    status >= 500 ? "GOV.UK may be having problems. Try again in a few minutes." : OFFLINE_HINT,
  );
}
