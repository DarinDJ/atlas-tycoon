/** Validate + quick-simulate a single map file:  npx tsx scripts/validate-one.ts src/usa-cities.ts */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { analyzeBalance, runSimulations, validateMap, type MapDefinition } from '@bt/engine';

const file = process.argv[2];
if (!file) {
  console.error('usage: validate-one <file.ts>');
  process.exit(1);
}
const mod = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
const maps = Object.values(mod).filter(
  (v): v is MapDefinition => !!v && typeof v === 'object' && (v as MapDefinition).schema === 1,
);
if (maps.length === 0) {
  console.error('No MapDefinition exports found');
  process.exit(1);
}
let failed = false;
for (const map of maps) {
  const v = validateMap(map);
  console.log(`== ${map.name} (${map.id}): ${map.tiles.length} tiles`);
  for (const i of v.issues) console.log(`  ${i.level.toUpperCase().padEnd(7)} ${i.path}: ${i.message}`);
  if (!v.ok) {
    failed = true;
    continue;
  }
  const b = analyzeBalance(map);
  for (const g of b.groups)
    console.log(
      `  ${g.name.padEnd(22)} set ${g.setCost} hotelROI ${g.hotelRoi.toFixed(2)} payback ${g.paybackLaps.toFixed(0)}`,
    );
  for (const w of b.warnings) console.log(`  balance: ${w}`);
  const rep = runSimulations(map, 20, { players: 4, seed: 1 });
  console.log(
    `  20 sim games: avg ${rep.avgTurns.toFixed(0)} turns, turn-limit ${(rep.turnLimitRate * 100).toFixed(0)}%, seat wins ${rep.winRateBySeat.map((w) => (w * 100).toFixed(0) + '%').join('/')}`,
  );
}
process.exit(failed ? 1 : 0);
