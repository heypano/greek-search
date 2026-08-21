/**
 * Character classes grouping each Greek letter with its accented forms.
 *
 * The uppercase classes are **written out by hand**. They used to be derived
 * with `toLocaleUpperCase()`, which is wrong because Greek case mapping is not
 * length preserving:
 *
 *     "[ιϊίΐ]".toLocaleUpperCase()  ->  [ Ι Ϊ Ί Ι U+0308 U+0301 ]   6 from 4
 *     "[υύϋΰ]".toLocaleUpperCase()  ->  [ Υ Ύ Ϋ Υ U+0308 U+0301 ]   6 from 4
 *     "[σς]".toLocaleUpperCase()    ->  [ Σ Σ ]                     duplicate
 *
 * `ΐ` (U+0390) and `ΰ` (U+03B0) have no precomposed uppercase, so uppercasing
 * them decomposes them and leaks two bare combining marks into the class. The
 * resulting classes then swallowed neighbouring classes during the old
 * sequential-replace build, producing nested garbage like
 * `[ΙΪΊΙ[ΥΎΫΫ́][ΥΎΫΫ́]]` - which is why case-sensitive search silently returned
 * `false` for every query containing an uppercase iota.
 *
 * These classes are legacy surface. {@link foldGreek} is the primitive now.
 */
const LOWERCASE_CLASSES = [
  "[αά]",
  "[εέ]",
  "[ιϊίΐ]",
  "[υύϋΰ]",
  "[ηή]",
  "[οό]",
  "[ωώ]",
  "[σς]",
] as const;

const UPPERCASE_CLASSES = [
  "[ΑΆ]",
  "[ΕΈ]",
  "[ΙΪΊ]", // no precomposed uppercase ΐ exists
  "[ΥΎΫ]", // no precomposed uppercase ΰ exists
  "[ΗΉ]",
  "[ΟΌ]",
  "[ΩΏ]",
  "[Σ]", // ς uppercases to Σ, so there is only one member
] as const;

export const conversionsArray: readonly string[] = [
  ...LOWERCASE_CLASSES,
  ...UPPERCASE_CLASSES,
];

/**
 * Character to character-class lookup, so a pattern can be built in a single
 * pass instead of by running one `String.replace` per class over output the
 * previous class already rewrote.
 */
export const conversionByCharacter: ReadonlyMap<string, string> = new Map(
  conversionsArray.flatMap((characterClass) =>
    [...characterClass.slice(1, -1)].map(
      (character) => [character, characterClass] as [string, string]
    )
  )
);
