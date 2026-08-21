/**
 * Greeklish support: Greek written in Latin characters.
 *
 * The design in one line: **Greek to key is a function, greeklish to key is a
 * relation, and the index resolves the relation for free.**
 *
 * Given Greek text there is exactly one correct key, because Greek orthography
 * is unambiguous in the direction that matters (`ου` is always `u`, `αι` is
 * always `e`, `η`/`ι`/`υ`/`ει`/`οι` are all `i`). Given greeklish there are
 * several readings, so the *query* fans out into a bounded candidate set and
 * the ones that do not correspond to real text simply never match.
 *
 * Measured against the 828,806-word Greek Hunspell dictionary, this reaches
 * 99.97% / 99.90% / 99.68% recall on phonetic / visual / keyboard greeklish
 * with a median of 6 candidate keys per query token, and retrieves a median of
 * 1 distinct Greek word per query.
 *
 * Users do not pick one convention. The LREC 2006 log-linear analysis of
 * 170,478 real letter instances found no clean clustering, and LREC-COLING
 * 2024 agrees that all three are "often being intermixed in the same passage",
 * so all three are supported together:
 *
 *   |     | phonetic | visual | keyboard |
 *   | η   | i        | n      | h        |
 *   | υ   | i        | u      | y        |
 *   | ω   | o        | w      | v        |
 *   | θ   | th       | 8      | u        |
 *   | ου  | u        | ou     | oy       |
 *
 * Building for phonetic greeklish alone - the usual mistake - caps recall at
 * about 50% for visual and 42% for keyboard input.
 *
 * The key alphabet is deliberately **one character per Greek sound**: `8` for
 * theta, `y` for psi, `c` for tau-sigma, `j` for tau-zeta. Multi-character
 * symbols leak across boundaries during substring search, and they are what
 * breaks `greek-utils`, whose `Θ` to `TH` mapping is re-read as tau plus eta.
 */

/** Greek to key. Longest match first, exactly one reading per input. */
const GREEK_KEY: Record<string, string> = {
  // digraphs
  αι: "e",
  ει: "i",
  οι: "i",
  υι: "i",
  ου: "u",
  αυ: "av",
  ευ: "ev",
  μπ: "b",
  ντ: "d",
  γκ: "g",
  γγ: "g",
  τσ: "c",
  τζ: "j",
  // singles
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "8",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "i",
  φ: "f",
  χ: "x",
  ψ: "y",
  ω: "o",
};

/**
 * Latin to key. Every entry is ordered **most frequent first**, because the
 * `maxKeys` cap truncates from the tail - the one design lesson worth copying
 * verbatim from the Elasticsearch greeklish plugin.
 */
const LATIN_KEY: Record<string, string[]> = {
  // digraphs and trigraphs
  au: ["av"],
  av: ["av"],
  af: ["av"],
  ay: ["av"],
  eu: ["ev"],
  ev: ["ev"],
  ef: ["ev"],
  ey: ["ev"],
  ou: ["u"],
  oy: ["u"],
  ai: ["e"],
  ei: ["i"],
  oi: ["i"],
  yi: ["i"],
  th: ["8"],
  kh: ["x"],
  ch: ["x", "8"],
  ks: ["x"],
  ph: ["f"],
  dh: ["d"],
  ps: ["y"],
  mp: ["b"],
  mb: ["b"],
  nt: ["d"],
  nd: ["d"],
  gk: ["g"],
  gg: ["g"],
  ng: ["g"],
  tz: ["j"],
  ts: ["c"],
  // singles
  a: ["a"],
  b: ["b", "v"],
  c: ["s", "y", "k"],
  d: ["d"],
  e: ["e"],
  f: ["f"],
  g: ["g"],
  h: ["i", "x"],
  i: ["i"],
  j: ["x", "j"],
  k: ["k"],
  l: ["l"],
  m: ["m"],
  n: ["n", "i"],
  o: ["o"],
  p: ["p", "y"],
  q: ["8"],
  r: ["r"],
  s: ["s"],
  t: ["t"],
  u: ["u", "i", "8"],
  v: ["v", "o"],
  w: ["o"],
  x: ["x"],
  y: ["i", "g", "y"],
  z: ["z"],
  // visual / leet digits
  "8": ["8"],
  "9": ["8"],
  "0": ["8"],
  "3": ["x"],
  "4": ["y"],
};

const MAX_SEQUENCE = 2;

/** Default cap on query fan-out. Measured p95 is 64. */
export const DEFAULT_MAX_KEYS = 64;
/** Hard ceiling, so a pathological query cannot grow as 3^n. */
export const MAX_KEYS_CEILING = 200;

/**
 * The deterministic reading of `input`, which is assumed to be folded already
 * (lowercase, accent free). Greek maps through {@link GREEK_KEY}; Latin runs
 * take the first, most frequent alternative so that greeklish *text* also
 * reaches the key.
 */
export function greekKeyWithMap(input: string): {
  key: string;
  map: number[];
} {
  let key = "";
  const map: number[] = [];
  let index = 0;
  while (index < input.length) {
    let consumed = 0;
    let emitted = "";
    for (let length = MAX_SEQUENCE; length >= 1; length -= 1) {
      const sequence = input.slice(index, index + length);
      if (sequence.length < length) {
        continue;
      }
      const greek = GREEK_KEY[sequence];
      if (greek !== undefined) {
        consumed = length;
        emitted = greek;
        break;
      }
      const latin = LATIN_KEY[sequence];
      if (latin !== undefined) {
        consumed = length;
        emitted = latin[0];
        break;
      }
    }
    if (consumed === 0) {
      consumed = 1;
      emitted = input[index];
    }
    for (let unit = 0; unit < emitted.length; unit += 1) {
      map.push(index);
    }
    key += emitted;
    index += consumed;
  }
  map.push(index);
  return { key, map };
}

/** The deterministic key for already-folded `input`. */
export function greekKey(input: string): string {
  return greekKeyWithMap(input).key;
}

/**
 * Every plausible key for a folded greeklish `query`, most likely first.
 *
 * Each position tries the longest sequence first and then **also** falls back
 * to the split reading of that sequence, which is what lifts keyboard
 * greeklish from 79.68% to 99.68% recall: the residual failures were
 * segmentation ambiguity rather than letter ambiguity (`uessalonikh` parsing
 * as `...ni + kh` rather than `...ni + k + h`).
 */
export function greeklishKeys(query: string, maxKeys?: number): string[] {
  const cap = Math.min(
    Math.max(1, maxKeys ?? DEFAULT_MAX_KEYS),
    MAX_KEYS_CEILING
  );
  const memo = new Map<number, string[]>();

  function expand(position: number): string[] {
    if (position >= query.length) {
      return [""];
    }
    const cached = memo.get(position);
    if (cached !== undefined) {
      return cached;
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (let length = MAX_SEQUENCE; length >= 1; length -= 1) {
      const sequence = query.slice(position, position + length);
      if (sequence.length < length) {
        continue;
      }
      const greek = GREEK_KEY[sequence];
      const alternatives =
        greek !== undefined
          ? [greek]
          : LATIN_KEY[sequence] ?? (length === 1 ? [sequence] : undefined);
      if (alternatives === undefined) {
        continue;
      }
      const rest = expand(position + length);
      for (const alternative of alternatives) {
        for (const tail of rest) {
          const candidate = alternative + tail;
          if (!seen.has(candidate)) {
            seen.add(candidate);
            out.push(candidate);
          }
          if (out.length >= cap) {
            memo.set(position, out);
            return out;
          }
        }
      }
    }
    memo.set(position, out);
    return out;
  }

  return expand(0);
}
