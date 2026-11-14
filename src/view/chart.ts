/** タイミングチャートと動作表のためのデータ整形。UI には依存しない。 */
import { busAt, busHistory, edgeTimes, statesAfterEdges } from '../engine/sample';
import type { Level, Trace, Trigger } from '../engine/types';

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
  /** クロックの回数（0 は最初のエッジの前）。 */
  n: number;
  /** そのエッジの時刻（n=0 は 0）。 */
  t: number;
  /** 落ち着いた後の値（上位ビットから）。 */
  bits: string;
};

/** 動作表：クロックの回数ごとの、落ち着いた後の値。 */
export function operationTable(trace: Trace, bits: readonly string[], clock: string, edge: Trigger): OperationRow[] {
  const edges = edgeTimes(trace, clock, edge);
  const first = edges[0];
  const rows: OperationRow[] = [
    { n: 0, t: 0, bits: first === undefined ? busAt(trace, bits, trace.end) : busAt(trace, bits, first, 'before') },
  ];
  statesAfterEdges(trace, bits, edges).forEach((value, k) => rows.push({ n: k + 1, t: edges[k]!, bits: value }));
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
