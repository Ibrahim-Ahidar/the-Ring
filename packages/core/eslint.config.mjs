import tsParser from "@typescript-eslint/parser";

const nodeBuiltins = [
  "fs", "path", "crypto", "os", "child_process", "http", "https",
  "stream", "url", "util", "buffer", "events",
];

// @pulse/core is platform-neutral: no Next.js, server-only, react-dom, or Node built-ins.
export default [
  // node-sqlite-executor is a test-only executor for vitest; runs on Node, never shipped to clients.
  { ignores: ["node_modules/**", "coverage/**", "src/local-store/node-sqlite-executor.ts"] },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...["next", "react-dom", "server-only"].map((name) => ({
              name,
              message: "@pulse/core must stay platform-neutral.",
            })),
            ...nodeBuiltins.map((name) => ({
              name,
              message: "@pulse/core must not use Node built-ins.",
            })),
          ],
          patterns: [
            { group: ["next/*", "react-dom/*", "node:*"], message: "@pulse/core must stay platform-neutral." },
            ...nodeBuiltins.map((name) => ({ group: [`${name}/*`], message: "@pulse/core must not use Node built-ins." })),
          ],
        },
      ],
    },
  },
  // Test-only SQLite executor for vitest under Node; never imported by app code paths.
  {
    files: ["src/local-store/node-sqlite-executor.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];
