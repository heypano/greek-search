# `@heypano/greek-search` - architectural and code review

Scope: everything except Greek-language semantics. Accents, diacritics, tonos/oxia,
Unicode normalization, polytonic, sigma variants, homoglyphs, greeklish, stemming and
collation were explicitly out of scope and are handed off at the bottom of this file.

Baseline before any change:

```
$ npm run lint   -> exit 1   (1 eslint error, 4 warnings)
$ npm test       -> exit 0   (10 tests, 3 suites - one of them a compiled artifact under dist/)
$ npm run build  -> exit 0   (dist/index.js, cjs only)
```

After:

```
$ npm run lint   -> exit 0
$ npm test       -> exit 0   (31 tests, 1 suite)
$ npm run build  -> exit 0   (dist/index.js + dist/index.mjs + .d.ts + .d.mts + sourcemaps)
```

---

## 1. Correctness bugs confirmed and fixed

Every bug below was reproduced by running the built package before touching it, and
each has a regression test in `src/index.test.ts`.

### 1.1 `getRegExp` returns a stateful `g` regex, and `test()` alternates

Reproduced against the old `dist/index.js`:

```
const re = getRegExp("αλλος");
re.test("Κάποιος ΆλΛοΣ")  // true
re.test("Κάποιος ΆλΛοΣ")  // false     <- lastIndex advanced to 13
re.test("Κάποιος ΆλΛοΣ")  // true
```

`greekSearch` itself happened to be safe because `getRegExp` built a fresh instance on
every call, but the trap is real for anyone who follows the README and caches the
expression, and it was one refactor away from breaking `greekSearch`.

**Fix, and why this option:** `getRegExp` keeps `g`. It is the only sensible flag for
its actual job - feeding `trimAround`, `matchAll` and `replace` - and removing it would
be a silent breaking change for iterating callers. Instead `greekSearch` no longer calls
`getRegExp`; it builds its own **non-global** expression from `getRegExpContent`. Both
share a small `getFlags(caseSensitive, global)` helper so the two cannot drift. The `g`
statefulness is now documented in the `getRegExp` JSDoc and in the README.

Public contract unchanged. Non-breaking.

### 1.2 `trimAround` silently dropped all trailing context

This is the biggest behavioural bug in the file and it was not on the original list.

Both context groups used the same shape, `(?:\S+\s*){0,n}`. That shape requires a
non-space character first. The leading group consumes "word + trailing space", so the
position immediately after the match is a **space**, and the trailing group can then
never match a single word:

```
// old build
trimAround("one two three needle four five six", /needle/g, 4)
// "...one two three needle..."      <- four leading words, zero trailing words
```

It only looked correct in the existing tests because there the match is followed by a
comma (`in trouble,`), which is a non-space character.

**Fix:** the trailing group is now mirrored - `(?:\s*\S+){0,n}` (space then word):

```
trimAround("one two three needle four five six", /needle/g, 4)
// "...one two three needle four five six..."
```

Both original `Trim Around` tests still pass unchanged; I verified by hand that the
punctuation in their fixtures makes the two shapes produce identical output there.

**This is a behaviour change** for callers whose matches end at a word boundary: they
now get the trailing context they asked for. It is a `fix:` (patch) under
`.releaserc.json`, not a `feat:`. Flagging it explicitly because output strings change.

### 1.3 `trimAround` lost every flag except `i`

`flags = "g"; if (regex.ignoreCase) flags += "i";` never produced a duplicate or invalid
flag (the hypothesis in the brief), but it **discarded `u`, `v`, `m`, `s`, `d` and `y`**.
Dropping `u` is the dangerous one, because the source is embedded verbatim:

```
// old build
trimAround("alpha \u{1F600} omega", /\p{Emoji_Presentation}/u, 1)
// ""     <- without `u`, `\p{...}` is literal `p{...}` and matches nothing
```

`/^three/m` and `/a.b/s` failed the same way.

**Fix:** `getTrimAroundFlags` starts from `regex.flags`, deletes `y` (a sticky
expression would anchor the scan to `lastIndex` and stop at the first gap - verified:
`/needle/y` used to return only a truncated first hit) and adds `g`. A `Set` guarantees
no duplicates. `u`/`v` can never collide because they cannot coexist on the source.

### 1.4 `numWords` was interpolated unvalidated - silent wrong answers and regex injection

`numWords` is typed `number` but nothing enforced it, and it lands straight in the
pattern. An invalid quantifier is not a syntax error in JS regex - it is silently
reinterpreted as literal text, so the pattern requires the literal characters `{0,-1}`
and matches nothing:

```
// old build, all of these returned "" with no error
trimAround(text, /needle/g, -1)        // ""
trimAround(text, /needle/g, 2.5)       // ""
trimAround(text, /needle/g, NaN)       // ""
trimAround(text, /needle/g, Infinity)  // ""
// and a JS caller could inject:
trimAround(text, /needle/g, "0}|(?:.*")  // SyntaxError: Unterminated group
```

