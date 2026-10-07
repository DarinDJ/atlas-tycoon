import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';

const EMOTES = ['👍', '😂', '😭', '🔥', '🙏', '😱', '🤝', '💸', '🎉', '😈'];
const QUICK = ['gg', 'nice', 'oops', 'hurry', 'trade?', 'no'];

export function Chat({ canSend }: { canSend: boolean }) {
  const t = useT();
  const chat = useGame((s) => s.chat);
  const me = useGame((s) => s.me);
  const send = useGame((s) => s.sendChat);
  const emote = useGame((s) => s.sendEmote);
  const markRead = useGame((s) => s.markChatRead);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
    markRead();
  }, [chat.length, markRead]);
  return (
    <div className="flex h-full flex-col" data-testid="chat">
      <div ref={ref} className="flex flex-1 flex-col gap-1 overflow-y-auto text-sm scrollbar-thin">
        {chat.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-2 py-1 ${m.system ? 'text-center text-xs opacity-60' : m.playerId === me ? 'self-end bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]' : 'self-start bg-[var(--panel-muted)]'} ${m.emote ? 'text-2xl' : ''}`}
          >
            {!m.system && m.playerId !== me && (
              <span className="mr-1 text-xs font-bold opacity-70">{m.name}</span>
            )}
            {m.text}
          </div>
        ))}
      </div>
      {canSend && (
        <>
          <div className="mt-1 flex gap-1 overflow-x-auto py-1 scrollbar-thin">
            {EMOTES.map((e) => (
              <button
                key={e}
                className="shrink-0 rounded-lg px-1.5 text-lg hover:bg-[var(--panel-muted)]"
                onClick={() => emote(e)}
                aria-label={`emote ${e}`}
              >
                {e}
              </button>
            ))}
            {QUICK.map((q) => (
              <button
                key={q}
                className="shrink-0 rounded-lg bg-[var(--panel-muted)] px-2 text-xs font-semibold"
                onClick={() => emote(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim();
              if (!v) return;
              send(v);
              setText('');
            }}
          >
            <input
              className="input py-1.5"
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('game.chatPlaceholder')}
              aria-label={t('game.chat')}
            />
            <button className="btn btn-primary btn-sm" type="submit">
              {t('game.send')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
