import { readFileSync } from "node:fs";
import { Command, CommanderError, Option } from "commander";
import { runCheck } from "./commands/check.js";
import { runSearch, type SearchOptions } from "./commands/search.js";
import { runStats } from "./commands/stats.js";
import { runUpdate } from "./commands/update.js";
import type { Context } from "./context.js";
import { ISSUES_URL, SourceError, UserError } from "./errors.js";
import type { FormatOptions } from "./output/format.js";

function version(): string {
  const pkg: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  return typeof pkg === "object" && pkg !== null && "version" in pkg
    ? String(pkg.version)
    : "0.0.0";
}

const ABOUT = `
Data: Home Office "Register of licensed sponsors: workers", published on GOV.UK
under the Open Government Licence v3.0.

Disclaimer: being on the register means a company is licensed to sponsor visas.
It doesn't mean the company is hiring, or will sponsor a particular role.`;

function addOutputOptions(cmd: Command): Command {
  return cmd
    .option("--json", "print JSON")
    .option("--csv", "print CSV (opens in Excel)")
    .option(
      "--out <file>",
      "save to a file instead of printing (format from --json/--csv or the file extension)",
    );
}

export function buildProgram(ctx: Context): Command {
  const program = new Command()
    .name("uk-sponsors")
    .description(
      "Search the UK register of licensed visa sponsors: by name, town or city, and visa route.",
    )
    .version(version(), "-v, --version")
    .showHelpAfterError("(add --help for usage)")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => {
        ctx.stdout.write(s);
      },
      writeErr: (s) => {
        ctx.stderr.write(s);
      },
    })
    .addHelpText(
      "after",
      `
Get started:
  $ uk-sponsors update
  $ uk-sponsors search --city Leeds --route "Skilled Worker"
  $ uk-sponsors check "Acme Software Ltd"
${ABOUT}`,
    );

  program
    .command("update")
    .description(
      "download the latest register from GOV.UK (the only command that uses the internet)",
    )
    .addHelpText(
      "after",
      `
Downloads about 11 MB from GOV.UK and saves a search index on this computer.
Run it again any time; if it fails, your existing data is kept.

Example:
  $ uk-sponsors update`,
    )
    .action(async () => {
      await runUpdate(ctx);
    });

  addOutputOptions(
    program
      .command("search")
      .description("find sponsors by name, place, route and rating (filters combine)")
      .option("--name <text>", "part of the company name (any case; Ltd = Limited, & = and)")
      .option("--city <text>", "town or city")
      .option("--county <text>", "county")
      .option(
        "--route <text>",
        'visa route, e.g. "Skilled Worker", "Creative Worker" or "Temporary Worker"',
      )
      .addOption(new Option("--rating <A|B>", "sponsor rating: A or B"))
      .option("--limit <n>", "most results to show", "50"),
  )
    .addHelpText(
      "after",
      `
Examples:
  Software companies in Manchester that sponsor Skilled Worker visas:
  $ uk-sponsors search --name software --city Manchester --route "Skilled Worker"

  A-rated sponsors in Leeds, as a spreadsheet:
  $ uk-sponsors search --city Leeds --rating A --out leeds.csv

  Temporary Worker sponsors (e.g. Creative Worker, Seasonal Worker) as JSON:
  $ uk-sponsors search --route "Temporary Worker" --limit 500 --json`,
    )
    .action(async (options: SearchOptions) => {
      await runSearch(ctx, options);
    });

  addOutputOptions(
    program
      .command("check")
      .description("is this company a licensed sponsor? Yes/no, with routes, town and rating")
      .argument("<company name...>", "the company name (use quotes if it has special characters)"),
  )
    .addHelpText(
      "after",
      `
Matching ignores case, punctuation and extra spaces, and treats Ltd/Limited
and &/and as the same. If there's no exact match, close matches are shown.

Examples:
  $ uk-sponsors check "Acme Software Ltd"
  $ uk-sponsors check "Smith & Jones Limited" --json`,
    )
    .action(async (name: string[], options: FormatOptions) => {
      await runCheck(ctx, name, options);
    });

  addOutputOptions(
    program
      .command("stats")
      .description("totals, top towns and cities, and counts by route, licence type and rating"),
  )
    .addHelpText(
      "after",
      `
Examples:
  $ uk-sponsors stats
  $ uk-sponsors stats --json`,
    )
    .action(async (options: FormatOptions) => {
      await runStats(ctx, options);
    });

  return program;
}

/** Runs the CLI and returns the exit code: 0 ok, 1 user error, 2 network or source error. */
export async function run(argv: string[], ctx: Context): Promise<number> {
  const program = buildProgram(ctx);
  try {
    if (argv.length === 0) {
      program.outputHelp();
      return 0;
    }
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode === 0 ? 0 : 1;
    }
    if (err instanceof UserError || err instanceof SourceError) {
      ctx.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) ctx.stderr.write(`${err.hint}\n`);
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    ctx.stderr.write(
      `Error: something unexpected went wrong: ${message}\nPlease report it at ${ISSUES_URL}\n`,
    );
    return 1;
  }
}
