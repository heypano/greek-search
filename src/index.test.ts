import {
  conversions,
  getRegExp,
  getRegExpContent,
  greekSearch,
  trimAround,
} from "./index";

let input = "";
let match = "";
let output = false;

describe("Greek Search Tests", () => {
  test("Case Sensitive", () => {
    input = "Κάποιος ΆλλοΣ";
    match = "ΆλλοΣ";
    output = greekSearch(input, match, true);
    expect(output).toBe(true);

    match = "ΑλλοΣ";
    output = greekSearch(input, match, true);
    expect(output).toBe(true);

    match = "ΆλλόΣ";
    output = greekSearch(input, match, true);
    expect(output).toBe(true);

    match = "άλλος";
    output = greekSearch(input, match, true);
    expect(output).toBe(false);
  });

  test("Case Ιnsensitive", () => {
    input = "Κάποιος ΆλΛοΣ";
    match = "ΆλλοΣ";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "Αλλος";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "αΛλΌσ";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "αλλος";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "αλος";
    output = greekSearch(input, match);
    expect(output).toBe(false);
  });

  test("Special Characters", () => {
    input = "Κάποιος ΆλλοΣ [] {} ()";
    match = "ΆλλοΣ";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "ΑλλοΣ [] {} ()";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "Άλλός [] {} ()";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "αλλος [] {} ()";
    output = greekSearch(input, match);
    expect(output).toBe(true);

    match = "αλος [] {} ()";
    output = greekSearch(input, match);
    expect(output).toBe(false);
  });

  test("Extra Conversions Case Insensitive", () => {
    const extraConversions = ["((ιατρος)|(γιατρος)|(ιατρός)|(γιατρός))"];

    input = "ΆλλοΣ ιατρός";
    match = "ΆλλοΣ";
    output = greekSearch(input, match, false, extraConversions);
    expect(output).toBe(true);

    match = "γιατρός";
    output = greekSearch(input, match, false, extraConversions);
    expect(output).toBe(true);

    match = "ΓΙΑΤΡΟΣ";
    output = greekSearch(input, match, false, extraConversions);
    expect(output).toBe(true);

    match = "γιατροος";
    output = greekSearch(input, match, false, extraConversions);
    expect(output).toBe(false);
  });

  test("Extra Conversions Case Sensitive", () => {
    const extraConversions = ["((ιατρος)|(γιατρος)|(ιατρός)|(γιατρός))"];

    input = "ΆλλοΣ ιατρός";
    match = "ΆλλοΣ";
    output = greekSearch(input, match, true, extraConversions);
    expect(output).toBe(true);

    match = "γιατρός";
    output = greekSearch(input, match, true, extraConversions);
    expect(output).toBe(true);

    match = "ΓΙΑΤΡΟΣ";
    output = greekSearch(input, match, true, extraConversions);
    expect(output).toBe(false);
  });

  test("Trim Around", () => {
    const textToTrim =
      "Flee in terror at cucumber discovered on floor. Am in trouble, roll over, too cute for human to get mad.";
    const regExp = new RegExp("in trouble", "ig");
    const numWords = 4;
    const result = trimAround(textToTrim, regExp, numWords);
    expect(result).toBe(
      "...discovered on floor. Am in trouble, roll over, too..."
    );
  });
  test("Trim Around - duplication", () => {
    const textToTrim =
      "Flee in terror at cucumber discovered on floor. Am in trouble, roll over, too cute for human to get mad. Am in trouble, roll over, too cute for human to get mad. Am in trouble, roll over, too cute for human to get mad.";
    const regExp = new RegExp("in trouble", "ig");
    const numWords = 4;
    const result = trimAround(textToTrim, regExp, numWords);
    expect(result).toBe(
      "...discovered on floor. Am in trouble, roll over, too...\n...to get mad. Am in trouble, roll over, too...\n...to get mad. Am in trouble, roll over, too..."
    );
  });
});

describe("Regular expression statefulness", () => {
  test("getRegExp still returns a global regex (public contract)", () => {
    expect(getRegExp("αλλος").global).toBe(true);
    expect(getRegExp("αλλος").ignoreCase).toBe(true);
    expect(getRegExp("αλλος", true).ignoreCase).toBe(false);
  });

  test("greekSearch is stable across repeated calls with the same arguments", () => {
    const text = "Κάποιος ΆλΛοΣ";
    for (let i = 0; i < 5; i++) {
      expect(greekSearch(text, "αλλος")).toBe(true);
    }
  });

  test("greekSearch does not use a stateful global regex internally", () => {
    // A `g` regex advances lastIndex on every successful `test()` call, which
    // makes repeated calls alternate between true and false. Guard against a
    // future refactor reintroducing that by checking a longer text with two
    // matches, which is where the bug shows up most clearly.
    const text = "άλλος και άλλος και άλλος";
    expect(greekSearch(text, "αλλος")).toBe(true);
    expect(greekSearch(text, "αλλος")).toBe(true);
    expect(greekSearch(text, "αλλος")).toBe(true);
  });
});

