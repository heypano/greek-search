import { toLetterform } from "./letterforms";
import { buildPattern } from "./regex";
import { project, projectHomoglyphs } from "./homoglyphs";
import { toOptions, maxKeysOf } from "./options";
import { DEFAULT_MAX_KEYS } from "./greeklish";
import { foldGreek, foldGreekWithMap } from "./fold";
import { greekCollator, greekMatches, trimAround } from "./search";
import {
  getRegExp,
  getRegExpContent,
  greekNormalize,
  conversions,
} from "./index";
import * as publicApi from "./index";
import { greeklishKeys } from "./greeklish";

describe("toLetterform", () => {
  test("passes through characters outside the gate", () => {
    for (const char of ["α", "A", "1", " ", "΄", "΄"]) {
      expect([char, toLetterform(char)]).toEqual([char, char]);
    }
  });

  test("folds symbol letterforms and maths Greek", () => {
    expect(toLetterform("ϑ")).toBe("θ");
    expect(toLetterform("\u{1d6a8}")).toBe("Α");
  });

  test("handles the empty string without throwing", () => {
    expect(toLetterform("")).toBe("");
  });

  test("leaves the tonos U+0384 alone - the whole reason for the gate", () => {
    expect(toLetterform("΄")).toBe("΄");
    expect("΄".normalize("NFKC")).toHaveLength(2); // what we are avoiding
  });
});

describe("buildPattern", () => {
  test("keeps escape sequences intact rather than expanding into them", () => {
    // escapeStringRegexp turns "[" into "\[", and the backslash must not be
    // treated as a character eligible for an accent class.
    const pattern = buildPattern("α[ό]", [], true);
    expect(pattern).toContain("\\[");
    expect(pattern).toContain("\\]");
    expect(new RegExp(pattern).test("α[ο]")).toBe(true);
  });

  test("rejects a non-string conversion", () => {
    expect(() => buildPattern("α", [123 as unknown as string], true)).toThrow(
      /to be a string/
    );
  });

  test("rejects an invalid conversion", () => {
    expect(() => buildPattern("α", ["("], true)).toThrow(
      /not a valid regular expression/
    );
  });

  test("keeps text before a conversion match", () => {
    const pattern = buildPattern("ναι γιατρος", ["(γιατρος)"], false);
    expect(pattern).toBe("ναι (γιατρος)");
  });

  test("does not spin on a conversion that matches the empty string", () => {
    const pattern = buildPattern("αβ", ["ζ*"], false);
    expect(typeof pattern).toBe("string");
  });

  test("a second conversion cannot rewrite what the first inserted", () => {
    // "(α)" is frozen after the first pass, so the second conversion must not
    // see its parentheses or its alpha as ordinary pattern text.
    const pattern = buildPattern("αβ", ["(α)", "\\("], false);
    expect(pattern).toBe("(α)β");
  });

  test("skips class expansion when asked not to expand", () => {
    expect(buildPattern("α", [], false)).toBe("α");
    expect(buildPattern("α", [], true)).toBe("[αά]");
  });
});

describe("homoglyphs", () => {
  test("project returns null for single-script tokens", () => {
    expect(project("OK")).toBeNull();
    expect(project("καλό")).toBeNull();
  });

  test("project returns null when any Latin character is off-table", () => {
    expect(project("ΒΗΜΑGAZINO")).toBeNull();
  });

  test("project folds a mixed token", () => {
    expect(project("Kαθώς")).toBe("Καθώς");
  });

  test("projectHomoglyphs short circuits on single-script strings", () => {
    expect(projectHomoglyphs("καλημέρα")).toBe("καλημέρα");
    expect(projectHomoglyphs("hello world")).toBe("hello world");
  });

  test("projectHomoglyphs leaves rejected tokens untouched mid-sentence", () => {
    expect(projectHomoglyphs("Kαθώς ΒΗΜΑGAZINO")).toBe("Καθώς ΒΗΜΑGAZINO");
  });

  test("folds Cyrillic look-alikes too", () => {
    expect(project("Аθήνα")).toBe("Αθήνα");
  });
});

