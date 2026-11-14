import { useEffect, useMemo, useState } from 'react';
import { simulate } from '../engine/simulate';
import { DEFAULT_DELAYS, type Delays, type SimOptions, type Trace } from '../engine/types';
import { LECTURES } from '../problems/lectures';
import { PROBLEMS, problemById, type Problem } from '../problems/problems';
import { SCENES, sceneById, type Scene } from '../problems/scenes';
import { buildDrawing } from '../schematic/layout';
import { layoutFor } from '../schematic/layouts';
import { operationTable } from '../view/chart';
import { makeNamer } from '../view/label';
import { buildSteps } from '../view/steps';
import { OperationTable } from './OperationTable';
import { ProblemView } from './ProblemView';
import { loadSolved, saveSolved } from './progress';
import { Schematic } from './Schematic';
import { StepPanel } from './StepPanel';
import { DesignGuide } from './DesignGuide';
import { StateDiagram } from './StateDiagram';
import { sceneDiagram } from '../view/statediagram';
import { EDGE_COLOR, TimingChart, type ChartRow } from './TimingChart';
import './app.css';

type Mode = SimOptions['mode'];
type WireModel = NonNullable<SimOptions['wireModel']>;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 12;
const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

/** 画面の幅に全体が収まる拡大率。 */
function fitZoom(scene: Scene): number {
  const room = (typeof window === 'undefined' ? 1200 : window.innerWidth) - 250 - 132 - 90;
  return clampZoom(Math.max(0.5, room / scene.stimulus.end));
}

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

function sceneDelays(scene: Scene): Delays {
  return { ...DEFAULT_DELAYS, ...scene.delays, wire: { ...scene.delays.wire } };
}

/** 場面の行を、バス表示のときは多ビット信号ごとに1行へまとめる。 */
function chartRows(scene: Scene, busView: boolean): ChartRow[] {
  const buses = busCandidates(scene);
  if (!busView) return scene.rows.map((signal) => ({ kind: 'bit', signal }));
  const rows: ChartRow[] = [];
  const done = new Set<string>();
  for (const signal of scene.rows) {
    const bus = buses.find(([, bits]) => bits.includes(signal));
    if (!bus) rows.push({ kind: 'bit', signal });
    else if (!done.has(bus[0])) {
      done.add(bus[0]);
      rows.push({ kind: 'bus', name: bus[0], bits: bus[1] });
    }
  }
  return rows;
}

function busCandidates(scene: Scene): [string, string[]][] {
  return Object.entries(scene.circuit.buses ?? {}).filter(([, bits]) => bits.every((b) => scene.rows.includes(b)));
}

