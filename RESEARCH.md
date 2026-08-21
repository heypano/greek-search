# `@heypano/greek-search` - deep research report

Scope: **modern Greek only.** Polytonic / ancient Greek is explicitly out of scope and is not
recommended anywhere in this document. Two Greek Extended codepoint families still appear, but
only as *defensive normalization* concerns for modern text (oxia, section 3.2) and as an optional
fold (lunate sigma, section 3.6).

## Methodology and what "confirmed" means

Everything labelled **CONFIRMED** below was executed. Unless stated otherwise the code under test is
the **published npm artifact**, obtained with `npm pack @heypano/greek-search@latest` (version 2.0.9,
`dist/index.js`, CommonJS, `escape-string-regexp` bundled inline), running on **Node v26.5.0 with
full ICU 78.3**, default locale `en-US`. Scripts live in the session scratchpad.

The working tree was being edited by another session while this research ran. Where the working tree
differs from 2.0.9 I re-ran the repro against a CommonJS compile of the current `src/` and say so
explicitly. `src/conversions.ts` was **unchanged** throughout, and it is the source of the two worst
bugs, so those apply to both.

Anything labelled **SUSPECTED** was not executed end to end.

Section 4's greeklish numbers come from two independent measurement runs: a small hand-built
prototype I wrote and ran myself (`scratchpad/gl*.js`, 40 curated Greek/greeklish pairs), and a
dictionary-scale run over the full 828,806-word Greek Hunspell word list carried out as part of the
literature review for this report. Where the two disagree I say so and defer to the dictionary-scale
numbers, because my curated set turned out to be skewed toward phonetic greeklish (see 4.4).

The same applies to the prevalence figures in 3.2, 3.8 and 3.9 (NFD pages, mixed-script tokens, oxia
occurrences): those come from a live scan of a few dozen Greek sites done for this report, not from a
published corpus study, and are flagged as order-of-magnitude evidence in section 8. Every *behavioural*
claim about Unicode - what NFC, NFD and NFKC actually do to a given string - I ran myself.

Two recommendations in this report were **reversed** during the research after being checked against
data: `NFKC` went from "use it behind a flag" to "do not use it" (3.6), and homoglyph folding went
from "ship it off by default" to "ship it on, gated" (3.8). Both reversals are marked in place.

---

## 1. Executive summary - the five things that matter, ranked

### 1. Case-sensitive search silently returns `false` for any query containing `Ι`, `Ί`, or `Ϊ`

Not "slightly wrong" - completely broken, with no error. `greekSearch("ΙΑΤΡΟΣ", "ΙΑΤΡΟΣ", true)` is
`false`. Seven of eleven ordinary uppercase Greek words I tried fail to match themselves. The cause
is a re-entrancy hazard in the conversion loop (section 2.1). The existing test suite never catches
it because every fixture is the word `ΆλλοΣ`, which happens to contain no iota. **Still present in
the working tree.**

### 2. The library has no Unicode normalization step at all, so decomposed input is not just missed - it is corrupted

If either side of the comparison is NFD - and a live scan of Greek sites found NFD content on **2.3%
of pages**, `cnn.gr`'s homepage among them - a combining `U+0301` or `U+0308` in the query gets swallowed
by the uppercase conversion classes and turned into nested character classes. The generated regex is
still syntactically valid in non-`u` mode, so it fails silently rather than throwing (section 2.2).
A single `.normalize("NFC")` on both sides would eliminate this entire class of bug.

### 3. Greeklish is the highest-value missing feature, and there is a bounded design that works

Naive Greek-to-greeklish expansion produces 4 to 64 variants per word, which is why people assume it
is impractical. It is not, if you pick the right direction: **fold both sides to a lossy key, keep the
Greek side deterministic (exactly one key per word), and put all the ambiguity on the query side**.
Measured on the full 828,806-word Greek Hunspell dictionary, that design reaches **99.7 to 99.97%
recall** across all three greeklish conventions, at a median of 6 candidate keys per query token, and
it retrieves a **median of 1 and a p99 of 4** spurious words - because the index itself does the
disambiguation as a hash lookup, with no dictionary or language model needed (section 4.4). It also
preserves offsets, so highlighting still points at the original Greek text.

### 4. The regex-generation primitive is the wrong core abstraction; `normalize()` should be the core and the regex should be built on top

The `replace(new RegExp(c), c)` trick - using each conversion as both pattern and replacement - is
the direct cause of bugs 1 and 2, cannot express greeklish digraphs (`ου` to `u` is many-to-one, and
character classes only do one-to-one), cannot be validated under the `u` flag, and is not even
faster. A fold-and-`includes` prototype ran in the same ballpark for one-shot search and roughly
**10x faster when the corpus is pre-folded** (section 5.1). Keep `getRegExp` as a thin convenience
wrapper over the fold, because highlighting genuinely wants a regex.

### 5. `extraConversions` is a raw regex injection hole, and `trimAround` has a real ReDoS with default arguments

`extraConversions` strings go into the `RegExp` constructor unescaped: `[".*"]` makes every query
match everything, and `["("]` throws a `SyntaxError` out of what is documented as a boolean predicate.
Separately, `trimAround`'s `(?:\S+\s*){0,N}` is a classic nested quantifier: with the README's
documented default `numWords = 8` and no attacker-controlled regex at all, a 30 character
whitespace-free token (a URL, a hash, a base64 blob) costs 203 ms, a 34 character one costs 642 ms,
and my "realistic long URL" case never finished in three minutes (section 2.5, 2.6).

---

## 2. Confirmed bugs

### 2.1 CONFIRMED - case-sensitive search is broken for `Ι` / `Ί` / `Ϊ`

**Root cause.** `conversions.ts` builds each uppercase class with `toLocaleUpperCase()`. For the iota
and upsilon classes that is not a one-to-one mapping, because `ΐ` (U+0390) and `ΰ` (U+03B0) have **no
precomposed uppercase form** - Unicode's `SpecialCasing.txt` expands them to a base letter plus two
combining marks. So the bare combining marks `U+0308` and `U+0301` end up as *members of the
character class*:

```
"[ιϊίΐ]".toLocaleUpperCase()
  => "[ΙΪΊΪ́]"   = U+005B U+0399 U+03AA U+038A U+0399 U+0308 U+0301 U+005D
"[υύϋΰ]".toLocaleUpperCase()
  => "[ΥΎΫΫ́]"   = U+005B U+03A5 U+038E U+03AB U+03A5 U+0308 U+0301 U+005D
```

Now the loop bites itself. `[ΙΪΊΪ́]` runs first and inserts its own text into the pattern. Three
iterations later `[ΥΎΫΫ́]` runs; as a *pattern* it matches `U+0308` and `U+0301`, which are now
sitting inside the freshly inserted iota class, and replaces each of them with the whole upsilon
class. The result is nested brackets.

**Reproduction** (published 2.0.9, `scratchpad/exp8.js`, `exp9.js`):

```js
const { greekSearch, getRegExpContent } = require("@heypano/greek-search");

getRegExpContent("ΙΑΤΡΟΣ", true)
// => "[ΙΪΊΙ[ΥΎΫΫ́][ΥΎΫΫ́]][ΑΆ]ΤΡ[ΟΌ][ΣΣ]"

greekSearch("ΙΑΤΡΟΣ", "ΙΑΤΡΟΣ", true)   // => false
```

Read the corrupted fragment as the engine does: `[ΙΪΊΙ[ΥΎΫΫ́]` is a class that ends at the first `]`,
then `[ΥΎΫΫ́]` is a second class, then a **literal `]`**. So the "iota" position now demands three
characters, the last of which is a right square bracket. It can never match Greek text.

Actual output over a word list:

```
greekSearch("ΙΑΤΡΟΣ","ΙΑΤΡΟΣ",true)           = false
greekSearch("ΥΓΕΙΑ","ΥΓΕΙΑ",true)             = false
greekSearch("ΙΩΑΝΝΙΝΑ","ΙΩΑΝΝΙΝΑ",true)       = false
greekSearch("ΜΑΙΟΣ","ΜΑΙΟΣ",true)             = false
greekSearch("ΘΕΣΣΑΛΟΝΙΚΗ","ΘΕΣΣΑΛΟΝΙΚΗ",true) = false
greekSearch("ΠΕΙΡΑΙΑΣ","ΠΕΙΡΑΙΑΣ",true)       = false
greekSearch("ΤΡΙΤΗ","ΤΡΙΤΗ",true)             = false
greekSearch("ΥΨΟΣ","ΥΨΟΣ",true)               = true
greekSearch("ΑΘΗΝΑ","ΑΘΗΝΑ",true)             = true
greekSearch("ΕΛΛΑΔΑ","ΕΛΛΑΔΑ",true)           = true
greekSearch("ΟΔΟΣ","ΟΔΟΣ",true)               = true
```

Scanning the whole uppercase alphabet, exactly `Ι`, `Ί` and `Ϊ` are affected. `Υ` alone is safe only
because no later conversion contains a combining mark - it is luck, not design.

**Re-verified against the working tree** (`scratchpad/cur`): identical output. Still broken.

**Fix.** Do not derive uppercase classes with `toLocaleUpperCase()`. Write them out, or better,
delete the whole conversion-class mechanism per section 5.

### 2.2 CONFIRMED - decomposed (NFD) input produces a corrupted pattern, not just a miss

Same mechanism, reachable from the default case-insensitive path. `scratchpad/exp2.js`:

```js
const nfd = "άλλος".normalize("NFD");   // U+03B1 U+0301 U+03BB U+03BB U+03BF U+03C2

getRegExpContent("άλλος")   // NFC  => "[αά]λλ[οό][σς]"          correct
getRegExpContent(nfd)       // NFD  => "[αά][ΙΪΊΙ[ΥΎΫΫ́][ΥΎΫΫ́]]λλ[οό][σς]"

greekSearch("Κάποιος άλλος", "άλλος")        // => true
greekSearch("Κάποιος άλλος", nfd)            // => false
greekSearch("Κάποιος άλλος".normalize("NFD"), "άλλος")  // => false
```

The bare `U+0301` from the decomposition is caught by the uppercase iota class and expanded, then the
upsilon class expands the marks inside *that*. A decomposed alpha-with-tonos becomes "an alpha,
followed by an iota-ish thing, followed by a `]`".

Two separate defects are stacked here and both need naming:

- **No normalization.** Even with the corruption fixed, NFD query against NFC text would still miss,
  because `α U+0301` is two codepoints and `[αά]` matches one.
