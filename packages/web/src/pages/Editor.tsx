import type { MapDefinition, Tile } from '@bt/engine';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '../components/board/Board';
import { useT } from '../i18n';
import { api, type MapSummary } from '../lib/api';
import { readJson, writeJson } from '../lib/storage';

interface Issue {
  level: string;
  path: string;
  message: string;
}
interface Balance {
  groups: {
    groupId: string;
    name: string;
    setCost: number;
    fullBuildCost: number;
    avgHotelRent: number;
    hotelRoi: number;
    paybackLaps: number;
  }[];
  warnings: string[];
}
interface SimReport {
  games: number;
  avgTurns: number;
  medianTurns: number;
  turnLimitRate: number;
  winRateBySeat: number[];
  avgPropertiesBought: number;
  avgHousesBuilt: number;
  avgTrades: number;
  avgBankruptcies: number;
  tileRent: Record<string, number>;
  elapsedMs: number;
}

const DRAFT_KEY = 'bt.editor.draft';

/**
 * Map editor: load a built-in map or JSON, edit tiles/groups/cards/economy with live board preview,
 * validate against the engine schema, run the balance simulator, export JSON.
 */
export default function Editor() {
  const t = useT();
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [map, setMap] = useState<MapDefinition | null>(() => readJson<MapDefinition | null>(DRAFT_KEY, null));
  const [selected, setSelected] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [sim, setSim] = useState<SimReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'tile' | 'map' | 'cards' | 'json'>('tile');
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    void api
      .maps()
      .then(setMaps)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (map) writeJson(DRAFT_KEY, map);
  }, [map]);

  const update = (fn: (m: MapDefinition) => void) => {
    setMap((m) => {
      if (!m) return m;
      const copy = structuredClone(m);
      fn(copy);
      return copy;
    });
  };

  const load = async (id: string) => {
    const m = await api.map(id);
    setMap(structuredClone(m));
    setSelected(null);
    setIssues([]);
    setBalance(null);
    setSim(null);
  };

  const validate = async () => {
    if (!map) return;
    setBusy(true);
    try {
      const r = await api.validateMap(map);
      setIssues(r.issues);
      setBalance(r.balance as Balance | null);
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (games: number) => {
    if (!map) return;
    setBusy(true);
    try {
      setSim((await api.simulate(map, games, 4)) as unknown as SimReport);
    } catch {
      setIssues([{ level: 'error', path: '', message: 'Simulation failed (is the map valid?)' }]);
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    if (!map) return;
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${map.id}.json`;
    a.click();
  };

  const importJson = (file: File) => {
    void file.text().then((txt) => {
      try {
        setMap(JSON.parse(txt) as MapDefinition);
        setIssues([]);
      } catch {
        setIssues([{ level: 'error', path: '', message: 'Invalid JSON' }]);
      }
    });
  };

  const tile = map && selected !== null ? map.tiles[selected] : null;
  const rentHeat = useMemo(() => {
    if (!sim || !map) return null;
    const max = Math.max(1, ...Object.values(sim.tileRent));
    return map.tiles.map((_, i) => (sim.tileRent[String(i)] ?? 0) / max);
  }, [sim, map]);

  return (
    <main
      id="main"
      className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-[calc(var(--safe-top)+1rem)] pb-16"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/" className="text-sm underline opacity-70">
            ← {t('app.back')}
          </Link>
          <h1 className="text-2xl font-black">🛠️ {t('editor.title')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input w-auto"
            onChange={(e) => e.target.value && void load(e.target.value)}
            defaultValue=""
            aria-label="Load map"
          >
            <option value="">Load built-in map…</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.flag} {m.name}
              </option>
            ))}
          </select>
          <label className="btn btn-secondary btn-sm cursor-pointer">
            📂 Import JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
          </label>
          <button className="btn btn-secondary btn-sm" disabled={!map} onClick={exportJson}>
            💾 Export JSON
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!map || busy}
            onClick={() => void validate()}
            data-testid="validate"
          >
            ✅ Validate
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!map || busy}
            onClick={() => void simulate(50)}
          >
            🤖 Simulate 50
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!map || busy}
            onClick={() => void simulate(300)}
          >
            🤖 Simulate 300
          </button>
        </div>
      </header>

      {!map && (
        <p className="panel p-6 text-center opacity-70">
          Load a built-in map or import a JSON file to begin. Maps are plain data: edit, validate, simulate,
          export, then drop the file into packages/maps/src.
        </p>
      )}

      {map && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="relative">
            <Board map={map} game={null} selectedTile={selected} onSelect={setSelected}>
              <div className="p-3 text-center text-white drop-shadow">
                <div className="text-xl font-black">{map.name}</div>
                <div className="text-xs">
                  {map.tiles.length} tiles · {map.groups.length} groups
                </div>
              </div>
            </Board>
            {rentHeat && (
              <div
                className="pointer-events-none absolute inset-0 grid"
                style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}
              >
                <div className="absolute right-2 bottom-2 rounded bg-[var(--panel)]/90 p-1 text-[10px]">
                  Rent heat-map from last simulation: top earners outlined in red
                </div>
              </div>
            )}
          </div>

          <div className="panel flex flex-col gap-3 p-3">
            <div className="flex gap-1" role="tablist">
              {(['tile', 'map', 'cards', 'json'] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  className={`btn btn-sm flex-1 ${tab === k ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setTab(k)}
                >
                  {k === 'tile' ? 'Tile' : k === 'map' ? 'Map & economy' : k === 'cards' ? 'Cards' : 'JSON'}
                </button>
              ))}
            </div>

            {tab === 'tile' && (
              <div className="flex flex-col gap-2 text-sm">
                {!tile && <p className="opacity-60">{t('game.pickOne')}</p>}
                {tile && selected !== null && (
                  <>
                    <div className="text-xs opacity-60">
                      #{selected} · {tile.type}
                    </div>
                    <label className="flex flex-col gap-1">
                      Name
                      <input
                        className="input"
                        value={tile.name}
                        onChange={(e) => update((m) => void (m.tiles[selected]!.name = e.target.value))}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Id (slug, used by cards)
                      <input
                        className="input"
                        value={tile.id}
                        onChange={(e) => update((m) => void (m.tiles[selected]!.id = e.target.value))}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        Emoji
                        <input
                          className="input"
                          value={tile.emoji ?? ''}
                          onChange={(e) => update((m) => void (m.tiles[selected]!.emoji = e.target.value))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Type
                        <select
                          className="input"
                          value={tile.type}
                          onChange={(e) =>
                            update((m) => {
                              m.tiles[selected] = convertTile(
                                m.tiles[selected]!,
                                e.target.value as Tile['type'],
                                m,
                              );
                            })
                          }
                        >
                          {[
                            'property',
                            'transport',
                            'utility',
                            'tax',
                            'luck',
                            'treasure',
                            'start',
                            'jail',
                            'gotojail',
                            'freeparking',
                            'special',
                          ].map((ty) => (
                            <option key={ty}>{ty}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      Fun fact
                      <textarea
                        className="input"
                        rows={2}
                        value={tile.fact ?? ''}
                        onChange={(e) => update((m) => void (m.tiles[selected]!.fact = e.target.value))}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Image URL (optional)
                      <input
                        className="input"
                        value={tile.image ?? ''}
                        onChange={(e) =>
                          update((m) => void (m.tiles[selected]!.image = e.target.value || undefined))
                        }
                      />
                    </label>
                    {tile.type === 'property' && (
                      <>
                        <label className="flex flex-col gap-1">
                          Group
                          <select
                            className="input"
                            value={tile.group}
                            onChange={(e) =>
                              update((m) => void ((m.tiles[selected] as typeof tile).group = e.target.value))
                            }
                          >
                            {map.groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            Price
                            <input
                              type="number"
                              className="input"
                              value={tile.price}
                              onChange={(e) =>
                                update(
                                  (m) =>
                                    void ((m.tiles[selected] as typeof tile).price = Number(e.target.value)),
                                )
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            House cost
                            <input
                              type="number"
                              className="input"
                              value={tile.houseCost}
                              onChange={(e) =>
                                update(
                                  (m) =>
                                    void ((m.tiles[selected] as typeof tile).houseCost = Number(
                                      e.target.value,
                                    )),
                                )
                              }
                            />
                          </label>
                        </div>
                        <div className="text-xs font-semibold">Rent: base, 1-4 houses, hotel</div>
                        <div className="grid grid-cols-6 gap-1">
                          {tile.rent.map((r, i) => (
                            <input
                              key={i}
                              type="number"
                              className="input px-1 text-center"
                              value={r}
                              onChange={(e) =>
                                update(
                                  (m) =>
                                    void ((m.tiles[selected] as typeof tile).rent[i] = Number(
                                      e.target.value,
                                    )),
                                )
                              }
                              aria-label={`rent ${i}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    {(tile.type === 'transport' || tile.type === 'utility') && (
                      <label className="flex flex-col gap-1">
                        Price
                        <input
                          type="number"
                          className="input"
                          value={tile.price}
                          onChange={(e) =>
                            update(
                              (m) => void ((m.tiles[selected] as typeof tile).price = Number(e.target.value)),
                            )
                          }
                        />
                      </label>
                    )}
                    {tile.type === 'transport' && (
                      <label className="flex flex-col gap-1">
                        Rent by count owned (comma separated)
                        <input
                          className="input"
                          value={tile.rent.join(',')}
                          onChange={(e) =>
                            update(
                              (m) =>
                                void ((m.tiles[selected] as typeof tile).rent = e.target.value
                                  .split(',')
                                  .map(Number)),
                            )
                          }
                        />
                      </label>
                    )}
                    {tile.type === 'utility' && (
                      <label className="flex flex-col gap-1">
                        Dice multipliers by count owned
                        <input
                          className="input"
                          value={tile.multipliers.join(',')}
                          onChange={(e) =>
                            update(
                              (m) =>
                                void ((m.tiles[selected] as typeof tile).multipliers = e.target.value
                                  .split(',')
                                  .map(Number)),
                            )
                          }
                        />
                      </label>
                    )}
                    {tile.type === 'tax' && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          Amount
                          <input
                            type="number"
                            className="input"
                            value={tile.amount}
                            onChange={(e) =>
                              update(
                                (m) =>
                                  void ((m.tiles[selected] as typeof tile).amount = Number(e.target.value)),
                              )
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          % of net worth (optional)
                          <input
                            type="number"
                            className="input"
                            value={tile.percentOfNetWorth ?? ''}
                            onChange={(e) =>
                              update(
                                (m) =>
                                  void ((m.tiles[selected] as typeof tile).percentOfNetWorth = e.target.value
                                    ? Number(e.target.value)
                                    : undefined),
                              )
                            }
                          />
                        </label>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          update(
                            (m) =>
                              void m.tiles.splice(selected + 1, 0, {
                                ...structuredClone(m.tiles[selected]!),
                                id: `${m.tiles[selected]!.id}-copy`,
                              }),
                          )
                        }
                      >
                        Duplicate after
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => update((m) => void m.tiles.splice(selected, 1))}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'map' && (
              <div className="flex flex-col gap-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    Id
                    <input
                      className="input"
                      value={map.id}
                      onChange={(e) => update((m) => void (m.id = e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Name
                    <input
                      className="input"
                      value={map.name}
                      onChange={(e) => update((m) => void (m.name = e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Country
                    <input
                      className="input"
                      value={map.country}
                      onChange={(e) => update((m) => void (m.country = e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Flag
                    <input
                      className="input"
                      value={map.flag ?? ''}
                      onChange={(e) => update((m) => void (m.flag = e.target.value))}
                    />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1">
                    Tagline
                    <input
                      className="input"
                      value={map.tagline ?? ''}
                      onChange={(e) => update((m) => void (m.tagline = e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Currency symbol
                    <input
                      className="input"
                      value={map.currency.symbol}
                      onChange={(e) => update((m) => void (m.currency.symbol = e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Style
                    <select
                      className="input"
                      value={map.currency.style}
                      onChange={(e) =>
                        update(
                          (m) =>
                            void (m.currency.style = e.target.value as MapDefinition['currency']['style']),
                        )
                      }
                    >
                      <option value="plain">plain</option>
                      <option value="indian-lakh">indian-lakh</option>
                      <option value="compact">compact</option>
                    </select>
                  </label>
                  {(['startingCash', 'salary', 'jailFine', 'auctionMinIncrement'] as const).map((k) => (
                    <label key={k} className="flex flex-col gap-1">
                      {k}
                      <input
                        type="number"
                        className="input"
                        value={map.economy[k]}
                        onChange={(e) => update((m) => void (m.economy[k] = Number(e.target.value)))}
                      />
                    </label>
                  ))}
                  {(['primary', 'secondary', 'accent', 'boardBg'] as const).map((k) => (
                    <label key={k} className="flex items-center justify-between gap-2">
                      theme.{k}
                      <input
                        type="color"
                        value={map.theme[k]}
                        onChange={(e) => update((m) => void (m.theme[k] = e.target.value))}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 text-xs font-bold uppercase opacity-60">Groups</div>
                {map.groups.map((g, gi) => (
                  <div key={gi} className="flex items-center gap-1">
                    <input
                      type="color"
                      value={g.color}
                      onChange={(e) => update((m) => void (m.groups[gi]!.color = e.target.value))}
                      aria-label="colour"
                    />
                    <input
                      className="input w-20"
                      value={g.id}
                      onChange={(e) => update((m) => void (m.groups[gi]!.id = e.target.value))}
                      aria-label="group id"
                    />
                    <input
                      className="input"
                      value={g.name}
                      onChange={(e) => update((m) => void (m.groups[gi]!.name = e.target.value))}
                      aria-label="group name"
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => update((m) => void m.groups.splice(gi, 1))}
                      aria-label="remove group"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="btn btn-secondary btn-sm self-start"
                  onClick={() =>
                    update(
                      (m) =>
                        void m.groups.push({
                          id: `group${m.groups.length + 1}`,
                          name: 'New group',
                          color: '#888888',
                        }),
                    )
                  }
                >
                  + Group
                </button>
              </div>
            )}

            {tab === 'cards' && (
              <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto text-sm scrollbar-thin">
                {(['luck', 'treasure'] as const).map((deck) => (
                  <div key={deck}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-bold">
                        {deck} ({map.cards[deck].length})
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          update(
                            (m) =>
                              void m.cards[deck].push({
                                id: `${deck}-${Date.now()}`,
                                text: 'New card. Collect 50.',
                                effect: { kind: 'money', amount: 50 },
                              }),
                          )
                        }
                      >
                        + Card
                      </button>
                    </div>
                    {map.cards[deck].map((c, ci) => (
                      <div
                        key={ci}
                        className="mb-1 flex flex-col gap-1 rounded-lg bg-[var(--panel-muted)] p-2"
                      >
                        <input
                          className="input"
                          value={c.text}
                          onChange={(e) => update((m) => void (m.cards[deck][ci]!.text = e.target.value))}
                          aria-label="card text"
                        />
                        <div className="flex gap-1">
                          <input
                            className="input w-28"
                            value={c.id}
                            onChange={(e) => update((m) => void (m.cards[deck][ci]!.id = e.target.value))}
                            aria-label="card id"
                          />
                          <input
                            className="input font-mono text-xs"
                            value={JSON.stringify(c.effect)}
                            onChange={(e) => {
                              try {
                                const eff = JSON.parse(e.target.value);
                                update((m) => void (m.cards[deck][ci]!.effect = eff));
                              } catch {
                                /* keep typing */
                              }
                            }}
                            aria-label="effect json"
                          />
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => update((m) => void m.cards[deck].splice(ci, 1))}
                            aria-label="remove card"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <p className="text-xs opacity-60">
                  Effects: {'{"kind":"money","amount":±n}'}, {'{"kind":"moveTo","tileId":"id"}'},{' '}
                  {'{"kind":"moveBy","steps":±n}'}, {'{"kind":"gotoJail"}'}, {'{"kind":"jailFree"}'},{' '}
                  {'{"kind":"repairs","perHouse":n,"perHotel":n}'}, {'{"kind":"eachPlayer","amount":±n}'},{' '}
                  {'{"kind":"nearest","tileType":"transport","rentMultiplier":2}'}
                </p>
              </div>
            )}

            {tab === 'json' && (
              <div className="flex flex-col gap-2">
                <textarea
                  className="input h-80 font-mono text-xs"
                  value={jsonText || JSON.stringify(map, null, 2)}
                  onChange={(e) => setJsonText(e.target.value)}
                  aria-label="map json"
                />
                <button
                  className="btn btn-secondary btn-sm self-start"
                  onClick={() => {
                    try {
                      setMap(JSON.parse(jsonText) as MapDefinition);
                      setJsonText('');
                    } catch {
                      setIssues([{ level: 'error', path: '', message: 'Invalid JSON' }]);
                    }
                  }}
                >
                  Apply JSON
                </button>
              </div>
            )}

            {issues.length > 0 && (
              <ul
                className="max-h-40 overflow-y-auto rounded-lg bg-[var(--panel-muted)] p-2 text-xs scrollbar-thin"
                data-testid="issues"
              >
                {issues.map((i, k) => (
                  <li key={k} className={i.level === 'error' ? 'text-red-400' : 'text-amber-400'}>
                    {i.level.toUpperCase()} {i.path}: {i.message}
                  </li>
                ))}
              </ul>
            )}
            {issues.length === 0 && balance && (
              <p className="text-xs font-semibold text-emerald-400">✓ Map is valid</p>
            )}
            {balance && (
              <div className="text-xs">
                <div className="mb-1 font-bold">Balance</div>
                <table className="w-full">
                  <thead className="text-left opacity-60">
                    <tr>
                      <th>Group</th>
                      <th className="text-right">Set</th>
                      <th className="text-right">+Hotels</th>
                      <th className="text-right">Hotel rent</th>
                      <th className="text-right">ROI</th>
                      <th className="text-right">Payback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balance.groups.map((g) => (
                      <tr key={g.groupId}>
                        <td>{g.name}</td>
                        <td className="text-right tabular-nums">{g.setCost}</td>
                        <td className="text-right tabular-nums">{g.fullBuildCost}</td>
                        <td className="text-right tabular-nums">{Math.round(g.avgHotelRent)}</td>
                        <td className="text-right tabular-nums">{g.hotelRoi.toFixed(2)}</td>
                        <td className="text-right tabular-nums">{g.paybackLaps.toFixed(0)} laps</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {balance.warnings.map((w, i) => (
                  <div key={i} className="text-amber-400">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            {sim && (
              <div className="rounded-lg bg-[var(--panel-muted)] p-2 text-xs" data-testid="sim-report">
                <div className="font-bold">
                  Simulation: {sim.games} games ({(sim.elapsedMs / 1000).toFixed(1)}s)
                </div>
                <div>
                  Avg length {sim.avgTurns.toFixed(0)} turns (median {sim.medianTurns}), turn-limit hit{' '}
                  {(sim.turnLimitRate * 100).toFixed(0)}%
                </div>
                <div>
                  Win rate by seat:{' '}
                  {sim.winRateBySeat.map((w, i) => `S${i + 1} ${(w * 100).toFixed(0)}%`).join(' · ')}
                </div>
                <div>
                  Properties bought {sim.avgPropertiesBought.toFixed(1)} · houses{' '}
                  {sim.avgHousesBuilt.toFixed(1)} · trades {sim.avgTrades.toFixed(1)} · bankruptcies{' '}
                  {sim.avgBankruptcies.toFixed(1)}
                </div>
                <div className="mt-1">
                  Top rent:{' '}
                  {Object.entries(sim.tileRent)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([i, r]) => `${map.tiles[Number(i)]?.name} ${(r / sim.games).toFixed(0)}`)
                    .join(' · ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function convertTile(tile: Tile, type: Tile['type'], map: MapDefinition): Tile {
  const base = {
    id: tile.id,
    name: tile.name,
    emoji: tile.emoji,
    fact: tile.fact,
    lat: tile.lat,
    lng: tile.lng,
    image: tile.image,
    i18n: tile.i18n,
  };
  switch (type) {
    case 'property':
      return {
        ...base,
        type,
        group: map.groups[0]?.id ?? 'g1',
        price: 100,
        rent: [6, 30, 90, 270, 400, 550],
        houseCost: 50,
      };
    case 'transport':
      return { ...base, type, price: 200, rent: [25, 50, 100, 200] };
    case 'utility':
      return { ...base, type, price: 150, multipliers: [4, 10] };
    case 'tax':
      return { ...base, type, amount: 100 };
    case 'special':
      return { ...base, type, effect: { kind: 'money', amount: 50 }, description: 'Collect 50' };
    default:
      return { ...base, type } as Tile;
  }
}
