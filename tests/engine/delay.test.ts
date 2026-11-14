/** 遅延モード（タイムラグ）のテスト。FF 8ns、ゲート 5ns、クロック周期 100ns。 */
import { describe, expect, it } from 'vitest';
import { busHistory, edgeTimes, statesAfterEdges } from '../../src/engine/sample';
import { simulate } from '../../src/engine/simulate';
import { clock, withInputs } from '../../src/engine/stimulus';
import type { Circuit, SimOptions, Trace, Trigger } from '../../src/engine/types';
import * as c from '../../src/problems/circuits';
import { SCENARIOS, SLIDE_16_5 } from '../fixtures/scenarios';

const FF = 8;
const GATE = 5;
const delay = (extra: Partial<SimOptions> = {}): SimOptions => ({ mode: 'delay', delays: { ff: FF, gate: GATE }, ...extra });

/** クロックで動いた Q の変化を「どのFFが、Cₚ のエッジから何ns後に」の形で取り出す。 */
function clockedLags(trace: Trace, edge: Trigger): { ff: string; lag: number }[] {
  const edges = edgeTimes(trace, 'cp', edge);
  const out: { ff: string; lag: number }[] = [];
  for (const change of trace.changes) {
    if (change.cause.kind !== 'clock' || !/^q\d$/.test(change.signal)) continue;
    const origin = edges.filter((t) => t <= change.t).at(-1);
    if (origin === undefined) throw new Error('エッジより前に変化しています');
    out.push({ ff: change.cause.ff, lag: change.t - origin });
  }
  return out;
}

describe('非同期式カウンタ：遅れが段々に積み重なる', () => {
  const cases: { circuit: Circuit; edge: Trigger; clr?: 0 | 1 }[] = [
    { circuit: c.c16_p5, edge: 'falling', clr: 1 },
    { circuit: c.c16_3a, edge: 'falling' },
    { circuit: c.c16_3b, edge: 'rising' },
    { circuit: c.c16_4, edge: 'falling', clr: 1 },
    { circuit: c.c16_5, edge: 'falling', clr: 0 },
    { circuit: c.c17_1, edge: 'falling' },
  ];

  it.each(cases)('$circuit.id：リップルが届いた段 k は、エッジから (k+1)×FF遅延 後に変化する', ({ circuit, edge, clr }) => {
    const base = clock({ signal: 'cp', edge, period: 100, edges: 10 });
    const trace = simulate(circuit, clr === undefined ? base : withInputs(base, { clr }), delay());
    const lags = clockedLags(trace, edge);
    // 変化しなかった段は検査しない（clockedLags に現れない）。
    for (const { ff, lag } of lags) {
      const k = Number(ff.replace('ff', ''));
      expect(lag, `${ff}`).toBe((k + 1) * FF);
    }
    // 最終段までリップルが届いた場面が、少なくとも1回ある。
    expect(lags.some((l) => l.ff === 'ff2')).toBe(true);
    expect(lags.some((l) => l.ff === 'ff0')).toBe(true);
  });

  it('16-4：1つのエッジの中で 8ns → 16ns → 24ns の順に変わる（011→100）', () => {
    const trace = simulate(
      c.c16_4,
      withInputs(clock({ signal: 'cp', edge: 'falling', period: 100, edges: 5 }), { clr: 1 }),
      delay(),
    );
    const window = trace.changes.filter((ch) => ch.t > 400 && ch.t < 500 && /^q\d$/.test(ch.signal));
    expect(window.map((ch) => [ch.signal, ch.t - 400, ch.value])).toEqual([
      ['q0', 8, 0],
      ['q1', 16, 0],
      ['q2', 24, 1],
    ]);
    // 途中に、本来はない値が一瞬現れる：011 → 010 → 000 → 100
    const seen = busHistory(trace, ['q2', 'q1', 'q0']).filter((h) => h.t > 400 && h.t < 500);
    expect(seen.map((h) => h.value)).toEqual(['010', '000', '100']);
  });
});

describe('同期式カウンタ：全FFが同時に、FF遅延だけ遅れて変化する', () => {
  const cases = [c.c18_1, c.c18_p3, c.c18_p4, c.c18_d3, c.c18_rs3, c.c18_ex2];

  it.each(cases)('$id', (circuit) => {
    const base = clock({ signal: 'cp', edge: 'falling', period: 100, edges: 16 });
    const trace = simulate(circuit, circuit.inputs.includes('clr') ? withInputs(base, { clr: 0 }) : base, delay());
    const lags = clockedLags(trace, 'falling');
    expect(lags.length).toBeGreaterThan(0);
    expect(lags.every((l) => l.lag === FF)).toBe(true);
  });

  it('非同期8進（16-4）と同期8進（18-練3）の比較：111→000 で最後の Q が変わる時刻', () => {
    const stim = clock({ signal: 'cp', edge: 'falling', period: 100, edges: 8 });
    const last = (trace: Trace): number => Math.max(...trace.changes.filter((ch) => ch.t >= 800 && /^q\d$/.test(ch.signal)).map((ch) => ch.t));
    expect(last(simulate(c.c16_4, withInputs(stim, { clr: 1 }), delay())) - 800).toBe(3 * FF);
    expect(last(simulate(c.c18_p3, stim, delay())) - 800).toBe(FF);
  });
});