- **The corruption itself**, which makes the failure mode worse and much harder to debug.

**Re-verified against the working tree.** Still broken.

### 2.3 CONFIRMED (in 2.0.9) / FIXED in the working tree - `g` flag makes results alternate

`getRegExp` returns a regex with `g`, and 2.0.9's `greekSearch` calls `.test()` on it. `.test()` on a
global regex advances `lastIndex`. `scratchpad/exp3.js` against 2.0.9:

```js
const re = getRegExp("αλλος");     // /[αά]λλ[οό][σς]/gi
const text = "άλλος και άλλος";
re.test(text);   // true   lastIndex = 5
re.test(text);   // true   lastIndex = 15
re.test(text);   // false  lastIndex = 0     <-- same regex, same text
re.test(text);   // true   lastIndex = 5
```

The working tree already fixes `greekSearch` by building a **non-global** regex internally, and
documents the hazard on `getRegExp`. Good fix. But `getRegExp` still hands callers a stateful object
whose most obvious use (`re.test(x)` in a loop, or `array.filter(x => re.test(x))`) is silently
wrong, and that is the exact shape the README encourages. See section 6.1 for the API fix.

### 2.4 CONFIRMED - oxia-bearing modern text never matches

`scratchpad/exp11.js`:

```js
"άλλος"  // U+1F71 U+03BB U+03BB U+03BF U+03C2   (oxia)
"άλλος"  // U+03AC U+03BB U+03BB U+03BF U+03C2   (tonos)

greekSearch(oxiaText,  "αλλος")   // => false
greekSearch(tonosText, "αλλος")   // => true
greekSearch(tonosText, oxiaQuery) // => false

getRegExpContent(oxiaQuery)  // => "άλλ[οό][σς]"  with the first char left as a raw U+1F71
oxiaText.normalize("NFC") === tonosText   // => true
```

Note the last line: **`NFC` already fixes this for free.** All sixteen tonos/oxia pairs verified:

| tonos | oxia | `NFC(oxia) === tonos` |
|---|---|---|
| ά U+03AC | ά U+1F71 | true |
| έ U+03AD | έ U+1F73 | true |
| ή U+03AE | ή U+1F75 | true |
| ί U+03AF | ί U+1F77 | true |
| ό U+03CC | ό U+1F79 | true |
| ύ U+03CD | ύ U+1F7B | true |
| ώ U+03CE | ώ U+1F7D | true |
| Ά U+0386 | Ά U+1FBB | true |
| Έ U+0388 | Έ U+1FC9 | true |
| Ή U+0389 | Ή U+1FCB | true |
| Ί U+038A | Ί U+1FDB | true |
| Ό U+038C | Ό U+1FF9 | true |
| Ύ U+038E | Ύ U+1FEB | true |
| Ώ U+038F | Ώ U+1FFB | true |
| ΐ U+0390 | ΐ U+1FD3 | true |
| ΰ U+03B0 | ΰ U+1FE3 | true |

This is the only reason the Greek Extended block needs to be mentioned at all. It is a defensive
normalization concern, not polytonic support: these sixteen codepoints turn up in modern Greek text
that has been through a bad encoder, and `.normalize("NFC")` unifies every one of them.

### 2.5 CONFIRMED - `extraConversions` is injected into `RegExp` unescaped

`scratchpad/exp5.js`:

```js
greekSearch("hello", "hello", false, ["("]);
// throws SyntaxError: Invalid regular expression: /(/g: Unterminated group

greekSearch("τελείως άσχετο", "γιατρός", false, [".*"]);   // => true
getRegExpContent("γιατρός", false, [".*"]);                // => ".*.*"
```

Two distinct problems:

- A documented `boolean`-returning function **throws** on some inputs. Any app that lets a user
  configure synonyms, or that builds conversions from data, has a crash and a trivially reachable
  denial of service.
- The "conversion is its own replacement" trick means a conversion that matches broadly **eats the
  entire query**. `.*` matched all of `γιατρός` and replaced it with `.*`, so the pattern became
  `.*.*` and everything matches. This is not a contrived string; it is what happens if someone writes
  a conversion slightly too loosely.

**Re-verified against the working tree.** The new argument validation checks that
`extraConversions` is an array, but does not validate or escape its contents. Still exploitable.

### 2.6 CONFIRMED - ReDoS in `trimAround` with default arguments and no user regex

`trimAround` wraps the pattern in `(?:\S+\s*){0,N}`. `\S+` followed by `\s*`, repeated, is a textbook
nested quantifier: on a run of non-whitespace characters with no match, the engine enumerates every
way to partition the run into up to `N` groups. `scratchpad/exp6.js`, no `extraConversions`,
`getRegExp("ζζζζ")` (a pattern that simply does not match):

```
numWords=8  (the README default), single token of 22 chars ->    11 ms
numWords=8,                                     24 chars ->      25 ms
numWords=8,                                     26 chars ->      51 ms
numWords=8,                                     28 chars ->     112 ms
numWords=8,                                     30 chars ->     203 ms

numWords=10, 30-char token ->  1039 ms
numWords=14, 30-char token ->  6815 ms
numWords=16, 30-char token -> 10608 ms
numWords=20, 30-char token -> 12925 ms
```

Cost doubles roughly every two characters. The next case in the script - a realistic sentence
containing a 40 character URL query string, `numWords=12` - **did not complete in three minutes** and
had to be killed.

**Re-verified against the working tree**: 30-char token 197 ms, 34-char token 642 ms. The working
tree changed the trailing group from `(?:\S+\s*)` to `(?:\s*\S+)`, which fixes a real correctness bug
but does nothing for the backtracking.

This is the most dangerous finding for anyone running this server-side, because it needs no
attacker-controlled query at all - only *searched text* that contains a long unbroken token.

**Fix.** Do not do context extraction with a regex. Find the match offsets (which the fold approach
gives you directly), then walk word boundaries outward in plain string code. Linear, and no
backtracking.

### 2.7 CONFIRMED - patterns are not valid under the `u` flag

```js
new RegExp(getRegExpContent("ά".normalize("NFD")), "gu");
// SyntaxError: Invalid regular expression: ... Lone quantifier brackets
```

This matters because `u` is the prerequisite for `\p{Script=Greek}`, `\p{L}` and correct astral
handling - that is, for every Unicode-aware feature in section 6. The current output format is a dead
end for them.

### 2.8 CONFIRMED - half the conversion passes are dead work, and the `i` flag already does their job

In the default case-insensitive path the query is lowercased first, so the eight uppercase classes can
never match a Greek letter. They still run eight `String.replace` passes, and as section 2.2 shows,
the only thing they *do* match is stray combining marks - which is precisely the bug.

Independently, JavaScript's `i` flag already folds sigma correctly, so `[σς]` buys nothing in the
default mode:

```js
/σ/i.test("Σ")     // true
/ς/i.test("Σ")     // true
/[σς]/i.test("Σ")  // true
```

Also, `"[σς]".toLocaleUpperCase()` is `"[ΣΣ]"` - a character class with a duplicate member, which is
harmless but is a clear signal that the derivation is not sound.

### 2.9 SUSPECTED - `toLocaleUpperCase()` with no argument is environment-dependent

`conversions.ts` calls `toLocaleUpperCase()` with no locale, so per spec it uses the **host default
locale**. CLDR's `el` locale strips tonos when uppercasing, which would change the conversion table:

```js
"[αά]".toLocaleUpperCase("el")   // => "[ΑΑ]"     tonos gone, duplicate member
"[αά]".toLocaleUpperCase()       // => "[ΑΆ]"     on this machine
"[ιϊίΐ]".toLocaleUpperCase("el") // => "[ΙΪΙΪ]"
```

If the host locale ever resolved to `el`, `[ΑΆ]` would collapse to `[ΑΑ]` and case-sensitive search
for `ΆΛΛΟΣ` would stop matching `ΑΛΛΟΣ`. **I could not reproduce this on Node 26.5 / ICU 78.3**: with
`LANG=LC_ALL=el_GR.UTF-8`, `Intl.DateTimeFormat().resolvedOptions().locale` did report `el-GR`, but
the no-argument `toLocaleUpperCase()` still returned `[ΑΆ]`. So this is a latent spec-level hazard,
not a demonstrated failure. It should still be removed: a library's behaviour must not depend on the
host locale, and there is no reason to compute this table at runtime at all.

Related, and worth knowing when you write the replacement table:

```js
"Μαΐου".toLocaleUpperCase()      // "ΜΑΪ́ΟΥ"  -> Ϊ + U+0301, per SpecialCasing.txt
"Μαΐου".toLocaleUpperCase("el")  // "ΜΑΪΟΥ"  -> CLDR el drops the tonos
```

---

## 3. Correctness gaps in the accent / normalization model

### 3.1 There is no normalization step, and that is the root of most of this

The single highest-leverage change in the whole report is to normalize both the query and the text
before doing anything else. A `foldGreek` of roughly ten lines fixes bugs 2.2 and 2.4 outright:

```js
function foldGreek(s) {
  return s
    .normalize("NFC")                 // unifies oxia U+1F71.. with tonos U+03AC..,
                                      // and the Greek question mark / ano teleia
    .normalize("NFD")                 // split every accent off its base letter
    .replace(/[\u0300-\u036f]/g, "")  // drop the combining marks (tonos + dialytika)
    .normalize("NFC")
    .toLowerCase()
    .replace(/\u03c2/g, "\u03c3");     // final sigma  \u03c2 -> \u03c3
}
```

**Do not reach for `NFKC` here.** An earlier draft of this report suggested it as an option for folding
lunate sigma and the Mathematical Greek block. That was wrong, and section 3.6 now explains why:
`NFKC` destroys Greek ordinals. Use `NFC` plus an explicit letterform table.

A bonus property of stripping the whole `U+0300-U+036F` range rather than relying on `NFC` alone:
Mac OS X before 10.3 encoded Greek tonos as **`U+030D`** (combining vertical line above), not `U+0301`.
`NFC` cannot repair that data - `"\u03b1\u030d".normalize("NFC")` stays two codepoints - but the fold
above strips `U+030D` along with everything else, so both spellings land on `"α"`. **Verified.**

Measured against the current implementation (`scratchpad/exp10.js`), on the cases where they differ:

