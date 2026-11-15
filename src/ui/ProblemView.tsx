import { useMemo, useState } from 'react';
import { simulate } from '../engine/simulate';
import type { Level, Trace } from '../engine/types';
import { CELL_NS, type EssayProblem, type Problem, type QuizProblem, type TableProblem, type TimingProblem } from '../problems/problems';
import { sceneById, type Scene } from '../problems/scenes';
import { buildDrawing } from '../schematic/layout';
import { specFor } from '../schematic/layouts';
import { operationTable } from '../view/chart';
import { allCorrect, busCells, grade, signalCells, type Mark } from '../view/grade';
import { makeNamer } from '../view/label';
import { FillChart, type FillRow } from './FillChart';
import { Schematic } from './Schematic';

type Props = {
  problem: Problem;
  solved: boolean;
  onSolved: () => void;
  /** 「解説を見る」：シミュレーション画面でこの場面を開く。 */
  onExplain: (sceneId: string) => void;
};

const NONE: ReadonlySet<string> = new Set();

function useIdeal(scene: Scene): Trace {
  return useMemo(() => simulate(scene.circuit, scene.stimulus, { mode: 'ideal', init: scene.init }), [scene]);
}

/** 場面の回路図（初期状態の値で色を付ける）。 */
function SceneSchematic({ scene, trace }: { scene: Scene; trace?: Trace }) {
  const layout = specFor(scene.id, scene.circuit);
  const drawing = useMemo(() => (layout ? buildDrawing(scene.circuit, layout.spec) : undefined), [scene, layout]);
  const namer = useMemo(() => makeNamer(scene.labels), [scene]);
  if (!drawing) return null;
  return <Schematic drawing={drawing} namer={namer} values={trace?.initial ?? {}} changed={NONE} />;
}

function summary(marks: Mark[]): string {
  const wrong = marks.filter((m) => m === 'wrong').length;
  const blank = marks.filter((m) => m === 'blank').length;
  if (wrong === 0 && blank === 0) return '全部正解です。';
  return `まちがい ${wrong} か所、空欄 ${blank} か所。赤がまちがい、黄色が空欄です。`;
}

export function ProblemView({ problem, solved, onSolved, onExplain }: Props) {
  return (
    <>
      <header>
        <h2>
          {problem.title}
          {solved && <span className="solved-badge">解いた</span>}
        </h2>
        <p className="muted">スライド {problem.source}</p>
        <p className="statement">{problem.statement}</p>
      </header>
      {problem.kind === 'timing' && <TimingView key={problem.id} problem={problem} onSolved={onSolved} onExplain={onExplain} />}
      {problem.kind === 'table' && <TableView key={problem.id} problem={problem} onSolved={onSolved} onExplain={onExplain} />}
      {problem.kind === 'quiz' && <QuizView key={problem.id} problem={problem} onSolved={onSolved} />}
      {problem.kind === 'essay' && <EssayView key={problem.id} problem={problem} onSolved={onSolved} />}
    </>
  );
}

type SubProps<P> = { problem: P; onSolved: () => void; onExplain: (sceneId: string) => void };

