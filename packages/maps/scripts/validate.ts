import { analyzeBalance, validateMap } from '@bt/engine';
import { listMaps } from '../src/index.js';

let failed = false;
for (const map of listMaps()) {
  const v = validateMap(map);
  const errors = v.issues.filter((i) => i.level === 'error');
  const warnings = v.issues.filter((i) => i.level === 'warning');
  console.log(
    `\n== ${map.name} (${map.id}) : ${map.tiles.length} tiles, ${map.cards.luck.length}+${map.cards.treasure.length} cards`,
  );
  for (const i of errors) console.log(`  ERROR   ${i.path}: ${i.message}`);
  for (const i of warnings) console.log(`  warn    ${i.path}: ${i.message}`);
  if (!v.ok) failed = true;
  const b = analyzeBalance(map);
  console.log(
    `  total property value ${b.totalPropertyValue}, starting cash ratio ${b.startingCashRatio.toFixed(2)}`,
  );
  for (const g of b.groups) {
    console.log(
      `  ${g.name.padEnd(22)} set ${String(g.setCost).padStart(5)}  +hotels ${String(g.fullBuildCost).padStart(5)}  hotel-rent ${String(Math.round(g.avgHotelRent)).padStart(5)}  ROI ${g.hotelRoi.toFixed(2)}  payback ${g.paybackLaps.toFixed(0)} laps`,
    );
  }
  for (const w of b.warnings) console.log(`  balance ${w}`);
}
if (failed) {
  console.error('\nMap validation FAILED');
  process.exit(1);
}
console.log('\nAll maps valid.');