**Fix:** `!Number.isInteger(numWords) || numWords < 0` throws a `TypeError` naming the
argument. This turns four silent wrong answers into a loud error and closes the
injection. It is a behaviour change only for input that was already producing garbage.

### 1.5 The `\{0,${numWords}\}` escaping was harmless but misleading

Proven, not assumed:

```
> const n = 4; `(?:(?:\\S+\\s*)\{0,${n}\})`
'(?:(?:\\S+\\s*){0,4})'
```

`\{` is not a recognised escape in a template literal, so it collapses to `{` and the
quantifier was always real. Had it survived as `\{0,4\}` the function would have matched
nothing. Cleaned up to plain braces and locked with a test
(`the {0,n} quantifier is a real quantifier, not literal braces`).

### 1.6 `(?:...)` grouping of `regex.source` - verified correct

The source was already wrapped, and it matters. Test
`a top level alternation in the source is grouped` pins it: ungrouped,
`/needle|four/` would read as `(?:\S+\s*){0,1}needle` OR `four(?:\s*\S+){0,1}` and each
branch would pick up context on one side only. No change needed.

### 1.7 Input validation was inconsistent - crash on one side, nonsense coercion on the other

Defaults only apply to `undefined`, so `null` fell through:

```
// old build
greekSearch(null, "a")   // false           (via String(null) === "null")
greekSearch("a", null)   // TypeError: Cannot read properties of null
greekSearch(123, "2")    // true            (silently searched the string "123")
trimAround("abc", null)  // TypeError: Cannot read properties of null
```

**Fix:** `null` is now treated exactly like `undefined` (the empty default) for `text`,
`match`, `extraConversions` and `regex`, so optional fields can be passed straight
through. Any *other* non-string/non-array/non-RegExp value throws a `TypeError` that
names the argument, instead of being coerced. The declared types widened to
`string | null`, so this is additive for TypeScript consumers.

`regex` is checked with `Object.prototype.toString.call(...)` rather than `instanceof`
so it survives cross-realm values (jsdom, `vm`).

### 1.8 Zero-width matches rendered as a bare `......`

```
// old build
trimAround("one two", /.*/g, 4)   // "...one two...\n......"
```

Zero-length matches are now filtered out.

### 1.9 Not fixed, documented instead: `$` in `extraConversions`

`getRegExpContent` uses each conversion string as both pattern **and** replacement, and
`String.prototype.replace` treats `$&`, `$1`, `$$` specially in the replacement. A
caller-supplied conversion containing `$` would therefore be re-expanded rather than
inserted literally. Fixing it means passing a replacer function, which changes what
`extraConversions` means for anyone relying on the current behaviour. Low impact
(a `$` in a conversion is also an end anchor in the pattern, so such a conversion rarely
matches anything) and it edges into the conversion-table semantics owned by the other
agent, so it is recorded here rather than changed.

---

## 2. Packaging - verdict and evidence

### 2.1 The ESM-only dependency does **not** break `require()`

This was the headline suspicion and it turned out to be a non-issue at runtime.
`@rollup/plugin-node-resolve` **inlines** `escape-string-regexp` into the bundle, so the
published CJS file contains the function body and has no `require("escape-string-regexp")`
in it. Verified against a real `npm pack` tarball installed into a scratch consumer:

```
$ node cjs.cjs   ->  CJS require: true
$ node esm.mjs   ->  ESM named import: true
```

The genuine problem was the other direction: because it is bundled but still declared as
a **runtime dependency**, every consumer was forced to install an ESM-only package they
never load:

```
# before
$ ls node_modules
@heypano
escape-string-regexp     <- dead weight

# after
$ ls node_modules
@heypano
```

Moved to `devDependencies`. `package-lock.json` regenerated; the root package now has no
`dependencies` at all. Non-breaking for consumers.

### 2.2 Types resolved, but only by legacy accident

There was no `types` field. `tsc --traceResolution` showed it working anyway through the
`main` -> sibling `.d.ts` fallback, so the README's "TypeScript types exported" claim was
true but undeclared and would break the moment an `exports` map was added.

### 2.3 What was actually wrong

- CJS only. The README advertises browser + ESM. Bundlers got the CJS file, no ESM, no
  tree-shaking, no `sideEffects` hint.
- No `module`, no `exports`, no `types`, no `sideEffects`.
- `prelint` ran a bare `tsc` that **emitted into `dist/`**, dropping `dist/conversions.js`,
  `dist/index.js` (ESM, immediately overwritten by rollup) and `dist/test.test.js` on top
  of the build output. Jest then picked the last one up and ran the scratch test suite a
  second time - visible in the baseline run as `PASS dist/test.test.js`.

