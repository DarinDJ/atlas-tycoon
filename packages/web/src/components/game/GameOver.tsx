import type { GameState, MapDefinition } from '@bt/engine';
import { netWorth } from '@bt/engine';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../config/brand';
import { mapName, money, useI18n, useT } from '../../i18n';
import { api } from '../../lib/api';
import { renderShareCard, shareBlob, whatsappUrl } from '../../lib/shareCard';
import { useGame } from '../../store/useGame';
import { AdSlot } from '../AdSlot';
import { Confetti } from '../Confetti';
import { AVATARS, glyphFor } from '../../config/cosmetics';

interface Props {
  game: GameState;
  map: MapDefinition;
  me: string | null;
  isHost: boolean;
  adsEnabled: boolean;
  entitlements: string[];
}

export function GameOver({ game, map, me, isHost, adsEnabled, entitlements }: Props) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const emit = useGame((s) => s.emit);
  const leave = useGame((s) => s.leaveRoom);
  const toast = useGame((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const winner = game.players.find((p) => p.id === game.winner);
  const iWon = !!me && game.winner === me;
  const ranking = game.ranking.map((id) => game.players.find((p) => p.id === id)!).filter(Boolean);
  const url = `${location.origin}/play/${map.id}`;
  const winnerMoney = winner ? money(map, netWorth(game, map, winner.id)) : '';
  const shareText = t('results.shareWin', {
    map: mapName(map, lang),
    money: winnerMoney,
    url,
    hashtag: BRAND.hashtag,
  });
  const minutes = Math.max(1, Math.round(((game.endedAt ?? Date.now()) - game.startedAt) / 60000));

  const share = async () => {
    setBusy(true);
    void api.track('share_clicked', { map: map.id });
    const blob = await renderShareCard({
      title: BRAND.name,
      subtitle: `${t('results.turns', { n: game.turn })} · ${t('results.duration', { m: minutes })}`,
      winnerName: winner?.name ?? '—',
      money: winnerMoney,
      mapName: mapName(map, lang),
      ranking: ranking.map((p) => ({
        name: p.name,
        money: money(map, netWorth(game, map, p.id)),
        color: p.color,
      })),
      brand: BRAND.name,
      url,
      colors: { primary: map.theme.primary, secondary: map.theme.secondary },
    });
    if (blob) {
      const r = await shareBlob(blob, shareText);
      if (r === 'downloaded') toast('info', 'Image saved');
    }
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-3"
      data-testid="game-over"
    >
      <Confetti run={iWon} />
      <motion.div
        className="panel w-full max-w-md p-5"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <div className="text-center">
          <div className="text-5xl">{iWon ? '🏆' : '🎲'}</div>
          <h2 className="mt-2 text-2xl font-black">
            {iWon
              ? t('results.youWon')
              : winner
                ? t('results.winner', { name: winner.name })
                : t('results.youLost')}
          </h2>
          {game.log.some((l) => l.event.type === 'timeUp') && (
            <p className="text-sm opacity-70">{t('results.timeUp')}</p>
          )}
          <p className="text-xs opacity-60">
            {t('results.turns', { n: game.turn })} · {t('results.duration', { m: minutes })}
          </p>
        </div>
        <ol className="mt-4 flex flex-col gap-1">
          {ranking.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${i === 0 ? 'bg-saffron/15 font-bold' : ''}`}
            >
              <span className="w-5 text-right tabular-nums">{i + 1}.</span>
              <span className="text-lg">{glyphFor(AVATARS, p.avatar)}</span>
              <span className="flex-1 truncate" style={{ color: p.color }}>
                {p.name}
                {p.id === me ? ` (${t('app.you')})` : ''}
              </span>
              <span className="tabular-nums">
                {p.bankrupt ? t('game.bankrupt') : money(map, netWorth(game, map, p.id))}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => void share()} disabled={busy}>
              🖼️ {t('results.shareImage')}
            </button>
            <a
              className="btn btn-secondary"
              href={whatsappUrl(shareText)}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
            >
              💬
            </a>
          </div>
          {isHost ? (
            <button
              className="btn btn-primary"
              data-testid="play-again"
              onClick={() => void emit('room:newGame')}
            >
              🔁 {t('results.playAgain')}
            </button>
          ) : (
            <p className="text-center text-xs opacity-60">{t('lobby.waiting')}</p>
          )}
          <Link to="/" className="btn btn-ghost" onClick={() => void leave()}>
            {t('results.backHome')}
          </Link>
        </div>
        <AdSlot placement="results" enabled={adsEnabled} entitlements={entitlements} className="mt-3" />
      </motion.div>
    </div>
  );
}
