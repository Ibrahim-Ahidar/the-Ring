module.exports = {
  preset: "jest-expo",
  // testRegex, not testMatch: globs skip dot folders such as .worktrees.
  roots: ["<rootDir>/src", "<rootDir>/modules"],
  testRegex: "\\.test\\.tsx?$",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