| text | query | current | folded |
|---|---|---|---|
| `"Κάποιος άλλος"` NFD | `"αλλος"` | false | **true** |
| `"Κάποιος άλλος"` | `"άλλος"` NFD | false | **true** |
| `"άλλος"` (oxia) | `"αλλος"` | false | **true** |
| `"ΙΑΤΡΟΣ"` | `"ΙΑΤΡΟΣ"` | true (insensitive path) | true |
| `"ΟΔΟΣ"` | `"οδός"` | true | true |
| `"Μαΐου"` | `"ΜΑΙΟΥ"` | true | true |

Note the ordering `NFC` then `NFD` then strip then `NFC`. The leading `NFC` is what folds oxia to
tonos, via Unicode's singleton canonical decompositions - going straight to NFD would also work here,
but doing NFC first makes the intent explicit and keeps the table above true by construction.

### 3.2 Oxia: yes, fold it, and it is free

Covered in 2.4. The recommendation is narrow and cheap: **call `.normalize("NFC")`**. That is the
entire fix. Do not add polytonic character classes; do not touch the Greek Extended block beyond what
NFC does automatically.

Calibration on how much this matters: a scan of Greek sites found oxia at **10 occurrences in 670,846
Greek characters (0.0015%)**, and **all of them on Orthodox church sites**, in ordinary monotonic words
(`πίστη`, `ευκαιρία`, `ανά`). Zero on news, government, university, e-commerce or el.wikipedia. The
likely mechanism is not legacy encodings - ISO 8859-7 `0xDC`, cp1253 and MacGreek `0xC0` all map to
`U+03AC` correctly - but polytonic-to-monotonic conversion that strips breathings and leaves the
Extended-block acute behind.

So oxia is rare. It is still worth fixing because the fix is a single `normalize` call that you need
anyway for section 3.1, not because it is common.

### 3.3 `ΐ` (U+0390) and `ΰ` (U+03B0) have no precomposed uppercase - stop deriving classes from case

This is the mechanical cause of bug 2.1 and is worth stating on its own because it will bite any
future attempt to "just uppercase the table":

```
"[ιϊίΐ]".toLocaleUpperCase()  ->  [ Ι Ϊ Ί Ι U+0308 U+0301 ]     6 members from 4
"[υύϋΰ]".toLocaleUpperCase()  ->  [ Υ Ύ Ϋ Υ U+0308 U+0301 ]     6 members from 4
"[σς]".toLocaleUpperCase()    ->  [ Σ Σ ]                        duplicate
```

Case mapping is not length-preserving in Greek. Any design that assumes it is will be wrong. The fold
approach sidesteps this entirely, because it strips marks *after* decomposition instead of trying to
enumerate precomposed forms.

### 3.4 Final sigma and the `Σ` asymmetry

On this build, `"ΟΔΟΣ".toLowerCase()`, `.toLocaleLowerCase()` and `.toLocaleLowerCase("el")` **all**
returned `"οδος"` with a non-final `σ`, so I did **not** reproduce the classic
`toLowerCase` vs `toLocaleLowerCase("el")` divergence for a word-final `Σ` here. The library is
nevertheless doing the right thing by mapping `ς` and `σ` together - it just does not need a
character class to do it, since `i`-flag case folding already unifies `Σ`/`σ`/`ς` (2.8), and the fold
approach handles it with one `.replace(/ς/g, "σ")` that works in case-sensitive mode too.

The current case-sensitive mode is genuinely incoherent about this. `getRegExpContent("ΟΔΟΣ", true)`
is `"[ΟΌ]Δ[ΟΌ][ΣΣ]"` - a "case-sensitive" search that quietly ignores accent differences but respects
case, which is a combination no user asked for. See 6.6.

### 3.5 Dialytika is handled inconsistently, and case-sensitive mode gets it wrong

`[ιϊίΐ]` folds dialytika together with tonos, which is a defensible product decision for search
(`Μαΐου` should be findable as `μαιου`) even though the two marks mean different things
orthographically. But it is only true in the lowercase path:

```js
greekSearch("ΜΑΪΟΥ", "μαιου")         // => true
greekSearch("ΜΑΪΟΥ", "ΜΑΙΟΥ", true)   // => false   (bug 2.1)
greekSearch("ΜΑΪΟΥ", "Μαΐου", true)   // => false
```

Under the fold, dialytika is just another combining mark and disappears with the rest, so this
becomes consistent for free. If you ever want *strict* dialytika (distinguishing `μαιου` from
`μαΐου`), that should be an explicit option, not an accident of which code path ran.

For reference, `greek-utils@1.3.0`'s `sanitizeDiacritics` **does not** strip dialytika at all -
`sanitizeDiacritics("Μαΐου ϊϋΐΰ")` returns the input unchanged. Verified. Do not delegate to it for
this.

### 3.6 Lunate sigma and symbol letterforms - fold them with an explicit table, NOT with NFKC

```js
greekSearch("ΟΔΟϹ", "οδος")   // => false
```

`ϲ U+03F2` and `Ϲ U+03F9` are not a modern-orthography concern, but they do show up in pasted text
from stylised logos, church and ecclesiastical material, and some display fonts. Every Greek symbol
letterform has a compatibility decomposition, all verified:

| char | codepoint | NFKC | | char | codepoint | NFKC |
|---|---|---|---|---|---|---|
| ϲ | U+03F2 | ς U+03C2 | | ϖ | U+03D6 | π U+03C0 |
| Ϲ | U+03F9 | Σ U+03A3 | | ϰ | U+03F0 | κ U+03BA |
| ϐ | U+03D0 | β U+03B2 | | ϱ | U+03F1 | ρ U+03C1 |
| ϑ | U+03D1 | θ U+03B8 | | ϵ | U+03F5 | ε U+03B5 |
| ϕ | U+03D5 | φ U+03C6 | | 𝚨 | U+1D6A8 | Α U+0391 |

That last row is the Mathematical Alphanumeric Symbols block: `NFKC` maps the entire Greek maths
alphabet back to plain Greek.

**But do not use `NFKC` to get this.** It silently destroys Greek ordinals, which are common in legal,
historical and ecclesiastical text. `U+0384 GREEK TONOS` - the character people actually type for an
ordinal mark - has the compatibility decomposition `<compat> 0020 0301`, so **verified**:

```
"ΦΕΚ Α΄ 251"     NFC  tokens: ["ΦΕΚ", "Α΄", "251"]
                 NFKC tokens: ["ΦΕΚ", "Α", "́", "251"]     <- ordinal split into two tokens
"Φίλιππος Β΄"    NFC  tokens: ["Φίλιππος", "Β΄"]
                 NFKC tokens: ["Φίλιππος", "Β", "́"]

foldGreek("ΦΕΚ Α΄ 251")  with NFC  -> "φεκ α΄ 251"
                         with NFKC -> "φεκ α  251"          <- ordinal gone entirely
```

`ΦΕΚ Α΄ 251`, `Μακάριος Γ΄`, `Β΄ Παγκόσμιος Πόλεμος`, `Φίλιππος Β΄` all lose their ordinal. The proper
keraia `U+0374` fares slightly better but still changes, to `U+02B9`.

**Recommendation: keep `NFC`, and fold the twelve-odd symbol letterforms with an explicit lookup
table.** It is a dozen entries, it is exact, and it cannot surprise you the way a whole compatibility
normalization can.

This is also worth knowing if you index Greek in Elasticsearch: the ICU analysis plugin's
`icu_normalizer` defaults to **`nfkc_cf`**, which has exactly this problem on any Greek corpus
containing ordinals.

### 3.7 Greek punctuation collapses under NFC already

All verified:

| char | name | NFC | NFKC |
|---|---|---|---|
| `;` U+037E | Greek question mark | `;` U+003B | `;` U+003B |
| `·` U+0387 | ano teleia | `·` U+00B7 | `·` U+00B7 |
| `ʹ` U+0374 | numeral sign (keraia) | `ʹ` U+02B9 | `ʹ` U+02B9 |
| `͵` U+0375 | lower numeral sign | unchanged | unchanged |
| `΄` U+0384 | tonos (spacing) | unchanged | space + U+0301 |
| `΅` U+0385 | dialytika tonos (spacing) | unchanged | space + U+0308 + U+0301 |

So the Greek question mark and ano teleia need **no special handling at all** once you normalize -
NFC unifies each with its ASCII/Latin-1 twin. This is a nice, cheap correctness win that the current
implementation misses purely because it never normalizes.

### 3.8 Latin and Cyrillic homoglyphs - implement it, script-gated. The Greek numbers justify it.

This is a real-world problem, not a theoretical one, and there is now measured Greek data behind that
claim. Nothing in the current library helps:

```js
greekSearch("ΚΑΛΟ", "KAΛO")   // => false
//                    ^^  ^   K, A, O are LATIN U+004B U+0041 U+004F; only Λ is Greek
```

**Prevalence, measured on Greek text.** A scan of 69,167 tokens across 13 Greek news and finance sites
found **65 mixed Greek+Latin tokens, or 0.094%** - roughly **60x more frequent than oxia** in the same
corpus. More important than the rate is the shape: these are not legitimate mixed script, they are one
dominant corruption pattern, **a Latin capital opening a Greek word**. Real observed hits:
`Kαθώς`, `Oδύσσεια`, `Xωρίς`, `Tι`, `Aυτή`, `Mε`, `Nόσος`, `Eλένη`, plus Latin `o` inside Greek words
(`στo`, `Ρoή`, `Ισολογισμoί`). `Oδύσσεια` never matches a user typing `Οδύσσεια`.

Confirmed that `Intl.Collator("el", { sensitivity: "base" })` does **not** help -
`compare("οδος", "οδoς")` (Latin `o`) returns `-1`, not `0`. Collation folds accents and case; it does
not fold scripts.

The full confusable set for uppercase Greek, verified codepoint by codepoint:

| Greek | Latin | Cyrillic | | Greek | Latin | Cyrillic |
|---|---|---|---|---|---|---|
| Α U+0391 | A U+0041 | А U+0410 | | Ν U+039D | N U+004E | - |
| Β U+0392 | B U+0042 | В U+0412 | | Ο U+039F | O U+004F | О U+041E |
| Ε U+0395 | E U+0045 | Е U+0415 | | Ρ U+03A1 | P U+0050 | Р U+0420 |
| Ζ U+0396 | Z U+005A | - | | Τ U+03A4 | T U+0054 | Т U+0422 |
| Η U+0397 | H U+0048 | Н U+041D | | Υ U+03A5 | Y U+0059 | У U+0423 |
| Ι U+0399 | I U+0049 | І U+0406 | | Χ U+03A7 | X U+0058 | Х U+0425 |
| Κ U+039A | K U+004B | К U+041A | | | | |
| Μ U+039C | M U+004D | М U+041C | | | | |

