import { foldGreek } from "./fold";
import { greekKey, greeklishKeys, MAX_KEYS_CEILING } from "./greeklish";

const key = (s: string) => greekKey(foldGreek(s));

describe("greekKey", () => {
  test("is deterministic for Greek and collapses the ambiguous vowels", () => {
    expect(key("γιατρός")).toBe("giatros");
    expect(key("Θεσσαλονίκη")).toBe("8essaloniki");
    expect(key("ξενοδοχείο")).toBe("xenodoxio");
    expect(key("ευχαριστώ")).toBe("evxaristo");
    expect(key("αυτοκίνητο")).toBe("avtokinito");
    expect(key("παπούτσια")).toBe("papucia");
  });

  test("merges the vowels that greeklish cannot distinguish", () => {
    // η, ι, υ, ει, οι all say "i"; ο and ω both say "o".
    expect(key("ήλιος")).toBe(key("ίλιος"));
    expect(key("ώρα")).toBe(key("όρα"));
  });
});

describe("greeklishKeys", () => {
  // One entry per convention, per the LREC taxonomy. Users mix all three.
  const words: Array<[string, string[]]> = [
    ["γιατρός", ["giatros", "giatrws", "giatroc"]],
    ["Θεσσαλονίκη", ["thessaloniki", "8essalonikh", "uessalonikh"]],
    ["ξενοδοχείο", ["ksenodoxeio", "3enodoxeio", "jenodoxeio"]],
    ["ευχαριστώ", ["efxaristo", "euxaristw", "eyxaristv"]],
    ["αυτοκίνητο", ["aftokinito", "autokinhto", "aytokinhto"]],
    ["ώρα", ["ora", "wra", "vra"]],
    ["ψάρι", ["psari", "4ari", "cari"]],
  ];

  test.each(words)(
    "%s is reachable from all three conventions",
    (greek, forms) => {
      const target = key(greek);
      for (const form of forms) {
        expect([form, greeklishKeys(foldGreek(form))]).toEqual([
          form,
          expect.arrayContaining([target]),
        ]);
      }
    }
  );

  test("a Greek query yields exactly its own key", () => {
    expect(greeklishKeys(foldGreek("γιατρός"))).toEqual(["giatros"]);
  });

  test("fan-out stays bounded", () => {
    const keys = greeklishKeys(foldGreek("ypologistis"));
    expect(keys.length).toBeLessThanOrEqual(64);
    expect(keys).toContain(key("υπολογιστής"));
  });

  test("respects an explicit cap and the hard ceiling", () => {
    expect(greeklishKeys(foldGreek("yyyyyyyyyy"), 5)).toHaveLength(5);
    expect(
      greeklishKeys(foldGreek("yyyyyyyyyyyyyy"), 10_000).length
    ).toBeLessThanOrEqual(MAX_KEYS_CEILING);
  });

  test("the most likely reading comes first", () => {
    expect(greeklishKeys(foldGreek("giatros"))[0]).toBe("giatros");
  });
});
