/** タイミングチャートと動作表のためのデータ整形。UI には依存しない。 */
import { busAt, busHistory, edgeTimes } from '../engine/sample';
import { simulate } from '../engine/simulate';
import type { Change, Circuit, Level, Trace, Trigger } from '../engine/types';

export type Wave = {
  initial: Level;
  /** 値が変わった点（時刻順）。同じ時刻に 2 回変わると、幅 0 のパルスになる。 */
  points: { t: number; value: Level }[];
  /** 描く範囲の終わり。 */
  until: number;
};

/** 1ビット信号の波形。until より後の変化は含めない。 */
export function wave(trace: Trace, signal: string, until: number = trace.end): Wave {
  const initial = trace.initial[signal];
  if (initial === undefined) throw new Error(`信号がありません: ${signal}`);
  const points = trace.changes
    .filter((ch) => ch.signal === signal && ch.t <= until)
    .map((ch) => ({ t: ch.t, value: ch.value }));
  return { initial, points, until };
}

/** 16進のバス表記。例：'1010' → 'XA' */
export function hexLabel(bits: string): string {
  const digits = Math.ceil(bits.length / 4);
  return `X${parseInt(bits, 2).toString(16).toUpperCase().padStart(digits, '0')}`;
}

export type BusSegment = { t0: number; t1: number; bits: string; hex: string };

/** 多ビット信号の区間ごとの値。幅 0 の区間（一瞬だけ現れる値）も含む。 */
export function busSegments(trace: Trace, bits: readonly string[], until: number = trace.end): BusSegment[] {
  const history = busHistory(trace, bits).filter((h) => h.t <= until);
  return history.map((h, i) => {
    const next = history[i + 1];
    return { t0: h.t, t1: next ? next.t : until, bits: h.value, hex: hexLabel(h.value) };
  });
}

export type OperationRow = {
  /**
   * settled：クロックの後に落ち着いた値。
   * transient：そのクロックで一瞬だけ現れた値（リセット信号が出る状態）。次の行が落ち着いた後の値。
   * reset：外部 CLR でリセットされた直後の値（ここから数え直す）。最初の行もこれ。
   */
  kind: 'settled' | 'transient' | 'reset';
  /** クロックの回数（リセットの後を 0 として数える）。 */
  n: number;
  /** そのエッジ（reset はリセットが始まった時刻、最初の行は 0）。 */
  t: number;
  /** 値（上位ビットから）。 */
  bits: string;
};

/**
 * 外部 CLR 入力が「働く」ときの値を、回路を動かして求める。
 * どの状態から始めても全 FF が 0 になる側の値。CLR 入力がない、または決まらなければ undefined。
 */
export function resetLevel(circuit: Circuit, input = 'clr'): Level | undefined {
  if (!circuit.inputs.includes(input)) return undefined;
  const ffs = circuit.components.filter((comp) => comp.kind === 'ff');
  const forces = (level: Level): boolean => {
    // 1個だけ 1 の状態と、全部 1 の状態から始めて、どれも 0 になるか。
    const starts = [...ffs.map((f) => [f.id]), ffs.map((f) => f.id)];
    return starts.every((ones) => {
      const init = Object.fromEntries(ones.map((id) => [id, 1 as Level]));
      const trace = simulate(circuit, { initial: { [input]: level }, changes: [], end: 1 }, { mode: 'ideal', init });
      return ffs.every((f) => f.kind === 'ff' && trace.initial[f.q] === 0);
    });
  };
  const low = forces(0);
  const high = forces(1);
  return low === high ? undefined : high ? 1 : 0;
}

/** 外部 CLR が働いている区間 [開始, 終了)。 */
function resetIntervals(trace: Trace, input: string, level: Level): [number, number][] {
  const out: [number, number][] = [];
  let start: number | undefined = trace.initial[input] === level ? 0 : undefined;
  for (const ch of trace.changes) {
    if (ch.signal !== input) continue;
    if (ch.value === level) start ??= ch.t;
    else if (start !== undefined) {
      out.push([start, ch.t]);
      start = undefined;
    }
  }
  if (start !== undefined) out.push([start, Infinity]);
  return out;
}

