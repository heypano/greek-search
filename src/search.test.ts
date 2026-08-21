import { greekCompare, greekMatches, greekSearch, trimAround } from "./search";
import { getRegExpContent } from "./index";

const ALPHABET = "αβγδεζηθικλμνξοπρστυφχψω";
const ACCENTED = "άέήίόύώϊϋΐΰς";

describe("self matching - the coverage gap that hid the iota bug", () => {
  // Every fixture in the old suite was the word "ΆλλοΣ", which contains no
  // iota, no upsilon, no NFD, no oxia, no digraph and no homoglyph. This loop
  // would have caught it immediately: case-sensitive search used to return
  // false for every query containing an uppercase iota.
  const letters = [...(ALPHABET + ACCENTED)];
  const words = [
    "ΙΑΤΡΟΣ",
    "ΠΑΙΔΙ",
    "ΑΘΗΝΑ",
    "ΟΔΟΣ",
    "ΜΑΪΟΥ",
    "ΞΕΝΟΔΟΧΕΙΟ",
    "ΥΠΟΛΟΓΙΣΤΗΣ",
    "γιατρός",
    "Θεσσαλονίκη",
    "ευχαριστώ",
  ];

  test.each([false, true])(
    "every Greek letter matches itself (caseSensitive=%s)",
    (caseSensitive) => {
      for (const letter of letters) {
        for (const form of [letter, letter.toLocaleUpperCase()]) {
          expect([form, greekSearch(form, form, caseSensitive)]).toEqual([
            form,
            true,
          ]);
        }
      }
    }
  );

  test.each([false, true])(
    "every word matches itself (caseSensitive=%s)",
    (caseSensitive) => {
      for (const word of words) {
        for (const form of [word, word.toLocaleUpperCase()]) {
          expect([form, greekSearch(form, form, caseSensitive)]).toEqual([
            form,
            true,
          ]);
        }
      }
    }
  );

  test("uppercase iota specifically - the regression", () => {
    expect(greekSearch("ΙΑΤΡΟΣ", "ΙΑΤΡΟΣ", true)).toBe(true);
    expect(greekSearch("ΠΑΙΔΙ", "ΠΑΙΔΙ", true)).toBe(true);
    expect(greekSearch("ΜΑΪΟΥ", "ΜΑΙΟΥ", true)).toBe(true);
  });

  test("the generated pattern never nests character classes", () => {
    for (const letter of [...ALPHABET]) {
      const pattern = getRegExpContent(letter.toLocaleUpperCase(), true);
      expect([letter, pattern.slice(1, -1).includes("[")]).toEqual([
        letter,
        false,
      ]);
    }
  });
});

describe("normalization", () => {
  const word = "άλλος";

  test("matches across all four NFC/NFD combinations", () => {
    for (const text of [word.normalize("NFC"), word.normalize("NFD")]) {
      for (const query of [
        "αλλος",
        word.normalize("NFC"),
        word.normalize("NFD"),
      ]) {
        expect([text, query, greekSearch(`Κάποιος ${text}`, query)]).toEqual([
          text,
          query,
          true,
        ]);
      }
    }
  });

  test("folds all 16 oxia codepoints onto tonos", () => {
    // Oxia (Greek Extended) rather than tonos, as left behind by
    // polytonic-to-monotonic conversion. NFC unifies them; nothing else has to.
    const oxia = "\u1f71\u1f73\u1f75\u1f77\u1f79\u1f7b\u1f7d";
    const tonos = "\u03ac\u03ad\u03ae\u03af\u03cc\u03cd\u03ce";
    const plain = "\u03b1\u03b5\u03b7\u03b9\u03bf\u03c5\u03c9";
    for (let i = 0; i < oxia.length; i += 1) {
      expect([i, oxia[i] === tonos[i]]).toEqual([i, false]); // genuinely distinct
      expect([i, greekSearch(oxia[i], tonos[i])]).toEqual([i, true]);
      expect([i, greekSearch(oxia[i], plain[i])]).toEqual([i, true]);
    }
    const capitals = "\u1fbb\u1fc9\u1fcb\u1fdb\u1ff9\u1feb\u1ffb";
    const capitalTonos = "\u0386\u0388\u0389\u038a\u038c\u038e\u038f";
    for (let i = 0; i < capitals.length; i += 1) {
      expect([i, capitals[i] === capitalTonos[i]]).toEqual([i, false]);
      expect([i, greekSearch(capitals[i], capitalTonos[i])]).toEqual([i, true]);
    }
    // A whole word spelled with oxia.
    expect(
      greekSearch(
        "\u1f71\u03bb\u03bb\u03bf\u03c2",
        "\u03b1\u03bb\u03bb\u03bf\u03c2"
      )
    ).toBe(true);
  });

  test("repairs pre-10.3 Mac OS tonos (U+030D), which NFC cannot", () => {
    expect("α̍".normalize("NFC")).toHaveLength(2);
    expect(greekSearch("κα̍τι", "κατι")).toBe(true);
  });

  test("finds words spelled with look-alike characters", () => {
    expect(greekSearch("Oδύσσεια", "Οδύσσεια")).toBe(true);
    expect(greekSearch("KAΛO", "καλό")).toBe(true);
    expect(greekSearch("στo σπίτι", "στο")).toBe(true);
  });

  test("does not fold brand-like single-script tokens", () => {
    expect(greekSearch("HOTEL", "ΗΟΤΕΛ")).toBe(false);
    expect(greekSearch("ΒΗΜΑGAZINO", "ΒΗΜΑ")).toBe(true); // plain substring
  });

  test("handles Greek punctuation and lunate sigma", () => {
    expect(greekSearch("ΟΔΟϹ", "οδός")).toBe(true);
    // Greek question mark U+037E vs ASCII semicolon, ano teleia U+0387 vs U+00B7.
    expect(greekSearch("\u03a4\u03b9\u037e", "\u03c4\u03b9\u003b")).toBe(true);
    expect(
      greekSearch("\u03bd\u03b1\u03af\u0387", "\u03bd\u03b1\u03b9\u00b7")
    ).toBe(true);
  });
});

