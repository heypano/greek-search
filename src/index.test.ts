import { greekSearch } from "./index";

const result = greekSearch("bla");
console.log(result);
describe("Greek Search Tests", () => {
  test("bla", () => {
    const input = "bla";
    const output = greekSearch(input);
    expect(output).toBe(input);
  });
});
