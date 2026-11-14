import { describe, expect, it } from 'vitest';
import { activeHigh, activeLow, ff, gate, wire } from '../../src/engine/build';
import { changesOf, valueAt } from '../../src/engine/sample';
import { evalGate, ffNext, simulate } from '../../src/engine/simulate';
import type { Circuit, FFType, GateOp, Level, Stimulus, Trigger } from '../../src/engine/types';

const L = (bits: string): Level[] => [...bits].map((b) => (b === '1' ? 1 : 0));

describe('ゲートの真理値表', () => {
  // 入力 00, 01, 10, 11 に対する出力
  const tables: [GateOp, string][] = [
    ['AND', '0001'],
    ['OR', '0111'],
    ['NAND', '1110'],
    ['NOR', '1000'],
    ['XOR', '0110'],
  ];
  it.each(tables)('%s', (op, expected) => {
    const actual = ['00', '01', '10', '11'].map((input) => evalGate(op, L(input))).join('');
    expect(actual).toBe(expected);
  });

  it('NOT', () => {
    expect(evalGate('NOT', [0])).toBe(1);
    expect(evalGate('NOT', [1])).toBe(0);
  });

  it('3入力の AND と NAND', () => {
    expect(evalGate('AND', L('111'))).toBe(1);
    expect(evalGate('AND', L('101'))).toBe(0);
    expect(evalGate('NAND', L('111'))).toBe(0);
    expect(evalGate('NAND', L('110'))).toBe(1);
  });
});

describe('FFの特性表', () => {
  it('D-FF：D の値になる', () => {
    expect(ffNext('D', 0, { d: 1 }).next).toBe(1);
    expect(ffNext('D', 1, { d: 0 }).next).toBe(0);
  });

  it('T-FF：T=1 で反転、T=0 で保持', () => {
    expect(ffNext('T', 0, { t: 1 })).toEqual({ next: 1, action: 'toggle' });
    expect(ffNext('T', 1, { t: 1 })).toEqual({ next: 0, action: 'toggle' });
    expect(ffNext('T', 1, { t: 0 })).toEqual({ next: 1, action: 'hold' });
  });

  it('JK-FF：保持／リセット／セット／反転', () => {
    expect(ffNext('JK', 1, { j: 0, k: 0 })).toEqual({ next: 1, action: 'hold' });
    expect(ffNext('JK', 1, { j: 0, k: 1 })).toEqual({ next: 0, action: 'reset' });
    expect(ffNext('JK', 0, { j: 1, k: 0 })).toEqual({ next: 1, action: 'set' });
    expect(ffNext('JK', 0, { j: 1, k: 1 })).toEqual({ next: 1, action: 'toggle' });
    expect(ffNext('JK', 1, { j: 1, k: 1 })).toEqual({ next: 0, action: 'toggle' });
  });

  it('RS-FF：保持／リセット／セット、S=R=1 は禁止入力', () => {
    expect(ffNext('RS', 1, { s: 0, r: 0 })).toEqual({ next: 1, action: 'hold' });
    expect(ffNext('RS', 1, { s: 0, r: 1 })).toEqual({ next: 0, action: 'reset' });
    expect(ffNext('RS', 0, { s: 1, r: 0 })).toEqual({ next: 1, action: 'set' });
    expect(ffNext('RS', 0, { s: 1, r: 1 }).action).toBe('invalid');
  });
});

/** D-FF 1個の回路。cp は 100 で立上り、200 で立下る。 */
function single(type: FFType, trigger: Trigger, extra: Partial<ReturnType<typeof ff>> = {}): Circuit {
  const data = type === 'D' ? { d: 'a' } : type === 'T' ? { t: 'a' } : type === 'JK' ? { j: 'a', k: 'b' } : { s: 'a', r: 'b' };
  return {
    id: 'single',
    inputs: ['cp', 'a', 'b', 'clr', 'pr'],
    components: [ff(type, 'ff', 'q', { trigger, clock: 'cp', ...data, ...extra })],
  };
}

const pulse: Stimulus = {
  initial: { a: 1 },
  changes: [
    { t: 100, signal: 'cp', value: 1 },
    { t: 200, signal: 'cp', value: 0 },
  ],
  end: 300,
};