describe("Input handling", () => {
  test("empty text and empty match", () => {
    expect(greekSearch("", "")).toBe(true);
    expect(greekSearch("abc", "")).toBe(true);
    expect(greekSearch("", "abc")).toBe(false);
    expect(getRegExpContent("")).toBe("");
  });

  test("null and undefined are treated as the empty default", () => {
    expect(greekSearch(undefined, undefined)).toBe(true);
    expect(greekSearch(null, "abc")).toBe(false);
    expect(greekSearch("abc", null)).toBe(true);
    expect(getRegExpContent(null)).toBe("");
    expect(getRegExp(null).source).toBe("(?:)");
    expect(greekSearch("abc", "abc", false, null)).toBe(true);
  });

  test("non-string input throws a descriptive TypeError", () => {
    expect(() => greekSearch(123 as unknown as string, "2")).toThrow(TypeError);
    expect(() => greekSearch("123", 2 as unknown as string)).toThrow(TypeError);
    expect(() => getRegExpContent({} as unknown as string)).toThrow(TypeError);
    expect(() =>
      getRegExpContent("a", false, "nope" as unknown as string[])
    ).toThrow(TypeError);
  });

  test("regex special characters in the match are escaped", () => {
    const specials = "a.b*c+d?e^f$g|h(i)j[k]l{m}n\\o-p";
    expect(greekSearch(`xx ${specials} yy`, specials)).toBe(true);
    expect(greekSearch("aXbXcXdXeXfXgXhXiXjXkXlXmXnXoXp", specials)).toBe(
      false
    );
  });

  test("conversions is exported and non-empty", () => {
    expect(Array.isArray(conversions)).toBe(true);
    expect(conversions.length).toBeGreaterThan(0);
  });
});

describe("trimAround", () => {
  const text = "one two three needle four five six";

  test("numWords = 0 returns just the match", () => {
    expect(trimAround(text, /needle/g, 0)).toBe("...needle...");
  });

  test("addEllipses = false returns the raw slice", () => {
    expect(trimAround(text, /needle/g, 1, false)).toBe("three needle four");
  });

  test("no match returns an empty string", () => {
    expect(trimAround(text, /zzz/g, 2)).toBe("");
  });

  test("match at the very start of the text", () => {
    expect(trimAround(text, /one/g, 2)).toBe("...one two three...");
  });

  test("match at the very end of the text", () => {
    expect(trimAround(text, /six/g, 2)).toBe("...four five six...");
  });

  test("a top level alternation in the source is grouped", () => {
    // Without the (?:...) wrapper the pattern would read as
    // `(?:\\S+\\s*){0,1}needle` OR `four(?:\\s*\\S+){0,1}`, so each branch would
    // pick up context on one side only and produce two separate lines.
    // Grouped, "four" is consumed as the trailing context of the "needle"
    // match, so there is a single line.
    expect(trimAround(text, /needle|four/g, 1)).toBe("...three needle four...");
  });

  test("the {0,n} quantifier is a real quantifier, not literal braces", () => {
    // A literal `\{0,4\}` in the pattern would never match anything.
    expect(trimAround(text, /needle/g, 2)).toBe(
      "...two three needle four five..."
    );
  });

  test("zero length matches do not produce bare ellipses", () => {
    expect(trimAround(text, /.*/g, 4)).toBe(
      "...one two three needle four five six..."
    );
    expect(trimAround("", /.*/g, 4)).toBe("");
  });

  test("preserves the unicode flag from the source regex", () => {
    expect(
      trimAround("alpha \u{1F600} omega", /\p{Emoji_Presentation}/u, 1)
    ).toBe("...alpha \u{1F600} omega...");
  });

  test("preserves the multiline and dotAll flags from the source regex", () => {
    // Without `m` the `^` could never match, so the result would be "".
    // With `m` the leading context group eats "two\n" to reach the line start.
    expect(trimAround("one two\nthree four", /^three/m, 1)).toBe(
      "...two\nthree four..."
    );
    expect(trimAround("one a\nb two", /a.b/s, 1)).toBe("...one a\nb two...");
  });

  test("preserves case insensitivity and adds the global flag", () => {
    expect(trimAround("one NEEDLE two", /needle/i, 1)).toBe(
      "...one NEEDLE two..."
    );
    expect(trimAround("a needle b needle c", /needle/, 0)).toBe(
      "...needle...\n...needle..."
    );
  });

  test("a sticky source regex still scans the whole text", () => {
    expect(trimAround(text, /needle/y, 1)).toBe("...three needle four...");
  });

  test("invalid numWords throws instead of silently returning nothing", () => {
    expect(() => trimAround(text, /needle/g, -1)).toThrow(TypeError);
    expect(() => trimAround(text, /needle/g, 2.5)).toThrow(TypeError);
    expect(() => trimAround(text, /needle/g, NaN)).toThrow(TypeError);
    expect(() => trimAround(text, /needle/g, Infinity)).toThrow(TypeError);
    expect(() =>
      trimAround(text, /needle/g, "0}|(?:.*" as unknown as number)
    ).toThrow(TypeError);
  });

  test("invalid regex or text throws a descriptive TypeError", () => {
    expect(() => trimAround(text, "needle" as unknown as RegExp)).toThrow(
      TypeError
    );
    expect(() => trimAround(123 as unknown as string, /needle/g)).toThrow(
      TypeError
    );
  });

  test("null text and null regex fall back to the defaults", () => {
    expect(trimAround(null, /needle/g, 1)).toBe("");
    expect(trimAround(text, null, 0)).toBe(
      "...one two three needle four five six..."
    );
  });

  test("composes with getRegExp", () => {
    expect(trimAround("Κάποιος ΆλΛοΣ ήρθε", getRegExp("αλλος"), 1)).toBe(
      "...Κάποιος ΆλΛοΣ ήρθε..."
    );
  });
});
