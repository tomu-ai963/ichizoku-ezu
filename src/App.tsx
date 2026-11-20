import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, MousePointer2, Trash2, Undo2, Upload } from 'lucide-react';
import LandCanvas, { Tool } from './LandCanvas';
import {
  area,
  DEFAULT_LAND,
  formatArea,
  formatTsubo,
  Land,
  LAND_MAX,
  LAND_MIN,
  perimeterHedges,
  Plan,
  round1,
  Zone,
  ZONE_ORDER,
  ZONE_TYPES,
  ZoneType,
} from './model';
import { downloadPlan, loadPlan, parsePlan, savePlan } from './storage';
import { runChecks } from './checks';

const HISTORY_MAX = 100;

/** 入力中は文字列のまま持ち、確定(blur / Enter)で数値にする */
function NumField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onFocus?: () => void;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(props.value));
  }, [props.value, editing]);

  const commit = () => {
    setEditing(false);
    const v = Number(text);
    if (text.trim() !== '' && Number.isFinite(v)) {
      props.onCommit(round1(Math.min(props.max, Math.max(props.min, v))));
    } else {
      setText(String(props.value));
    }
  };

  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500">
      {props.label}
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
        value={text}
        onFocus={() => {
          setEditing(true);
          props.onFocus?.();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold text-stone-700">{props.title}</h2>
      {props.children}
    </section>
  );
}

