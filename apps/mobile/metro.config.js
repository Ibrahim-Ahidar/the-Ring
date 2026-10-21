// Monorepo Metro config: watch the repo root and resolve from both node_modules
// folders so @pulse/core and @pulse/i18n (TypeScript source) bundle.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Skip git worktrees, agent folders and build output: each worktree carries its own
// node_modules, which makes the file crawl take minutes and duplicates every package.
config.resolver.blockList = [
  /[\\/]\.worktrees[\\/].*/,
  /[\\/]\.claude[\\/].*/,
  /[\\/]apps[\\/]desktop[\\/](dist|release)[\\/].*/,
  /[\\/]apps[\\/]web[\\/]\.next[\\/].*/,
];

module.exports = config;
