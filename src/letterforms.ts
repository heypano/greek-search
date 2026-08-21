/**
 * Greek symbol letterforms folded to ordinary orthography.
 *
 * Every character handled here has a Unicode compatibility decomposition, so
 * `NFKC` folds all of them for free. Do NOT normalize whole strings with
 * `NFKC` to get that: it also decomposes `U+0384 GREEK TONOS` into a space
 * plus a combining acute, which splits Greek ordinals in two.
 *
 *     "ΦΕΚ Α΄ 251"  NFC  -> ["ΦΕΚ", "Α΄", "251"]
 *                   NFKC -> ["ΦΕΚ", "Α", "́", "251"]
 *
 * Ordinals like `Μακάριος Γ΄` and `Β΄ Παγκόσμιος Πόλεμος` saturate Greek legal
 * and historical text, so that is not an acceptable trade. Instead we gate on
 * the codepoint first and only then apply `NFKC`, to a single character. The
 * gate structurally cannot reach `U+0384`, and the fold stays exact without a
 * hand-maintained mapping table going stale.
 *
 * (This is also why Elasticsearch's `icu_normalizer`, which defaults to
 * `nfkc_cf`, is the wrong default for any Greek corpus containing ordinals.)
 */

/** Standalone symbol letterforms: lunate sigma, script theta, micro sign, etc. */
const SYMBOL_LETTERFORMS = new Set([
  0x00b5, // µ micro sign            -> μ
  0x03d0, // ϐ curled beta           -> β
  0x03d1, // ϑ script theta          -> θ
  0x03d2, // ϒ hooked upsilon        -> Υ
  0x03d3, // ϓ hooked upsilon tonos  -> Ύ
  0x03d4, // ϔ hooked upsilon dialy. -> Ϋ
  0x03d5, // ϕ script phi            -> φ
  0x03d6, // ϖ pi symbol             -> π
  0x03f0, // ϰ kappa symbol          -> κ
  0x03f1, // ϱ rho symbol            -> ρ
  0x03f2, // ϲ lunate sigma          -> ς
  0x03f4, // ϴ capital theta symbol  -> Θ
  0x03f5, // ϵ lunate epsilon        -> ε
  0x03f9, // Ϲ capital lunate sigma  -> Σ
]);

/**
 * The Greek span of the Mathematical Alphanumeric Symbols block: five styled
 * copies of the alphabet plus their variant glyphs. Contiguous, so a range
 * test is enough of a gate.
 */
const MATH_GREEK_START = 0x1d6a8;
const MATH_GREEK_END = 0x1d7cb;

/**
 * Folds one character to its ordinary Greek letterform, or returns it
 * unchanged. Case is preserved, because the homoglyph gate runs on cased text
 * and needs the signal.
 */
export function toLetterform(char: string): string {
  const code = char.codePointAt(0);
  if (code === undefined) {
    return char;
  }
  if (
    SYMBOL_LETTERFORMS.has(code) ||
    (code >= MATH_GREEK_START && code <= MATH_GREEK_END)
  ) {
    return char.normalize("NFKC");
  }
  return char;
}
