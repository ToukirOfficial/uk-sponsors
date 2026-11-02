import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { UserError } from "../errors.js";

const UTF8_BOM = String.fromCharCode(0xfeff);

export type Format = "table" | "json" | "csv";

export interface FormatOptions {
  json?: boolean | undefined;
  csv?: boolean | undefined;
  out?: string | undefined;
}

/** --json / --csv, or worked out from the --out file name. Table otherwise. */
export function resolveFormat(options: FormatOptions): Format {
  if (options.json && options.csv) {
    throw new UserError("Choose one output format: --json or --csv, not both.");
  }
  if (options.json) return "json";
  if (options.csv) return "csv";
  const ext = options.out ? extname(options.out).toLowerCase() : "";
  if (ext === ".json") return "json";
  if (ext === ".csv") return "csv";
  return "table";
}

export interface Writer {
  write(text: string): void;
}

/**
 * Prints to the screen, or saves to the --out file. CSV files get a UTF-8
 * byte order mark so Excel shows accented names correctly.
 */
export async function emit(
  text: string,
  format: Format,
  out: string | undefined,
  stdout: Writer,
): Promise<void> {
  if (!out) {
    stdout.write(text);
    return;
  }
  const body = format === "csv" ? `${UTF8_BOM}${text}` : text;
  try {
    await writeFile(out, body, "utf8");
  } catch (err) {
    const reason =
      (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err));
    throw new UserError(
      `Couldn't save to "${out}" (${reason}).`,
      "Check the folder exists and you can write to it.",
    );
  }
}
