import { buildPattern } from "./regex";
import { foldGreek } from "./fold";
import { conversionsArray } from "./conversions";
import { LegacyCaseSensitive, SearchOptions, toOptions } from "./options";

export { foldGreek, foldGreekWithMap } from "./fold";
export type { FoldOptions, FoldedString } from "./fold";
export { greekKey, greekKeyWithMap, greeklishKeys } from "./greeklish";
export {
  greekSearch,
  greekMatches,
  greekCompare,
  greekCollator,
  trimAround,
} from "./search";
export type { MatchRange } from "./search";
export type { SearchOptions } from "./options";
export { project as projectHomoglyphs } from "./homoglyphs";

/**
 * The accent character classes.
 *
 * @deprecated Legacy surface. {@link foldGreek} is the primitive now, and it
 * handles decomposed input, oxia, look-alike characters and letterforms that
 * a character class cannot express.
 */
export const conversions: readonly string[] = conversionsArray;

function toOptionalString(
  value: string | undefined | null,
  name: string
): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new TypeError(
      `greek-search: expected \`${name}\` to be a string, received ${typeof value}`
    );
  }
  return value;
}

function patternFor(
  match: string | undefined | null,
  caseSensitiveOrOptions?: LegacyCaseSensitive | SearchOptions,
  extraConversions?: readonly string[] | null
): { pattern: string; caseSensitive: boolean } {
  const safeMatch = toOptionalString(match, "match");
  const options = toOptions(caseSensitiveOrOptions, extraConversions);
  const caseSensitive = options.caseSensitive ?? false;
  const used = caseSensitive ? safeMatch : safeMatch.toLocaleLowerCase();
  return {
    pattern: buildPattern(used, options.extraConversions ?? [], true),
    caseSensitive,
  };
}

/**
 * Returns the content of a regular expression for the match text, ignoring
 * stresses and final ς.
 *
 * @deprecated Prefer {@link greekSearch} or {@link greekMatches}. A character
 * class cannot express `ου` to `u`, cannot be validated under the `u` flag,
 * and does not see decomposed input at all.
 */
export function getRegExpContent(
  match?: string | null,
  caseSensitiveOrOptions?: LegacyCaseSensitive | SearchOptions,
  extraConversions?: readonly string[] | null
): string {
  return patternFor(match, caseSensitiveOrOptions, extraConversions).pattern;
}

/**
 * Returns a regular expression for the match text, ignoring stresses and final ς.
 *
 * The returned expression carries the `g` flag so it can be handed to
 * `String.prototype.matchAll` and friends. That makes it **stateful**:
 * `test` and `exec` advance `lastIndex`, so repeated boolean checks on one
 * instance alternate between true and false. Use {@link greekSearch} for a
 * predicate and {@link greekMatches} for offsets.
 *
 * @deprecated See {@link getRegExpContent}.
 */
export function getRegExp(
  match?: string | null,
  caseSensitiveOrOptions?: LegacyCaseSensitive | SearchOptions,
  extraConversions?: readonly string[] | null
): RegExp {
  const { pattern, caseSensitive } = patternFor(
    match,
    caseSensitiveOrOptions,
    extraConversions
  );
  return new RegExp(pattern, caseSensitive ? "g" : "gi");
}

/**
 * Folds `value` to the canonical form used for comparison. Exposed so callers
 * can pre-fold a corpus once and compare with plain `includes`, which is about
 * 10x faster than folding on every query.
 */
export function greekNormalize(
  value: string,
  options: SearchOptions = {}
): string {
  return foldGreek(value, options);
}
