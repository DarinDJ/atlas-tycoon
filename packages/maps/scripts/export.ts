/** Export all maps as JSON for the editor / static hosting:  npm run export -w @bt/maps */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMaps } from '../src/index.js';

const out = process.argv[2] ?? join(process.cwd(), 'dist-json');
mkdirSync(out, { recursive: true });
for (const map of listMaps()) {
  writeFileSync(join(out, `${map.id}.json`), JSON.stringify(map, null, 2));
  console.log(`wrote ${map.id}.json`);
}
