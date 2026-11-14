/** 動作表：クロックの回数と値がずれていないこと、遅延ありでも理想でも同じ並びになること。 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { SCENES, sceneById, type Scene } from '../../src/problems/scenes';
import { operationTable, resetLevel, type OperationRow } from '../../src/view/chart';

const table = (id: string, mode: 'ideal' | 'delay'): OperationRow[] => {
  const s = sceneById(id) as Scene;
  const trace = simulate(s.circuit, s.stimulus, { mode, delays: s.delays, init: s.init });
  return operationTable(s.circuit, trace, s.stateBits, s.clock, s.edge);
};
const short = (rows: OperationRow[]): string[] =>
  rows.map((r) => `${r.kind === 'reset' ? 'R' : r.kind === 'transient' ? '!' : ''}${r.n}:${r.bits}`);

describe('16-5 非同期5進カウンタの動作表', () => {
  it.each(['ideal', 'delay'] as const)('%s：Cₚ=1 が 001、Cₚ=9 が 100。(101) の行の次に (000) が来る', (mode) => {
    const rows = table('16-5', mode);
    const settled = (n: number): string => rows.find((r) => r.kind === 'settled' && r.n === n)!.bits;
    expect(settled(1)).toBe('001');
    expect(settled(4)).toBe('100');
    expect(settled(9)).toBe('100');
    // 外部 CLR が働いている間の1回目のエッジは数えない。E13 と E14 の間の CLR パルスで数え直す。
    expect(short(rows)).toEqual([
      'R0:000', '1:001', '2:010', '3:011', '4:100', '!5:101', '5:000',
      '6:001', '7:010', '8:011', '9:100', '!10:101', '10:000', '11:001', '12:010',
      'R0:000', '1:001', '2:010',
    ]);
  });

  it('簡略版（Q₂ と Q₀ の AND）も同じ並び', () => {
    expect(short(table('16-5s', 'delay'))).toEqual(short(table('16-5', 'ideal')));
  });
});

describe('外部 CLR が働く値を、回路から求める', () => {
  it.each([
    ['16-5', 1], // OR(外部CLR, リセット信号) → 正論理
    ['16-ex3', 0], // AND(外部CLR, NAND) → 負論理
    ['16-4', 0],
    ['18-1', 1],
    ['19-sipo', 0],
    ['20-johnson', 0],
  ] as const)('%s は %i で働く', (id, level) => {
    expect(resetLevel(sceneById(id)!.circuit)).toBe(level);
  });

  it('CLR 入力のない回路は undefined', () => {
    expect(resetLevel(sceneById('17-1')!.circuit)).toBeUndefined();
  });
});

describe('カウンタの動作表は、クロックの回数と値がずれない', () => {
  // [場面, 何進, 向き, 一瞬だけ現れる値（その値と、落ち着いた後の値）]
  // 17-3（改良型）は、4回目のクロックで Q₂ が 1 になり、その Q₂ で FF₁ がリセットされるので、
  // (110) が一瞬現れてから (100) に落ち着く。
  const cases: [string, number, 'up' | 'down', [glitch: string, settles: number] | undefined][] = [
    ['16-p5', 8, 'up', undefined],
    ['16-3a', 8, 'down', undefined],
    ['16-3b', 8, 'down', undefined],
    ['16-4', 8, 'up', undefined],
    ['16-5', 5, 'up', ['101', 0]],
    ['16-5s', 5, 'up', ['101', 0]],
    ['16-ex2a', 16, 'down', undefined],
    ['16-ex2b', 16, 'up', undefined],
    ['16-ex3', 7, 'up', ['111', 0]],
    ['17-1', 5, 'up', ['101', 0]],
    ['17-3', 5, 'up', ['110', 4]],
    ['17-ex1', 16, 'up', undefined],
    ['18-1', 4, 'up', undefined],
    ['18-p3', 8, 'up', undefined],
    ['18-p4', 16, 'up', undefined],
    ['18-d3', 3, 'up', undefined],
    ['18-rs3', 3, 'up', undefined],
    ['18-ex2', 5, 'up', undefined],
  ];

  describe.each(cases)('%s（%i進 %s）', (id, modulus, direction, glitch) => {
    it.each(['ideal', 'delay'] as const)('%s：Cₚ=n の行の値は、n を何進かで割った余り（ダウンは逆順）', (mode) => {
      const rows = table(id, mode);
      const counted = rows.filter((r) => r.kind !== 'transient');
      expect(counted.length).toBeGreaterThan(modulus);
      for (const row of counted) {
        const want = direction === 'up' ? row.n % modulus : (modulus - (row.n % modulus)) % modulus;
        expect(parseInt(row.bits, 2), `Cₚ=${row.n}`).toBe(want);
      }
      // 一瞬だけ現れる値は、決まった行の直前にだけ出て、次の行が落ち着いた後の値になる。
      const transients = rows.filter((r) => r.kind === 'transient');
      if (glitch === undefined) expect(transients).toEqual([]);
      else {
        expect(transients.length).toBeGreaterThan(0);
        for (const row of transients) {
          expect(row.bits).toBe(glitch[0]);
          expect(row.n % modulus).toBe(glitch[1]);
          const after = rows[rows.indexOf(row) + 1]!;
          expect([after.kind, after.n, parseInt(after.bits, 2)]).toEqual(['settled', row.n, glitch[1]]);
        }
      }
    });
  });
});

describe('全場面：遅延ありでも理想でも、動作表は同じ並びになる', () => {
  // 17-2 は、配線遅延で誤動作する様子を見る場面なので除く（遅延ありでは意図的に違う動きになる）。
  it.each(SCENES.filter((s) => s.id !== '17-2').map((s) => s.id))('%s', (id) => {
    expect(short(table(id, 'delay'))).toEqual(short(table(id, 'ideal')));
  });

  it('17-2：遅延あり（配線遅延 20ns）では (101) の次が (001) になり、理想では (000) に戻る', () => {
    expect(short(table('17-2', 'delay')).slice(4, 8)).toEqual(['4:100', '!5:101', '5:001', '6:010']);
    expect(short(table('17-2', 'ideal')).slice(4, 8)).toEqual(['4:100', '!5:101', '5:000', '6:001']);
  });
});

describe('レジスタ類：途中の CLR パルスで数え直す', () => {
  it('18-1：CLR が働いている間のエッジ（1回目と18回目）は数えない', () => {
    const rows = table('18-1', 'ideal');
    expect(short(rows).slice(0, 5)).toEqual(['R0:00', '1:01', '2:10', '3:11', '4:00']);
    expect(short(rows).slice(-2)).toEqual(['16:00', 'R0:00']);
  });
});