Plus lowercase `ο`/`o`/`о`, `α`/`a`/`а`, `ν`/`v`.

**The design, four rules.** Verified prototype:

1. **Gate on mixed script.** Only fold when the token contains at least one Greek *and* one Latin
   character. Single-script tokens are never touched.
2. **Project all or nothing.** If any Latin character in the token is not in the table, fold nothing.
   This is what keeps brand names safe.
3. **Emit as an additional candidate, never replace.** The original spelling must still match itself.
4. **Fold before lowercasing.** Case carries the signal: `Β`/`B` are homoglyphs, `β`/`b` are not.

```js
const hasGreek = s => /\p{Script=Greek}/u.test(s);
const hasLatin = s => /\p{Script=Latin}/u.test(s);

function project(tok) {
  if (!(hasGreek(tok) && hasLatin(tok))) return null;          // rule 1
  const latin = [...tok].filter(c => /\p{Script=Latin}/u.test(c));
  if (!latin.every(c => HOMO[c])) return null;                 // rule 2
  return [...tok].map(c => HOMO[c] ?? c).join("");
}
```

Measured behaviour, every case verified:

```
FIRES:      Kαθώς -> Καθώς      Oδύσσεια -> Οδύσσεια    Xωρίς -> Χωρίς
            Tι -> Τι            Aυτή -> Αυτή            Mε -> Με
            Nόσος -> Νόσος      Eλένη -> Ελένη
            στo -> στο          Ρoή -> Ροή              Ισολογισμoί -> Ισολογισμοί

DOES NOT FIRE:  ΟΚ   OK   TV   iPhone   Η2Ο   HOTEL   Οδύσσεια   ΒΗΜΑGAZINO
```

Every false-positive worry I had is single-script per token and never fires. `ΒΗΜΑGAZINO` is the
interesting one: its Latin run contains `G`, which is not in the table, so rule 2 rejects the whole
token. That is the all-or-nothing rule earning its keep.

Rule 4 matters more than it looks:

```js
project("Bήτα")                // => "Βήτα"    Latin B folds to Greek Β
project("Bήτα".toLowerCase())  // => null      b/β are not homoglyphs, signal lost
```

**Do not use `confusables.txt` or `skeleton()` as the table.** Two disqualifiers, both real: Greek `σ`
and `ο` share the prototype `o`, so a skeleton-based fold would merge two distinct Greek letters; and
Greek capital iota is confusable with the digit `1`. Hand-write the fourteen-row table above instead.

**Revised recommendation.** An earlier draft of this report said to ship this off by default for one
release. The measured Greek numbers, and how cleanly the gate behaves, argue for shipping it **on**,
gated, from the start - it is 60x more common than a problem I am already recommending you fix, and
the failure mode is one-directional recall improvement rather than precision loss.

### 3.9 How much decomposed Greek is actually out there

Worth quantifying, because it decides whether 3.1 is a nice-to-have or a real bug.

- The only large-scale published figure is Google's, reported by Mark Davis: roughly **99.98% of web
  HTML content characters** were already NFC across 700M documents (January 2009). That sounds
  reassuring and is the wrong statistic for an index.
- The number that matters is the **per-document** rate, because one NFD document is one document that
  never matches. A 43-page live scan of Greek sites found NFD content on **2.3% of pages** - including
  `cnn.gr`'s homepage, live, with `μελισσοκομία` and `ξεκινούν` decomposed in a single headline.
- **APFS did not fix this, it froze it.** APFS is normalization-*insensitive* but
  normalization-*preserving*, so NFD filenames inherited from old HFS+ volumes stay NFD indefinitely.
- Worse, Mac OS X before 10.3 used **`U+030D`** rather than `U+0301` for Greek tonos, and Apple's
  TN1150 notes that MacGreek had the largest number of decomposition changes of any encoding. `NFC`
  cannot repair that data. The mark-stripping fold in 3.1 can, and does. **Verified.**
- The HTML spec does **not** require NFC on form submission (there is only a SHOULD about `datalist`
  matching), so you cannot assume a browser hands you normalized query text. Normalize it yourself.

Conclusion: a ~2% page-level miss rate on Greek content, plus an unrepairable legacy variant that only
mark-stripping catches, makes 3.1 a correctness fix rather than a polish item.

## 4. Greeklish - full design recommendation

This is the headline missing feature. It is also where the library could differentiate: `greek-utils`
(7,518 downloads/month, versus 44/month for this package) has *conversion* functions but no search
at all, and nothing on npm does bidirectional greeklish **search**.

### 4.1 What people actually type: three conventions, freely mixed

The canonical taxonomy comes from Chalamandaris et al., LREC 2006 ("All Greek to me!") and is
confirmed by Toumazatos et al., LREC-COLING 2024. There are **three** conventions, not two:

1. **Phonetic** - write what it sounds like: `θ` to `th`, `αι` to `e`, `χ` to `ch`/`x`, `ου` to `u`.
2. **Visual / optical** - write what it looks like: `θ` to `8`, `ω` to `w`, `η` to `n`, `ξ` to `3`.
3. **Keyboard / key-sharing** - write whatever is on the same physical key in the Greek layout:
   `θ` to `u`, `η` to `h`, `υ` to `y`, `ω` to `v`, `ψ` to `c`, `ξ` to `j`.

The five graphemes that cleanly separate all three (from the 2006 paper, which chose them precisely
because they are the only ones that admit all three modes and produce distinct outcomes):

| Greek | phonetic | visual | keyboard |
|---|---|---|---|
| η | `i` | `n` | `h` |
| υ | `i` | `u` | `y` |
| ω | `o` | `w` | `v` |
| θ | `th` | `8` | `u` |
| ου | `u` | `ou` | `oy` |

**The critical finding for design: users do not pick one convention.** The 2006 paper's log-linear
analysis of 170,478 real letter instances found no clean clustering - one latent class was 73%
keyboard, another 52% phonetic / 34% visual, a third was a near-even three-way mix. Their conclusion,
verbatim: *"users tend to use a mix and match approach to Greeklish type in their messages, instead of
only one of the three different types."* The 2024 paper agrees: all three are "often being intermixed
in the same passage."

So a design that only handles phonetic greeklish - which is what my first prototype did, and what
most naive implementations do - covers well under half of real input. Section 4.4 quantifies exactly
how badly.

The best published consolidated greeklish-to-Greek table is Table 2 of Toumazatos et al. 2024
(braces mean "or"):

```
a  -> α          n  -> ν            8  -> θ
ai -> αι         nt -> ντ           3  -> ξ
b  -> {β, μπ}    o  -> {ο, ω}       q  -> θ
d  -> {δ, ντ}    oi -> οι
e  -> {ε, αι}    ou -> ου
ei -> ει         p  -> {π, ψ}
f  -> φ          r  -> ρ
g  -> γ          s  -> {σ, ς}
h  -> {η, χ}     t  -> τ
i  -> {η, ι, υ, ει, οι, υι}         th -> θ
k  -> κ          u  -> {υ, θ, ου}
ks -> ξ          ui -> υι
l  -> λ          v  -> β
m  -> μ          w  -> ω
mp -> μπ         x  -> {ξ, χ}
y  -> υ          z  -> ζ
```

### 4.2 The formal standards are the wrong target, and now we can say by how much

**ELOT 743** (Greece, 1982/2001), adopted internationally as **ISO 843:1997** (the two are declared
identical), further adopted by **UN/UNGEGN** resolution V/19 for geographic names and by
**BGN/PCGN** in 1996. It has two modes: Type 1 transliteration (reversible, `ī`/`ō`) and **Type 2
transcription**, which is what the Greek state uses for passports and ID cards. Type 2's signature
rules are context-sensitive:

```
αυ -> av  before β γ δ ζ λ μ ν ρ and vowels;  af  before θ κ ξ π σ τ φ χ ψ and word-final
ευ -> ev / ef   (same condition)     ηυ -> iv / if
μπ -> b at word start OR end;  mp word-medially
γγ -> ng    γκ -> gk    γχ -> nch    ου -> ou    χ -> ch    ξ -> x    η -> i    ω -> o
```

Verified outputs from the Greek government's own converter at `passport.gov.gr`:
`ΕΛΕΥΘΕΡΙΟΣ` to `ELEFTHERIOS`, `ΝΑΥΠΛΙΟ` to `NAFPLIO`, `ΑΥΓΟΥΣΤΟΣ` to `AVGOUSTOS`,
`ΜΠΑΜΠΗΣ` to `BAMPIS`, `ΘΕΣΣΑΛΟΝΙΚΗ` to `THESSALONIKI`, `ευχαριστώ` to `efcharisto`.

**Measured agreement between ELOT 743 transcription and real greeklish**, over a 20,000-word sample
of the Greek Hunspell dictionary:

```
ELOT 743 == phonetic greeklish, exact:  35.0%   (mean normalized edit distance 0.098)
ELOT 743 == visual   greeklish, exact:  23.4%   (0.143)
ELOT 743 == keyboard greeklish, exact:  18.8%   (0.150)
```

The single biggest divergence is `χ` to `ch`: greeklish users overwhelmingly write `x`. Also
`ξενοδοχείο` becomes ELOT `xenodocheio` while people type `ksenodoxeio` or `3enodoxeio`.

The 2024 paper puts it plainly: ISO 843's *"mappings are almost never used in Greeklish."*

**Conclusion: do not use ELOT 743 as the search key.** Absorb its spellings as one more input
variant. Add a separate ELOT field only if you also need to match passport-style official data,
where the 35% agreement rate means one key cannot serve both.

### 4.3 The explosion, measured in both directions

Greek to greeklish (the easy direction). Note that the brief's own example words are close to the
best case:

| Greek word | Skroutz table, full product | phonetic only | maximal, incl. visual and leet |
|---|---:|---:|---:|
| `γιατρός` | **1** | 1 | 12 |
| `Ελλάδα` | **1** | 1 | 2 |
| `αυτοκίνητο` | 8 | 6 | 48 |
| `παπούτσια` | 3 | 2 | 24 |
| `Θεσσαλονίκη` | 2 | 2 | 240 |
| `ξενοδοχείο` | - | 12 | 72 |
| `ευχαριστώ` | 36 | 18 | 144 |
| `ηλεκτρονικός υπολογιστής` | - | 12 | 27,648 |

Greeklish to Greek is the direction that genuinely explodes, because segmentation is ambiguous too:

```
ellada        ->      4 candidate Greek strings
giatros       ->     36
efxaristw     ->     36
8essalonikh   ->     48
autokinhto    ->    144
thessaloniki  ->    432
ksenodoxeio   ->  1,664
ypologistis   ->  2,592
```

2,592 hypotheses for one 11-character token. This is why every serious greeklish-to-Greek system needs
a dictionary or a language model, and why section 4.7 says not to build one.

**How Elasticsearch handles it.** The Skroutz `elasticsearch-analysis-greeklish` plugin takes
approach (a): expand Greek to many greeklish tokens **at index time**, emitted at the same position
and offset as synonyms, capped by `max_expansions` (**default 20**, confirmed from the source). Two
details worth stealing and one worth avoiding:

- It collapses each digraph to a sentinel codepoint first, so the per-character cross-product can
  treat digraphs atomically. Clean trick.
- When the cap is hit it keeps appending only the **first** alternative for the remaining characters,
  so **the alternative lists must be ordered by frequency** - truncation always keeps the head.
- With `greek_variants: true` (the default) it also runs a *reverse* stemmer that inflates each word
  into up to 10 singular/plural forms first, so a single input token can emit up to **200** tokens.
  That is a 200x index cost, which is fine for a search cluster and absurd for a browser library.
- Its gate is strict: `StringUtils.containsOnly(input, "αβγδεζηθικλμνξοπρστυφχψω")`. Accented
  vowels, final sigma and uppercase are all **rejected**, which is why the README insists it run after
  a Greek lowercase filter.

### 4.4 The design that works: lossy key on both sides, ambiguity on the query side only

The key insight, and the thing that makes this tractable:

> **Greek to key is a function. Greeklish to key is a relation - and the index itself resolves it.**

Given Greek input there is exactly **one** correct key, because Greek orthography is unambiguous in
the direction that matters (`ου` is always `u`, `αι` is always `e`, `η`/`ι`/`υ`/`ει`/`οι` are all
`i`). Given greeklish input, several readings are possible, so the query fans out into a bounded set
of candidate keys - and then almost all of them simply do not exist in the index and vanish.

Greek side, deterministic, longest match first:

| Greek | key | Greek | key | Greek | key |
|---|---|---|---|---|---|
| αι | `e` | α | `a` | ξ | `x` |
| ει, οι, υι | `i` | β | `v` | ο | `o` |
| ου | `u` | γ | `g` | π | `p` |
| αυ | `av` | δ | `d` | ρ | `r` |
| ευ | `ev` | ε | `e` | σ, ς | `s` |
| μπ | `b` | ζ | `z` | τ | `t` |
| ντ | `d` | η | `i` | υ | `i` |
| γκ, γγ | `g` | θ | `th` | φ | `f` |
| τσ | `ts` | ι | `i` | χ | `x` |
| τζ | `tz` | κ | `k` | ψ | `ps` |
| | | λ | `l` | ω | `o` |
| | | μ | `m` | | |
| | | ν | `n` | | |

**A note on the key alphabet.** The table above writes multi-character symbols (`th`, `ps`, `ts`) for
readability, but a real implementation should emit **single characters** - for example `8` for theta,
`y` for psi, `c` for tsi, `j` for tzi. Two reasons. First, substring search over a key string can
otherwise bleed across symbol boundaries, since `p` and `s` are themselves symbols and `ps` is not
atomic. Second, this is exactly the class of bug that breaks `greek-utils`: its `Θ` to `TH` mapping is
re-read as tau plus eta on the way back (4.9). The prototype traces in 4.5 use the single-character
form.

Latin side, the mirror, with alternatives where genuinely needed:

```
digraphs:  au|av|af|ay -> av      eu|ev|ef|ey -> ev      ou|oy -> u
           ai -> e    ei|oi|yi -> i
           th|kh|ch -> th|x       ks|ph|dh|ps|mp|mb|nt|nd|gk|gg|ng|tz|ts -> as above
singles:   h -> i|x     w -> o     y -> i|g|ps    u -> u|i|th
           8|9|0|q -> th          3 -> x         c -> s|ps|k    j -> x|tz
           n -> n|i    v -> v|o    b -> b|v       p -> p|ps
```

**Measured on the full 828,806-word Greek Hunspell dictionary.** These numbers are the core of the
recommendation.

*Is the Greek key too lossy?* No:

```
828,806 distinct Greek words -> 754,472 distinct keys   (ratio 1.099)
  keys with more than one word:   65,527  (8.7% of keys)
  words in a colliding key:      139,861 (16.9% of words)
  largest cluster:                    12
```

Most collisions are inflectional variants of the same lemma, which for search is a feature rather
than a bug. (Additionally folding double consonants barely helps - 751,056 keys instead of 754,472 -
so do not bother.)

*Is a single deterministic latin key enough?* **No, and this is where my own 40-pair prototype was
too optimistic.** Generating greeklish in each convention and checking whether its key equals the
Greek key:

```
phonetic greeklish:  91.88% recall
visual   greeklish:  50.11% recall
keyboard greeklish:  41.66% recall
```

My hand-picked 40-pair test in `scratchpad/gl3.js` scored 40/40 with a mean fan-out of 1.5, but that
set was skewed phonetic. The dictionary-scale numbers are the ones to design against.

*Adding small per-letter alternations* (`n` to `n|i`, `u` to `u|i|th`, `v` to `v|o`, `y` to `i|g|ps`,
`c` to `s|ps|k`, `j` to `x|tz`, `h` to `i|x`, `b` to `b|v`):

```
phonetic 92.00%   visual 90.01%   keyboard 79.68%
query fan-out: mean 4.4, median 2, p95 12
```

Better, but keyboard greeklish still leaks - and the remaining failures are **segmentation**
ambiguity, not letter ambiguity. `uessalonikh` gets parsed as `...ni + kh` (chi) rather than
`...ni + k + h` (kappa + eta).

*Final design: also let every digraph fall back to its split reading.* This is the answer:

```
phonetic 99.97%   visual 99.90%   keyboard 99.68%
query fan-out: mean 15.2, median 6, p95 64, hard cap 200
```

*And the precision cost is almost nothing*, because the lexicon prunes the hypotheses for free. Over
3,000 sampled words, hitting the 754k-key index with all ~15 candidate keys:

```
distinct Greek words retrieved per query token
  phonetic:  mean 1.4   median 1   p90 2   p99 4   max 12
  visual:    mean 1.2   median 1   p90 2   p99 4   max 12
  keyboard:  mean 1.2   median 1   p90 2   p99 4   max 12
```

Fifteen candidate keys go in, roughly one real word comes out. **The index is the disambiguator** -
no dictionary download, no n-gram model, no neural net. This is the "All Greek to me!" insight
(unified phonetic key plus lexicon projection, 99.37% accuracy in LREC 2006) reframed as a hash
lookup.

**Why this beats the Elasticsearch expansion model for a library like this one:**

- **Index stays 1x**, versus 20x to 200x.
- **Symmetric for free.** Greek query finds greeklish text and greeklish query finds Greek text,
  because both sides go through the same fold.
- **New conventions are cheap.** Adding `q` to theta or `4` to psi is one entry on the *query* table;
  with expansion indexing you would have to reindex everything.
- **Bounded and tunable.** One number caps it, and hitting the cap degrades recall gracefully.

### 4.5 Highlighting still works - offsets survive the fold

The obvious objection to a key-based design is that you lose the ability to highlight. You do not, if
you build a parallel index map while folding (`scratchpad/gl4.js`, verified end to end):

```
text: Ο γιατρός Παπαδάτος και το ξενοδοχείο Θεσσαλονίκη
key : o giatros papadatos ke to xenodoxio 8essaloniki

query "giatros"      -> 1 key  -> range [2,9]   -> "γιατρός"
query "ksenodoxeio"  -> 1 key  -> range [27,37] -> "ξενοδοχείο"
query "8essaloniki"  -> 1 key  -> range [38,49] -> "Θεσσαλονίκη"
query "THESSALONIKH" -> 2 keys -> range [38,49] -> "Θεσσαλονίκη"
```

A greeklish query returns byte-accurate highlight ranges into the **original accented Greek text**.
This is strictly better than what the regex approach can do, because the regex approach cannot express
`ου` to `u` at all - a character class is one-to-one and `ου` to `u` is two-to-one.

### 4.6 False positives, honestly

The key is lossy by construction and it will merge distinct words. Measured collisions
(`scratchpad/gl2.js`):

```
NE      -> ναι, νε
TIXOS   -> τείχος, τοίχος
KALOS   -> κάλος, καλός
XERI    -> χέρι, ξέρει
ORA     -> ώρα, όρα
ILI     -> ύλη, ήλη, ίλη
DINO    -> δύνω, ντύνω
AFTO    -> αυτό, αφτό
SKILOS  -> σκύλος, σκίλος
```

Most of these are genuine Greek homophones (`τείχος`/`τοίχος`, `κάλος`/`καλός`) that any
phonetic-search system merges and that users are not surprised by. The two that are *not* homophones
and come purely from the ambiguity merges are `χέρι`/`ξέρει` (`χ` and `ξ` both to `x`) and
`δύνω`/`ντύνω` (`δ` and `ντ` both to `d`). Both are acceptable recall-over-precision trades for
search, and both should be documented rather than hidden.

At dictionary scale the picture is reassuring. Over all 828,806 words, **8.7% of keys hold more than
one word and 16.9% of words sit in a colliding key**, with a largest cluster of 12. The big clusters
are inflectional families of one lemma - `siglisis` collects `συγκλίσεις` / `σύγκλισης` /
`συγκλήσεις` / `σύγκλησης` and so on - which for search is a feature. And end to end, a greeklish
query with ~15 candidate keys retrieves a **median of 1** distinct Greek word, p99 of 4 (4.4).

**Crucially: greeklish must be opt-in.** A Greek query against Greek text should stay exact. Turn the
key on only when the query is greeklish, or when the caller asks for it.

### 4.7 API sketch

```ts
// The primitive. Deterministic, one key per input.
export function greekKey(s: string, opts?: KeyOptions): string;

// The greeklish-aware query side. Returns 1..N keys (bounded).
export function greeklishKeys(query: string, opts?: KeyOptions): string[];

// Fold with a parallel offset map, for highlighting.
export function greekKeyWithMap(s: string): { key: string; map: number[] };

interface KeyOptions {
  greeklish?: boolean;      // default false - Greek stays exact
  homoglyphs?: boolean;     // default TRUE - script-gated, additive, see 3.8
  letterforms?: boolean;    // default true - explicit table for lunate sigma,
                            //   symbol variants, maths Greek. NEVER via NFKC (3.6)
  maxKeys?: number;         // hard cap on query fan-out, default 64
}

// Integrated into the existing surface:
greekSearch(text, match, { greeklish: true });          // => boolean
greekMatches(text, match, { greeklish: true });         // => Array<[start, end]>
```

