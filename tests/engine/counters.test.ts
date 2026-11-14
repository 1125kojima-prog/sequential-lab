/** カウンタは「N回のクロックで元の状態に戻る」ことを確認する。 */
import { describe, expect, it } from 'vitest';
import { busAt, edgeTimes, statesAfterEdges } from '../../src/engine/sample';
import { simulate } from '../../src/engine/simulate';
import { clock, withInputs } from '../../src/engine/stimulus';
import type { Circuit, Level, Trigger } from '../../src/engine/types';
import * as c from '../../src/problems/circuits';

type Counter = {
  circuit: Circuit;
  edge: Trigger;
  n: number;
  /** CLR を働かせない値（CLR 入力がある回路だけ）。 */
  clrIdle?: Level;
  init?: Record<string, Level>;
  /** 数える向き（2進数として読んだとき）。 */
  dir?: 'up' | 'down';
};

const COUNTERS: Counter[] = [
  { circuit: c.c16_p5, edge: 'falling', n: 8, clrIdle: 1, dir: 'up' },
  { circuit: c.c16_3a, edge: 'falling', n: 8, dir: 'down' },
  { circuit: c.c16_3b, edge: 'rising', n: 8, dir: 'down' },
  { circuit: c.c16_4, edge: 'falling', n: 8, clrIdle: 1, dir: 'up' },
  { circuit: c.c16_5, edge: 'falling', n: 5, clrIdle: 0, dir: 'up' },
  { circuit: c.c16_5s, edge: 'falling', n: 5, clrIdle: 0, dir: 'up' },
  { circuit: c.c16_ex2a, edge: 'rising', n: 16, clrIdle: 1, dir: 'down' },
  { circuit: c.c16_ex2b, edge: 'rising', n: 16, clrIdle: 1, dir: 'up' },
  { circuit: c.c16_ex3, edge: 'rising', n: 7, clrIdle: 1, dir: 'up' },
  { circuit: c.c17_1, edge: 'falling', n: 5, dir: 'up' },
  { circuit: c.c17_3, edge: 'falling', n: 5, dir: 'up' },
  { circuit: c.c17_ex1, edge: 'falling', n: 16, dir: 'up' },
  { circuit: c.c18_1, edge: 'falling', n: 4, clrIdle: 0, dir: 'up' },
  { circuit: c.c18_2, edge: 'falling', n: 4, clrIdle: 0 },
  { circuit: c.c18_p3, edge: 'falling', n: 8, dir: 'up' },
  { circuit: c.c18_p4, edge: 'falling', n: 16, dir: 'up' },
  { circuit: c.c18_d3, edge: 'falling', n: 3, clrIdle: 0, dir: 'up' },
  { circuit: c.c18_rs3, edge: 'falling', n: 3, clrIdle: 0, dir: 'up' },
  { circuit: c.c18_ex2, edge: 'falling', n: 5, dir: 'up' },
  { circuit: c.c20_ring, edge: 'rising', n: 4, clrIdle: 1, init: { ff3: 1 } },
  { circuit: c.c20_self, edge: 'rising', n: 4, clrIdle: 1, init: { ff3: 1 } },
  { circuit: c.c20_johnson, edge: 'rising', n: 8, clrIdle: 1 },
];

describe.each(COUNTERS)('$circuit.id は $n 進', ({ circuit, edge, n, clrIdle, init, dir }) => {
  const base = clock({ signal: 'cp', edge, period: 100, edges: 2 * n });
  const stimulus = clrIdle === undefined ? base : withInputs(base, { clr: clrIdle });
  const bits = circuit.buses!.Q!;

  it.each(['ideal', 'delay'] as const)('%s：N回で元に戻り、途中の N 個の状態はすべて異なる', (mode) => {
    const trace = simulate(circuit, stimulus, { mode, init });
    const start = busAt(trace, bits, 0);
    const states = statesAfterEdges(trace, bits, edgeTimes(trace, 'cp', edge));
    expect(states[n - 1]).toBe(start);
    expect(states[2 * n - 1]).toBe(start);
    expect(new Set(states.slice(0, n)).size).toBe(n);
    expect(states.slice(n)).toEqual(states.slice(0, n));
  });

  it.runIf(dir !== undefined)(`数える向きは ${dir}`, () => {
    const trace = simulate(circuit, stimulus, { mode: 'ideal', init });
    const values = [busAt(trace, bits, 0), ...statesAfterEdges(trace, bits, edgeTimes(trace, 'cp', edge))]
      .slice(0, n)
      .map((s) => parseInt(s, 2));
    const expected = Array.from({ length: n }, (_, k) => (dir === 'up' ? k : (2 ** bits.length - k) % 2 ** bits.length));
    expect(values).toEqual(expected);
  });
});
