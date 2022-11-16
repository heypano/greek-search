import { conversionsArray } from "./conversions";
import escapeStringRegexp from "escape-string-regexp";

/**
 * Returns whether or not text matches match, ignoring stresses and final ς
 */
export function greekSearch(
  text: string = "", // the text to match
  match: string = "", // the original string to match
  caseSensitive: boolean = false
): boolean {
  let regExpContent = escapeStringRegexp(match);
  for (const conversion of conversionsArray) {
    const replacementRegex = new RegExp(`[${conversion}]`, "g");
    regExpContent = regExpContent.replace(replacementRegex, `[${conversion}]`);
  }
  const flags = ["g"];
  if (!caseSensitive) {
    flags.push("i");
  }
  const regEx = new RegExp(regExpContent, flags.join(""));
  return regEx.test(text);
}