`maxKeys` is the safety valve. At dictionary scale the fan-out is mean 15.2 / median 6 / p95 64, so 64
is the right default and 200 is a reasonable hard ceiling; a pathological all-`y` query would otherwise
grow as 3^n. Order the alternatives by frequency, because truncation always keeps the head of each
list - that is the one design lesson worth copying verbatim from the Elasticsearch plugin.

Two tuning notes from the dictionary-scale measurements:

- `p` to `π|ψ`, `c` to `σ|ψ|κ` and `y` to `υ|γ|ψ` are the noisiest alternations. Consider gating them
  behind a "no results" retry rather than always emitting them.
- Applying the latin key on the **index** side is only correct if the Latin content is meant to be
  Greek. English product names should not go through it. Detect script, or index both fields.

### 4.8 What not to do

- **Do not implement greeklish-to-Greek conversion.** That is a different, much harder problem
  (`greek-utils.toGreek("8essaloniki")` returns `"θεσσαλονικι"`, not `"Θεσσαλονίκη"` - wrong vowel,
  no capital, no accent) and it is unnecessary: both sides only ever need to reach the key.
- **Do not generate an alternation regex over greeklish variants.** With 4 to 64 alternatives per
  word, patterns become enormous and the backtracking behaviour becomes hard to reason about. Keys
  plus `indexOf` are simpler and faster.
- **Do not chase ELOT 743 conformance.** It agrees with real greeklish only 35% / 23% / 19% of the
  time across the three conventions (4.2). Absorb its spellings; do not make it the output format.
- **Do not build only for phonetic greeklish.** That is the single most common mistake and it caps
  recall at roughly 50% for visual and 42% for keyboard greeklish (4.4). Users mix all three
  conventions inside one word.
- **Do not index-time expand like Elasticsearch does.** 20x to 200x index growth, and it bakes your
  convention guesses into the index (4.3).

### 4.9 Prior art, measured

Everything in this table was run locally against the packages as published.

| | `@heypano/greek-search` 2.0.9 | `greek-utils` 1.3.0 | ES greeklish plugin |
|---|---|---|---|
| downloads / month | 44 | 7,518 | n/a (ES plugin) |
| handles all 3 conventions | n/a | phonetic + visual | phonetic + partial visual |
| **searches text** | yes | **no** | yes (index-time tokens) |
| strips tonos | yes (via classes) | yes | yes |
| strips **dialytika** | lowercase path only | **no** | yes |
| normalizes NFD | **no** | **no** | yes (Lucene) |
| folds oxia | **no** | partial (hardcoded list) | yes |
| Greek to greeklish | **no** | yes | yes |
| greeklish to Greek | **no** | yes (lossy) | no |
| ELOT 743 output | **no** | yes | no |
| returns offsets | no | n/a | n/a |
| bounds expansion | n/a | n/a | `max_expansions`, default **20** |

Verified `greek-utils` behaviour:

```js
greekUtils.sanitizeDiacritics("Μαΐου ϊϋΐΰ")     // "Μαΐου ϊϋΐΰ"   dialytika untouched
greekUtils.toGreeklish("Θεσσαλονίκη")           // "THessalonikh"  note the casing bug
greekUtils.toPhoneticLatin("ευχαριστώ")         // "efkharistó"
greekUtils.toTransliteratedLatin("Θεσσαλονίκη") // "Thessaloníkē"
greekUtils.toGreek("8essaloniki")               // "θεσσαλονικι"   wrong vowel, no capital
greekUtils.toGreek("giatros")                   // "γιατροσ"       no final sigma
```

`greek-utils` is a **conversion** library built from ordered find/replace tables (an array of
`{find, replace}` pairs applied one `String.replace` at a time, so order *is* the algorithm). It has
no search function, no normalization of decomposed input, and its diacritics table is a hand-written
codepoint list rather than an algorithmic fold. It also does not round-trip, and one of its bugs is
instructive: `toGreeklish("Θεσσαλονίκη")` gives `"THessalonikh"`, which `toGreek` then re-parses as
`"ΤΗεσσαλονικη"` - the `Θ` to `TH` mapping is re-read as tau plus eta. That is exactly the hazard of
multi-character key symbols that 4.4's single-character alphabet avoids.

Its one genuinely valuable piece is `toPhoneticLatin`, the only context-sensitive table in the npm
ecosystem, which implements the ELOT-style `αυ`/`ευ` rule with lookaheads over explicit vowel and
consonant sets. Worth reading before writing your own.

**Correction to a claim I made earlier in this research:** it is not true that nothing on npm does
greeklish search. Relevant prior art:

- **`greeklish-search`** - small, and explicitly uses the lossy-key-on-both-sides approach recommended
  here (its `searchByField` pushes query and field through the same function). It has a bug: index 34
  of its match array is a Greek `υ` rather than a Latin `y`. Worth reading as a sanity check on the
  design, not as a dependency.
- **`greek-text-utils`** - a TypeScript rewrite of `greek-utils` that additionally implements real
  ISO 843 Type 1 and Type 2 plus `fromISO843Type1()`. The only npm package that does the standards
  properly. Use it if you need an ELOT field.
- **`grklsh` does not exist on npm** (404 on the registry). It is a Python 2 CLI script, MIT, last
  touched 2017, with a flat char-by-char dict and no module API. Its table is still a useful record
  of the chat dialect (`θ` to `8`, `ξ` to `3`, `ω` to `w`, `η` to `h`, `υ` to `y`).
- **No ICU transliterator is reachable from JavaScript.** `Intl` exposes collation, formatting and
  segmentation but not `Transliterator`, and there is no TC39 proposal. ICU4X has one in Rust but it
  is not exposed through its FFI, so there is no WASM binding. So `Greek-Latin/UNGEGN` - which does
  implement the context-sensitive `αυ`/`ευ` rule correctly - is simply not available here. That
  settles the "should we just use ICU" question: you cannot.

The academic state of the art is worth knowing for calibration. On **real-world** greeklish, the best
system in the LREC-COLING 2024 evaluation was GPT-4 with 6 examples at roughly 9-11% character error
and 18-23% word error; a 20-year-old dictionary-plus-trigram system placed second, beating every
fine-tuned encoder-decoder. **Greeklish-to-Greek conversion is not a solved problem.** Search, which
only needs a small candidate set rather than one right answer, is a much easier target - which is
precisely why 4.4's approach works so well.

The Elasticsearch greeklish plugin's `max_expansions` default of **20** was confirmed from its README.
Its model - generate many greeklish tokens per Greek token at index time, capped - is the right shape
for a search cluster and the wrong shape here, for the reason in 4.3: it puts the fan-out on the
corpus side, where this library should put it on the query side.

---

## 5. The regex-generation approach itself

### 5.1 `normalize()` should be the core primitive; the regex should be derived from it

**Correctness.** The fold handles every case the regex approach handles, plus NFD, plus oxia, plus
punctuation, plus (optionally) homoglyphs and greeklish. It has no re-entrancy hazard because there is
no self-referential substitution step. It cannot be corrupted by user input because nothing is
concatenated into a pattern.

**Expressiveness.** A character class is strictly one-to-one. Greeklish needs many-to-one
(`ου` to `u`, `th` to `8`) and one-to-many. The regex approach cannot express the headline feature.

**Performance** (`scratchpad/exp10.js`, 20,000-row corpus, one query):

```
greekSearch() per row, rebuilding the regex 20,000x    29 ms
getRegExp() built once, reused with lastIndex reset     1 ms
fold both sides every time, no index                   16 ms
pre-folded corpus (index built once in 20 ms)           2 ms
```

The regex is fast when reused, but reusing it safely is exactly the trap in 2.3. The fold is in the
same ballpark cold and roughly **10x faster warm**, which is the case that matters for a real search
box: fold the corpus once, fold each keystroke's query, `indexOf`.

**Composability.** The fold composes with everything downstream. `greek-stemmer@0.1.4` needs
accent-free uppercase input to work at all - verified:

```js
stemmer.stem("ΓΙΑΤΡΟΣ")  // => "ΓΙΑΤΡ"     (after folding)
stemmer.stem("ΓΙΑΤΡΌΣ")  // => "ΓΙΑΤΡΌΣ"   (unchanged - accents break it)
```

A `normalize()` export is immediately useful to every consumer for building their own index, sorting,
deduping, or feeding a stemmer. A regex-string export is useful only for regex.

**Recommendation.** Keep `getRegExp`, because highlighting really does want a regex and it is the
existing public API. But build it *from* the fold: normalize the query, then emit a pattern over the
normalized alphabet, with `u` support. Make `normalize` / `greekKey` the documented core.

### 5.2 The re-entrancy hazard is not theoretical - it fires on ordinary input

Section 2.1 and 2.2 prove it concretely. To state the general rule: the loop is unsafe because the
replacement text for conversion *i* can be matched by conversion *j* for any *j > i*. Today two
concrete pairs collide:

- `[ΙΪΊΪ́]` inserts `U+0308 U+0301`; `[ΥΎΫΫ́]` (later in the array) matches both.
- Any user-supplied `extraConversion` broad enough to match a `[`, `]`, or an accented letter that a
  later conversion also inserts.

Note the ordering dependency: `extraConversions` are *prepended*, so they run first and are then
themselves rewritten by the built-in conversions. `getRegExpContent("γιατρός", false, [".*"])`
returning `".*.*"` is that happening. Any fix that keeps the loop must, at minimum, do a single
simultaneous pass rather than N sequential passes.

### 5.3 ReDoS

Two independent exposures, both confirmed:

- `trimAround`'s nested quantifier, reachable with default arguments and no user regex at all
  (2.6). **This is the serious one.**
- `extraConversions` letting a caller inject an arbitrary pattern (2.5).

The generated conversion patterns themselves are safe - they are a flat sequence of single-character
classes with no quantifiers, so they are linear.

### 5.4 Stateful `g` flag

Confirmed in 2.3, already fixed for `greekSearch` in the working tree, still a footgun on
`getRegExp`. The clean fix is 6.1.

---

## 6. Recommended new features

### 6.1 Return match ranges, not just a boolean - HIGH value, LOW effort

