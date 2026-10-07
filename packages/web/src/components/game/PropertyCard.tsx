import type { GameState, LegalActions, MapDefinition } from '@bt/engine';
import { computeRent, mortgageValue, isOwnable, unmortgageCost } from '@bt/engine';
import { motion } from 'framer-motion';
import { groupName, money, tileFact, tileName, useI18n, useT } from '../../i18n';
import { groupColor, tileArtStyle, tileGlyph } from '../../lib/tileArt';
import { useGame } from '../../store/useGame';
import { Modal } from '../ui/Modal';

interface Props {
  index: number | null;
  map: MapDefinition;
  game: GameState | null;
  legal: LegalActions | null;
  me: string | null;
  onClose(): void;
}

/** Property / tile detail card with build, mortgage and trade actions. Opens as a modal on tap. */
export function PropertyCard({ index, map, game, legal, me, onClose }: Props) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const act = useGame((s) => s.act);
  const openTrade = useGame((s) => s.openTrade);
  const tile = index !== null ? map.tiles[index] : undefined;
  const own = index !== null ? game?.ownership[index] : undefined;
  const owner = own ? game?.players.find((p) => p.id === own.owner) : undefined;
  const color = tile ? groupColor(map, tile) : null;
  const can = (list: number[] | undefined) => !!index && index !== null && !!list?.includes(index);
  const canBuild = index !== null && !!legal?.build.includes(index);
  const canSell = index !== null && !!legal?.sellHouse.includes(index);
  const canMortgage = can(legal?.mortgage);
  const canUnmortgage = can(legal?.unmortgage);

  return (
    <Modal open={index !== null} onClose={onClose} size="sm">
      {tile && index !== null && (
        <motion.div
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-3"
          data-testid="property-card"
        >
          <div className="relative h-28 overflow-hidden rounded-xl" style={tileArtStyle(tile, map)}>
            {color && <div className="absolute inset-x-0 top-0 h-2" style={{ background: color }} />}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-2 text-white">
              <div>
                <div className="text-lg leading-tight font-extrabold">
                  {tileGlyph(tile)} {tileName(map, index, lang)}
                </div>
                {tile.type === 'property' && (
                  <div className="text-xs opacity-90">{groupName(map, tile.group, lang)}</div>
                )}
              </div>
              {'price' in tile && <div className="text-base font-bold">{money(map, tile.price)}</div>}
            </div>
          </div>

          {owner && (
            <div className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: owner.color }} />
              <span>
                {t('game.owner')}: <b>{owner.name}</b>
              </span>
              {own?.mortgaged && (
                <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">{t('game.mortgaged')}</span>
              )}
              {own && own.houses > 0 && (
                <span className="text-xs">
                  {own.houses === 5 ? '🏨 ' + t('game.hotel') : '🏠'.repeat(own.houses)}
                </span>
              )}
            </div>
          )}
          {isOwnable(tile) && !owner && <div className="text-sm opacity-70">{t('game.unowned')}</div>}

          {tile.type === 'property' && (
            <table className="w-full text-sm">
              <tbody>
                <tr className={own && own.houses === 0 ? 'font-bold' : ''}>
                  <td>{t('game.rent')}</td>
                  <td className="text-right tabular-nums">{money(map, tile.rent[0])}</td>
                </tr>
                <tr className="opacity-80">
                  <td className="pl-3">{t('game.rentWithSet')}</td>
                  <td className="text-right tabular-nums">{money(map, tile.rent[0] * 2)}</td>
                </tr>
                {[1, 2, 3, 4].map((h) => (
                  <tr key={h} className={own?.houses === h ? 'font-bold' : ''}>
                    <td>{'🏠'.repeat(h)}</td>
                    <td className="text-right tabular-nums">{money(map, tile.rent[h as 1 | 2 | 3 | 4])}</td>
                  </tr>
                ))}
                <tr className={own?.houses === 5 ? 'font-bold' : ''}>
                  <td>🏨 {t('game.hotel')}</td>
                  <td className="text-right tabular-nums">{money(map, tile.rent[5])}</td>
                </tr>
                <tr className="border-t border-black/10 opacity-80">
                  <td>{t('game.houseCost')}</td>
                  <td className="text-right tabular-nums">{money(map, tile.houseCost)}</td>
                </tr>
                <tr className="opacity-80">
                  <td>{t('game.mortgageValue')}</td>
                  <td className="text-right tabular-nums">{money(map, mortgageValue(tile))}</td>
                </tr>
              </tbody>
            </table>
          )}
          {tile.type === 'transport' && (
            <table className="w-full text-sm">
              <tbody>
                {tile.rent.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {i + 1} {i === 0 ? 'owned' : 'owned'}
                    </td>
                    <td className="text-right tabular-nums">{money(map, r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tile.type === 'utility' && (
            <ul className="text-sm">
              {tile.multipliers.map((m, i) => (
                <li key={i}>
                  {i + 1} owned: {m}× dice
                </li>
              ))}
            </ul>
          )}
          {tile.type === 'tax' && (
            <p className="text-sm">
              {money(map, tile.amount)}
              {tile.percentOfNetWorth
                ? ` or ${tile.percentOfNetWorth}% of net worth, whichever is lower`
                : ''}
            </p>
          )}
          {tile.type === 'special' && <p className="text-sm">{tile.description}</p>}
          {game && owner && isOwnable(tile) && owner.id !== me && (
            <p className="text-xs opacity-70">
              {t('game.rent')} now: <b>{money(map, computeRent(game, map, index, 7))}</b>
            </p>
          )}

          {tileFact(map, index, lang) && (
            <p className="rounded-lg bg-black/5 p-2 text-xs">
              <b>{t('game.fact')}</b> {tileFact(map, index, lang)}
            </p>
          )}

          {me && own?.owner === me && isOwnable(tile) && (
            <div className="flex flex-wrap gap-2">
              {tile.type === 'property' && (
                <>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!canBuild}
                    data-testid="build"
                    onClick={() => void act({ type: 'build', tile: index })}
                  >
                    🏠{' '}
                    {own.houses === 4
                      ? t('game.buildHotel', { cost: money(map, tile.houseCost) })
                      : t('game.build', { cost: money(map, tile.houseCost) })}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!canSell}
                    onClick={() => void act({ type: 'sellHouse', tile: index })}
                  >
                    {t('game.sellHouse', { refund: money(map, Math.floor(tile.houseCost / 2)) })}
                  </button>
                </>
              )}
              {!own.mortgaged ? (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!canMortgage}
                  onClick={() => void act({ type: 'mortgage', tile: index })}
                >
                  {t('game.mortgage', { amount: money(map, mortgageValue(tile)) })}
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!canUnmortgage}
                  onClick={() => void act({ type: 'unmortgage', tile: index })}
                >
                  {t('game.unmortgage', { cost: money(map, game ? unmortgageCost(game, tile) : 0) })}
                </button>
              )}
            </div>
          )}
          {me && owner && owner.id !== me && !owner.bankrupt && (
            <button
              className="btn btn-secondary btn-sm self-start"
              onClick={() => {
                onClose();
                openTrade(owner.id);
              }}
            >
              🤝 {t('game.trade')}
            </button>
          )}
        </motion.div>
      )}
    </Modal>
  );
}
