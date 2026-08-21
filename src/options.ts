import { DEFAULT_MAX_KEYS } from "./greeklish";

export interface SearchOptions {
  /** Respect case. Default `false`. */
  caseSensitive?: boolean;
  /**
   * Respect tonos and dialytika. Default `false`.
   *
   * Previously impossible to turn on: the old `caseSensitive` flag meant
   * "respect case but still ignore accents", which is a combination nobody
   * asked for. The two are orthogonal now.
   */
  accentSensitive?: boolean;
  /** Match greeklish against Greek and vice versa. Default `false`. */
  greeklish?: boolean;
  /** Fold Latin/Cyrillic look-alikes onto Greek. Default `true`. */
  homoglyphs?: boolean;
  /** Fold lunate sigma, symbol letterforms and maths Greek. Default `true`. */
  letterforms?: boolean;
  /** Require the match to be a whole word. Default `false`. */
  wholeWord?: boolean;
  /**
   * Groups of interchangeable terms, as plain data.
   *
   *     synonyms: [["γιατρός", "ιατρός"], ["ξενοδοχείο", "hotel"]]
   *
   * Every term is folded, so accent and case variants collapse on their own
   * and there is no escaping burden on the caller. Prefer this over
   * {@link SearchOptions.extraConversions}.
   */
  synonyms?: ReadonlyArray<readonly string[]>;
  /**
   * Raw regular expression fragments spliced into the pattern.
   *
   * @deprecated Use {@link SearchOptions.synonyms}. These strings reach the
   * `RegExp` constructor unescaped, so `[".*"]` makes every query match
   * everything. They are validated now, but the contract - a fragment that
   * must also match its own literal alternatives - remains a sharp edge.
   */
  extraConversions?: readonly string[];
  /** Cap on greeklish query fan-out. Default 64, hard ceiling 200. */
  maxKeys?: number;
}

export type LegacyCaseSensitive = boolean | null | undefined;

/**
 * Accepts both the historical positional signature and an options object, so
 * the new surface is additive rather than breaking.
 */
export function toOptions(
  caseSensitiveOrOptions?: LegacyCaseSensitive | SearchOptions,
  extraConversions?: readonly string[] | null
): SearchOptions {
  if (
    caseSensitiveOrOptions !== null &&
    typeof caseSensitiveOrOptions === "object"
  ) {
    return caseSensitiveOrOptions;
  }
  return {
    caseSensitive: caseSensitiveOrOptions ?? false,
    extraConversions: extraConversions ?? [],
  };
}

export function maxKeysOf(options: SearchOptions): number {
  return options.maxKeys ?? DEFAULT_MAX_KEYS;
}
