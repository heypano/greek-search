import { greekSearch } from "./index";

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
});
