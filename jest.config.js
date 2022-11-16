const esModules = "(escape-string-regexp)";

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "\\.ts$": "ts-jest",
    "\\.js$": "ts-jest",
  },
  transformIgnorePatterns: [`/node_modules/(?!${esModules})`],
};
