import escapeStringRegexp from "escape-string-regexp";
import { conversionByCharacter } from "./conversions";

/**
 * A slice of a pattern under construction. Segments produced by an
 * `extraConversions` replacement are `frozen`, so the per-character pass
 * cannot rewrite regex syntax that a previous step just inserted.
 */
interface Segment {
  text: string;
  frozen: boolean;
}

/**
 * Compiles one `extraConversions` entry, turning an invalid fragment into a
 * named error rather than letting a `SyntaxError` escape from what is
 * documented as a boolean predicate.
 */
function compileConversion(conversion: string, index: number): RegExp {
  if (typeof conversion !== "string") {
    throw new TypeError(
      `greek-search: expected \`extraConversions[${index}]\` to be a string, received ${typeof conversion}`
    );
  }
  try {
    return new RegExp(conversion, "g");
  } catch (cause) {
    throw new TypeError(
      `greek-search: \`extraConversions[${index}]\` is not a valid regular expression: ${conversion}`
    );
  }
}

/**
 * Substitutes each occurrence of `conversion` with the conversion itself,
 * freezing what it inserts.
 *
 * This deliberately does not use `String.prototype.replace` with a string
 * replacement, because that would interpret `$&`, `$1` and friends inside the
 * caller's conversion.
 */
function applyConversion(
  segments: Segment[],
  conversion: string,
  index: number
) {
  const pattern = compileConversion(conversion, index);
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.frozen) {
      out.push(segment);
      continue;
    }
    let cursor = 0;
    pattern.lastIndex = 0;
    let match = pattern.exec(segment.text);
    while (match !== null) {
      if (match.index > cursor) {
        out.push({
          text: segment.text.slice(cursor, match.index),
          frozen: false,
        });
      }
      out.push({ text: conversion, frozen: true });
      cursor = match.index + match[0].length;
      if (match[0].length === 0) {
        // A conversion that matches the empty string would spin forever.
        pattern.lastIndex += 1;
      }
      match = pattern.exec(segment.text);
    }
    if (cursor < segment.text.length) {
      out.push({ text: segment.text.slice(cursor), frozen: false });
    }
  }
  return out;
}

/**
 * Expands every character that has an accent class, in one pass.
 *
 * The old implementation ran one `String.replace` per class over the growing
 * pattern, so a class inserted early was itself eligible input for every class
 * that ran after it. One pass over the original characters removes that whole
 * failure mode by construction.
 */
function expandCharacters(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      // Keep an escape sequence together; escaped characters are ASCII
      // punctuation and never carry an accent class.
      out += text.slice(index, index + 2);
      index += 1;
      continue;
    }
    out += conversionByCharacter.get(character) ?? character;
  }
  return out;
}

/**
 * Returns the content of a regular expression for the match text, ignoring
 * stresses and final ς.
 *
 * Prefer {@link greekSearch} or {@link greekMatches}: they fold both sides,
 * which additionally handles decomposed input, oxia, look-alike characters and
 * greeklish. This remains for callers that want the pattern itself.
 */
export function buildPattern(
  match: string,
  extraConversions: readonly string[],
  expand: boolean
): string {
  let segments: Segment[] = [
    { text: escapeStringRegexp(match), frozen: false },
  ];
  extraConversions.forEach((conversion, index) => {
    segments = applyConversion(segments, conversion, index);
  });
  return segments
    .map((segment) =>
      segment.frozen || !expand ? segment.text : expandCharacters(segment.text)
    )
    .join("");
}
