# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@heypano/greek-search` is a small, zero-runtime-dependency npm package for searching **modern** Greek text: it ignores accents, final sigma, decomposed input and look-alike characters, and optionally matches greeklish.

Polytonic/ancient Greek is explicitly out of scope. The only Greek Extended codepoints handled are the oxia forms, which `NFC` folds onto ordinary tonos for free.

## Commands

```bash
npm test                       # jest (ts-jest) over src/**/*.test.ts
npx jest src/fold.test.ts      # single test file
npx jest -t "oxia"             # single test by name
npm run typecheck              # tsc -p tsconfig.typecheck.json (noEmit, includes tests)
npm run lint                   # typecheck (prelint) then eslint on src
npm run lint-fix               # eslint --fix
npm run build                  # lint (prebuild) then rollup -> dist CJS + ESM
```

## Architecture

`foldGreek` is the core primitive; everything else is built on it. The old approach - using each character class as both the search pattern and its own replacement, in a sequential `replace` loop - is gone from the search path, because it was re-entrant (a class inserted early was input to every class that ran after it) and because a character class is one-to-one and so cannot express `ου` to `u`.

Pipeline, in order, all in `src/fold.ts`:

1. **Homoglyphs** (`src/homoglyphs.ts`) - script-gated projection of Latin/Cyrillic look-alikes onto Greek. Runs **first, on cased text**, because case carries the signal: `Β`/`B` are look-alikes, `β`/`b` are not. Length preserving, so it cannot disturb the offset map.
2. **Letterforms** (`src/letterforms.ts`) - lunate sigma, symbol variants, maths Greek.
3. **`NFC`** - folds oxia onto tonos via singleton canonical decompositions.
4. **`NFD`, strip `U+0300-U+036F`, `NFC`** - removes tonos and dialytika. Stripping the whole range rather than relying on `NFC` is what repairs pre-10.3 Mac OS text, which encoded tonos as `U+030D`.
5. **Lowercase** (unless `caseSensitive`), then `ς` to `σ` in both case modes.

`foldGreekWithMap` returns the same fold plus a `map` with one more entry than the key, where `map[i]` is the source offset of `key[i]` and `map[key.length]` is the source length. The source range for a key slice `[i, j)` is exactly `[map[i], map[j])`, which is what lets `greekMatches` return offsets into the original accented text.

`src/greeklish.ts` sits on top: Greek to key is a **function** (one reading), greeklish to key is a **relation** (the query fans out into a bounded candidate set, and the text resolves the ambiguity). The key alphabet is deliberately one character per sound (`8` theta, `y` psi, `c` tau-sigma, `j` tau-zeta); multi-character symbols leak across boundaries during substring search. All three transliteration conventions - phonetic, visual, keyboard - are supported together, because users mix them within one word.

`src/search.ts` composes the maps and does the matching. `src/regex.ts` keeps the deprecated `getRegExp`/`getRegExpContent` working, rebuilt as a single pass so classes can no longer corrupt each other.

## Non-obvious constraints

- **Never normalize with `NFKC`.** `U+0384 GREEK TONOS` has the compatibility decomposition `<compat> 0020 0301`, so `NFKC` splits Greek ordinals in two: `"ΦΕΚ Α΄ 251"` becomes `"φεκ α  251"`. Ordinals saturate Greek legal and historical text. `src/letterforms.ts` gates on the codepoint *first* and only then applies `NFKC` to that single character, so it structurally cannot reach `U+0384`. There is a test asserting ordinals survive.
- **Never derive the uppercase character classes with `toLocaleUpperCase()`.** Greek case mapping is not length preserving: `ΐ` and `ΰ` have no precomposed uppercase, so uppercasing decomposes them and leaks bare combining marks into the class. That, plus the re-entrant replace loop, is what made case-sensitive search silently return `false` for every query containing an uppercase iota. The uppercase classes in `src/conversions.ts` are written by hand.
- **Do not use `confusables.txt` for homoglyphs.** Greek `σ` and `ο` share the prototype `o`, and Greek capital iota is confusable with the digit `1`.
- **`\b` is ASCII only** and useless for Greek (`/\bαλλος\b/.test("αλλος")` is `false`). `wholeWord` checks `\p{L}\p{N}_` around the offsets instead.
- `trimAround` walks offsets rather than wrapping the pattern in `(?:\S+\s*){0,N}`. That nested quantifier was a real ReDoS at the documented default `numWords`, with no attacker-supplied regex.

## Testing

Every Greek fixture in the original suite was the word `ΆλλοΣ`, which contains no iota, no upsilon, no NFD, no oxia, no digraph and no homoglyph - which is exactly how the uppercase-iota bug survived to production. `src/search.test.ts` now loops every letter and a word list through both case modes. Keep that habit: a new fold rule needs a fixture that the old fixtures could not have caught.

## Gotchas

- `tsconfig.json` is the **build** config (emits declarations, `types: []` so jest globals never leak into published `.d.ts`). `tsconfig.typecheck.json` is `noEmit` and includes tests; jest and `npm run lint` both use it. Do not give `tsc` an `outDir` of `dist` again - a bare `tsc` used to overwrite the rollup bundle with unloadable ESM.
- `lib` must stay at `ES2020` or later: `String.prototype.matchAll` is ES2020.
- The rollup config mirrors every `dist/*.d.ts` to `.d.mts` and rewrites relative specifiers to add `.mjs`, because `.d.mts` is resolved with ESM rules where extensionless relative imports are an error.
- `escape-string-regexp` is a **devDependency**: it is ESM only and gets inlined into both bundles, so consumers must never install it.

## Releases

CircleCI runs lint, test, build, then `npx semantic-release` on every push. Per `.releaserc.json` the rules are non-standard: **`feat` triggers a MAJOR bump**, while `fix` and `chore` are patches. Prefer `fix:` unless a major is genuinely intended. `main` is the release branch; `development` publishes prereleases.
