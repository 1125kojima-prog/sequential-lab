/** スライドの答え（動作表・タイミングチャート）と、理想モードの結果が一致することを確認する。 */
import { describe, expect, it } from 'vitest';
import { busAt, busHistory, changesOf, edgeTimes, statesAfterEdges, valueAt } from '../../src/engine/sample';
import { simulate } from '../../src/engine/simulate';
import { clock, withInputs } from '../../src/engine/stimulus';
import type { Level, Trace } from '../../src/engine/types';
import * as c from '../../src/problems/circuits';
import { busInit, busSet, SCENARIOS, SLIDE_16_5, SLIDE_20_SELF, SLIDE_21 } from '../fixtures/scenarios';

/** 信号が 1 になっている区間（幅 0 のものは除く）。 */
function highIntervals(trace: Trace, signal: string): [number, number][] {
  const out: [number, number][] = [];
  let start: number | undefined = trace.initial[signal] === 1 ? 0 : undefined;
  for (const change of changesOf(trace, signal)) {
    if (change.value === 1) start = change.t;
    else if (start !== undefined) {
      if (change.t > start) out.push([start, change.t]);
      start = undefined;
    }
  }
  if (start !== undefined) out.push([start, trace.end]);
  return out;
}

describe('スライドの答えと一致する（理想モード）', () => {
  it.each(SCENARIOS)('$name（$source）', (s) => {
    const trace = simulate(s.circuit, s.stimulus, { mode: 'ideal', init: s.init });
    const edges = edgeTimes(trace, 'cp', s.edge);
    expect(edges).toHaveLength(s.afterEdges.length);
    expect(statesAfterEdges(trace, s.bits, edges)).toEqual(s.afterEdges);
  });
});

describe('16-5 非同期5進アップカウンタ（p.9〜10）', () => {
  const circuits = [c.c16_5, c.c16_5s];

  it.each(circuits)('$id：E1〜E15 がスライドのチャートと一致する', (circuit) => {
    const trace = simulate(circuit, SLIDE_16_5.stimulus);
    const edges = edgeTimes(trace, 'cp', 'falling');
    expect(statesAfterEdges(trace, SLIDE_16_5.bits, edges).slice(0, 15)).toEqual(SLIDE_16_5.afterEdges.slice(0, 15));
    expect(busAt(trace, SLIDE_16_5.bits, SLIDE_16_5.afterE13.t)).toBe(SLIDE_16_5.afterE13.value);
  });

  it.each(circuits)('$id：E16 はスライドの絵（000）と食い違い、機構上は 010 になる（D10）', (circuit) => {
    const trace = simulate(circuit, SLIDE_16_5.stimulus);
    const edges = edgeTimes(trace, 'cp', 'falling');
    const actual = statesAfterEdges(trace, SLIDE_16_5.bits, edges)[15];
    expect(SLIDE_16_5.afterEdges[15]).toBe('000');
    expect(actual).toBe('010');
  });

  it.each(circuits)('$id：(100) の次のエッジで一瞬 (101) になり、直ちに (000) へ戻る', (circuit) => {
    const trace = simulate(circuit, SLIDE_16_5.stimulus);
    const at600 = busHistory(trace, SLIDE_16_5.bits).filter((h) => h.t === 600);
    expect(at600.map((h) => h.value)).toEqual(['101', '000']);
    expect(busAt(trace, SLIDE_16_5.bits, 600, 'before')).toBe('100');
  });

  it('リセットの理由が記録される：AND 出力 → OR → CLR', () => {
    const trace = simulate(c.c16_5, SLIDE_16_5.stimulus);
    const rst = changesOf(trace, 'rst').find((ch) => ch.t === 600 && ch.value === 1);
    expect(rst?.cause).toMatchObject({ kind: 'gate', gate: 'rst', inputs: [1, 1, 1] });
    const q0 = changesOf(trace, 'q0').filter((ch) => ch.t === 600);
    expect(q0.map((ch) => ch.cause.kind)).toEqual(['clock', 'async']);
    expect(q0[1]!.cause).toMatchObject({ pin: 'clr', by: 'clr_all' });
  });

  it('外部 CLR が 1 の間はクロックを無視する（E1 と E14）', () => {
    const trace = simulate(c.c16_5s, SLIDE_16_5.stimulus);
    expect(busAt(trace, SLIDE_16_5.bits, 110)).toBe('000');
    expect(busAt(trace, SLIDE_16_5.bits, 1380)).toBe('000');
    expect(busAt(trace, SLIDE_16_5.bits, 1410)).toBe('000');
  });
});

describe('17-1 の一瞬の (101)（p.2）', () => {
  it('5回目のエッジで (100)→(101)→(000)', () => {
    const trace = simulate(c.c17_1, clock({ signal: 'cp', edge: 'falling', period: 100, edges: 6 }));
    const at500 = busHistory(trace, ['q2', 'q1', 'q0']).filter((h) => h.t === 500);
    expect(at500.map((h) => h.value)).toEqual(['101', '000']);
  });
});