describe('遅延が小さければ、各エッジの後に落ち着く値は理想モードと同じ', () => {
  it.each(SCENARIOS)('$name', (s) => {
    const ideal = simulate(s.circuit, s.stimulus, { mode: 'ideal', init: s.init });
    const delayed = simulate(s.circuit, s.stimulus, delay({ init: s.init }));
    const edges = edgeTimes(ideal, 'cp', s.edge);
    expect(statesAfterEdges(delayed, s.bits, edges)).toEqual(statesAfterEdges(ideal, s.bits, edges));
  });

  it.each([c.c16_5, c.c16_5s])('$id', (circuit) => {
    const ideal = simulate(circuit, SLIDE_16_5.stimulus);
    const delayed = simulate(circuit, SLIDE_16_5.stimulus, delay());
    const edges = edgeTimes(ideal, 'cp', 'falling');
    expect(statesAfterEdges(delayed, SLIDE_16_5.bits, edges)).toEqual(statesAfterEdges(ideal, SLIDE_16_5.bits, edges));
  });

  it('16-5：遅延ありでは (101) が幅のあるパルスとして見える', () => {
    const trace = simulate(c.c16_5s, SLIDE_16_5.stimulus, delay());
    const seen = busHistory(trace, SLIDE_16_5.bits).filter((h) => h.t >= 600 && h.t < 700);
    // 608: Q₀=1 → AND(5) → OR(5) → CLR → FF(8) で 626 に Q₀, Q₂ が 0
    expect(seen).toEqual([
      { t: 608, delta: 0, value: '101' },
      { t: 626, delta: 0, value: '000' },
    ]);
  });
});

describe('17-2 リセット信号の伝達が遅れると誤動作する（p.3）', () => {
  const stim = clock({ signal: 'cp', edge: 'falling', period: 100, edges: 14 });
  const bits = ['q2', 'q1', 'q0'];
  const run = (circuit: Circuit, wireDelay: number, wireModel: 'inertial' | 'transport' = 'inertial'): string[] => {
    const trace = simulate(circuit, stim, delay({ delays: { ff: FF, gate: GATE, wire: { rst_ff0: wireDelay } }, wireModel }));
    return statesAfterEdges(trace, bits, edgeTimes(trace, 'cp', 'falling'));
  };
  const NORMAL = ['001', '010', '011', '100', '000', '001', '010', '011', '100', '000', '001', '010', '011', '100'];

  it.each([0, 2, 4])('配線遅延 %ins：正常な5進カウンタ', (d) => {
    expect(run(c.c17_1, d)).toEqual(NORMAL);
  });

  it('配線遅延 20ns（慣性・標準）：リセットが FF₀ に届かず、(101) の次が (001) になる', () => {
    // スライドの説明どおり：FF₁ と FF₂ だけリセットされ、Q₂=0 でリセット信号が消える。
    // 以降は 001→010→011→100 の4状態を回り、(000) には戻らない。
    expect(run(c.c17_1, 20)).toEqual([
      '001', '010', '011', '100', '001', '010', '011', '100', '001', '010', '011', '100', '001', '010',
    ]);
  });

  it('配線遅延 20ns（慣性）：FF₀ の CLR 端子にはパルスが届いていない', () => {
    const trace = simulate(c.c17_1, stim, delay({ delays: { ff: FF, gate: GATE, wire: { rst_ff0: 20 } } }));
    const q0Causes = trace.changes.filter((ch) => ch.signal === 'q0').map((ch) => ch.cause.kind);
    expect(q0Causes.every((kind) => kind === 'clock')).toBe(true);
    // AND の出力（リセット信号）自体は出ている：幅 13ns（FF 8ns + ゲート 5ns）
    const rst = trace.changes.filter((ch) => ch.signal === 'rst').slice(0, 2);
    expect(rst.map((ch) => [ch.t, ch.value])).toEqual([
      [513, 1],
      [526, 0],
    ]);
  });

  it('配線遅延 8ns：リセットは届くが遅く、Q₀ の立下りで FF₁ が動いて (010) へ飛ぶ', () => {
    // FF₁ の CLR が解除された後に Q₀ が 0 になるため、FF₁ がそれをクロックとして受け取る。
    expect(run(c.c17_1, 8)).toEqual([
      '001', '010', '011', '100', '010', '011', '100', '010', '011', '100', '010', '011', '100', '010',
    ]);
  });

  it('配線遅延 20ns（そのまま遅れて届く方式）：リセットは遅れて届き、(010) へ飛ぶ', () => {
    expect(run(c.c17_1, 20, 'transport')).toEqual([
      '001', '010', '011', '100', '010', '011', '100', '010', '011', '100', '010', '011', '100', '010',
    ]);
  });

  it.each([0, 8, 20, 40])('17-3 改良型は、配線遅延 %ins でも正常な5進カウンタ', (d) => {
    expect(run(c.c17_3, d)).toEqual(NORMAL);
  });
});
