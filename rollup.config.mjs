import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

// `escape-string-regexp` (MIT, (c) Sindre Sorhus) is inlined into the bundle,
// so its notice travels with the output.
const banner =
  "/*! @heypano/greek-search | ISC | bundles escape-string-regexp (MIT, (c) Sindre Sorhus) */";

/**
 * `escape-string-regexp` is ESM only, so it is bundled into both outputs
 * rather than left as an external `require()` that plain CommonJS could not
 * resolve. That is also why it is a devDependency: consumers never install it.
 */

/**
 * Node resolves the `import` condition of a CommonJS package as ESM, so the
 * declarations need an ESM twin. Relative specifiers have to gain an explicit
 * `.mjs` extension on the way, because `.d.mts` is resolved with ESM rules
 * where extensionless relative imports are an error.
 */
const mirrorDeclarationsAsMts = () => ({
  name: "mirror-declarations-as-mts",
  writeBundle() {
    for (const entry of readdirSync("dist")) {
      if (!entry.endsWith(".d.ts")) {
        continue;
      }
      const source = readFileSync(`dist/${entry}`, "utf8");
      const mirrored = source.replace(
        /(\bfrom\s*|\bimport\s*\()(["'])(\.[^"']*?)\2/g,
        (_match, prefix, quote, specifier) =>
          `${prefix}${quote}${specifier}.mjs${quote}`
      );
      writeFileSync(
        `dist/${entry.replace(/\.d\.ts$/, ".d.mts")}`,
        mirrored,
        "utf8"
      );
    }
  },
});

export default {
  input: "./src/index.ts",
  output: [
    {
      // Kept at the historical path so `main` and any deep require keep working.
      file: "dist/index.js",
      format: "cjs",
      exports: "named",
      sourcemap: true,
      banner,
    },
    {
      file: "dist/index.mjs",
      format: "es",
      sourcemap: true,
      banner,
    },
  ],
  plugins: [
    peerDepsExternal(),
    resolve(),
    typescript({ tsconfig: "./tsconfig.json" }),
    mirrorDeclarationsAsMts(),
  ],
};
