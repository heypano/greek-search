import { conversionsArray } from "./conversions";
import escapeStringRegexp from "escape-string-regexp";

/**
 * Returns the content of a regular expression for the match text, ignoring stresses and final ς
 */
export function getRegExpContent(match: string = "") {
  let regExpContent = escapeStringRegexp(match);
  for (const conversion of conversionsArray) {
    const replacementRegex = new RegExp(`[${conversion}]`, "g");
    regExpContent = regExpContent.replace(replacementRegex, `[${conversion}]`);
  }
  return regExpContent;
}

/**
 * Returns a regular expression for the match text, ignoring stresses and final ς
 */
export function getRegExp(match: string = "", caseSensitive: boolean = false) {
  const regExpContent = getRegExpContent(match);
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
  text: string = "", // the text to match
  match: string = "", // the original string to match
  caseSensitive: boolean = false
): boolean {
  const regEx = getRegExp(match, caseSensitive);
  return regEx.test(text);
}
