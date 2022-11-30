import { conversionsArray } from "./conversions";
import escapeStringRegexp from "escape-string-regexp";

export const conversions = conversionsArray;

/**
 * Returns the content of a regular expression for the match text, ignoring stresses and final ς
 */
export function getRegExpContent(
  match = "",
  caseSensitive = false,
  extraConversions: Array<string> = []
) {
  const usedMatch = caseSensitive ? match : match.toLocaleLowerCase();
  let regExpContent = escapeStringRegexp(usedMatch);

  const allConversions = [...extraConversions, ...conversionsArray];
  for (const conversion of allConversions) {
    const replacementRegex = new RegExp(conversion, "g");
    regExpContent = regExpContent.replace(replacementRegex, conversion);
  }
  return regExpContent;
}

/**
 * Returns a regular expression for the match text, ignoring stresses and final ς
 */
export function getRegExp(
  match = "",
  caseSensitive = false,
  extraConversions: Array<string> = []
) {
  const regExpContent = getRegExpContent(
    match,
    caseSensitive,
    extraConversions
  );
  const flags = ["g"];
  if (!caseSensitive) {
    flags.push("i");
  }
  return new RegExp(regExpContent, flags.join(""));
}

/**
 * Returns whether or not text matches match, ignoring stresses and final ς
 */
export function greekSearch(
  text = "", // the text to match
  match = "", // the original string to match
  caseSensitive = false,
  extraConversions: Array<string> = []
): boolean {
  const regEx = getRegExp(match, caseSensitive, extraConversions);
  return regEx.test(text);
}

/**
 * Return content around the matched string
 */
export function trimAround(
  text = "",
  regex = /.*/,
  numWords = 4,
  addEllipses = true
) {
  let flags = "";
  if (regex.ignoreCase) {
    flags = "i";
  }
  const newRegExp = new RegExp(
    `((\\S+\\s*)\{0,${numWords}\})(${regex.source})((\\S+\\s*)\{0,${numWords}\})`,
    flags
  );
  const matches = text.match(newRegExp) || [];
  const result = matches.join("").trim();
  if (addEllipses) {
    return `...${result}...`;
  }
  return result;
}