export default function App() {
  const [plan, setPlan] = useState<Plan>(() => loadPlan() ?? { version: 1, land: DEFAULT_LAND, zones: [] });
  const [past, setPast] = useState<Plan[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState(1);
  const [hedgeWidth, setHedgeWidth] = useState(2);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const changeStart = useRef<Plan | null>(null);

  const { land, zones } = plan;

  useEffect(() => savePlan(plan), [plan]);

  // --- 履歴 ---
  const pushHistory = useCallback(() => {
    setPast((p) => [...p.slice(-HISTORY_MAX + 1), plan]);
  }, [plan]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    setPlan(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setSelectedId(null);
  }, [past]);

  const setZones = (fn: (zs: Zone[]) => Zone[]) => setPlan((p) => ({ ...p, zones: fn(p.zones) }));
  const setLand = (patch: Partial<Land>) => setPlan((p) => ({ ...p, land: { ...p.land, ...patch } }));

  const updateZone = (z: Zone) => setZones((zs) => zs.map((q) => (q.id === z.id ? z : q)));

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushHistory();
    setZones((zs) => zs.filter((z) => z.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, pushHistory]);

  // --- キーボード ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, deleteSelected]);

  // --- 読み込み・書き出し ---
  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file
      .text()
      .then((txt) => {
        const p = parsePlan(JSON.parse(txt));
        pushHistory();
        setPlan(p);
        setSelectedId(null);
        setMessage(`「${p.land.name}」を読み込みました(区画 ${p.zones.length} 個)。`);
      })
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? `読み込めませんでした: ${err.message}` : '読み込めませんでした。');
      });
  };

  // --- 集計 ---
  const landArea = land.width * land.height;
  const breakdown = useMemo(() => {
    return ZONE_ORDER.map((t) => {
      const zs = zones.filter((z) => z.type === t);
      const a = zs.reduce((s, z) => s + area(z), 0);
      return { type: t, count: zs.length, area: a };
    }).filter((r) => r.count > 0);
  }, [zones]);
  const usedArea = breakdown.reduce((s, r) => s + r.area, 0);
  const checks = useMemo(() => runChecks(land, zones), [land, zones]);

  const selected = zones.find((z) => z.id === selectedId) ?? null;

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40';

  return (
    <div className="min-h-screen bg-[#f7f4ec] text-stone-800">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-bold leading-tight text-stone-900">一族の土地 絵図</h1>
          <p className="text-xs text-stone-500">土地を面で区切って、広さを確かめる設計図</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={undo} disabled={past.length === 0} title="元に戻す (Ctrl+Z)">
            <Undo2 size={16} /> 戻す
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={importFile} />
          <button className={btn} onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> 読み込み
          </button>
          <button className={btn} onClick={() => downloadPlan(plan)}>
            <Download size={16} /> 書き出し
          </button>
        </div>
      </header>

      {message && (
        <div className="mx-4 mt-3 flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{message}</span>
          <button className="text-amber-700" onClick={() => setMessage(null)} aria-label="閉じる">
            ×
          </button>
        </div>
      )}

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:flex-row lg:items-start">
        {/* 絵図 */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="描く道具">
            <button
              onClick={() => setTool('select')}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                tool === 'select' ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white'
              }`}
            >
              <MousePointer2 size={14} /> 選ぶ・動かす
            </button>
            {ZONE_ORDER.map((t) => {
              const st = ZONE_TYPES[t];
              const on = tool === t;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setTool(t);
                    setSelectedId(null);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                    on ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white'
                  }`}
                >
                  <span className="inline-block h-3 w-3 rounded-sm border" style={{ background: st.fill, borderColor: st.stroke }} />
                  {st.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-stone-500">
            {tool === 'select'
              ? '区画をタップで選択、ドラッグで移動、右下の丸で大きさを変えます。'
              : `ドラッグして「${ZONE_TYPES[tool].label}」の区画を描きます。`}
          </p>
          <div className="rounded-xl border border-stone-200 bg-white p-2">
            <LandCanvas
              land={land}
              zones={zones}
              tool={tool}
              selectedId={selectedId}
              snap={snap}
              onSelect={setSelectedId}
              onCreate={(z) => {
                pushHistory();
                setZones((zs) => [...zs, z]);
                setSelectedId(z.id);
                setTool('select');
              }}
              onBeginChange={() => {
                changeStart.current = plan;
              }}
              onLiveChange={updateZone}
              onEndChange={() => {
                const start = changeStart.current;
                changeStart.current = null;
                if (start && start.zones !== plan.zones) {
                  setPast((p) => [...p.slice(-HISTORY_MAX + 1), start]);
                }
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-stone-500">
            寸法の刻み
            <select
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800"
              value={snap}
              onChange={(e) => setSnap(Number(e.target.value))}
            >
              <option value={1}>1 m</option>
              <option value={0.5}>0.5 m</option>
              <option value={0.1}>0.1 m</option>
            </select>
          </label>
        </div>

        {/* 右側のパネル */}
        <div className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
          {selected && (
            <Section title="選んだ区画">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  種類
                  <select
                    className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
                    value={selected.type}
                    onChange={(e) => {
                      pushHistory();
                      updateZone({ ...selected, type: e.target.value as ZoneType });
                    }}
                  >
                    {ZONE_ORDER.map((t) => (
                      <option key={t} value={t}>
                        {ZONE_TYPES[t].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  名前(空なら種類名)
                  <input
                    className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
                    value={selected.name}
                    placeholder={ZONE_TYPES[selected.type].label}
                    onFocus={pushHistory}
                    onChange={(e) => updateZone({ ...selected, name: e.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="東西の長さ (m)" value={selected.w} min={0.1} max={LAND_MAX} onFocus={pushHistory} onCommit={(w) => updateZone({ ...selected, w })} />
                  <NumField label="南北の長さ (m)" value={selected.h} min={0.1} max={LAND_MAX} onFocus={pushHistory} onCommit={(h) => updateZone({ ...selected, h })} />
                  <NumField label="西端からの距離 (m)" value={selected.x} min={0} max={LAND_MAX} onFocus={pushHistory} onCommit={(x) => updateZone({ ...selected, x })} />
                  <NumField label="北端からの距離 (m)" value={selected.y} min={0} max={LAND_MAX} onFocus={pushHistory} onCommit={(y) => updateZone({ ...selected, y })} />
                </div>
                <p className="text-sm">
                  面積 <strong>{formatArea(area(selected))}</strong>
                  <span className="ml-2 text-stone-500">{formatTsubo(area(selected))}</span>
                </p>
                <button
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                  onClick={deleteSelected}
                >
                  <Trash2 size={14} /> この区画を消す
                </button>
              </div>
            </Section>
          )}

          <Section title="土地">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-stone-500">
                名前
                <input
                  className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
                  value={land.name}
                  onFocus={pushHistory}
                  onChange={(e) => setLand({ name: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <NumField label="東西 (m)" value={land.width} min={LAND_MIN} max={LAND_MAX} onFocus={pushHistory} onCommit={(width) => setLand({ width })} />
                <NumField label="南北 (m)" value={land.height} min={LAND_MIN} max={LAND_MAX} onFocus={pushHistory} onCommit={(height) => setLand({ height })} />
              </div>
              <p className="text-sm">
                広さ <strong>{formatArea(landArea)}</strong>
                <span className="ml-2 text-stone-500">
                  {formatTsubo(landArea)} / {round1(landArea / 10000).toLocaleString('ja-JP')} ha
                </span>
              </p>
              <div className="flex items-end gap-2">
                <div className="w-24">
                  <NumField label="垣根の幅 (m)" value={hedgeWidth} min={0.5} max={50} onCommit={setHedgeWidth} />
                </div>
                <button
                  className={btn + ' flex-1 justify-center'}
                  onClick={() => {
                    pushHistory();
                    setZones((zs) => [...zs, ...perimeterHedges(land, hedgeWidth)]);
                  }}
                >
                  外周に垣根を引く
                </button>
              </div>
              <button
                className="text-left text-xs text-red-600 underline-offset-2 hover:underline disabled:opacity-40"
                disabled={zones.length === 0}
                onClick={() => {
                  pushHistory();
                  setZones(() => []);
                  setSelectedId(null);
                }}
              >
                区画をすべて消す(戻すで取り消せます)
              </button>
            </div>
          </Section>

          <Section title="面積の内訳">
            {breakdown.length === 0 ? (
              <p className="text-sm text-stone-500">まだ区画がありません。上の道具を選んでドラッグで描いてください。</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {breakdown.map((r) => (
                    <tr key={r.type} className="border-b border-stone-100 last:border-0">
                      <td className="py-1.5">
                        <span
                          className="mr-2 inline-block h-3 w-3 rounded-sm border align-middle"
                          style={{ background: ZONE_TYPES[r.type].fill, borderColor: ZONE_TYPES[r.type].stroke }}
                        />
                        {ZONE_TYPES[r.type].label}
                        <span className="ml-1 text-xs text-stone-400">×{r.count}</span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatArea(r.area)}</td>
                      <td className="w-14 py-1.5 text-right tabular-nums text-stone-500">
                        {landArea > 0 ? Math.round((r.area / landArea) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                  <tr className="text-stone-500">
                    <td className="pt-2">まだ決めていない所</td>
                    <td className="pt-2 text-right tabular-nums">{formatArea(Math.max(0, landArea - usedArea))}</td>
                    <td className="pt-2 text-right tabular-nums">
                      {landArea > 0 ? Math.max(0, Math.round(((landArea - usedArea) / landArea) * 100)) : 0}%
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Section>

          <Section title="原則チェック">
            <p className="mb-3 text-xs text-stone-500">決まったルールで判定しています(AI ではありません)。</p>
            <ul className="flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.label} className="rounded-lg bg-stone-50 px-3 py-2">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>{c.label}</span>
                    <span
                      className={
                        c.status === 'good' ? 'text-emerald-700' : c.status === 'warn' ? 'text-amber-700' : 'text-stone-500'
                      }
                    >
                      {c.status === 'good' ? '◯ 適合' : c.status === 'warn' ? '△ 要検討' : '— 未定'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{c.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </main>
    </div>
  );
}