describe('FFのトリガ', () => {
  it('立上りエッジで動く', () => {
    const trace = simulate(single('D', 'rising'), pulse);
    expect(changesOf(trace, 'q').map((c) => c.t)).toEqual([100]);
    expect(valueAt(trace, 'nq', 150)).toBe(0);
  });

  it('立下りエッジで動く', () => {
    const trace = simulate(single('D', 'falling'), pulse);
    expect(changesOf(trace, 'q').map((c) => c.t)).toEqual([200]);
  });

  it('エッジと同時に変わった入力は、変わる前の値を読む', () => {
    const stim: Stimulus = { ...pulse, changes: [...pulse.changes, { t: 100, signal: 'a', value: 0 }] };
    const trace = simulate(single('D', 'rising'), stim);
    expect(valueAt(trace, 'q', 150)).toBe(1);
  });

  it('変化の理由に、エッジ直前の入力と動作が記録される', () => {
    const trace = simulate(single('JK', 'falling'), { ...pulse, initial: { a: 1, b: 1 } });
    expect(changesOf(trace, 'q')[0]!.cause).toEqual({
      kind: 'clock',
      ff: 'ff',
      at: 200,
      edge: 'falling',
      clockSignal: 'cp',
      inputs: { j: 1, k: 1 },
      action: 'toggle',
    });
  });
});

describe('CLR と PR', () => {
  it('正論理の CLR：1 で Q=0。働いている間はクロックを無視する', () => {
    const circuit = single('D', 'rising', { clr: activeHigh('clr'), init: 1 });
    const trace = simulate(circuit, {
      initial: { a: 1 },
      changes: [
        { t: 50, signal: 'clr', value: 1 },
        { t: 100, signal: 'cp', value: 1 },
        { t: 150, signal: 'cp', value: 0 },
        { t: 160, signal: 'clr', value: 0 },
        { t: 200, signal: 'cp', value: 1 },
      ],
      end: 300,
    });
    expect(valueAt(trace, 'q', 40)).toBe(1);
    expect(valueAt(trace, 'q', 60)).toBe(0);
    expect(valueAt(trace, 'q', 120)).toBe(0);
    expect(valueAt(trace, 'q', 220)).toBe(1);
    expect(changesOf(trace, 'q')[0]!.cause).toMatchObject({ kind: 'async', pin: 'clr', by: 'clr' });
  });

  it('負論理の CLR：0 で Q=0', () => {
    const circuit = single('D', 'rising', { clr: activeLow('clr'), init: 1 });
    // clr の初期値は 0（働いている）ので、最初から Q=0。
    const trace = simulate(circuit, { ...pulse, changes: [{ t: 50, signal: 'clr', value: 1 }, ...pulse.changes] });
    expect(trace.initial.q).toBe(0);
    expect(valueAt(trace, 'q', 150)).toBe(1);
  });

  it('正論理の PR：1 で Q=1（クロックに関係なく）', () => {
    const circuit = single('D', 'rising', { pr: activeHigh('pr') });
    const trace = simulate(circuit, {
      initial: { a: 0 },
      changes: [
        { t: 30, signal: 'pr', value: 1 },
        { t: 60, signal: 'pr', value: 0 },
        { t: 100, signal: 'cp', value: 1 },
      ],
      end: 200,
    });
    expect(valueAt(trace, 'q', 40)).toBe(1);
    expect(valueAt(trace, 'q', 80)).toBe(1);
    expect(valueAt(trace, 'q', 120)).toBe(0);
  });

  it('負論理の PR：0 で Q=1', () => {
    const circuit = single('D', 'rising', { pr: activeLow('pr') });
    const trace = simulate(circuit, { initial: { a: 0, pr: 1 }, changes: [{ t: 30, signal: 'pr', value: 0 }], end: 100 });
    expect(valueAt(trace, 'q', 20)).toBe(0);
    expect(valueAt(trace, 'q', 40)).toBe(1);
  });
});