describe("greekMatches", () => {
  test("returns offsets into the original text", () => {
    const text = "Ο γιατρός και ο γιατρός";
    const ranges = greekMatches(text, "ΓΙΑΤΡΟΣ");
    expect(ranges).toEqual([
      { start: 2, end: 9 },
      { start: 16, end: 23 },
    ]);
    expect(text.slice(2, 9)).toBe("γιατρός");
  });

  test("offsets are correct even when the text is decomposed", () => {
    const text = "Ο γιατρός".normalize("NFD");
    const [range] = greekMatches(text, "γιατρος");
    expect(text.slice(range.start, range.end).normalize("NFC")).toBe("γιατρός");
  });

  test("an empty query has no location", () => {
    expect(greekMatches("κάτι", "")).toEqual([]);
    expect(greekSearch("κάτι", "")).toBe(true);
  });
});

describe("wholeWord", () => {
  test("matches whole words only, Unicode aware", () => {
    // \b is ASCII only: /\bαλλος\b/.test("αλλος") is false, which is useless.
    expect(greekSearch("άλλος", "αλλος", { wholeWord: true })).toBe(true);
    expect(greekSearch("άλλος", "λλο", { wholeWord: true })).toBe(false);
    expect(greekSearch("λλο μόνο", "λλο", { wholeWord: true })).toBe(true);
    expect(greekSearch("άλλος", "λλο")).toBe(true);
  });
});

describe("synonyms", () => {
  const synonyms = [["γιατρός", "ιατρός"]];

  test("expands a query to its group, folding as it goes", () => {
    expect(greekSearch("ΆλλοΣ ιατρός", "γιατρός", { synonyms })).toBe(true);
    expect(greekSearch("ΆλλοΣ ιατρός", "ΓΙΑΤΡΟΣ", { synonyms })).toBe(true);
    expect(greekSearch("ΆλλοΣ ιατρός", "γιατροος", { synonyms })).toBe(false);
  });

  test("returns offsets for the synonym that actually matched", () => {
    const text = "ΆλλοΣ ιατρός";
    const [range] = greekMatches(text, "γιατρός", { synonyms });
    expect(text.slice(range.start, range.end)).toBe("ιατρός");
  });
});

describe("extraConversions is validated rather than injected blindly", () => {
  test("an invalid fragment throws a named error, not a SyntaxError", () => {
    expect(() => greekSearch("κάτι", "κατι", false, ["("])).toThrow(TypeError);
    expect(() => greekSearch("κάτι", "κατι", false, ["("])).toThrow(
      /not a valid regular expression/
    );
  });

  test("a `$` in a conversion is not read as a replacement pattern", () => {
    expect(() => greekSearch("κάτι", "κατι", false, ["κ$&"])).not.toThrow();
  });
});

describe("greeklish", () => {
  const text = "Ο γιατρός στο ξενοδοχείο Θεσσαλονίκη, ευχαριστώ";

  test("is off by default so Greek queries stay exact", () => {
    expect(greekSearch(text, "giatros")).toBe(false);
    expect(greekSearch(text, "giatros", { greeklish: true })).toBe(true);
  });

  test.each([
    ["giatros", "γιατρός"],
    ["ksenodoxeio", "ξενοδοχείο"],
    ["3enodoxeio", "ξενοδοχείο"],
    ["8essalonikh", "Θεσσαλονίκη"],
    ["thessaloniki", "Θεσσαλονίκη"],
    ["uessalonikh", "Θεσσαλονίκη"],
    ["efxaristw", "ευχαριστώ"],
  ])("%s highlights the Greek word %s", (query, expected) => {
    const [range] = greekMatches(text, query, { greeklish: true });
    expect(range).toBeDefined();
    expect(text.slice(range.start, range.end)).toBe(expected);
  });

  test("works in the other direction too, Greek query against greeklish text", () => {
    expect(
      greekSearch("to 3enodoxeio", "ξενοδοχείο", { greeklish: true })
    ).toBe(true);
  });
});

describe("greekCompare", () => {
  test("sorts Greek correctly where the default sort does not", () => {
    expect(["Ω", "Α", "Ζ", "ά", "Β"].sort(greekCompare)).toEqual([
      "Α",
      "ά",
      "Β",
      "Ζ",
      "Ω",
    ]);
    expect(["Ω", "Α", "Ζ", "ά", "Β"].sort()).toEqual(["Α", "Β", "Ζ", "Ω", "ά"]);
  });
});

describe("trimAround is no longer a ReDoS", () => {
  test("a long whitespace-free token returns promptly at the documented default", () => {
    // With the old nested (?:\S+\s*){0,N} quantifier this took 642 ms at 34
    // characters and did not finish at 60, using only the documented default
    // numWords and no attacker-supplied pattern.
    const token = "a".repeat(200);
    const text = `start ${token} needle end`;
    const started = Date.now();
    expect(trimAround(text, /needle/g, 8)).toContain("needle");
    expect(Date.now() - started).toBeLessThan(250);
  });
});
