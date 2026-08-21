import { toLetterform } from "./letterforms";
import { projectHomoglyphs } from "./homoglyphs";

/** Combining marks: tonos, dialytika, and the legacy Mac OS tonos U+030D. */
const COMBINING_MARKS = /[̀-ͯ]/g;

export interface FoldOptions {
  /** Keep case distinctions. Default `false`. */
  caseSensitive?: boolean;
  /** Keep tonos and dialytika distinctions. Default `false`. */
  accentSensitive?: boolean;
  /** Fold Latin/Cyrillic look-alikes onto Greek. Default `true`. */
  homoglyphs?: boolean;
  /** Fold lunate sigma, symbol letterforms and maths Greek. Default `true`. */
  letterforms?: boolean;
}

/**
 * A folded string plus a map back to the offsets it came from.
 *
 * `map` has one more entry than `key` has UTF-16 units: `map[i]` is the source
 * offset that produced `key[i]`, and `map[key.length]` is the source length.
 * That makes the source range for a key slice `[i, j)` exactly
 * `[map[i], map[j])`, including any combining marks that were stripped along
 * the way - which is what a highlight wants.
 */
export interface FoldedString {
  key: string;
  map: number[];
}

function foldChar(
  char: string,
  { accentSensitive, caseSensitive, letterforms }: Required<FoldOptions>
): string {
  let out = letterforms ? toLetterform(char) : char;

  // NFC first: this is what folds oxia (U+1F71 and friends, still found in
  // text produced by polytonic-to-monotonic conversion) onto ordinary tonos,
  // via Unicode's singleton canonical decompositions.
  out = out.normalize("NFC");

  if (!accentSensitive) {
    // Decompose, drop every combining mark, recompose. Stripping the whole
    // U+0300-U+036F range rather than relying on NFC alone is what repairs
    // pre-10.3 Mac OS text, which encoded Greek tonos as U+030D: NFC cannot
    // fix that ("α̍".normalize("NFC") stays two codepoints) but
    // mark-stripping lands both spellings on "α".
    out = out.normalize("NFD").replace(COMBINING_MARKS, "").normalize("NFC");
  }

  if (!caseSensitive) {
    out = out.toLowerCase();
  }

  // Final sigma, in both case modes.
  return out.replace(/ς/g, "σ");
}

function resolve(options: FoldOptions): Required<FoldOptions> {
  return {
    caseSensitive: options.caseSensitive ?? false,
    accentSensitive: options.accentSensitive ?? false,
    homoglyphs: options.homoglyphs ?? true,
    letterforms: options.letterforms ?? true,
  };
}

/**
 * Folds Greek text to a canonical search form, and reports where every
 * character came from.
 *
 * The homoglyph pass runs first, on cased text, because case carries the
 * signal (`Β`/`B` are look-alikes, `β`/`b` are not). It is length preserving,
 * so it cannot disturb the offset map.
 */
export function foldGreekWithMap(
  input: string,
  options: FoldOptions = {}
): FoldedString {
  const resolved = resolve(options);
  const source = resolved.homoglyphs ? projectHomoglyphs(input) : input;

  let key = "";
  const map: number[] = [];
  let index = 0;
  for (const char of source) {
    const folded = foldChar(char, resolved);
    for (let unit = 0; unit < folded.length; unit += 1) {
      map.push(index);
    }
    key += folded;
    index += char.length;
  }
  map.push(index);
  return { key, map };
}

/** Folds Greek text to a canonical search form. */
export function foldGreek(input: string, options: FoldOptions = {}): string {
  const resolved = resolve(options);
  const source = resolved.homoglyphs ? projectHomoglyphs(input) : input;
  let key = "";
  for (const char of source) {
    key += foldChar(char, resolved);
  }
  return key;
}
