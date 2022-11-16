import { getRegExpContent, greekSearch } from "./index";

let input = "";
let match = "";
let output = false;

describe("Greek Search Tests", () => {
  test("Case Sensitive", () => {
    input = "Κάποιος ΆλλοΣ";
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
    input = "Κάποιος ΆλλοΣ";
    match = "ΑλλοΣ";
    output = greekSearch(input, match);
    expect(output).toBe(true);
    match = "Άλλός";
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
    match = "γιατρός";
    output = greekSearch(input, match, true, extraConversions);
    expect(output).toBe(true);

    match = "ΓΙΑΤΡΟΣ";
    output = greekSearch(input, match, true, extraConversions);
    expect(output).toBe(false);
  });
});
