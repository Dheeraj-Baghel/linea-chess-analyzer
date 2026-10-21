import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Build-only manifest for the exact app/engine/piece bytes. No provider API or
// another workspace application's assets are included in the offline cache.
export function lineaOfflineBuild() {
  return { name: 'linea-offline-build', apply: 'build', enforce: 'post',
    async generateBundle(_, bundle) {
      const members = new Map();
      for (const [name, artifact] of Object.entries(bundle)) members.set('/' + name, artifact.type === 'chunk' ? artifact.code : artifact.source);
      async function collect(directory) {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) await collect(file);
          else if (!['linea-sw.js'].includes(entry.name)) members.set('/' + path.relative('public', file).split(path.sep).join('/'), await fs.readFile(file));
        }
      }
      await collect('public');
      const hashes = [...members].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]).sort(([a], [b]) => a.localeCompare(b));
      const version = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
      // A direct review must not prefetch the large optional homepage renderer.
      const optionalAssets = hashes.map(([name]) => name).filter(name => /HeroChessScene/.test(name));
      this.emitFile({ type: 'asset', fileName: 'linea-offline-version.js', source: `self.LINEA_OFFLINE = ${JSON.stringify({ version, assets: hashes.map(([name]) => name).filter(name => !optionalAssets.includes(name)), optionalAssets })};\n` });
    },
  };
}