describe('遅延', () => {
  const buffer: Circuit = {
    id: 'chain',
    inputs: ['a'],
    components: [gate('n1', 'NOT', 'a'), gate('n2', 'NOT', 'n1')],
  };
  const step: Stimulus = { changes: [{ t: 10, signal: 'a', value: 1 }], end: 100 };

  it('理想モード：同じ時刻に、因果の順（delta）で変化する', () => {
    const trace = simulate(buffer, step);
    expect(trace.changes.map((c) => [c.signal, c.t, c.delta])).toEqual([
      ['a', 10, 0],
      ['n1', 10, 1],
      ['n2', 10, 2],
    ]);
  });

  it('遅延モード：ゲートごとに遅延が積み重なる', () => {
    const trace = simulate(buffer, step, { mode: 'delay', delays: { gate: 5, gateById: { n2: 7 } } });
    expect(trace.changes.map((c) => [c.signal, c.t])).toEqual([
      ['a', 10],
      ['n1', 15],
      ['n2', 22],
    ]);
  });

  it('FFの遅延：クロックエッジから Q の変化まで', () => {
    const trace = simulate(single('D', 'rising'), pulse, { mode: 'delay', delays: { ff: 8 } });
    expect(changesOf(trace, 'q').map((c) => c.t)).toEqual([108]);
    expect(changesOf(trace, 'nq').map((c) => c.t)).toEqual([108]);
  });

  const wired: Circuit = { id: 'wired', inputs: ['a'], components: [gate('y', 'OR', wire('a', 'w'), 0)] };
  const shortPulse: Stimulus = {
    changes: [
      { t: 10, signal: 'a', value: 1 },
      { t: 16, signal: 'a', value: 0 },
    ],
    end: 100,
  };

  it('配線遅延（慣性・標準）：遅延より短いパルスは消える', () => {
    const trace = simulate(wired, shortPulse, { mode: 'delay', delays: { gate: 0, wire: { w: 10 } } });
    expect(changesOf(trace, 'y')).toEqual([]);
  });

  it('配線遅延（慣性）：遅延より長いパルスは遅れて届く', () => {
    const trace = simulate(wired, shortPulse, { mode: 'delay', delays: { gate: 0, wire: { w: 4 } } });
    expect(changesOf(trace, 'y').map((c) => [c.t, c.value])).toEqual([
      [14, 1],
      [20, 0],
    ]);
  });

  it('配線遅延（そのまま遅れて届く）：短いパルスも届く', () => {
    const trace = simulate(wired, shortPulse, {
      mode: 'delay',
      delays: { gate: 0, wire: { w: 10 } },
      wireModel: 'transport',
    });
    expect(changesOf(trace, 'y').map((c) => [c.t, c.value])).toEqual([
      [20, 1],
      [26, 0],
    ]);
  });

  it('理想モードでは配線遅延を無視する', () => {
    const trace = simulate(wired, shortPulse, { mode: 'ideal', delays: { wire: { w: 10 } } });
    expect(changesOf(trace, 'y').map((c) => c.t)).toEqual([10, 16]);
  });
});

describe('不正な回路', () => {
  it('未定義の信号を参照するとエラー', () => {
    const circuit: Circuit = { id: 'bad', inputs: [], components: [gate('y', 'NOT', 'nothing')] };
    expect(() => simulate(circuit, { changes: [], end: 10 })).toThrow(/未定義の信号/);
  });

  it('信号名が重複するとエラー', () => {
    const circuit: Circuit = { id: 'bad', inputs: ['y'], components: [gate('y', 'NOT', 'y')] };
    expect(() => simulate(circuit, { changes: [], end: 10 })).toThrow(/重複/);
  });

  it('遅延 0 で発振する回路はエラー', () => {
    const circuit: Circuit = { id: 'osc', inputs: [], components: [gate('y', 'NOT', 'y')] };
    expect(() => simulate(circuit, { changes: [], end: 10 })).toThrow(/発振/);
  });

  it('FFの入力がつながっていないとエラー', () => {
    const circuit: Circuit = { id: 'bad', inputs: ['cp'], components: [ff('JK', 'ff', 'q', { trigger: 'rising', clock: 'cp', j: 1 })] };
    expect(() => simulate(circuit, { changes: [], end: 10 })).toThrow(/接続されていません/);
  });
});