### 2.4 What was implemented

Dual output from the existing rollup config - no new toolchain:

| file | purpose |
| --- | --- |
| `dist/index.js` | CJS, historical path, still what `main` points at |
| `dist/index.mjs` | ESM |
| `dist/index.d.ts` / `dist/index.d.mts` | declarations per condition |
| `dist/*.map` | sourcemaps with `sourcesContent` inlined, so they work standalone |

`package.json` now declares `main`, `module`, `types`, `sideEffects: false`,
`engines.node >= 12` (the code needs `Array.prototype.flatMap`, Node 11+) and:

```json
"exports": {
  ".": {
    "import":  { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
    "require": { "types": "./dist/index.d.ts",  "default": "./dist/index.js" }
  },
  "./package.json": "./package.json"
}
```

A ~10 line inline rollup plugin mirrors `*.d.ts` to `*.d.mts`. A `banner` carries the
MIT notice for the inlined `escape-string-regexp`, which was previously stripped.

Verified against a freshly packed tarball installed into a clean consumer:

```
node ESM  -> .../dist/index.mjs        (import.meta.resolve)
node CJS  -> .../dist/index.js         (require.resolve)
tsc module=esnext   moduleResolution=node10    OK
tsc module=node16   moduleResolution=node16    OK
tsc module=nodenext moduleResolution=nodenext  OK   (resolved to dist/index.d.mts)
tsc module=esnext   moduleResolution=bundler   OK
tsc module=commonjs moduleResolution=node10    OK
```

`npm pack --dry-run` on the final tree - 10 files, everything the `exports` map points
at is present, nothing stray:

```
dist/conversions.d.mts  dist/conversions.d.ts
dist/index.d.mts        dist/index.d.ts
dist/index.js           dist/index.js.map
dist/index.mjs          dist/index.mjs.map
package.json            README.md
```

---

## 3. Repo hygiene

- **Deleted `index.ts` (root).** A v1 leftover (`greekSearch(text) { return text; }`).
  `tsconfig` only includes `src`, and a repo-wide grep found no reference to it.
- **Deleted `build/`.** It *was* tracked in git (three files from commit `c850ae6`,
  "published version 1 (does nothing)") - the compiled output of the root stub above.
  Also added `build` to `.gitignore`, which only had `dist`.
- **Deleted `src/test.test.js`.** An unrelated coding exercise: a fully commented-out
  `promisify` suite plus a `solution()` string-chunker whose only test was
  `test("", () => { console.log(...) })`. No assertions, no relation to the package.
  It was staged; unstaged and removed.
- **Cleaned `src/index.test.ts`.** Removed the same exported `promisify` helper and the
  empty `test("s", () => {})` - the latter was the single error that made
  `npm run lint` exit 1 at baseline. The six Greek assertion tests are untouched.
- Removed a stray `heypano-greek-search-2.0.9.tgz` left in the root by `npm pack`.

---

## 4. Testing

31 tests, up from 10 (of which two suites were the scratch file counted twice). Written
failing first, watched fail, then fixed - three of my initial expectations were wrong and
the implementation was right, so the expectations were corrected to the hand-derived
values with a comment explaining each.

New coverage, all non-linguistic:

- regex statefulness across repeated calls; `getRegExp` still global, `greekSearch` stable
- empty text / empty match / no match
- `null` and `undefined` on every parameter
- non-string input throwing `TypeError`
- regex-special characters in the match (`.*+?^$|()[]{}\-`)
- `trimAround` with `numWords = 0`, matches at the very start and very end
- `addEllipses = false`
- flag preservation (`u`, `m`, `s`, `i`, `y`) and `g` injection
- alternation grouping, real-quantifier proof, zero-width match filtering
- invalid `numWords` and invalid `regex` throwing
- `trimAround` composing with `getRegExp`

The existing Greek assertions were kept verbatim to lock current behaviour in.

`jest.config.js`:
- added `roots: ["<rootDir>/src"]` so compiled artifacts under `dist/` are never collected
- dropped `preset: "ts-jest"`. Jest **merges** a preset's `transform` with the local one,
  so the preset's `^.+\.tsx?$` entry (which has no `tsconfig` option) won over the
  explicit entry and the tests could not see the jest globals. This cost a debugging
  cycle and is now a comment in the file and a note in `CLAUDE.md`.
- `transformIgnorePatterns` for `escape-string-regexp` kept: it is still ESM-only and
  still needs transforming for the test run.

---

## 5. TypeScript and lint

- **Split the tsconfigs.** `tsconfig.json` is now build-only (`types: []`, excludes
  tests, still what rollup uses for declarations). New `tsconfig.typecheck.json` extends
  it with `noEmit: true`, `types: ["node", "jest"]` and no `exclude`. `prelint` runs
  `npm run typecheck` instead of a bare `tsc`, so tests are type-checked **and** nothing
  is emitted into `dist/`. Verified by planting a deliberate type error in a test:

  ```
  src/index.test.ts(301,7): error TS2322: Type 'string' is not assignable to type 'number'.
  ```