/**
 * 動作表：クロックの回数ごとの、落ち着いた後の値（次のエッジの直前で読む）。
 * - 外部 CLR が働いている間のエッジは数えない。CLR でリセットされたら 0 から数え直す。
 * - リセット信号で一瞬だけ現れる値（5進カウンタの (101) など）は、transient の行として先に出す。
 * 遅延ありでも理想でも、同じ並びになる。
 */
export function operationTable(circuit: Circuit, trace: Trace, bits: readonly string[], clock: string, edge: Trigger): OperationRow[] {
  const level = resetLevel(circuit);
  const resets = level === undefined ? [] : resetIntervals(trace, 'clr', level);
  const inReset = (t: number): boolean => resets.some(([a, b]) => t >= a && t < b);
  const edges = edgeTimes(trace, clock, edge).filter((t) => !inReset(t));
  const stateChanges = trace.changes.filter((ch) => bits.includes(ch.signal));
  /** [from, to) の間に、CLR／PR で変わる直前に現れていた値。 */
  const transients = (from: number, to: number, settled: string): string[] => {
    const seen: string[] = [];
    stateChanges.forEach((ch, i) => {
      if (ch.t < from || ch.t >= to || ch.cause.kind !== 'async') return;
      const prev = stateChanges[i - 1];
      // 同じ時刻・同じ原因で続く変化（複数の FF が同時にリセット）は、最初の1つだけ見る。
      if (prev && prev.cause.kind === 'async' && prev.t === ch.t && prev.delta === ch.delta) return;
      const before = stateBefore(ch);
      if (before !== settled && seen[seen.length - 1] !== before) seen.push(before);
    });
    return seen;
  };
  // 理想モードでは同じ時刻に続けて変わるので、時刻ではなく変化の順番で「直前の値」を求める。
  const stateBefore = (target: Change): string => {
    const value: Record<string, Level> = {};
    for (const bit of bits) value[bit] = trace.initial[bit] ?? 0;
    for (const ch of stateChanges) {
      if (ch === target) break;
      value[ch.signal] = ch.value;
    }
    return bits.map((bit) => value[bit]).join('');
  };

  const rows: OperationRow[] = [];
  // 区切り：数えるエッジと、エッジより後に始まるリセット。
  const marks = [
    ...edges.map((t) => ({ t, reset: false })),
    ...resets.filter(([a]) => a > 0).map(([a]) => ({ t: a, reset: true })),
  ].sort((x, y) => x.t - y.t);
  const until = (i: number): number => marks[i + 1]?.t ?? Infinity;
  const read = (i: number): string => (until(i) === Infinity ? busAt(trace, bits, trace.end) : busAt(trace, bits, until(i), 'before'));

  const first = marks[0];
  rows.push({ kind: 'reset', n: 0, t: 0, bits: first ? busAt(trace, bits, first.t, 'before') : busAt(trace, bits, trace.end) });
  let n = 0;
  marks.forEach((mark, i) => {
    const settled = read(i);
    if (mark.reset) {
      n = 0;
      rows.push({ kind: 'reset', n: 0, t: mark.t, bits: settled });
      return;
    }
    n++;
    for (const value of transients(mark.t, until(i), settled)) rows.push({ kind: 'transient', n, t: mark.t, bits: value });
    rows.push({ kind: 'settled', n, t: mark.t, bits: settled });
  });
  return rows;
}

/** 時間軸の目盛り。目盛りの間隔が画面上で minPx 以上になるようにする。 */
export function timeTicks(end: number, pxPerNs: number, minPx = 60): number[] {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const unit = candidates.find((c) => c * pxPerNs >= minPx) ?? 1000;
  const ticks: number[] = [];
  for (let t = 0; t <= end; t += unit) ticks.push(t);
  return ticks;
}
