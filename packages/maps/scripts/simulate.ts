/**
 * Bot-vs-bot balance simulator.
 *   npm run simulate -- --map india-cities --games 500 --players 4 --levels medium,hard
 */
import { runSimulations, type BotLevel } from '@bt/engine';
import { getMap, listMaps } from '../src/index.js';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a.startsWith('--'))
    args.set(
      a.slice(2),
      process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[++i]! : 'true',
    );
}
const mapId = args.get('map') ?? 'india-cities';
const map = getMap(mapId);
if (!map) {
  console.error(
    `Unknown map ${mapId}. Available: ${listMaps()
      .map((m) => m.id)
      .join(', ')}`,
  );
  process.exit(1);
}
const games = Number(args.get('games') ?? 200);
const players = Number(args.get('players') ?? 4);
const levels = (args.get('levels') ?? 'medium').split(',') as BotLevel[];
const seed = Number(args.get('seed') ?? 1);
const maxTurns = Number(args.get('maxTurns') ?? 600);
const json = args.get('json') === 'true';

console.log(
  `Simulating ${games} games of ${map.name}: ${players} players, levels ${levels.join('/')}, seed ${seed}`,
);
const rep = runSimulations(map, games, { players, levels, seed, maxTurns });
if (json) {
  console.log(JSON.stringify(rep, null, 2));
} else {
  console.log(`\nFinished in ${(rep.elapsedMs / 1000).toFixed(1)}s`);
  console.log(
    `Average game length: ${rep.avgTurns.toFixed(0)} turns (median ${rep.medianTurns}), ${rep.avgActions.toFixed(0)} actions`,
  );
  console.log(`Hit turn limit: ${(rep.turnLimitRate * 100).toFixed(1)}%`);
  console.log(
    `Win rate by seat: ${rep.winRateBySeat.map((w, i) => `S${i + 1} ${(w * 100).toFixed(1)}%`).join('  ')}`,
  );
  console.log(
    `Win rate by level (per seat): ${Object.entries(rep.winRateByLevel)
      .map(([l, w]) => `${l} ${(w * 100).toFixed(1)}%`)
      .join('  ')}`,
  );
  console.log(
    `Avg properties bought ${rep.avgPropertiesBought.toFixed(1)}, houses built ${rep.avgHousesBuilt.toFixed(1)}, trades ${rep.avgTrades.toFixed(1)}, auctions ${rep.avgAuctions.toFixed(1)}, bankruptcies ${rep.avgBankruptcies.toFixed(2)}`,
  );
  const rentRows = Object.entries(rep.tileRent)
    .map(([i, r]) => ({ tile: map.tiles[Number(i)]!.name, rent: r / games }))
    .sort((a, b) => b.rent - a.rent)
    .slice(0, 10);
  console.log('\nTop rent earners (per game):');
  for (const r of rentRows) console.log(`  ${r.tile.padEnd(22)} ${r.rent.toFixed(0)}`);
}