describe("fold options", () => {
  test("homoglyphs can be turned off", () => {
    expect(foldGreek("Oδύσσεια", { homoglyphs: false })).toBe("oδυσσεια");
    expect(foldGreek("Oδύσσεια", { homoglyphs: true })).toBe("οδυσσεια");
  });

  test("letterforms can be turned off", () => {
    expect(foldGreek("ΟΔΟϹ", { letterforms: false })).toBe("οδοϲ");
    expect(foldGreek("ΟΔΟϹ", { letterforms: true })).toBe("οδοσ");
  });

  test("foldGreekWithMap honours the same options", () => {
    expect(foldGreekWithMap("Oδύσσεια", { homoglyphs: false }).key).toBe(
      "oδυσσεια"
    );
    expect(
      foldGreekWithMap("Άλλος", { accentSensitive: true, caseSensitive: true })
        .key
    ).toBe("Άλλοσ");
  });

  test("an empty string folds to an empty key with a single map entry", () => {
    expect(foldGreekWithMap("")).toEqual({ key: "", map: [0] });
    expect(foldGreek("")).toBe("");
  });
});

describe("options plumbing", () => {
  test("toOptions accepts the legacy positional form", () => {
    expect(toOptions(true, ["α"])).toEqual({
      caseSensitive: true,
      extraConversions: ["α"],
    });
    expect(toOptions()).toEqual({ caseSensitive: false, extraConversions: [] });
    expect(toOptions(null)).toEqual({
      caseSensitive: false,
      extraConversions: [],
    });
  });

  test("toOptions passes an options object straight through", () => {
    const options = { greeklish: true };
    expect(toOptions(options)).toBe(options);
  });

  test("maxKeysOf falls back to the default", () => {
    expect(maxKeysOf({})).toBe(DEFAULT_MAX_KEYS);
    expect(maxKeysOf({ maxKeys: 8 })).toBe(8);
  });
});

describe("argument validation", () => {
  test("greekMatches rejects a non-array extraConversions", () => {
    expect(() =>
      greekMatches("α", "α", {
        extraConversions: "α" as unknown as string[],
      })
    ).toThrow(/to be an array of strings/);
  });

  test("greekMatches rejects non-string text and match", () => {
    expect(() => greekMatches(1 as unknown as string, "α")).toThrow(TypeError);
    expect(() => greekMatches("α", 1 as unknown as string)).toThrow(TypeError);
  });

  test("null text and null match are treated as absent", () => {
    expect(greekMatches(null, null)).toEqual([]);
    expect(greekMatches("α", null)).toEqual([]);
  });
});

describe("legacy regex surface", () => {
  test("getRegExpContent accepts an options object", () => {
    expect(getRegExpContent("Α", { caseSensitive: true })).toBe("[ΑΆ]");
    expect(getRegExpContent("Α")).toBe("[αά]"); // lowercased first
  });

  test("getRegExp carries the g flag and is therefore stateful", () => {
    const regex = getRegExp("άλλος");
    expect(regex.flags).toContain("g");
    expect([regex.test("άλλος"), regex.test("άλλος")]).toEqual([true, false]);
  });

  test("getRegExp respects caseSensitive in its flags", () => {
    expect(getRegExp("α", true).flags).toBe("g");
    expect(getRegExp("α", false).flags).toBe("gi");
  });

  test("getRegExpContent defaults to an empty pattern", () => {
    expect(getRegExpContent()).toBe("");
    expect(getRegExpContent(null)).toBe("");
  });

  test("conversions is exported, frozen in shape and has no nested classes", () => {
    expect(conversions).toHaveLength(16);
    for (const characterClass of conversions) {
      expect([characterClass, characterClass.slice(1, -1)]).not.toContain("[");
    }
  });
});

describe("greekNormalize", () => {
  test("is the fold, exposed for pre-folding a corpus", () => {
    expect(greekNormalize("Άλλος")).toBe(foldGreek("Άλλος"));
    expect(greekNormalize("Άλλος", { caseSensitive: true })).toBe("Αλλοσ");
  });
});

describe("greekCollator", () => {
  test("returns a collator honouring the requested sensitivity", () => {
    expect(greekCollator({ sensitivity: "base" }).compare("οδος", "οδός")).toBe(
      0
    );
    expect(
      greekCollator({ sensitivity: "accent" }).compare("οδος", "οδός")
    ).toBe(-1);
    expect(greekCollator().compare("α", "α")).toBe(0);
  });
});

