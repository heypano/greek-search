/**
 * Latin and Cyrillic characters that are visually identical to Greek letters.
 *
 * This is a real corruption pattern in Greek text, not a theoretical one: a
 * scan of 69,167 tokens across 13 Greek news and finance sites found 65 mixed
 * Greek+Latin tokens (0.094%), roughly 60x the rate of stray oxia in the same
 * corpus. Almost all of them are one shape - a Latin capital opening a Greek
 * word (`Kαθώς`, `Oδύσσεια`, `Xωρίς`) - or a Latin `o` inside one (`στo`,
 * `Ισολογισμoί`). `Oδύσσεια` never matches a user typing `Οδύσσεια`.
 *
 * `Intl.Collator("el", { sensitivity: "base" })` does not help here: it folds
 * accents, case and final sigma, but not scripts.
 *
 * The table is hand-written on purpose. Unicode's `confusables.txt` is
 * disqualified twice over: Greek `σ` and `ο` share the prototype `o`, so a
 * skeleton fold would merge two distinct Greek letters, and Greek capital iota
 * is confusable with the digit `1`.
 */
/**
 * Built from parallel strings rather than written as an object literal on
 * purpose: as literal keys, Latin `A` and Cyrillic `А` are indistinguishable
 * in an editor, which is a poor way to maintain a look-alike table. The
 * Cyrillic side is spelled with escapes for the same reason.
 */
function pair(from: string, to: string): Array<[string, string]> {
  return [...from].map((character, index) => [character, to[index]]);
}

/** Latin capitals that are drawn identically to a Greek capital. */
const LATIN_CAPITALS = pair("ABEZHIKMNOPTYX", "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ");

/**
 * Latin lowercase. Only the genuinely identical ones: `b`/`β` and `n`/`ν` are
 * not look-alikes and must not be folded.
 */
const LATIN_LOWERCASE = pair("aov", "αον");

/** Cyrillic capitals: А В Е Н І К М О Р Т У Х */
const CYRILLIC_CAPITALS = pair(
  "\u0410\u0412\u0415\u041d\u0406\u041a\u041c\u041e\u0420\u0422\u0423\u0425",
  "ΑΒΕΗΙΚΜΟΡΤΥΧ"
);

/** Cyrillic lowercase: а о */
const CYRILLIC_LOWERCASE = pair("\u0430\u043e", "αο");

const HOMOGLYPHS: Record<string, string> = Object.fromEntries([
  ...LATIN_CAPITALS,
  ...LATIN_LOWERCASE,
  ...CYRILLIC_CAPITALS,
  ...CYRILLIC_LOWERCASE,
]);

const GREEK = /\p{Script=Greek}/u;
const NON_GREEK_SCRIPT = /[\p{Script=Latin}\p{Script=Cyrillic}]/u;

/**
 * Projects a single token onto Greek if, and only if, it looks like a Greek
 * word corrupted by look-alike characters. Returns `null` when the token
 * should be left exactly as it is.
 *
 * Four rules, in order:
 *
 * 1. **Gate on mixed script.** A token needs at least one Greek character and
 *    at least one Latin/Cyrillic character. Single-script tokens are never
 *    touched, which is what keeps `OK`, `TV`, `iPhone` and `HOTEL` safe.
 * 2. **All or nothing.** If any non-Greek character is missing from the table,
 *    fold nothing. `ΒΗΜΑGAZINO` is rejected because `G` is not a homoglyph,
 *    which is exactly the point.
 * 3. **Never destructive.** Callers treat the projection as an additional
 *    reading, so the original spelling still matches itself.
 * 4. **Run before lowercasing.** Case carries the signal: `Β`/`B` are
 *    homoglyphs but `β`/`b` are not, so `project("Bήτα")` folds while
 *    `project("bήτα")` correctly returns `null`.
 */
export function project(token: string): string | null {
  if (!GREEK.test(token) || !NON_GREEK_SCRIPT.test(token)) {
    return null; // rule 1
  }
  let out = "";
  for (const char of token) {
    if (NON_GREEK_SCRIPT.test(char)) {
      const mapped = HOMOGLYPHS[char];
      if (mapped === undefined) {
        return null; // rule 2
      }
      out += mapped;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Applies {@link project} to every whitespace-separated token of `s`, leaving
 * the tokens it rejects untouched. Offsets are preserved because the table is
 * one character in, one character out.
 */
export function projectHomoglyphs(s: string): string {
  if (!NON_GREEK_SCRIPT.test(s) || !GREEK.test(s)) {
    return s;
  }
  return s.replace(/\S+/gu, (token) => project(token) ?? token);
}