describe('19 レジスタ（バス表記）', () => {
  const hex = (bits: string): string => parseInt(bits, 2).toString(16).toUpperCase();

  it('4ビットパラレルレジスタ（p.6）：Q = X0,X3,X1,XA,X6,X1,X0,X1,XF,X5', () => {
    const a = ['a3', 'a2', 'a1', 'a0'];
    const stimulus = withInputs(
      clock({ signal: 'cp', edge: 'rising', period: 100, edges: 8 }),
      { clr: 0, ...busInit(a, '3') },
      [
        [80, 'clr', 1],
        ...busSet(a, 140, '1'),
        ...busSet(a, 215, 'A'),
        ...busSet(a, 365, '6'),
        ...busSet(a, 465, '1'),
        [535, 'clr', 0],
        [555, 'clr', 1],
        ...busSet(a, 620, 'F'),
        ...busSet(a, 715, '5'),
      ],
    );
    const trace = simulate(c.c19_reg4, stimulus);
    const history = busHistory(trace, ['q3', 'q2', 'q1', 'q0']).map((h) => hex(h.value));
    expect(history).toEqual(['0', '3', '1', 'A', '6', '1', '0', '1', 'F', '5']);
  });

  it('演習1（p.9）：3ビットパラレルレジスタ（立下り）。Q = X0,X2,X3,X3,X4,X0,X6,X7,X0', () => {
    const a = ['a2', 'a1', 'a0'];
    const stimulus = withInputs(
      clock({ signal: 'cp', edge: 'falling', period: 100, edges: 8 }),
      { clr: 0, ...busInit(a, '1') },
      [
        [30, 'clr', 1],
        ...busSet(a, 87, '2'),
        ...busSet(a, 165, '3'),
        ...busSet(a, 316, '4'),
        ...busSet(a, 413, '5'),
        [484, 'clr', 0],
        [532, 'clr', 1],
        ...busSet(a, 570, '6'),
        ...busSet(a, 663, '7'),
        ...busSet(a, 787, '0'),
      ],
    );
    const trace = simulate(c.c19_ex1, stimulus);
    const q = ['q2', 'q1', 'q0'];
    // スライドは区間ごとの値。X3 が2区間続くところは、E3 の前後で値を読んで確かめる。
    expect(busHistory(trace, q).map((h) => hex(h.value))).toEqual(['0', '2', '3', '4', '0', '6', '7', '0']);
    expect([250, 350, 450, 510].map((t) => hex(busAt(trace, q, t)))).toEqual(['3', '3', '4', '0']);
  });

  it('PISO（p.8）：プリセットした直後に Q へ出る', () => {
    const s = SCENARIOS.find((x) => x.source === '19 p.8')!;
    const trace = simulate(s.circuit, s.stimulus);
    expect(busAt(trace, ['q3', 'q2', 'q1', 'q0'], 160)).toBe('1001');
    expect(busAt(trace, ['q3', 'q2', 'q1', 'q0'], 750)).toBe('1110');
  });

  it('JK-FFのシフトレジスタ（20-練1）は、D-FFのSIPOと同じ動きをする', () => {
    const s = SCENARIOS.find((x) => x.source === '19 p.7')!;
    const d = simulate(c.c19_sipo, s.stimulus);
    const jk = simulate(c.c20_p1, s.stimulus);
    const edges = edgeTimes(d, 'cp', 'rising');
    expect(statesAfterEdges(jk, s.bits, edges)).toEqual(statesAfterEdges(d, s.bits, edges));
  });
});

describe('20 リングカウンタ', () => {
  const one = withInputs(clock({ signal: 'cp', edge: 'rising', period: 100, edges: 1 }), { clr: 1 });
  const q = ['q3', 'q2', 'q1', 'q0'];
  const initOf = (state: string): Record<string, Level> =>
    Object.fromEntries([...state].map((bit, i) => [`ff${3 - i}`, bit === '1' ? 1 : 0])) as Record<string, Level>;

  it('練習2：初期値 (0000) だと動かない', () => {
    const trace = simulate(c.c20_ring, withInputs(clock({ signal: 'cp', edge: 'rising', period: 100, edges: 5 }), { clr: 1 }));
    expect(busHistory(trace, q).map((h) => h.value)).toEqual(['0000']);
  });

  it('練習4：自己補正型は全16状態でスライドの状態図どおりに遷移する', () => {
    for (const [state, next] of Object.entries(SLIDE_20_SELF)) {
      const trace = simulate(c.c20_self, one, { mode: 'ideal', init: initOf(state) });
      expect(busAt(trace, q, 0), state).toBe(state);
      expect(busAt(trace, q, trace.end), `${state} の次`).toBe(next);
    }
  });

  it('練習4：どの初期値からも定常ループ（1000→0100→0010→0001）に入る', () => {
    const loop = ['1000', '0100', '0010', '0001'];
    const stim = withInputs(clock({ signal: 'cp', edge: 'rising', period: 100, edges: 8 }), { clr: 1 });
    for (let n = 0; n < 16; n++) {
      const state = n.toString(2).padStart(4, '0');
      const trace = simulate(c.c20_self, stim, { mode: 'ideal', init: initOf(state) });
      const tail = statesAfterEdges(trace, q, edgeTimes(trace, 'cp', 'rising')).slice(4);
      expect(tail.every((v) => loop.includes(v)), state).toBe(true);
    }
  });

  it('ふつうのリングカウンタは (1110) から定常ループに戻れない', () => {
    const s = SCENARIOS.find((x) => x.source === '20 p.3')!;
    const trace = simulate(s.circuit, s.stimulus, { mode: 'ideal', init: s.init });
    expect(busHistory(trace, q).some((h) => h.value === '1000')).toBe(false);
  });
});

describe('21-練6 自動販売機のタイミングチャート（p.9）', () => {
  const trace = simulate(c.c21_vending, SLIDE_21.stimulus);

  it.each(Object.entries(SLIDE_21.high))('%s が 1 になる区間がスライドと一致する', (signal, expected) => {
    expect(highIntervals(trace, signal)).toEqual(expected);
  });

  it('ワインが出るのは、3000円状態で1000円がラッチされた1周期だけ', () => {
    expect(valueAt(trace, 'y0', 950)).toBe(1);
    expect(busAt(trace, ['q1', 'q0'], 950)).toBe('11');
    expect(busAt(trace, ['q1', 'q0'], 1050)).toBe('00');
  });
});
