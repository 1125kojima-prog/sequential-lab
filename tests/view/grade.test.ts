import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { sceneById, type Scene } from '../../src/problems/scenes';
import { allCorrect, busCells, counterKind, grade, signalCells } from '../../src/view/grade';

const run = (id: string) => {
  const s = sceneById(id) as Scene;
  return { s, trace: simulate(s.circuit, s.stimulus, { mode: 'ideal', init: s.init }) };
};

describe('マスごとの正解', () => {
  it('16-4：Q₀ は立下りごとに反転する（半周期のマスで 0,0,1,1,0,0,…）', () => {
    const { trace } = run('16-4');
    const cells = signalCells(trace, 'q0', 50);
    expect(cells).toHaveLength(trace.end / 50);
    expect(cells.slice(0, 8).map((c) => c.value)).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(cells.every((c) => !c.given)).toBe(true);
  });

  it('16-5：(101) の一瞬のパルスはマスに現れない（落ち着いた後の値）', () => {
    const { trace } = run('16-5');
    const cells = signalCells(trace, 'q0', 50);
    // t=600 のマス：Q₀ は一瞬 1 になってすぐ 0。
    expect(cells[12]).toEqual({ t0: 600, t1: 650, value: 0, given: false });
  });

  it('マスの途中で変わるところ（CLR や PR による変化）は、採点しない', () => {
    const { trace } = run('19-ex2');
    const cells = signalCells(trace, 'q0', 50);
    // (001) のプリセットは t=531、(111) のプリセットは t=723。どちらもマスの途中で Q₀ が変わる。
    expect(cells.filter((c) => c.given).map((c) => c.t0)).toEqual([500, 700]);
  });

  it('バス：19-演1 の Q は、エッジごとに X0,X2,X3,X3,X4 と進む', () => {
    const { s, trace } = run('19-ex1');
    const cells = busCells(trace, s.stateBits, 50);
    // 立下り k は t=100k。マス [100k, 100k+50) の値を見る。
    expect([0, 2, 4, 6, 8].map((i) => cells[i]!.value)).toEqual(['0', '2', '3', '3', '4']);
  });
});

describe('採点', () => {
  it('空欄・正解・不正解・採点しない欄を区別する', () => {
    const expected = [
      { value: 1, given: false },
      { value: 0, given: false },
      { value: 1, given: false },
      { value: 0, given: true },
    ];
    const marks = grade(expected, [1, 1, undefined, undefined]);
    expect(marks).toEqual(['correct', 'wrong', 'blank', 'given']);
    expect(allCorrect(marks)).toBe(false);
    expect(allCorrect(grade(expected, [1, 0, 1, undefined]))).toBe(true);
  });
});

describe('カウンタの種類', () => {
  const kind = (id: string) => {
    const { s, trace } = run(id);
    return counterKind(s.circuit, trace, s.stateBits, s.clock, s.edge);
  };

  it.each([
    ['16-4', { sync: false, modulus: 8, direction: 'up' }],
    ['16-3a', { sync: false, modulus: 8, direction: 'down' }],
    ['17-1', { sync: false, modulus: 5, direction: 'up' }],
    ['16-ex3', { sync: false, modulus: 7, direction: 'up' }],
    ['18-p3', { sync: true, modulus: 8, direction: 'up' }],
    ['18-p4', { sync: true, modulus: 16, direction: 'up' }],
    ['18-d3', { sync: true, modulus: 3, direction: 'up' }],
    ['18-ex2', { sync: true, modulus: 5, direction: 'up' }],
    ['20-johnson', { sync: true, modulus: 8, direction: 'other' }],
    ['20-ring', { sync: true, modulus: 4, direction: 'other' }],
  ] as const)('%s', (id, expected) => {
    expect(kind(id)).toEqual(expected);
  });

  it('動かない回路（リングカウンタ、初期値 0000）は何進とも言えない', () => {
    expect(kind('20-ring0').modulus).toBeUndefined();
  });
});
