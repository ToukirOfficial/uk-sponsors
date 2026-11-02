import type { Writer } from "./output/format.js";

/** Everything a command needs from the outside world, so tests can swap it. */
export interface Context {
  stdout: Writer;
  stderr: Writer;
  /** Terminal width for tables, if printing to a terminal. */
  stdoutColumns: number | undefined;
  /** Whether stderr is a terminal (live progress) or a log/pipe. */
  stderrIsTTY: boolean;
  /** Colour on stdout / stderr: terminals only, and never with NO_COLOR. */
  stdoutColor?: boolean;
  stderrColor?: boolean;
  cacheDir: string;
  now: () => Date;
  /** Overrides for tests: where to find the register and how big it must be. */
  source?: {
    apiUrl?: string;
    allowedOrigins?: readonly string[];
    minRows?: number;
    companiesHousePageUrl?: string;
    companiesHouseOrigins?: readonly string[];
    minCompaniesHouseRows?: number;
  };
}
