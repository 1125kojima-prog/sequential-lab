/**
 * 問題モードの正解づくりと採点。正解はエンジンの結果（理想モード）から計算する。UI には依存しない。
 */
import { busAt, valueAt } from '../engine/sample';
import type { Circuit, Conn, Level, Trace, Trigger } from '../engine/types';
import { operationTable } from './chart';

/** タイミングチャートのマス（クロックの半周期）。 */
export type Cell<T> = {
  t0: number;
  t1: number;
  /** マスの中での値。 */
  value: T;
  /**
   * マスの途中で値が変わる（CLR や PR で、エッジ以外の時刻に変化する）。
   * H/L の1つでは表せないので、最初から波形を見せて採点しない。
   */
  given: boolean;
};

function cellTimes(end: number, cell: number): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t < end; t += cell) out.push([t, Math.min(end, t + cell)]);
  return out;
}

/** 1ビット信号の、マスごとの正解。 */
export function signalCells(trace: Trace, signal: string, cell: number): Cell<Level>[] {
  return cellTimes(trace.end, cell).map(([t0, t1]) => ({
    t0,
    t1,
    value: valueAt(trace, signal, t0, 'after'),
    given: trace.changes.some((ch) => ch.signal === signal && ch.t > t0 && ch.t < t1),
  }));
}

/** 多ビット信号の、マスごとの正解（16進の1文字以上。'X' は付けない）。 */
export function busCells(trace: Trace, bits: readonly string[], cell: number): Cell<string>[] {
  const digits = Math.ceil(bits.length / 4);
  return cellTimes(trace.end, cell).map(([t0, t1]) => ({
    t0,
    t1,
    value: parseInt(busAt(trace, bits, t0, 'after'), 2).toString(16).toUpperCase().padStart(digits, '0'),
    given: trace.changes.some((ch) => bits.includes(ch.signal) && ch.t > t0 && ch.t < t1),
  }));
}

export type Mark = 'given' | 'correct' | 'wrong' | 'blank';

/** 答えを正解と比べる。 */
export function grade<T>(expected: readonly { value: T; given: boolean }[], answers: readonly (T | undefined)[]): Mark[] {
  return expected.map((cell, i) => {
    if (cell.given) return 'given';
    const answer = answers[i];
    if (answer === undefined || answer === '') return 'blank';
    return answer === cell.value ? 'correct' : 'wrong';
  });
}

/** 採点する欄がすべて正解か。 */
export function allCorrect(marks: readonly Mark[]): boolean {
  return marks.every((m) => m === 'given' || m === 'correct');
}

export type CounterKind = {
  /** 全 FF のクロックが共通のクロック入力につながっている。 */
  sync: boolean;
  /** 何進か（状態が一巡するまでのクロックの数）。一巡しなければ undefined。 */
  modulus: number | undefined;
  direction: 'up' | 'down' | 'other';
};

function connRef(conn: Conn): string | 0 | 1 {
  return typeof conn === 'object' ? conn.from : conn;
}

/** 回路と動作から、カウンタの種類（同期式か、何進か、アップかダウンか）を求める。 */
export function counterKind(
  circuit: Circuit,
  trace: Trace,
  bits: readonly string[],
  clock: string,
  edge: Trigger,
): CounterKind {
  const sync = circuit.components.every((comp) => comp.kind !== 'ff' || connRef(comp.clock) === clock);
  // 一瞬だけ現れる値は除く。外部 CLR でリセットされた後は、数え直しの行から続ける。
  const states = operationTable(circuit, trace, bits, clock, edge)
    .filter((row) => row.kind !== 'transient')
    .map((row) => row.bits);
  // 動き始めた状態が、次に現れるまでのクロックの数。
  const start = states.findIndex((s, i) => i + 1 < states.length && states[i + 1] !== s);
  const again = start < 0 ? -1 : states.indexOf(states[start]!, start + 1);
  if (start < 0 || again < 0) return { sync, modulus: undefined, direction: 'other' };
  const modulus = again - start;
  const cycle = states.slice(start, again + 1).map((s) => parseInt(s, 2));
  const steps = cycle.slice(1).map((v, i) => (((v - cycle[i]!) % modulus) + modulus) % modulus);
  const direction = steps.every((d) => d === 1) ? 'up' : steps.every((d) => d === modulus - 1) ? 'down' : 'other';
  return { sync, modulus, direction };
}