function TimingView({ problem, onSolved, onExplain }: SubProps<TimingProblem>) {
  const scene = sceneById(problem.sceneId)!;
  const trace = useIdeal(scene);
  const namer = useMemo(() => makeNamer(scene.labels), [scene]);
  const buses = scene.circuit.buses ?? {};
  const busBlanks = problem.busBlanks ?? [];

  const expected = useMemo(() => {
    const bit = Object.fromEntries(problem.blanks.map((s) => [s, signalCells(trace, s, CELL_NS)]));
    const bus = Object.fromEntries(busBlanks.map((name) => [name, busCells(trace, buses[name]!, CELL_NS)]));
    return { bit, bus };
  }, [problem, trace]);

  const [bits, setBits] = useState<Record<string, (Level | undefined)[]>>({});
  const [hex, setHex] = useState<Record<string, string[]>>({});
  const [marks, setMarks] = useState<Record<string, Mark[]> | undefined>();
  const [revealed, setRevealed] = useState(false);

  const count = Math.ceil(trace.end / CELL_NS);
  const bitAnswers = (s: string): (Level | undefined)[] => bits[s] ?? Array<Level | undefined>(count).fill(undefined);
  const busAnswers = (name: string): string[] => hex[name] ?? Array<string>(count).fill('');

  // 行を作る。入力はそのまま、空欄にする信号は入力用の行にする。
  const rows: FillRow[] = [];
  const done = new Set<string>();
  for (const signal of scene.rows) {
    const bus = Object.entries(buses).find(([, list]) => list.includes(signal) && list.every((b) => scene.rows.includes(b)));
    if (bus && (busBlanks.includes(bus[0]) || scene.busView)) {
      if (done.has(bus[0])) continue;
      done.add(bus[0]);
      if (busBlanks.includes(bus[0])) {
        rows.push({ kind: 'busBlank', name: bus[0], bits: bus[1], cells: expected.bus[bus[0]]!, answers: busAnswers(bus[0]), marks: marks?.[`bus:${bus[0]}`] });
      } else rows.push({ kind: 'bus', name: bus[0], bits: bus[1] });
    } else if (problem.blanks.includes(signal)) {
      rows.push({ kind: 'blank', signal, cells: expected.bit[signal]!, answers: bitAnswers(signal), marks: marks?.[signal] });
    } else rows.push({ kind: 'bit', signal });
  }

  const check = (): void => {
    const result: Record<string, Mark[]> = {};
    for (const s of problem.blanks) result[s] = grade(expected.bit[s]!, bitAnswers(s));
    for (const name of busBlanks) result[`bus:${name}`] = grade(expected.bus[name]!, busAnswers(name));
    setMarks(result);
    if (Object.values(result).every(allCorrect) && !revealed) onSolved();
  };
  const reveal = (): void => {
    setBits(Object.fromEntries(problem.blanks.map((s) => [s, expected.bit[s]!.map((c) => c.value)])));
    setHex(Object.fromEntries(busBlanks.map((name) => [name, expected.bus[name]!.map((c) => c.value)])));
    setMarks(undefined);
    setRevealed(true);
  };
  const clear = (): void => {
    setBits({});
    setHex({});
    setMarks(undefined);
    setRevealed(false);
  };

  return (
    <>
      <SceneSchematic scene={scene} trace={trace} />
      <p className="muted hint">
        青い行が答える信号。マスをクリックすると H → L と切り替わる（ドラッグで続けて塗れる。Shift+クリックで消す）。1マスはクロックの半周期。
        灰色のマスは途中で値が変わるところで、採点しない。採点は遅延なしの理想波形で行う。
      </p>
      <FillChart
        trace={trace}
        rows={rows}
        namer={namer}
        clock={scene.clock}
        edge={scene.edge}
        cellNs={CELL_NS}
        onBit={(signal, index, value) => {
          setBits((prev) => {
            const next = [...(prev[signal] ?? Array<Level | undefined>(count).fill(undefined))];
            next[index] = value;
            return { ...prev, [signal]: next };
          });
          setMarks(undefined);
        }}
        onBus={(name, index, value) => {
          setHex((prev) => {
            const next = [...(prev[name] ?? Array<string>(count).fill(''))];
            next[index] = value;
            return { ...prev, [name]: next };
          });
          setMarks(undefined);
        }}
      />
      <section className="panel">
        <div className="step-buttons">
          <button className="primary" onClick={check}>
            採点
          </button>
          <button onClick={clear}>クリア</button>
          <button onClick={reveal}>正解を表示</button>
          <button onClick={() => onExplain(scene.id)}>解説を見る（ステップ実行）</button>
        </div>
        {marks && <p className={Object.values(marks).every(allCorrect) ? 'result ok' : 'result ng'}>{summary(Object.values(marks).flat())}</p>}
        {revealed && <p className="muted">正解を表示したので、解いた記録には付けません。「クリア」してから自分で解くと記録されます。</p>}
      </section>
    </>
  );
}

