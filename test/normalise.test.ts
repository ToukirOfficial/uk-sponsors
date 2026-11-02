import { describe, expect, test } from "vitest";
import { containsWords, normaliseName, normaliseText } from "../src/register/normalise.js";

describe("normaliseName", () => {
  test.each([
    ["Acme Ltd", "ACME LIMITED"],
    ["Acme Ltd.", "acme ltd"],
    ["Smith & Jones", "Smith and Jones"],
    ["Big Bank PLC", "big bank plc"],
    ["Big Bank P.L.C.", "Big Bank plc"],
    ["Smith, Jones & Partners", "smith jones and partners"],
    ["Green  Fields   Farm", "green fields farm"],
    ["O’Brien & Sons Limited", "OBrien and Sons Ltd"],
    ["O'Brien", "obrien"],
    ["Café Société", "cafe societe"],
    ["Zürich-Data", "zurich data"],
  ])("%s equals %s", (a, b) => {
    expect(normaliseName(a)).toBe(normaliseName(b));
  });

  test("keeps different names different", () => {
    expect(normaliseName("Acme Ltd")).not.toBe(normaliseName("Acme Group Ltd"));
  });

  test("keeps non-Latin letters", () => {
    expect(normaliseName("北京 Ltd")).toBe("北京 ltd");
  });

  test("only maps whole words", () => {
    expect(normaliseName("Limitedly Ltd")).toBe("limitedly ltd");
  });
});

test("normaliseText does not change Limited", () => {
  expect(normaliseText("Limited")).toBe("limited");
});

test("containsWords matches whole words only", () => {
  expect(containsWords("new york", "york")).toBe(true);
  expect(containsWords("yorkshire", "york")).toBe(false);
  expect(containsWords("anything", "")).toBe(true);
});
