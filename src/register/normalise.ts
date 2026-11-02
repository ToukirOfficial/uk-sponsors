/**
 * Text key for loose matching: lower case, accents removed, apostrophes and
 * full stops dropped, "&" read as "and", other punctuation and repeated
 * spaces collapsed to one space.
 */
export function normaliseText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘`.]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const NAME_WORDS: Readonly<Record<string, string>> = {
  limited: "ltd",
};

/** Company name key: like normaliseText, and "Limited" and "Ltd" are equal. */
export function normaliseName(value: string): string {
  const text = normaliseText(value);
  if (text === "") return "";
  return text
    .split(" ")
    .map((word) => NAME_WORDS[word] ?? word)
    .join(" ");
}

/** True if `needle` appears in `haystack` as whole words (both already normalised). */
export function containsWords(haystack: string, needle: string): boolean {
  if (needle === "") return true;
  return ` ${haystack} `.includes(` ${needle} `);
}
