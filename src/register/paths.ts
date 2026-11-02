import { homedir } from "node:os";
import { posix, win32 } from "node:path";

/**
 * The OS user cache folder for uk-sponsors:
 * Linux ~/.cache/uk-sponsors (or $XDG_CACHE_HOME), macOS ~/Library/Caches/uk-sponsors,
 * Windows %LOCALAPPDATA%\uk-sponsors\Cache. UK_SPONSORS_CACHE_DIR overrides it.
 */
export function cacheDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  // Use the path rules of the target platform, not the machine running this.
  const { isAbsolute, join } = platform === "win32" ? win32 : posix;
  const override = env.UK_SPONSORS_CACHE_DIR;
  if (override) return override;
  if (platform === "win32") {
    return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "uk-sponsors", "Cache");
  }
  if (platform === "darwin") return join(home, "Library", "Caches", "uk-sponsors");
  const xdg = env.XDG_CACHE_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(home, ".cache"), "uk-sponsors");
}

export function indexPath(dir: string): string {
  return (process.platform === "win32" ? win32 : posix).join(dir, "index.json");
}
