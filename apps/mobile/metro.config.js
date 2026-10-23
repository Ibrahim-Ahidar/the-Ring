// Monorepo Metro config: watch the repo root and resolve from both node_modules
// folders so @pulse/core and @pulse/i18n (TypeScript source) bundle.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch only what the app imports. Watching the whole repo root makes the Windows
// watcher walk every worktree and time out ("Failed to start watch mode"), and then
// every bundle request fails with "Cannot read properties of undefined (reading 'get')".
config.watchFolders = [
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Skip git worktrees, agent folders and build output: each worktree carries its own
// node_modules, which makes the file crawl take minutes and duplicates every package.
// Anchored to this workspace root so the app still bundles when it runs from a worktree.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const under = (dir) =>
  new RegExp(
    "^" + path.resolve(workspaceRoot, dir).split(/[\\/]/).map(escapeRe).join("[\\\\/]") + "[\\\\/].*",
    "i",
  );
config.resolver.blockList = [
  under(".worktrees"),
  under(".claude"),
  // Metro merges these into one RegExp, so every pattern needs the same flags.
  /[\\/]apps[\\/]desktop[\\/](dist|release)[\\/].*/i,
  /[\\/]apps[\\/]web[\\/]\.next[\\/].*/i,
];

module.exports = config;
