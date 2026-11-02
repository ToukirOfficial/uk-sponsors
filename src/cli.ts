#!/usr/bin/env node
import { run } from "./program.js";
import { colorEnabled } from "./output/style.js";
import { cacheDir } from "./register/paths.js";

// Piping into `head` closes stdout early; that's not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

process.exitCode = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdoutColumns: process.stdout.isTTY ? process.stdout.columns : undefined,
  // isTTY is undefined (not false) when stderr is a pipe.
  stderrIsTTY: (process.stderr.isTTY as boolean | undefined) === true,
  stdoutColor: colorEnabled(process.stdout.isTTY),
  stderrColor: colorEnabled(process.stderr.isTTY),
  cacheDir: cacheDir(),
  now: () => new Date(),
});
