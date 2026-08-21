import { foldGreek, foldGreekWithMap } from "./fold";
import { greekKeyWithMap, greeklishKeys } from "./greeklish";
import { buildPattern } from "./regex";
import {
  LegacyCaseSensitive,
  SearchOptions,
  maxKeysOf,
  toOptions,
} from "./options";

/** A match, as offsets into the original text. */
export interface MatchRange {
  start: number;
  end: number;
}

/** Word characters, Unicode aware. `\b` is ASCII only and wrong for Greek. */
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

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

function toConversions(
  value: readonly string[] | undefined | null,
  name: string
): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError(
      `greek-search: expected \`${name}\` to be an array of strings, received ${typeof value}`
    );
  }
  return value;
}

/**
 * Composes a key-space offset map with the fold-space map beneath it.
 *
 * Every value in `outer` indexes the folded string, and `inner` has one entry
 * per folded unit plus a terminator, so the lookup is always in range.
 */
function composeMaps(outer: number[], inner: number[]): number[] {
  return outer.map((index) => inner[index]);
}

/**
 * Expands a folded query with any synonym group it belongs to. Terms are
 * folded too, so `"ιατρός"` and `"ιατρος"` are the same entry.
 */
function withSynonyms(
  query: string,
  options: SearchOptions,
  fold: (value: string) => string
): string[] {
  const groups = options.synonyms;
  if (groups === undefined || groups.length === 0) {
    return [query];
  }
  const out = [query];
  for (const group of groups) {
    const folded = group.map(fold);
    if (!folded.includes(query)) {
      continue;
    }
    for (const term of folded) {
      if (term !== "" && !out.includes(term)) {
        out.push(term);
      }
    }
  }
  return out;
}

function isWholeWord(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  return !WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after);
}

/**
 * Every match of `match` in `text`, as offsets into the original `text`.
 *
 * Offsets are the right primitive: highlighting, snippets and scoring all fall
 * out of them, and returning them means callers no longer need `getRegExp` -
 * which is stateful, because a `g` regular expression carries a `lastIndex`.
 */
export function greekMatches(
  text?: string | null,
  match?: string | null,
  caseSensitiveOrOptions?: LegacyCaseSensitive | SearchOptions,
  extraConversions?: readonly string[] | null
): MatchRange[] {
  const safeText = toOptionalString(text, "text");
  const safeMatch = toOptionalString(match, "match");
  const options = toOptions(caseSensitiveOrOptions, extraConversions);
  const conversions = toConversions(
    options.extraConversions,
    "extraConversions"
  );

  const fold = (value: string) => foldGreek(value, options);
  const folded = foldGreekWithMap(safeText, options);

  let haystack = folded.key;
  let offsets = folded.map;
  let needles = withSynonyms(fold(safeMatch), options, fold);

  if (options.greeklish) {
    const keyed = greekKeyWithMap(haystack);
    offsets = composeMaps(keyed.map, offsets);
    haystack = keyed.key;
    needles = needles.flatMap((needle) =>
      greeklishKeys(needle, maxKeysOf(options))
    );
  }

  // An empty query has no location. `greekSearch` still reports true for it,
  // matching `"".test` semantics and the historical behaviour.
  needles = [...new Set(needles.filter((needle) => needle !== ""))];
  if (needles.length === 0) {
    return [];
  }

  const found: MatchRange[] = [];
  const push = (from: number, to: number) => {
    // Needles are non-empty and the offset map is monotonic, so `start` and
    // `end` are always in range and `end` is always past `start`.
    const start = offsets[from];
    const end = offsets[to];
    if (options.wholeWord && !isWholeWord(safeText, start, end)) {
      return;
    }
    if (!found.some((range) => range.start === start && range.end === end)) {
      found.push({ start, end });
    }
  };

  if (conversions.length > 0) {
    // The legacy escape hatch. Both the query and the conversions are folded
    // first, so this path gets the normalization fixes too.
    for (const needle of needles) {
      const pattern = buildPattern(needle, conversions.map(fold), false);
      const regex = new RegExp(pattern, "g");
      for (const hit of haystack.matchAll(regex)) {
        if (hit.index !== undefined && hit[0].length > 0) {
          push(hit.index, hit.index + hit[0].length);
        }
      }
    }
  } else {
    for (const needle of needles) {
      let at = haystack.indexOf(needle);
      while (at !== -1) {
        push(at, at + needle.length);
        at = haystack.indexOf(needle, at + 1);
      }
    }
  }

  return found.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Whether `text` contains `match`, ignoring stresses and final ς.
 */
export function greekSearch(
  text?: string | null,
  match?: string | null,
  caseSensitiveOrOptions?: LegacyCaseSensitive | SearchOptions,
  extraConversions?: readonly string[] | null
): boolean {
  const safeMatch = toOptionalString(match, "match");
  const options = toOptions(caseSensitiveOrOptions, extraConversions);
  if (foldGreek(safeMatch, options) === "") {
    return true;
  }
  return (
    greekMatches(text, match, caseSensitiveOrOptions, extraConversions).length >
    0
  );
}

/**
 * A collator for Greek, which `Array.prototype.sort` gets wrong on its own.
 *
 *     ["Ω","Α","Ζ","ά","Β"].sort(greekCompare)  // Α, ά, Β, Ζ, Ω
 *     ["Ω","Α","Ζ","ά","Β"].sort()              // Α, Β, Ζ, Ω, ά
 *
 * At `sensitivity: "base"` this folds accents, case, final sigma and oxia. It
 * does **not** fold look-alike characters, which is why the homoglyph pass in
 * {@link foldGreek} still earns its place.
 */
export function greekCollator(
  options: Intl.CollatorOptions = {}
): Intl.Collator {
  return new Intl.Collator("el", options);
}

const defaultCollator = new Intl.Collator("el");

/** Compares two Greek strings for sorting. */
export function greekCompare(a: string, b: string): number {
  return defaultCollator.compare(a, b);
}

function isRegExp(value: unknown): value is RegExp {
  // Works across realms (jsdom, vm, iframes) where `instanceof` would fail.
  return Object.prototype.toString.call(value) === "[object RegExp]";
}

/**
 * Flags for scanning `text` with `regex`: keep everything the source declared
 * so `u`, `v`, `m`, `s` and `d` still mean what they meant, always add `g`,
 * and drop `y` because a sticky expression anchors the scan at `lastIndex` and
 * stops at the first gap.
 */
function scanFlags(regex: RegExp): string {
  const flags = new Set(regex.flags.split(""));
  flags.delete("y");
  flags.add("g");
  return [...flags].join("");
}

/** Walks `count` words forward from `from`, returning the offset reached. */
function wordsAfter(text: string, from: number, count: number): number {
  let at = from;
  for (let taken = 0; taken < count; taken += 1) {
    let cursor = at;
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor += 1;
    }
    if (cursor >= text.length || /\s/.test(text[cursor])) {
      break;
    }
    while (cursor < text.length && !/\s/.test(text[cursor])) {
      cursor += 1;
    }
    at = cursor;
  }
  return at;
}

