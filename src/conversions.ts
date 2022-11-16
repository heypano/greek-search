const baseConversions: Array<string> = [
  "αά",
  "εέ",
  "ιϊίΐ",
  "υύϋΰ",
  "ηή",
  "οό",
  "ωώ",
  "σς",
];

export const conversionsArray = baseConversions.flatMap((conversion) => [
  conversion,
  conversion.toLocaleUpperCase(),
]);
