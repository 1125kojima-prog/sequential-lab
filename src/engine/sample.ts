import type { Change, Level, Trace, Trigger } from './types';

/**
 * 時刻 t での信号の値。
 * when = 'before'：t より前の変化だけを反映した値（エッジ直前の値）。
 * when = 'after' ：t ちょうどの変化もすべて反映した値。
 */
export function valueAt(trace: Trace, signal: string, t: number, when: 'before' | 'after' = 'after'): Level {
  let v = trace.initial[signal];
  if (v === undefined) throw new Error(`信号がありません: ${signal}`);
  for (const change of trace.changes) {
    if (change.t > t || (when === 'before' && change.t === t)) break;
    if (change.signal === signal) v = change.value;
  }
  return v;
}

/** 多ビット信号の値を '101' のような文字列で返す（bits は上位ビットから）。 */
export function busAt(trace: Trace, bits: readonly string[], t: number, when: 'before' | 'after' = 'after'): string {
  return bits.map((bit) => valueAt(trace, bit, t, when)).join('');
}

/** 信号の、指定した向きのエッジの時刻。 */
export function edgeTimes(trace: Trace, signal: string, edge: Trigger): number[] {
  const want: Level = edge === 'rising' ? 1 : 0;
  return trace.changes.filter((c) => c.signal === signal && c.value === want).map((c) => c.t);
}

/**
 * 動作表：各クロックエッジの後に落ち着いた値。
 * k 番目のエッジの後の値は、次のエッジの直前（最後のエッジは終了時刻）で読む。
 */
export function statesAfterEdges(trace: Trace, bits: readonly string[], edges: readonly number[]): string[] {
  return edges.map((_, k) => {
    const next = edges[k + 1];
    return next === undefined ? busAt(trace, bits, trace.end, 'after') : busAt(trace, bits, next, 'before');
  });
}

/** 多ビット信号がたどった値の列（一瞬だけ現れる値も含む）。 */
export function busHistory(trace: Trace, bits: readonly string[]): { t: number; delta: number; value: string }[] {
  const current: Record<string, Level> = {};
  for (const bit of bits) current[bit] = valueAt(trace, bit, -Infinity);
  const read = (): string => bits.map((bit) => current[bit]).join('');
  const history = [{ t: 0, delta: 0, value: read() }];
  const relevant = trace.changes.filter((c) => bits.includes(c.signal));
  for (let i = 0; i < relevant.length; i++) {
    const change = relevant[i]!;
    current[change.signal] = change.value;
    const following = relevant[i + 1];
    if (following && following.t === change.t && following.delta === change.delta) continue;
    const value = read();
    if (history[history.length - 1]!.value !== value) history.push({ t: change.t, delta: change.delta, value });
  }
  return history;
}

/** ある信号の変化だけを取り出す。 */
export function changesOf(trace: Trace, signal: string): Change[] {
  return trace.changes.filter((c) => c.signal === signal);
}