- **`target: es2016` was a lie.** `conversions.ts` uses `Array.prototype.flatMap`, which
  is ES2019. It only compiled because `types: ["node", "jest"]` pulled in `@types/node`,
  whose `/// <reference lib="es2020" />` silently widened the lib. Proven by isolating it:

  ```
  conv.ts(12,49): error TS2550: Property 'flatMap' does not exist on type 'string[]'.
                  Try changing the 'lib' compiler option to 'es2019' or later.
  ```

  Now `target: "es2019"`, `lib: ["ES2019"]`. This declares what the code already
  required at runtime; it is not a support regression. `module: ES2020` is fine - rollup
  consumes the modules and emits both formats itself.

- `@types/node` was being used but was not a declared devDependency (it came in
  transitively). Declared it.

- Public API typing: explicit return types on all four exported functions,
  `conversions` narrowed to `readonly string[]`, `extraConversions` widened to
  `readonly string[] | null`. `trimAround`'s `regex` parameter was already inferred
  usefully as `RegExp` from the `/.*/ ` default; it is now explicit.
  `@typescript-eslint/explicit-function-return-type` is left off as intended - the
  return types are written by hand on the public surface only.

- `readonly string[]` on `conversions` is a **type-only** narrowing. Anyone who was
  mutating the exported array would now see a compile error. Runtime is unchanged and
  mutating it was never supported.

---

## 6. Docs

`README.md`:
- install section documents dual ESM/CJS and "no runtime dependencies"
- `trimAround` added to the method list, along with `conversions`
- `numWords` default corrected from `8` to `4` (the README was left behind by
  `fix: default to 8 words` -> `fix: back to 4`)
- `getRegExpContent`'s signature block said `getRegExp(...)` - fixed
- new **Notes** section covering `getRegExp` statefulness and the `null` handling
- stale `yarn rollup && npm publish` footer replaced (semantic-release does this)

`CLAUDE.md`: new **Packaging** section, rewritten **Gotchas**, plus explicit warnings not
to "simplify" `greekSearch` back into `getRegExp` and not to let the build tsconfig emit.
No Greek-linguistic content was added or changed.

---

## 7. Handed off to the Greek-research agent (not touched)

Evidence gathered, deliberately left alone:

1. **`toLocaleUpperCase()` on the character classes corrupts two of them.** `conversions.ts`
   derives the uppercase entries mechanically, but `ΐ` and `ΰ` have no single-codepoint
   uppercase form:

   ```
   "[ιϊίΐ]".toLocaleUpperCase() -> "[ΙΪΊΪ́]"   codepoints: 5b 399 3aa 38a 399 0308 0301 5d
   "[υύϋΰ]".toLocaleUpperCase() -> "[ΥΎΫΫ́]"   codepoints: 5b 3a5 38e 3ab 3a5 0308 0301 5d
   ```

   The class silently gains two bare combining marks (U+0308, U+0301) as independent
   members and contains no uppercase `ΐ`/`ΰ` at all. That is a real matching bug, but the
   right answer depends on normalization policy, so it is theirs.

2. **`"[σς]".toLocaleUpperCase()` is `"[ΣΣ]"`** - a duplicate-member no-op class. Harmless
   today, but it means uppercase final-sigma folding does nothing.

3. **`toLocaleLowerCase()` is called with no locale argument** in `getRegExpContent`, so
   behaviour depends on the host locale. Under `tr`, `"MATI".toLocaleLowerCase()` is
   `"matı"` (dotless), not `"mati"`. Whether to pin a locale (`"el"`) is a language call.

---

## 8. Recommended, not done

- **`.circleci/config.yml` uses `cimg/node:16.14.2`.** Node 16 is end-of-life and the
  declared `engines` floor is much lower. Bumping the image and switching
  `npm install` -> `npm ci` (the lockfile is now in sync) would make CI reproducible. Left
  alone because I cannot run CI to verify.
- **No `LICENSE` file** in the repo despite `"license": "ISC"`.
- **Dependency ages.** `typescript` is pinned to `4.8.3`, eslint 8 / `@typescript-eslint` 5
  / prettier 2 / semantic-release 19 are all a major or more behind. A separate upgrade
  pass, not a review fix.
- **`getRegExpContent`'s replace loop is O(conversions) passes over the pattern** and
  rewrites text it has already inserted, which is what makes `extraConversions` expand.
  It works and the tests depend on it, but a single-pass character-map would be both
  faster and easier to reason about. Restructuring it touches conversion semantics, so it
  belongs to whoever owns those.
