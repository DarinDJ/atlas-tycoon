import type { MapDefinition, PropertyTile, Tile } from '../../src/types/map.js';

function prop(
  id: string,
  group: string,
  price: number,
  rent: PropertyTile['rent'],
  houseCost: number,
): PropertyTile {
  return { id, name: id.toUpperCase(), type: 'property', group, price, rent, houseCost };
}

const groups = [
  { id: 'g1', name: 'Group 1', color: '#8b5a2b' },
  { id: 'g2', name: 'Group 2', color: '#aae0fa' },
  { id: 'g3', name: 'Group 3', color: '#d93a96' },
  { id: 'g4', name: 'Group 4', color: '#f7941d' },
  { id: 'g5', name: 'Group 5', color: '#ed1b24' },
  { id: 'g6', name: 'Group 6', color: '#fef200' },
  { id: 'g7', name: 'Group 7', color: '#1fb25a' },
  { id: 'g8', name: 'Group 8', color: '#0072bb' },
];

const transport = (id: string): Tile => ({
  id,
  name: id,
  type: 'transport',
  price: 200,
  rent: [25, 50, 100, 200],
});
const utility = (id: string): Tile => ({ id, name: id, type: 'utility', price: 150, multipliers: [4, 10] });

export const tiles: Tile[] = [
  { id: 'start', name: 'Start', type: 'start' },
  prop('p1', 'g1', 60, [2, 10, 30, 90, 160, 250], 50),
  { id: 'treasure1', name: 'Treasure', type: 'treasure' },
  prop('p2', 'g1', 60, [4, 20, 60, 180, 320, 450], 50),
  { id: 'tax1', name: 'Income Tax', type: 'tax', amount: 200, percentOfNetWorth: 10 },
  transport('t1'),
  prop('p3', 'g2', 100, [6, 30, 90, 270, 400, 550], 50),
  { id: 'luck1', name: 'Luck', type: 'luck' },
  prop('p4', 'g2', 100, [6, 30, 90, 270, 400, 550], 50),
  prop('p5', 'g2', 120, [8, 40, 100, 300, 450, 600], 50),
  { id: 'jail', name: 'Jail', type: 'jail' },
  prop('p6', 'g3', 140, [10, 50, 150, 450, 625, 750], 100),
  utility('u1'),
  prop('p7', 'g3', 140, [10, 50, 150, 450, 625, 750], 100),
  prop('p8', 'g3', 160, [12, 60, 180, 500, 700, 900], 100),
  transport('t2'),
  prop('p9', 'g4', 180, [14, 70, 200, 550, 750, 950], 100),
  { id: 'treasure2', name: 'Treasure', type: 'treasure' },
  prop('p10', 'g4', 180, [14, 70, 200, 550, 750, 950], 100),
  prop('p11', 'g4', 200, [16, 80, 220, 600, 800, 1000], 100),
  { id: 'parking', name: 'Free Parking', type: 'freeparking' },
  prop('p12', 'g5', 220, [18, 90, 250, 700, 875, 1050], 150),
  { id: 'luck2', name: 'Luck', type: 'luck' },
  prop('p13', 'g5', 220, [18, 90, 250, 700, 875, 1050], 150),
  prop('p14', 'g5', 240, [20, 100, 300, 750, 925, 1100], 150),
  transport('t3'),
  prop('p15', 'g6', 260, [22, 110, 330, 800, 975, 1150], 150),
  prop('p16', 'g6', 260, [22, 110, 330, 800, 975, 1150], 150),
  utility('u2'),
  prop('p17', 'g6', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { id: 'gotojail', name: 'Go To Jail', type: 'gotojail' },
  prop('p18', 'g7', 300, [26, 130, 390, 900, 1100, 1275], 200),
  prop('p19', 'g7', 300, [26, 130, 390, 900, 1100, 1275], 200),
  { id: 'treasure3', name: 'Treasure', type: 'treasure' },
  prop('p20', 'g7', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  transport('t4'),
  { id: 'luck3', name: 'Luck', type: 'luck' },
  prop('p21', 'g8', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { id: 'tax2', name: 'Luxury Tax', type: 'tax', amount: 100 },
  prop('p22', 'g8', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export const testMap: MapDefinition = {
  schema: 1,
  id: 'test-map',
  name: 'Test Map',
  country: 'Testland',
  currency: { code: 'USD', symbol: '$', style: 'plain', locale: 'en-US' },
  economy: { startingCash: 1500, salary: 200, jailFine: 50, auctionMinIncrement: 10 },
  theme: {
    primary: '#000',
    secondary: '#111',
    accent: '#222',
    boardBg: '#fff',
    tileBg: '#eee',
    text: '#000',
  },
  groups,
  tiles,
  cards: {
    luck: [
      { id: 'l-advance-start', text: 'Advance to Start', effect: { kind: 'moveTo', tileId: 'start' } },
      { id: 'l-back3', text: 'Go back 3', effect: { kind: 'moveBy', steps: -3 } },
      { id: 'l-jail', text: 'Go to jail', effect: { kind: 'gotoJail' } },
      { id: 'l-jailfree', text: 'Get out of jail free', effect: { kind: 'jailFree' } },
      { id: 'l-repairs', text: 'Repairs', effect: { kind: 'repairs', perHouse: 25, perHotel: 100 } },
      { id: 'l-pay50', text: 'Pay 50', effect: { kind: 'money', amount: -50 } },
      {
        id: 'l-nearest-t',
        text: 'Nearest transport',
        effect: { kind: 'nearest', tileType: 'transport', rentMultiplier: 2 },
      },
      {
        id: 'l-nearest-u',
        text: 'Nearest utility',
        effect: { kind: 'nearest', tileType: 'utility', rentMultiplier: 10 },
      },
      { id: 'l-p22', text: 'Advance to p22', effect: { kind: 'moveTo', tileId: 'p22' } },
    ],
    treasure: [
      { id: 't-collect200', text: 'Collect 200', effect: { kind: 'money', amount: 200 } },
      { id: 't-each50', text: 'Collect 50 from each', effect: { kind: 'eachPlayer', amount: 50 } },
      { id: 't-payeach50', text: 'Pay each 50', effect: { kind: 'eachPlayer', amount: -50 } },
      { id: 't-jailfree', text: 'Get out of jail free', effect: { kind: 'jailFree' } },
      { id: 't-start', text: 'Advance to Start', effect: { kind: 'moveTo', tileId: 'start' } },
    ],
  },
};

export const cardIndex = (deck: 'luck' | 'treasure', id: string): number =>
  testMap.cards[deck].findIndex((c) => c.id === id);
