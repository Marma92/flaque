/**
 * Pseudolocalization for QA. Transforms English strings into accented,
 * bracketed, length-padded variants so reviewers can spot, at a glance:
 *  - hardcoded strings that never went through i18n (they stay plain ASCII),
 *  - layouts that break when text grows (~30% padding mimics translations),
 *  - clipped/truncated text (the surrounding brackets reveal the bounds).
 *
 * Interpolation placeholders ({{name}}) and markup tags (<strong>) are left
 * untouched so the app keeps working under the pseudo locale.
 */

const ACCENTS: Record<string, string> = {
  a: "á", b: "ƀ", c: "ç", d: "đ", e: "é", f: "ƒ", g: "ǧ", h: "ĥ", i: "í", j: "ĵ",
  k: "ķ", l: "ĺ", m: "ɱ", n: "ñ", o: "ó", p: "ƥ", q: "ɋ", r: "ŕ", s: "š", t: "ŧ",
  u: "ú", v: "ṽ", w: "ŵ", x: "x", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Đ", E: "É", F: "Ƒ", G: "Ǧ", H: "Ĥ", I: "Í", J: "Ĵ",
  K: "Ķ", L: "Ĺ", M: "Ṁ", N: "Ñ", O: "Ó", P: "Ƥ", Q: "Ɋ", R: "Ŕ", S: "Š", T: "Ŧ",
  U: "Ú", V: "Ṽ", W: "Ŵ", X: "X", Y: "Ý", Z: "Ž"
};

// Keep {{interpolation}} and <markup> segments verbatim.
const PRESERVE = /(\{\{.*?\}\}|<\/?[^>]+>)/g;
const IS_PRESERVED = /^(?:\{\{|<)/;

export function pseudoizeString(value: string): string {
  const accented = value
    .split(PRESERVE)
    .map((segment) => (IS_PRESERVED.test(segment) ? segment : segment.replace(/[a-zA-Z]/g, (c) => ACCENTS[c] ?? c)))
    .join("");

  const visibleLength = value.replace(PRESERVE, "").length;
  const padding = "·".repeat(Math.max(2, Math.ceil(visibleLength * 0.3)));
  return `⟦${accented} ${padding}⟧`;
}

export function pseudoizeResource<T>(node: T): T {
  if (typeof node === "string") {
    return pseudoizeString(node) as T;
  }
  if (Array.isArray(node)) {
    return node.map((item) => pseudoizeResource(item)) as T;
  }
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, pseudoizeResource(value)])
    ) as T;
  }
  return node;
}

export const PSEUDO_LANGUAGE = "pseudo";

/** Pseudo mode is opt-in per page load via the `?pseudo` query flag. */
export function isPseudoEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has(PSEUDO_LANGUAGE);
}