`greekSearch` returning `boolean` throws away information the engine already computed, and
`trimAround`'s existence shows the need. Offsets are the right primitive: highlighting, snippets and
scoring all fall out of them.

```ts
export function greekMatches(
  text: string, match: string, opts?: SearchOptions
): Array<{ start: number; end: number }>;
```

Verified that offsets are trivially available today via `matchAll` and the `d` flag:

```js
for (const m of "άλλος και άλλος".matchAll(new RegExp(pattern, "gid")))
  // { 0: "άλλος", index: 0,  indices: [[0,5]] }
  // { 0: "άλλος", index: 10, indices: [[10,15]] }
```

Under the fold approach they come from the offset map (4.5) instead, which is what lets greeklish
queries highlight Greek text. Returning ranges also **retires the stateful-regex problem**: callers
stop needing `getRegExp` for the common case.

Rewrite `trimAround` on top of ranges and walk outward in plain string code. That kills the ReDoS
(2.6) as a side effect. **Effort: small. Value: high.**

### 6.2 Whole-word matching - MEDIUM value, LOW effort

`\b` is ASCII-only in JavaScript and is actively wrong for Greek. Confirmed:

```js
/\bαλλος\b/.test("αλλος")   // => false   (Greek letters are not \w)
/\bλλο\b/.test("αλλος")     // => false
```

Both results are wrong in different directions and neither is usable. The Unicode-aware form works:

```js
new RegExp("(?<![\\p{L}\\p{N}_])λλο(?![\\p{L}\\p{N}_])", "u")
  .test("αλλος")      // => false   correct
  .test("λλο μονο")   // => true    correct
```

Verified available: `\p{Script=Greek}`, `\p{Script_Extensions=Greek}`, `\p{Mn}` all work under `u` on
Node. Lookbehind is supported in all current engines and in Safari since 16.4; if you need older
Safari, do the boundary check in JS around the offsets from 6.1 instead of in the pattern.

```ts
greekSearch(text, match, { wholeWord: true });
```

Note this **requires** the `u` flag, which the current output format cannot take (2.7). Another
reason to move to the fold.

### 6.3 Prefix matching and ranking - MEDIUM value, MEDIUM effort

Once you have offsets you can score cheaply and usefully:

```ts
export function greekRank(items: string[], query: string, opts?): Array<{ item, score, ranges }>;
```

A serviceable score with no dependencies: exact match beats prefix-of-string beats prefix-of-word
beats substring; earlier offset beats later; shorter haystack beats longer. This is the feature that
turns the package from "a predicate" into "a search library", and it is where a typeahead consumer
actually gets value.

### 6.4 Collation and sorting - LOW effort, worth exporting

`Intl.Collator("el")` is built in and gets Greek right where naive sorting does not. Verified:

```js
["Ω","Α","Ζ","ά","Β"].sort((a,b) => a.localeCompare(b,"el"))   // Α, ά, Β, Ζ, Ω
["Ω","Α","Ζ","ά","Β"].sort()                                    // Α, Β, Ζ, Ω, ά
```

Sensitivity levels, verified:

| comparison | `base` | `accent` | `case` |
|---|---|---|---|
| `οδος` vs `οδός` | 0 | -1 | 0 |
| `οδος` vs `ΟΔΟΣ` | 0 | 0 | -1 |
| `οδος` vs `οδοσ` (final sigma) | 0 | 0 | 0 |
| `μαιου` vs `μαΐου` | 0 | -1 | 0 |
| `ά` (tonos) vs `ά` (oxia) | 0 | 0 | 0 |
| `οδος` vs `οδoς` (**Latin o**) | **-1** | -1 | -1 |

`sensitivity: "base"` folds accents, case, final sigma and oxia correctly - and confirms it does
**not** fold homoglyphs, which is why 3.8 is still needed. Export a `greekCompare` /
`greekCollator` helper so users stop hand-rolling `localeCompare`. **Effort: trivial. Value: real.**

### 6.5 Stemming - OUT of scope for this library; document the composition instead

Greek declension is the biggest recall gap (`γιατρός` / `γιατρού` / `γιατρό` / `γιατροί` /
`γιατρών`), but implementing a stemmer here is the wrong call: it is a large rule table, it needs a
stopword list, and it changes the library from "string matching" to "linguistics".

The right move is to make composition easy and document it. Verified `greek-stemmer@0.1.4` (MIT) on
folded input:

```
γιατρός, γιατροί, γιατρού, γιατρό, γιατρών   -> ΓΙΑΤΡ
ξενοδοχείο, ξενοδοχεία                       -> ΞΕΝΟΔΟΧ
καλός, καλή, καλό                            -> ΚΑΛ
παιδί, παιδιά                                -> ΠΑΙΔ
αυτοκίνητο, αυτοκίνητα                       -> ΑΥΤΟΚΙΝΗΤ
```

It works well, and it works **only** on accent-stripped uppercase input - which is exactly what
`normalize()` would hand it. Caveats worth stating in the README: 36 downloads/month, last published
long ago, and it depends on `lodash@^3` (2015) plus `yamljs` plus the junk `path` shim, so it is not
something to take as a hard dependency. Note it as an optional integration, with a code sample.

The Snowball Greek stemmer is the better-maintained algorithm if anyone wants to port one properly.

### 6.6 Fix the `caseSensitive` API shape - MEDIUM value, LOW effort

Today `caseSensitive: true` means "respect case but still ignore accents", which nobody asked for, and
it is the mode where bug 2.1 lives. Replace the boolean with explicit, orthogonal options:

```ts
interface SearchOptions {
  caseSensitive?: boolean;    // default false
  accentSensitive?: boolean;  // default false  <- currently impossible to turn on
  greeklish?: boolean;        // default false
  homoglyphs?: boolean;       // default true, script-gated (3.8)
  wholeWord?: boolean;
  letterforms?: boolean;
}
```

Keep the positional `(text, match, caseSensitive, extraConversions)` signature working by
overloading, so this is not a breaking change. (Note that the repo's semantic-release config maps
`feat:` to a **major** bump, so an additive change should ship as `fix:` unless a major is genuinely
intended.)

### 6.7 Replace `extraConversions` with a synonyms API - HIGH value, LOW effort

The current design asks callers to write a regex fragment that also matches its own literal
alternatives - a genuinely confusing contract, and an injection hole (2.5). The README's own example
is `["((ιατρος)|(γιατρος)|(ιατρός)|(γιατρός))"]`, which after folding collapses to just two distinct
forms. Offer plain data instead:

```ts
greekSearch(text, "γιατρός", {
  synonyms: [["γιατρός", "ιατρός"], ["ξενοδοχείο", "hotel"]]
});
```

Internally: fold every term, group them, and expand the query to the group. No regex from the caller,
no escaping burden, no injection, and accent variants collapse automatically. Keep `extraConversions`
accepted but **escape or validate it**, and deprecate it in the docs.

### 6.8 Fuzzy / edit-distance - LOW priority

Genuinely useful for typos, but do it *after* the fold, over keys, and only as an opt-in
`maxDistance: 1` bounded to short queries. Doing it before normalization would burn the edit budget on
accent differences the fold handles for free. Not worth building until 6.1 through 6.7 land.

### 6.9 Packaging - the CJS/ESM situation is not as broken as it looks, but it is fragile

I tested this rather than assuming, and the headline hypothesis is **false**:

- The published `dist/index.js` is **CommonJS with `escape-string-regexp` bundled inline** by rollup.
  The ESM-only dependency never reaches the consumer, so nothing breaks at install or runtime.
- `require("@heypano/greek-search")` works. **Verified.**
- `import { greekSearch } from "@heypano/greek-search"` from an ESM package works, because Node's
  CJS named-export detection finds all five exports. **Verified.**
- TypeScript resolves the types under `moduleResolution` `node10`, `node16` **and** `bundler`, via the
  adjacent `dist/index.d.ts`. **Verified, all three compile clean.**

The real problems are smaller but worth fixing:

1. **No `exports` field**, no `types` field, no `module`/ESM build, no `sideEffects: false`. Bundlers
   cannot tree-shake and cannot pick an ESM entry. For a five-function library that is pure overhead
   in every consumer's bundle.
2. **A stray ESM file is published.** `dist/conversions.js` in the 2.0.9 tarball is raw ESM
   (`export const conversionsArray = ...`) sitting inside a package with no `"type": "module"`. It is
   dead code today, but it is a lit fuse.
3. **`prelint` is `tsc`, and `tsconfig.json` has `outDir: "dist"` with `module: "ES2020"`.** So a bare
   `npm run lint` writes broken ESM over the build output. Confirmed in an isolated copy:

   ```
   $ tsc -p tsconfig.json           # == the `prelint` step
   $ head -1 dist/index.js
   import { conversionsArray } from "./conversions";
   $ node -e 'require("./dist/index.js")'
   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../dist/conversions'
   ```

   CI runs `lint` then `test` then `build` then `semantic-release`, so today rollup overwrites
   `dist/index.js` last and the published entry is fine - that is exactly why `dist/conversions.js`
   survives as ESM while `dist/index.js` does not. But the correctness of the published artifact
   depends entirely on step ordering. Reorder the CI steps, or add a lint step after build, and you
   ship a package that cannot be loaded. **I observed `dist/index.js` in this working tree flip
   between the rollup bundle and the raw `tsc` output during this session.**

Recommended package.json:

```jsonc
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "sideEffects": false
}
```

and give `tsc` its own `outDir` (or `noEmit` for the typecheck config, as the working tree's new
`tsconfig.typecheck.json` already starts to do) so it can never touch `dist/`.

### 6.10 Test-suite gaps

Worth calling out because it explains how bug 2.1 survived to production. Every Greek fixture in
`src/index.test.ts` is the word `ΆλλοΣ`, which contains no iota, no upsilon, no NFD, no oxia, no
digraph and no homoglyph. Two of the seven tests are about a cat-themed English sentence, and there is
a stray `test("s", () => {})`. Minimum additions:

- Every Greek letter, uppercase and lowercase, searched for itself, in both case modes. This one loop
  would have caught 2.1 immediately.
- NFC and NFD forms of the same word, in all four query/text combinations.
- Oxia forms of all 16 codepoints.
- A property test: `greekSearch(w, w, cs) === true` for every `w` in a Greek word list, for both
  values of `cs`.
- `trimAround` with a 60-character whitespace-free token and a timeout assertion.

---

## 7. Prioritized roadmap

### Do first - correctness and safety, no new surface area

