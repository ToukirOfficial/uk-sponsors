import { describe, expect, test } from "vitest";
import { formatRegisterDate, staleReminder } from "../src/register/freshness.js";
import { cacheDir } from "../src/register/paths.js";
import type { RegisterMeta } from "../src/register/store.js";

describe("cacheDir", () => {
  test("Linux uses ~/.cache or XDG_CACHE_HOME", () => {
    expect(cacheDir({}, "linux", "/home/rony")).toBe("/home/rony/.cache/uk-sponsors");
    expect(cacheDir({ XDG_CACHE_HOME: "/tmp/xdg" }, "linux", "/home/rony")).toBe(
      "/tmp/xdg/uk-sponsors",
    );
    expect(cacheDir({ XDG_CACHE_HOME: "relative" }, "linux", "/home/rony")).toBe(
      "/home/rony/.cache/uk-sponsors",
    );
  });

  test("macOS uses ~/Library/Caches", () => {
    expect(cacheDir({}, "darwin", "/Users/rony")).toBe("/Users/rony/Library/Caches/uk-sponsors");
  });

  test("Windows uses %LOCALAPPDATA%", () => {
    const dir = cacheDir(
      { LOCALAPPDATA: "C:\\Users\\rony\\AppData\\Local" },
      "win32",
      "C:\\Users\\rony",
    );
    expect(dir).toBe("C:\\Users\\rony\\AppData\\Local\\uk-sponsors\\Cache");
  });

  test("UK_SPONSORS_CACHE_DIR overrides", () => {
    expect(cacheDir({ UK_SPONSORS_CACHE_DIR: "/data/x" }, "linux", "/home/rony")).toBe("/data/x");
  });
});

describe("staleReminder", () => {
  const meta: RegisterMeta = {
    formatVersion: 1,
    registerDate: "2026-11-02",
    downloadedAt: "2026-11-02T10:00:00.000Z",
    sourceUrl: "x",
    rowCount: 1,
    companyCount: 1,
  };

  test("quiet for a week", () => {
    expect(staleReminder(meta, new Date("2026-11-09T10:00:00.000Z"))).toBeNull();
  });

  test("names the register date once data is over 7 days old", () => {
    expect(staleReminder(meta, new Date("2026-11-12T10:00:00.000Z"))).toBe(
      'Note: your sponsor data is 10 days old (register dated 2 November 2026). Run "uk-sponsors update" for the latest.',
    );
  });

  test("handles an unknown register date", () => {
    expect(
      staleReminder({ ...meta, registerDate: null }, new Date("2026-12-30T00:00:00Z")),
    ).toContain("register dated an unknown date");
  });
});

test("formatRegisterDate", () => {
  expect(formatRegisterDate("2026-01-05")).toBe("5 January 2026");
  expect(formatRegisterDate(null)).toBe("an unknown date");
});
