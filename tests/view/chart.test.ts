import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { sceneById, type Scene } from '../../src/problems/scenes';
import { busSegments, hexLabel, operationTable, timeTicks, wave } from '../../src/view/chart';

const run = (id: string, mode: 'ideal' | 'delay') => {
  const s = sceneById(id) as Scene;
  return { s, trace: simulate(s.circuit, s.stimulus, { mode, delays: s.delays, init: s.init }) };
};

describe('波形', () => {
  it('16-5 理想モード：(101) の瞬間、Q₀ は幅 0 のパルスになる', () => {
    const { trace } = run('16-5', 'ideal');
    const points = wave(trace, 'q0').points.filter((p) => p.t === 600);
    expect(points).toEqual([
      { t: 600, value: 1 },
      { t: 600, value: 0 },
    ]);
  });

  it('16-5 遅延モード：Q₀ のパルスに幅がある（608〜626ns）', () => {
    const { trace } = run('16-5', 'delay');
    const points = wave(trace, 'q0').points.filter((p) => p.t >= 600 && p.t < 700);
    expect(points).toEqual([
      { t: 608, value: 1 },
      { t: 626, value: 0 },
    ]);
  });

  it('until より後の変化は含めない', () => {
    const { trace } = run('16-4', 'ideal');
    const w = wave(trace, 'q0', 250);
    expect(w.points.map((p) => p.t)).toEqual([100, 200]);
    expect(w.until).toBe(250);
  });
});

describe('バス表示', () => {
  it('16進の表記', () => {
    expect(hexLabel('1010')).toBe('XA');
    expect(hexLabel('011')).toBe('X3');
    expect(hexLabel('00')).toBe('X0');
  });

  it('19 p.6：4ビットパラレルレジスタの Q は X0,X3,X1,XA,X6,X1,X0,X1,XF,X5', () => {
    const { s, trace } = run('19-reg4', 'ideal');
    expect(busSegments(trace, s.stateBits).map((seg) => seg.hex)).toEqual([
      'X0', 'X3', 'X1', 'XA', 'X6', 'X1', 'X0', 'X1', 'XF', 'X5',
    ]);
    const a = busSegments(trace, ['a3', 'a2', 'a1', 'a0']).map((seg) => seg.hex);
    expect(a).toEqual(['X3', 'X1', 'XA', 'X6', 'X1', 'XF', 'X5']);
  });

  it('19-演1：3ビットパラレルレジスタの Q は X0,X2,X3,X4,X0,X6,X7,X0', () => {
    const { s, trace } = run('19-ex1', 'ideal');
    expect(busSegments(trace, s.stateBits).map((seg) => seg.hex)).toEqual([
      'X0', 'X2', 'X3', 'X4', 'X0', 'X6', 'X7', 'X0',
    ]);
  });

  it('区間はつながっていて、最後は終了時刻まで', () => {
    const { s, trace } = run('19-reg4', 'ideal');
    const segs = busSegments(trace, s.stateBits);
    segs.slice(1).forEach((seg, i) => expect(seg.t0).toBe(segs[i]!.t1));
    expect(segs.at(-1)!.t1).toBe(trace.end);
  });
});

describe('動作表', () => {
  it('17-1：0回目は (000)、5回のクロックで (000) に戻る', () => {
    const { s, trace } = run('17-1', 'ideal');
    const rows = operationTable(s.circuit, trace, s.stateBits, s.clock, s.edge).filter((r) => r.kind !== 'transient');
    expect(rows.slice(0, 7).map((r) => r.bits)).toEqual(['000', '001', '010', '011', '100', '000', '001']);
    expect(rows.map((r) => r.n)).toEqual(rows.map((_, i) => i));
  });

  it('17-2：遅延モードの初期設定（配線遅延 20ns）では (000) に戻らない', () => {
    const { s, trace } = run('17-2', 'delay');
    const rows = operationTable(s.circuit, trace, s.stateBits, s.clock, s.edge).filter((r) => r.kind !== 'transient');
    expect(rows.slice(4, 8).map((r) => r.bits)).toEqual(['100', '001', '010', '011']);
  });
});

describe('時間軸の目盛り', () => {
  it('拡大すると細かくなる', () => {
    expect(timeTicks(300, 0.5)).toEqual([0, 200]);
    expect(timeTicks(300, 1)).toEqual([0, 100, 200, 300]);
    expect(timeTicks(30, 8)).toEqual([0, 10, 20, 30]);
  });
});