function TableView({ problem, onSolved, onExplain }: SubProps<TableProblem>) {
  const scene = sceneById(problem.sceneId)!;
  const trace = useIdeal(scene);
  const namer = useMemo(() => makeNamer(scene.labels), [scene]);
  // 一瞬だけ現れる値の行は問題にしない（落ち着いた後の値を答える）。
  const rows = useMemo(
    () => operationTable(scene.circuit, trace, scene.stateBits, scene.clock, scene.edge).filter((row) => row.kind !== 'transient'),
    [scene, trace],
  );
  const width = scene.stateBits.length;
  const [answers, setAnswers] = useState<(Level | undefined)[][]>(() => rows.map(() => Array<Level | undefined>(width).fill(undefined)));
  const [marks, setMarks] = useState<Mark[][] | undefined>();
  const [revealed, setRevealed] = useState(false);

  const expected = rows.map((row) => [...row.bits].map((ch) => ({ value: Number(ch) as Level, given: row.kind === 'reset' })));
  const check = (): void => {
    const result = expected.map((cells, n) => grade(cells, answers[n]!));
    setMarks(result);
    if (result.every(allCorrect) && !revealed) onSolved();
  };
  const cycle = (n: number, i: number): void => {
    setAnswers((prev) => prev.map((row, r) => (r === n ? row.map((v, c) => (c === i ? (v === undefined ? 0 : v === 0 ? 1 : undefined) : v)) : row)));
    setMarks(undefined);
  };

  return (
    <>
      <SceneSchematic scene={scene} trace={trace} />
      <section className="panel">
        <p className="muted hint">
          マスをクリックすると 空欄 → 0 → 1 と切り替わる。{namer.text(scene.clock)}=0 の行は最初の状態、または CLR でリセットした直後の状態（与えてある）。
        </p>
        <table className="op-table fill">
          <thead>
            <tr>
              <th>{namer.text(scene.clock)}</th>
              {scene.stateBits.map((b) => (
                <th key={b}>{namer.text(b)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, n) => (
              <tr key={n}>
                <td>{row.n}</td>
                {[...row.bits].map((ch, i) =>
                  row.kind === 'reset' ? (
                    <td key={i} className="given">
                      {ch}
                    </td>
                  ) : (
                    <td key={i} className={`cell ${marks?.[n]?.[i] ?? ''}`} onClick={() => cycle(n, i)}>
                      {answers[n]?.[i] ?? ''}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="step-buttons">
          <button className="primary" onClick={check}>
            採点
          </button>
          <button
            onClick={() => {
              setAnswers(rows.map(() => Array<Level | undefined>(width).fill(undefined)));
              setMarks(undefined);
              setRevealed(false);
            }}
          >
            クリア
          </button>
          <button
            onClick={() => {
              setAnswers(expected.map((cells) => cells.map((c) => c.value)));
              setMarks(undefined);
              setRevealed(true);
            }}
          >
            正解を表示
          </button>
          <button onClick={() => onExplain(scene.id)}>解説を見る（ステップ実行）</button>
        </div>
        {marks && <p className={marks.every(allCorrect) ? 'result ok' : 'result ng'}>{summary(marks.flat())}</p>}
        {revealed && <p className="muted">正解を表示したので、解いた記録には付けません。「クリア」してから自分で解くと記録されます。</p>}
      </section>
    </>
  );
}

function QuizView({ problem, onSolved }: Omit<SubProps<QuizProblem>, 'onExplain'>) {
  const [answers, setAnswers] = useState<string[]>(() => problem.questions.map(() => ''));
  const [marks, setMarks] = useState<Mark[] | undefined>();
  const [shown, setShown] = useState(false);

  const check = (): void => {
    const result = problem.questions.map((q, i): Mark => {
      const raw = answers[i] ?? '';
      if (raw.trim() === '') return 'blank';
      const value = Number(raw);
      if (q.kind === 'choice') return value === q.answer() ? 'correct' : 'wrong';
      return Number.isFinite(value) && Math.abs(value - q.answer()) <= (q.tolerance ?? 0) + 1e-9 ? 'correct' : 'wrong';
    });
    setMarks(result);
    if (allCorrect(result) && !shown) onSolved();
  };
  const set = (i: number, value: string): void => {
    setAnswers((prev) => prev.map((v, k) => (k === i ? value : v)));
    setMarks(undefined);
  };

  return (
    <>
      {(problem.sceneIds ?? []).map((id) => {
        const scene = sceneById(id);
        return scene ? (
          <div key={id}>
            <p className="muted hint">{scene.title}</p>
            <SceneSchematic scene={scene} />
          </div>
        ) : null;
      })}
      <section className="panel">
        <ol className="quiz">
          {problem.questions.map((q, i) => (
            <li key={i} className={marks?.[i] ?? ''}>
              <span className="prompt">{q.prompt}</span>
              {q.kind === 'choice' ? (
                <span className="options">
                  {q.options.map((option, k) => (
                    <label key={k}>
                      <input type="radio" name={`${problem.id}-${i}`} checked={answers[i] === String(k)} onChange={() => set(i, String(k))} /> {option}
                    </label>
                  ))}
                </span>
              ) : (
                <span className="options">
                  <input type="number" value={answers[i]} onChange={(e) => set(i, e.target.value)} /> {q.unit}
                  {q.tolerance ? <span className="muted">（±{q.tolerance} まで正解）</span> : null}
                </span>
              )}
              {marks?.[i] === 'correct' && <span className="mark ok">○</span>}
              {marks?.[i] === 'wrong' && <span className="mark ng">×</span>}
              {shown && (
                <span className="muted">　正解：{q.kind === 'choice' ? q.options[q.answer()] : `${Math.round(q.answer() * 1000) / 1000}${q.unit ?? ''}`}</span>
              )}
            </li>
          ))}
        </ol>
        <div className="step-buttons">
          <button className="primary" onClick={check}>
            採点
          </button>
          <button onClick={() => setShown((v) => !v)}>{shown ? '正解を隠す' : '正解を表示'}</button>
        </div>
        {marks && <p className={allCorrect(marks) ? 'result ok' : 'result ng'}>{summary(marks)}</p>}
        {shown && <p className="muted">正解を表示している間は、解いた記録には付けません。</p>}
      </section>
    </>
  );
}

function EssayView({ problem, onSolved }: Omit<SubProps<EssayProblem>, 'onExplain'>) {
  return (
    <section className="panel">
      <p className="muted hint">記述問題。自分で答えを書いてから、解答例を開いて見比べる。</p>
      <details onToggle={(e) => e.currentTarget.open && onSolved()}>
        <summary>解答例を見る</summary>
        <ul className="essay">
          {problem.answer.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