describe("trimAround edges", () => {
  test("defaults to the whole text when no regex is given", () => {
    expect(trimAround("one two")).toBe("...one two...");
    expect(trimAround(null)).toBe("");
  });

  test("numWords larger than the text is clamped by the text itself", () => {
    expect(trimAround("one two three", /two/g, 99)).toBe("...one two three...");
  });

  test("rejects a non-RegExp regex", () => {
    expect(() => trimAround("a", "a" as unknown as RegExp)).toThrow(
      /to be a RegExp/
    );
  });

  test("rejects a non-integer or negative numWords", () => {
    for (const bad of [-1, 2.5, NaN, Infinity, "4" as unknown as number]) {
      expect(() => trimAround("a needle b", /needle/g, bad)).toThrow(
        /non-negative integer/
      );
    }
  });

  test("a source regex without the g flag is still scanned globally", () => {
    expect(trimAround("needle and needle", /needle/, 0)).toBe(
      "...needle...\n...needle..."
    );
  });
});

describe("coverage of the remaining branches", () => {
  test("greeklishKeys passes through characters in neither table", () => {
    // Digits, spaces and punctuation are not Greek and not greeklish letters.
    expect(greeklishKeys(foldGreek("giatros 5!"))).toContain("giatros 5!");
  });

  test("getRegExpContent defaults caseSensitive when given a bare options object", () => {
    expect(getRegExpContent("Α", {})).toBe("[αά]");
  });

  test("identical spans found by two different needles are deduped", () => {
    // Both needles reach the same alternation, so both match "ιατρος" at 0.
    const ranges = greekMatches("ιατρος", "γιατρος", {
      synonyms: [["γιατρος", "ιατρος"]],
      extraConversions: ["((ιατρος)|(γιατρος))"],
    });
    expect(ranges).toEqual([{ start: 0, end: 6 }]);
  });

  test("ranges sharing a start are ordered by their end", () => {
    const ranges = greekMatches("ιατρος", "ιατρ", {
      synonyms: [["ιατρ", "ιατρος"]],
    });
    expect(ranges).toEqual([
      { start: 0, end: 4 },
      { start: 0, end: 6 },
    ]);
  });

  test("a whitespace-only match produces no snippet", () => {
    expect(trimAround("a   b", /\s+/g, 0)).toBe("");
  });
});

describe("public entry point", () => {
  test("re-exports the whole documented surface", () => {
    const expected = [
      "conversions",
      "foldGreek",
      "foldGreekWithMap",
      "getRegExp",
      "getRegExpContent",
      "greekCollator",
      "greekCompare",
      "greekKey",
      "greekKeyWithMap",
      "greekMatches",
      "greekNormalize",
      "greekSearch",
      "greeklishKeys",
      "projectHomoglyphs",
      "trimAround",
    ];
    expect(Object.keys(publicApi).sort()).toEqual(expected);
  });

  test("the re-exported functions are the working ones", () => {
    expect(publicApi.greekSearch("Κάποιος ΆλΛοΣ", "αλλος")).toBe(true);
    expect(publicApi.greekMatches("Ο γιατρός", "ΓΙΑΤΡΟΣ")).toEqual([
      { start: 2, end: 9 },
    ]);
    expect(publicApi.foldGreek("Άλλος")).toBe("αλλοσ");
    expect(publicApi.foldGreekWithMap("ά").map).toEqual([0, 1]);
    expect(publicApi.greekKey(publicApi.foldGreek("γιατρός"))).toBe("giatros");
    expect(publicApi.greekKeyWithMap("γιατρος").key).toBe("giatros");
    expect(publicApi.greeklishKeys("giatros")).toContain("giatros");
    expect(publicApi.projectHomoglyphs("Kαθώς")).toBe("Καθώς");
    expect(publicApi.trimAround("one needle two", /needle/g, 1)).toBe(
      "...one needle two..."
    );
    expect(publicApi.greekCompare("α", "β")).toBeLessThan(0);
    expect(
      publicApi.greekCollator({ sensitivity: "base" }).compare("α", "ά")
    ).toBe(0);
    expect(publicApi.greekNormalize("Άλλος")).toBe("αλλοσ");
    expect(publicApi.getRegExp("α").flags).toBe("gi");
    expect(publicApi.getRegExpContent("α")).toBe("[αά]");
    expect(publicApi.conversions.length).toBe(16);
  });
});
