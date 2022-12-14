import { greekSearch, trimAround } from "./index";

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