export function App() {
  const initial = useMemo(() => {
    const hash = readHash();
    const scene = sceneById(hash.get('scene') ?? '') ?? sceneById('16-5') ?? SCENES[0]!;
    return { hash, scene };
  }, []);

  const [scene, setScene] = useState<Scene>(initial.scene);
  const [mode, setMode] = useState<Mode>(initial.hash.get('mode') === 'ideal' ? 'ideal' : 'delay');
  const [delays, setDelays] = useState<Delays>(() => sceneDelays(initial.scene));
  const [wireModel, setWireModel] = useState<WireModel>('inertial');
  const [index, setIndex] = useState<number>(() => Number(initial.hash.get('step') ?? -1));
  const [zoom, setZoom] = useState<number>(() => {
    const z = Number(initial.hash.get('zoom'));
    return z > 0 ? clampZoom(z) : fitZoom(initial.scene);
  });
  const [busView, setBusView] = useState<boolean>(
    initial.hash.has('bus') ? initial.hash.get('bus') === '1' : (initial.scene.busView ?? false),
  );
  const [showAll, setShowAll] = useState<boolean>(initial.hash.get('all') === '1');
  const [tab, setTab] = useState<'sim' | 'problems' | 'design'>(() => {
    const view = initial.hash.get('view');
    return view === 'problems' || view === 'design' ? view : 'sim';
  });
  const [problem, setProblem] = useState<Problem>(() => problemById(initial.hash.get('problem') ?? '') ?? PROBLEMS[0]!);
  const [solved, setSolved] = useState<Set<string>>(() => loadSolved());
  const markSolved = (id: string): void => {
    setSolved((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      saveSolved(next);
      return next;
    });
  };

  const choose = (next: Scene): void => {
    setScene(next);
    setDelays(sceneDelays(next));
    setWireModel('inertial');
    setIndex(-1);
    setZoom(fitZoom(next));
    setBusView(next.busView ?? false);
  };

  const result = useMemo((): { trace: Trace } | { error: string } => {
    try {
      return { trace: simulate(scene.circuit, scene.stimulus, { mode, delays, wireModel, init: scene.init }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [scene, mode, delays, wireModel]);
  const trace = 'trace' in result ? result.trace : undefined;

  const namer = useMemo(() => makeNamer(scene.labels), [scene]);
  const steps = useMemo(
    () =>
      trace
        ? buildSteps(scene, trace, mode === 'delay' ? { wire: delays.wire ?? {}, model: wireModel } : undefined)
        : [],
    [scene, trace, mode, delays, wireModel],
  );
  const table = useMemo(
    () => (trace ? operationTable(scene.circuit, trace, scene.stateBits, scene.clock, scene.edge) : []),
    [scene, trace],
  );
  const idx = Math.min(Math.max(index, -1), steps.length - 1);
  const step = idx >= 0 ? steps[idx] : undefined;
  const move = (next: number): void => setIndex(Math.min(Math.max(next, -1), steps.length - 1));

  // ← → キーでステップを動かす。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tab !== 'sim') return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(Math.max(i, -1) + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(Math.min(i, steps.length - 1) - 1, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, tab]);

  // 表示中の場面とステップを URL に残す（再読み込みしても同じ場所に戻る）。
  useEffect(() => {
    const params = new URLSearchParams({ scene: scene.id, step: String(idx), mode, zoom: String(zoom) });
    if (busView) params.set('bus', '1');
    if (showAll) params.set('all', '1');
    if (tab === 'problems') {
      params.set('view', 'problems');
      params.set('problem', problem.id);
    } else if (tab === 'design') params.set('view', 'design');
    window.history.replaceState(null, '', `#${params.toString()}`);
  }, [scene, idx, mode, zoom, busView, showAll, tab, problem]);

  const drawing = useMemo(() => {
    const layout = layoutFor(scene.id, scene.circuit.id);
    return layout ? buildDrawing(scene.circuit, layout.spec) : undefined;
  }, [scene]);
  // 回路図に出す値：いまのステップが終わった時点（次のステップの直前）の値。
  const values = useMemo(() => {
    if (!trace) return {};
    const until = step ? step.end : (steps[0]?.t ?? 0);
    const v = { ...trace.initial };
    for (const ch of trace.changes) {
      if (ch.t > until || (ch.t === until && until < trace.end)) break;
      v[ch.signal] = ch.value;
    }
    return v;
  }, [trace, step, steps]);
  const changedNow = useMemo(() => new Set(step?.changed ?? []), [step]);
  const stateDiagram = useMemo(() => sceneDiagram(scene), [scene]);
  const stateNow = parseInt(scene.stateBits.map((b) => values[b] ?? 0).join(''), 2);
  const stateFrom = step && step.kind === 'clock' ? parseInt(step.path[0]!, 2) : undefined;

  const rows = chartRows(scene, busView);
  const inputs = new Set(scene.circuit.inputs);
  const reveal = !trace ? 0 : showAll ? trace.end : step ? step.end : (steps[0]?.t ?? trace.end);
  const edgeWord = scene.edge === 'rising' ? '立上り' : '立下り';
  const delayOn = mode === 'delay';
  const setWire = (id: string, v: number): void => setDelays((d) => ({ ...d, wire: { ...d.wire, [id]: v } }));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>順序回路 学習ラボ</h1>
        <div className="tabs">
          <button className={tab === 'sim' ? 'current' : ''} onClick={() => setTab('sim')}>
            シミュレーション
          </button>
          <button className={tab === 'problems' ? 'current' : ''} onClick={() => setTab('problems')}>
            問題（{PROBLEMS.filter((p) => solved.has(p.id)).length}/{PROBLEMS.length}）
          </button>
          <button className={tab === 'design' ? 'current' : ''} onClick={() => setTab('design')}>
            設計
          </button>
        </div>
        {tab === 'problems' &&
          LECTURES.map((lecture) => {
            const list = PROBLEMS.filter((p) => p.lecture === lecture.no);
            if (list.length === 0) return null;
            return (
              <div key={lecture.no}>
                <h2>
                  第{lecture.no}回 {lecture.title}
                </h2>
                <ul>
                  {list.map((p) => (
                    <li key={p.id}>
                      <button className={p.id === problem.id ? 'scene current' : 'scene'} onClick={() => setProblem(p)}>
                        <span className={solved.has(p.id) ? 'check done' : 'check'}>{solved.has(p.id) ? '✓' : '・'}</span>
                        {p.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        {tab === 'design' && (
          <p className="muted side-note">
            授業の「拡大入力要求表を使う設計方法」を、ステップ1から順に進める。作った回路は「シミュレーション」の画面で動かせる。
          </p>
        )}
        {tab === 'sim' && !SCENES.includes(scene) && (
          <p className="muted side-note">設計ガイドで作った回路を表示中。下の一覧から選ぶと授業の回路に戻る。</p>
        )}
        {tab === 'sim' && LECTURES.map((lecture) => {
          const list = SCENES.filter((s) => s.lecture === lecture.no);
          if (list.length === 0) return null;
          return (
            <div key={lecture.no}>
              <h2>
                第{lecture.no}回 {lecture.title}
              </h2>
              <ul>
                {list.map((s) => (
                  <li key={s.id}>
                    <button className={s.id === scene.id ? 'scene current' : 'scene'} onClick={() => choose(s)}>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </aside>

      {tab === 'problems' && (
        <main className="main">
          <ProblemView
            problem={problem}
            solved={solved.has(problem.id)}
            onSolved={() => markSolved(problem.id)}
            onExplain={(sceneId) => {
              const target = sceneById(sceneId);
              if (target) choose(target);
              setTab('sim');
            }}
          />
        </main>
      )}

      {tab === 'design' && (
        <main className="main">
          <DesignGuide
            onSimulate={(generated) => {
              choose(generated);
              setTab('sim');
            }}
          />
        </main>
      )}

      {tab === 'sim' && <main className="main">
        <header>
          <h2>{scene.title}</h2>
          <p className="muted">
            スライド {scene.source}　／　回路：{scene.circuit.title}
          </p>
          {scene.note && <p className="note">{scene.note}</p>}
        </header>

        <section className="panel controls">
          <div className="control-row">
            <strong>時間モデル</strong>
            <label>
              <input type="radio" checked={delayOn} onChange={() => setMode('delay')} /> 遅延あり（標準）
            </label>
            <label>
              <input type="radio" checked={!delayOn} onChange={() => setMode('ideal')} /> 理想（遅延なし）
            </label>
            <span className="spacer" />
            <strong>時間軸</strong>
            <button onClick={() => setZoom((z) => clampZoom(z / 1.5))}>−</button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(clampZoom(Number(e.target.value)))}
            />
            <button onClick={() => setZoom((z) => clampZoom(z * 1.5))}>＋</button>
            <button onClick={() => setZoom(fitZoom(scene))}>全体</button>
            <button onClick={() => setZoom(6)} disabled={!step} title="いまのステップの付近を拡大して、遅れを見る">
              このエッジを拡大
            </button>
          </div>

          <div className={delayOn ? 'control-row' : 'control-row disabled'}>
            <strong>遅延（ns）</strong>
            <DelayInput label="FF" value={delays.ff} max={30} disabled={!delayOn} onChange={(v) => setDelays((d) => ({ ...d, ff: v }))} />
            <DelayInput label="ゲート" value={delays.gate} max={30} disabled={!delayOn} onChange={(v) => setDelays((d) => ({ ...d, gate: v }))} />
            {(scene.wires ?? []).map((w) => (
              <DelayInput
                key={w.id}
                label={w.label}
                value={delays.wire?.[w.id] ?? 0}
                max={w.max}
                disabled={!delayOn}
                onChange={(v) => setWire(w.id, v)}
              />
            ))}
            {scene.wires && (
              <label>
                配線の遅れ方{' '}
                <select value={wireModel} disabled={!delayOn} onChange={(e) => setWireModel(e.target.value as WireModel)}>
                  <option value="inertial">短いパルスは消える（標準）</option>
                  <option value="transport">そのまま遅れて届く</option>
                </select>
              </label>
            )}
            <button
              disabled={!delayOn}
              onClick={() => {
                setDelays(sceneDelays(scene));
                setWireModel('inertial');
              }}
            >
              初期値に戻す
            </button>
          </div>

          <div className="control-row">
            <strong>表示</strong>
            {busCandidates(scene).length > 0 && (
              <label>
                <input type="checkbox" checked={busView} onChange={(e) => setBusView(e.target.checked)} /> 多ビット信号を16進のバス表示にする
              </label>
            )}
            <label>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 先の波形も表示する
            </label>
            <span className="legend">
              <svg width={26} height={12}>
                <line x1={2} x2={24} y1={6} y2={6} stroke={EDGE_COLOR[scene.edge]} strokeDasharray="3 3" strokeWidth={1.5} />
              </svg>
              FFが動くエッジ（{namer.text(scene.clock)} の{edgeWord}）。上の数字はその回数
            </span>
          </div>
        </section>

        {'error' in result && <p className="error">シミュレーションできません：{result.error}</p>}

        {trace && (
          <>
            {drawing && <Schematic drawing={drawing} namer={namer} values={values} changed={changedNow} />}
            <TimingChart
              trace={trace}
              rows={rows}
              namer={namer}
              inputs={inputs}
              reveal={reveal}
              pxPerNs={zoom}
              clock={scene.clock}
              edge={scene.edge}
              step={step}
            />
            {stateDiagram && (
              <details className="panel">
                <summary>状態遷移図（全 {stateDiagram.next.length} 状態。行き先はエンジンで求めたもの。点線は「すぐ」＝クロックを待たずに移る）</summary>
                <div className="schematic">
                  <StateDiagram diagram={stateDiagram.diagram} current={stateNow} from={stateFrom} to={stateFrom === undefined ? undefined : stateDiagram.next[stateFrom]} />
                </div>
              </details>
            )}
            <div className="below">
              <StepPanel
                steps={steps}
                index={idx}
                stateName={namer.bus(scene.stateBits)}
                initialState={scene.stateBits.map((b) => trace.initial[b] ?? 0).join('')}
                onMove={move}
              />
              <OperationTable
                rows={table}
                bits={scene.stateBits}
                clock={scene.clock}
                namer={namer}
                currentT={showAll ? Infinity : (step?.t ?? -1)}
              />
            </div>
          </>
        )}
      </main>}
    </div>
  );
}

type DelayInputProps = { label: string; value: number; max: number; disabled: boolean; onChange: (v: number) => void };

function DelayInput({ label, value, max, disabled, onChange }: DelayInputProps) {
  const set = (raw: string): void => {
    const v = Number(raw);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(0, Math.round(v))));
  };
  return (
    <label className="delay-input">
      {label}
      <input type="range" min={0} max={max} step={1} value={value} disabled={disabled} onChange={(e) => set(e.target.value)} />
      <input type="number" min={0} max={max} step={1} value={value} disabled={disabled} onChange={(e) => set(e.target.value)} />
    </label>
  );
}
