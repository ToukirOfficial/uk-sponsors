import { describe, expect, test } from "vitest";
import { SourceError } from "../src/errors.js";
import {
  ALLOWED_ORIGINS,
  checkDownloadUrl,
  dateFromFilename,
  parseContentApi,
} from "../src/register/locate.js";
import { contentApi } from "./server.js";

const REAL_URL =
  "https://assets.publishing.service.gov.uk/media/6ae84bbe713f8880fe54624f/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-02.csv";

describe("parseContentApi", () => {
  test("reads the CSV link and register date (real shape, Nov 2026)", () => {
    expect(parseContentApi(contentApi(REAL_URL), ALLOWED_ORIGINS)).toEqual({
      url: REAL_URL,
      filename: "SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-02.csv",
      registerDate: "2026-11-02",
      size: 10943210,
    });
  });

  test("picks the CSV even if another attachment comes first", () => {
    const data = {
      details: {
        attachments: [
          {
            content_type: "application/pdf",
            url: "https://assets.publishing.service.gov.uk/a.pdf",
          },
          { content_type: "text/csv", url: REAL_URL },
        ],
      },
    };
    expect(parseContentApi(data, ALLOWED_ORIGINS).url).toBe(REAL_URL);
  });

  test("falls back to public_updated_at for the date", () => {
    const data = {
      public_updated_at: "2026-10-30T09:00:00+00:00",
      details: {
        attachments: [
          {
            content_type: "text/csv",
            url: "https://assets.publishing.service.gov.uk/media/x/register.csv",
          },
        ],
      },
    };
    expect(parseContentApi(data, ALLOWED_ORIGINS)).toMatchObject({
      filename: "register.csv",
      registerDate: "2026-10-30",
      size: null,
    });
  });

  test.each([
    [null, /"details" is missing/],
    [{}, /"details" is missing/],
    [{ details: {} }, /"details.attachments" is missing/],
    [{ details: { attachments: [] } }, /"details.attachments" is empty/],
    [
      { details: { attachments: [{ content_type: "application/pdf", url: "x" }] } },
      /no CSV in "details.attachments" \(found: application\/pdf\)/,
    ],
  ])("fails clearly when the JSON shape changes: %j", (data, message) => {
    expect(() => parseContentApi(data, ALLOWED_ORIGINS)).toThrow(SourceError);
    expect(() => parseContentApi(data, ALLOWED_ORIGINS)).toThrow(message);
  });

  test("refuses links that aren't on assets.publishing.service.gov.uk", () => {
    expect(() =>
      parseContentApi(contentApi("https://evil.example.com/register.csv"), ALLOWED_ORIGINS),
    ).toThrow(/Refusing to download the register from https:\/\/evil.example.com/);
  });
});

describe("checkDownloadUrl", () => {
  test("requires HTTPS on the GOV.UK file host", () => {
    expect(checkDownloadUrl(REAL_URL, ALLOWED_ORIGINS).host).toBe(
      "assets.publishing.service.gov.uk",
    );
    expect(() => checkDownloadUrl(REAL_URL.replace("https:", "http:"), ALLOWED_ORIGINS)).toThrow(
      /Refusing/,
    );
    expect(() =>
      checkDownloadUrl("https://assets.publishing.service.gov.uk.evil.com/x.csv", ALLOWED_ORIGINS),
    ).toThrow(/Refusing/);
    expect(() => checkDownloadUrl("not a url", ALLOWED_ORIGINS)).toThrow(
      /isn't a valid web address/,
    );
  });
});

test("dateFromFilename", () => {
  expect(dateFromFilename("SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-02.csv")).toBe(
    "2026-11-02",
  );
  expect(dateFromFilename("2026-11-02_-_Worker_and_Temporary_Worker.csv")).toBe("2026-11-02");
  expect(dateFromFilename("register-2026-13-45.csv")).toBeNull();
  expect(dateFromFilename("register.csv")).toBeNull();
});
