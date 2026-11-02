/**
 * Minimal ANSI colours. Off unless printing to a terminal; NO_COLOR turns
 * them off (https://no-color.org) and FORCE_COLOR turns them on.
 */
export function colorEnabled(
  isTTY: boolean | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
  if (env.TERM === "dumb") return false;
  return isTTY === true;
}

const CODES = {
  bold: [1, 22],
  dim: [2, 22],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  cyan: [36, 39],
} as const;

export type Style = Record<keyof typeof CODES, (text: string) => string>;

export function paint(enabled: boolean): Style {
  const style = {} as Style;
  for (const [name, [open, close]] of Object.entries(CODES) as [
    keyof typeof CODES,
    readonly [number, number],
  ][]) {
    style[name] = enabled
      ? (text) => (text === "" ? "" : `\u001b[${open}m${text}\u001b[${close}m`)
      : (text) => text;
  }
  return style;
}