/** Walks `count` words backward from `from`, returning the offset reached. */
function wordsBefore(text: string, from: number, count: number): number {
  let at = from;
  for (let taken = 0; taken < count; taken += 1) {
    let cursor = at;
    while (cursor > 0 && /\s/.test(text[cursor - 1])) {
      cursor -= 1;
    }
    if (cursor <= 0 || /\s/.test(text[cursor - 1])) {
      break;
    }
    while (cursor > 0 && !/\s/.test(text[cursor - 1])) {
      cursor -= 1;
    }
    at = cursor;
  }
  return at;
}

/**
 * Returns up to `numWords` words of context on either side of every match of
 * `regex` in `text`, one match per line.
 *
 * The context is found by walking offsets rather than by wrapping the pattern
 * in `(?:\S+\s*){0,N}` on both sides. That nested quantifier was a genuine
 * ReDoS with the *documented* default of `numWords = 8` and no
 * attacker-supplied regex at all: a 34 character whitespace-free token - a
 * URL, a hash, a base64 blob - took 642 ms, and a longer one did not finish.
 */
export function trimAround(
  text?: string | null,
  regex?: RegExp | null,
  numWords = 4,
  addEllipses = true
): string {
  const safeText = toOptionalString(text, "text");
  const safeRegex = regex === undefined || regex === null ? /.*/ : regex;
  if (!isRegExp(safeRegex)) {
    throw new TypeError(
      `greek-search: expected \`regex\` to be a RegExp, received ${typeof regex}`
    );
  }
  if (!Number.isInteger(numWords) || numWords < 0) {
    throw new TypeError(
      `greek-search: expected \`numWords\` to be a non-negative integer, received ${String(
        numWords
      )}`
    );
  }

  const scanner = new RegExp(safeRegex.source, scanFlags(safeRegex));
  const snippets: string[] = [];
  let covered = -1;
  for (const hit of safeText.matchAll(scanner)) {
    // A zero width match has no content to show, and would render as a bare
    // "......" or, worse, as context around nothing.
    if (hit[0].length === 0) {
      continue;
    }
    // `matchAll` always populates `index`; the lib type is just wider.
    const start = hit.index as number;
    if (start < covered) {
      // Already inside the snippet the previous match produced. Emitting it
      // again would just repeat the same words on a second line.
      continue;
    }
    const end = start + hit[0].length;
    const from = wordsBefore(safeText, start, numWords);
    const to = wordsAfter(safeText, end, numWords);
    const snippet = safeText.slice(from, to).trim();
    if (snippet.length === 0) {
      continue;
    }
    covered = to;
    snippets.push(addEllipses ? `...${snippet}...` : safeText.slice(from, to));
  }
  return snippets.join("\n");
}
