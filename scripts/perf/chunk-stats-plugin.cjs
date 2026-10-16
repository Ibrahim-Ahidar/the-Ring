// Dev-only helper: with PULSE_CHUNK_STATS=1, `next build` writes
// .next/chunk-stats.json mapping each client chunk to its modules and sizes.
// Used by the perf effort to see what ships in First Load JS without adding a
// bundle-analyzer dependency.
const fs = require("node:fs");
const path = require("node:path");

class ChunkStatsPlugin {
  apply(compiler) {
    compiler.hooks.done.tap("ChunkStatsPlugin", (stats) => {
      const json = stats.toJson({
        all: false,
        chunks: true,
        chunkModules: true,
        chunkRelations: false,
        ids: true,
        moduleAssets: false,
      });
      const chunks = (json.chunks || []).map((chunk) => ({
        id: chunk.id,
        files: chunk.files,
        size: chunk.size,
        modules: (chunk.modules || [])
          .map((m) => ({ name: m.name, size: m.size }))
          .sort((a, b) => b.size - a.size),
      }));
      const out = path.join(compiler.options.context, ".next", "chunk-stats.json");
      fs.writeFileSync(out, JSON.stringify(chunks, null, 1));
    });
  }
}

module.exports = { ChunkStatsPlugin };
