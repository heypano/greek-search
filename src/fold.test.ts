import { foldGreek, foldGreekWithMap } from "./fold";

describe("foldGreek", () => {
  test("folds the cases the research report verified", () => {
    const cases: Array<[string, string]> = [
      ["Κάποιος άλλος".normalize("NFD"), "καποιοσ αλλοσ"],
      ["άλλος", "αλλοσ"],
      ["α̍", "α"], // pre-10.3 Mac OS encoded tonos as U+030D
      ["ΙΑΤΡΟΣ", "ιατροσ"],
      ["ΟΔΟΣ", "οδοσ"],
      ["Μαΐου", "μαιου"],
      ["ΟΔΟϹ", "οδοσ"], // capital lunate sigma
      ["KAΛO", "καλο"], // Latin K, A, O against Greek lambda
      ["Oδύσσεια", "οδυσσεια"], // Latin capital O opening a Greek word
      ["\u{1d6a8}\u{1d6c2}", "αα"], // maths Greek bold capital + small alpha
    ];
    for (const [input, expected] of cases) {
      expect([input, foldGreek(input)]).toEqual([input, expected]);
    }
  });

  test("oxia folds onto tonos", () => {
    expect(foldGreek("άλλος")).toBe("αλλοσ");
    expect(foldGreek("ά")).toBe(foldGreek("ά"));
  });

  test("keeps Greek ordinals intact - the reason NFKC is not used", () => {
    expect(foldGreek("ΦΕΚ Α΄ 251")).toBe("φεκ α΄ 251");
    expect(foldGreek("Μακάριος Γ΄")).toBe("μακαριοσ γ΄");
    expect(foldGreek("ΦΕΚ Α΄ 251").split(/\s+/)).toHaveLength(3);
  });

  test("the homoglyph gate does not fire on single-script tokens", () => {
    const untouched = ["OK", "TV", "iPhone", "HOTEL", "ΒΗΜΑGAZINO", "Η2Ο"];
    for (const s of untouched) {
      const folded = foldGreek(s, {
        caseSensitive: true,
        accentSensitive: true,
      });
      expect([s, folded]).toEqual([s, s]);
    }
  });

  test("homoglyphs fold before lowercasing, where the signal lives", () => {
    expect(foldGreek("Bήτα")).toBe("βητα"); // Latin B -> Greek Β
    // Lowercase Latin b is genuinely not a homoglyph of β, so it must not fold.
    expect(foldGreek("bήτα")).toBe("bητα");
  });

  test("respects accentSensitive and caseSensitive", () => {
    expect(foldGreek("Άλλος", { accentSensitive: true })).toBe("άλλοσ");
    expect(foldGreek("Άλλος", { caseSensitive: true })).toBe("Αλλοσ");
  });
});

describe("foldGreekWithMap", () => {
  test("maps folded offsets back onto the original text", () => {
    const text = "Ο γιατρός Παπαδάτος";
    const { key, map } = foldGreekWithMap(text);
    expect(key).toBe("ο γιατροσ παπαδατοσ");
    const start = key.indexOf("γιατροσ");
    expect(text.slice(map[start], map[start + 7])).toBe("γιατρός");
  });

  test("maps back correctly when the source is decomposed", () => {
    const text = "Ο γιατρός".normalize("NFD");
    const { key, map } = foldGreekWithMap(text);
    const start = key.indexOf("γιατροσ");
    expect(text.slice(map[start], map[start + 7]).normalize("NFC")).toBe(
      "γιατρός"
    );
  });

  test("map has one more entry than the key and ends at the source length", () => {
    const text = "Μαΐου 2024";
    const { key, map } = foldGreekWithMap(text);
    expect(map).toHaveLength(key.length + 1);
    expect(map[key.length]).toBe(text.length);
  });
});