1. **Normalize both sides.** Add the `foldGreek` from 3.1 and run it on `text` and `match` before
   anything else. Fixes 2.2 and 2.4, and makes 3.7 work for free. *Ship as `fix:`.*
2. **Kill the derived uppercase conversions.** Either hand-write the table or, better, drop the whole
   conversion-class mechanism in favour of the fold. Fixes 2.1, 2.8 and 2.9.
3. **De-ReDoS `trimAround`.** Replace the nested quantifier with offset arithmetic. Fixes 2.6.
4. **Escape or validate `extraConversions`.** Stop a documented predicate from throwing. Fixes 2.5.
5. **Homoglyph folding** (3.8), script-gated, all-or-nothing, additive, applied before lowercasing.
   Measured at 0.094% of tokens in Greek news text, roughly 60x the oxia rate, with a gate that fires
   on every real corruption and none of the false-positive cases. Small, self-contained, high recall
   payoff.
6. **Expand the test suite** per 6.10. Do this alongside 1 and 2, not after.

### Do second - the API that makes the library useful

7. **`greekMatches()` returning ranges** (6.1), with `trimAround` rebuilt on top. This retires
   `getRegExp` as the primary API and with it the `lastIndex` footgun.
8. **Options object** (6.6) with `accentSensitive`, added by overload so nothing breaks.
9. **`synonyms`** replacing `extraConversions` (6.7).
10. **Packaging**: `exports`, `types`, dual build, `sideEffects: false`, and a `tsc` `outDir` that is
   not `dist/` (6.9).

### Do third - the differentiator

11. **Greeklish**, per section 4: `greekKey`, `greeklishKeys`, `greekKeyWithMap`, `{ greeklish: true }`,
    `maxKeys` cap (default 64, ceiling 200), documented collision list. Build it for **all three**
    conventions - phonetic, visual and keyboard - and include the digraph-split fallbacks, because
    that is the difference between ~50% and ~99.9% recall on non-phonetic input (4.4). This is the
    feature that makes the package worth choosing over `greek-utils`.
12. **Whole-word matching** (6.2) and `greekCompare` (6.4). Both are small.

### Do later, or not at all

13. **Ranking / prefix scoring** (6.3) - only once ranges exist.
14. **Fuzzy matching** (6.8) - only over keys, only bounded.

### Explicitly do not do

- **Polytonic / ancient Greek.** Out of scope. The only Greek Extended codepoints that matter are the
  16 oxia forms, and `.normalize("NFC")` handles all of them for free (2.4). Do not add polytonic
  character classes, do not touch breathings or iota subscript, do not add archaic letters.
- **Greeklish-to-Greek conversion.** Genuinely ambiguous (2,592 hypotheses for one 11-character
  token), needs a lexicon or a language model, and still unsolved in the literature - the best system
  in the 2024 LREC-COLING evaluation was GPT-4 at 18-23% word error on real data. It is also
  unnecessary: both sides only need to reach the key (4.8, 4.9).
- **A built-in stemmer.** Document the `greek-stemmer` composition instead (6.5).
- **Alternation-regex greeklish.** 4 to 64 alternatives per word; keys plus `indexOf` are simpler and
  faster (4.8).
- **ELOT 743 / ISO 843 conformance as a goal.** It agrees with real greeklish 35% / 23% / 19% of the
  time. Absorb its spellings as inputs; do not make it the output (4.2). If you need passport-style
  data, add a separate ELOT field, or delegate to `greek-text-utils`, which already implements ISO 843
  Types 1 and 2 properly.
- **`NFKC` / `NFKD` as the normalization form.** It destroys Greek ordinals - `ΦΕΚ Α΄ 251` becomes
  `φεκ α  251` - because `U+0384` decomposes to space plus combining acute. Use `NFC` plus an explicit
  twelve-row letterform table for lunate sigma and the maths Greek block (3.6). Same warning applies
  to Elasticsearch's `icu_normalizer`, which defaults to `nfkc_cf`.
- **`confusables.txt` / `skeleton()` as the homoglyph table.** Greek `σ` and `ο` share the prototype
  `o`, and Greek capital iota is confusable with the digit `1`. Hand-write the table (3.8).
- **Keeping the `replace(new RegExp(c), c)` trick.** It is the direct cause of the two worst bugs, it
  cannot express the headline feature, and it is not faster (5.1, 5.2).

---

## 8. Sources

**Run locally, in this session** (Node v26.5.0, ICU 78.3): `@heypano/greek-search@2.0.9` via
`npm pack`; the current working-tree `src/` compiled to CommonJS; `greek-utils@1.3.0`;
`greek-stemmer@0.1.4`; TypeScript 5.9 resolution checks under `node10` / `node16` / `bundler`;
`Intl.Collator("el")`; `String.prototype.normalize`; the Greek government's own ELOT 743 converter
JavaScript.

**Greeklish, standards and research**

- Chalamandaris, Protopapas, Tsiakoulis, Raptis, "All Greek to me! An automatic Greeklish to Greek
  transliteration system", LREC 2006 - [aclanthology.org/L06-1229](https://aclanthology.org/L06-1229/).
  Origin of the phonetic / visual / keyboard taxonomy; 99.37% accuracy via unified phonetic key plus
  lexicon projection.
- Toumazatos, Pavlopoulos, Androutsopoulos, Vassos, "Still All Greeklish to Me", LREC-COLING 2024 -
  [aclanthology.org/2024.lrec-main.1330](https://aclanthology.org/2024.lrec-main.1330/). Current
  state of the art and the consolidated greeklish-to-Greek mapping table.
- [github.com/nlpaueb/greeklish](https://github.com/nlpaueb/greeklish) and
  [AUEB-NLP/ByT5_g2g](https://huggingface.co/AUEB-NLP/ByT5_g2g) - the accompanying tables and model.
- ELOT 743:2001 full Greek text - [sete.gr PDF](https://sete.gr/files/Media/Egkyklioi/040707Latin-Greek.pdf);
  ISO 843:1997(E) - [iteh preview](https://cdn.standards.iteh.ai/samples/5215/ebfdc4425f834833a5fe07c44f2dca79/ISO-843-1997.pdf);
  UNGEGN Greek report v4.0 - [eki.ee PDF](https://www.eki.ee/wgrs/rom1_el.pdf);
  BGN/PCGN 1996 agreement - [gov.uk PDF](https://assets.publishing.service.gov.uk/media/5ab4df04e5274a1aa2d41460/ROMANIZATION_OF_GREEK.pdf);
  ALA-LC Greek - [loc.gov PDF](https://www.loc.gov/catdir/cpso/romanization/greek.pdf).
- Greek passport converter - [passport.gov.gr](https://www.passport.gov.gr/passports/GrElotConverter/GrElotConverter.html).
- Skroutz Elasticsearch greeklish filter - [github.com/skroutz/elasticsearch-analysis-greeklish](https://github.com/skroutz/elasticsearch-analysis-greeklish)
  (`max_expansions` default 20, `greek_variants` default true); Ruby port
  [skroutz/greeklish](https://github.com/skroutz/greeklish); stemmer
  [skroutz/elasticsearch-skroutz-greekstemmer](https://github.com/skroutz/elasticsearch-skroutz-greekstemmer).
- npm prior art: [greek-utils](https://github.com/vbarzokas/greek-utils),
  [greek-text-utils](https://github.com/mkarajohn/greek-text-utils),
  [greeklish-search](https://www.npmjs.com/package/greeklish-search),
  [xtonousou/grklsh](https://github.com/xtonousou/grklsh) (Python, not npm).
- CLDR transliteration rules -
  [Greek-Latin.xml](https://github.com/unicode-org/cldr/blob/main/common/transforms/Greek-Latin.xml),
  [Greek_Latin_UNGEGN.xml](https://github.com/unicode-org/cldr/blob/main/common/transforms/Greek_Latin_UNGEGN.xml).
- Dictionary used for the scale measurements: [wooorm/dictionaries, el](https://github.com/wooorm/dictionaries/tree/main/dictionaries/el)
  (828,806 words).
- Lookbehind support baseline (Safari 16.4) - [caniuse.com/js-regexp-lookbehind](https://caniuse.com/js-regexp-lookbehind).

**Unicode, normalization and confusables**

- UAX #15 Unicode Normalization Forms - [unicode.org/reports/tr15](https://www.unicode.org/reports/tr15/);
  UTR #36 Unicode Security Considerations - [unicode.org/reports/tr36](https://www.unicode.org/reports/tr36/);
  UTS #39 Unicode Security Mechanisms and `confusables.txt` -
  [unicode.org/reports/tr39](https://www.unicode.org/reports/tr39/).
- `SpecialCasing.txt` (the `ΐ` / `ΰ` uppercase expansions and the Final_Sigma condition) -
  [unicode.org/Public/UCD/latest/ucd/SpecialCasing.txt](https://www.unicode.org/Public/UCD/latest/ucd/SpecialCasing.txt).
- NFC prevalence on the web, ~99.98% of HTML content characters over 700M documents, Mark Davis,
  January 2009 - [macchiato.com/unicode/nfc-faq](https://macchiato.com/unicode/nfc-faq).
- Apple TN1150 HFS Plus Volume Format, including the pre-10.3 Greek tonos `U+030D` note -
  [developer.apple.com/library/archive/technotes/tn/tn1150.html](https://developer.apple.com/library/archive/technotes/tn/tn1150.html).
- HTML Standard, form submission and normalization -
  [html.spec.whatwg.org](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html).
- Elasticsearch ICU analysis plugin, `icu_normalizer` default `nfkc_cf` -
  [elastic.co ICU plugin docs](https://www.elastic.co/guide/en/elasticsearch/plugins/current/analysis-icu.html).
- Lucene `GreekLowerCaseFilter` / `GreekAnalyzer` / `GreekStemmer` -
  [lucene.apache.org javadoc](https://lucene.apache.org/core/9_0_0/analysis/common/org/apache/lucene/analysis/el/package-summary.html).
- Snowball Greek stemmer - [snowballstem.org/algorithms/greek/stemmer.html](https://snowballstem.org/algorithms/greek/stemmer.html).
- Greek NFD / homoglyph prevalence figures (2.3% of pages carrying NFD content; 65 mixed-script tokens
  in 69,167; 10 oxia occurrences in 670,846 Greek characters) come from a live scan of Greek news,
  government, university, e-commerce, church and Wikipedia pages performed for this report. They are
  a point-in-time sample of a few dozen sites, not a published corpus statistic, and should be treated
  as order-of-magnitude evidence rather than precise rates.
