// `escape-string-regexp` v5 is ESM only, so it has to be transformed rather
// than passed through untouched like the rest of node_modules.
const esModules = "(escape-string-regexp)";

module.exports = {
  // No `preset: "ts-jest"`: jest merges a preset's `transform` with this one,
  // and the preset entry (which has no tsconfig option) would win.
  testEnvironment: "node",
  // Only ever run the sources. Without this jest also picks up compiled
  // artifacts under dist/ and runs every test twice.
  roots: ["<rootDir>/src"],
  transform: {
    // The build tsconfig has `types: []` so that jest/node globals never leak
    // into the published declarations; tests need them, so use the
    // typecheck config here.
    "\\.ts$": ["ts-jest", { tsconfig: "tsconfig.typecheck.json" }],
    "\\.js$": ["ts-jest", { tsconfig: "tsconfig.typecheck.json" }],
  },
  transformIgnorePatterns: [`/node_modules/(?!${esModules})`],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts"],
  // The suite covers every branch today. Keep it that way: an untested branch
  // is how the uppercase-iota bug reached production.
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
