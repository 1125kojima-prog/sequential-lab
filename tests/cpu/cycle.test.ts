/** 命令実行サイクル：計算した各コマの値が、スライド 22 p.13〜24 の図と一致すること。 */
import { describe, expect, it } from 'vitest';
import { parseInstr, runProgram, SLIDE_PROGRAM, type Frame } from '../../src/cpu/cycle';

const frames = runProgram();
/** そのスライドに対応するコマのうち最後のもの（スライドはそのページの処理が終わった後の図）。 */
const atSlide = (page: number): Frame => {
  const list = frames.filter((f) => f.slide === page);
  if (list.length === 0) throw new Error(`p.${page} のコマがない`);
  return list[list.length - 1]!;
};

describe('命令の読み取り', () => {
  it('add / sub / sw', () => {
    expect(parseInstr('add GR0, 1820, 1821')).toMatchObject({ op: 'add', dst: 'GR0', a: { kind: 'mem', addr: 1820 }, b: { kind: 'mem', addr: 1821 } });
    expect(parseInstr('sub GR1, GR0, 1822')).toMatchObject({ op: 'sub', dst: 'GR1', a: { kind: 'reg', reg: 'GR0' }, b: { kind: 'mem', addr: 1822 } });
    expect(parseInstr('sw GR1, 1000(823)')).toMatchObject({ op: 'sw', src: 'GR1', offset: 1000, base: { kind: 'imm', value: 823 } });
    expect(parseInstr('sw GR1, 1000(GR2)')).toMatchObject({ base: { kind: 'reg', reg: 'GR2' } });
  });
  it('読めない命令はエラー', () => {
    expect(() => parseInstr('mul GR0, 1, 2')).toThrow();
    expect(() => parseInstr('add 1820, GR0, GR1')).toThrow();
    expect(() => parseInstr('sw GR1, 1000')).toThrow();
  });
});

describe('スライド p.13〜24 との一致', () => {
  it('3命令 × 5つの処理（フェッチは PC 更新を含めて2コマ）＋実行前', () => {
    expect(frames).toHaveLength(1 + 3 * 6);
    const order = frames.slice(1, 7).map((f) => f.stage);
    expect(order).toEqual(['fetch', 'fetch', 'decode', 'address', 'operand', 'execute']);
  });

  it('p.13 実行前：PC=1000、レジスタは空', () => {
    const f = atSlide(13);
    expect(f.machine).toMatchObject({ pc: 1000, ir: null, ar0: null, ar1: null, gr: { GR0: null, GR1: null, GR2: null } });
  });

  it('p.14〜17 add GR0, 1820, 1821', () => {
    expect(atSlide(14).machine).toMatchObject({ pc: 1000, ir: 'add GR0, 1820, 1821' });
    expect(atSlide(15).machine.pc).toBe(1001);
    const p16 = atSlide(16);
    expect(p16.decoded).toEqual({ opcode: 'add', operands: 'GR0, 1820, 1821', addressed: true });
    expect(p16.machine).toMatchObject({ ar0: 38, ar1: 26 });
    expect(p16.arrows).toEqual(
      expect.arrayContaining([
        { from: 'dec', to: 'm1820', kind: 'addr' },
        { from: 'm1820', to: 'ar0', kind: 'data' },
        { from: 'm1821', to: 'ar1', kind: 'data' },
      ]),
    );
    expect(atSlide(17).machine.gr.GR0).toBe(64);
  });

  it('p.18〜21 sub GR1, GR0, 1822', () => {
    expect(atSlide(18).machine).toMatchObject({ pc: 1001, ir: 'sub GR1, GR0, 1822' });
    expect(atSlide(19).machine.pc).toBe(1002);
    const p20 = atSlide(20);
    expect(p20.machine).toMatchObject({ ar0: 64, ar1: 19 });
    expect(p20.arrows).toEqual(expect.arrayContaining([{ from: 'gr0', to: 'ar0', kind: 'data' }, { from: 'm1822', to: 'ar1', kind: 'data' }]));
    expect(atSlide(21).machine.gr).toEqual({ GR0: 64, GR1: 45, GR2: null });
  });

  it('p.22〜24 sw GR1, 1000(823)：GR1 のデータを 1000+823 にストア', () => {
    expect(atSlide(22).machine).toMatchObject({ pc: 1002, ir: 'sw GR1, 1000(823)' });
    expect(atSlide(23).machine.pc).toBe(1003);
    const p24 = atSlide(24);
    expect(p24.decoded).toEqual({ opcode: 'sw', operands: 'GR1, 1823', addressed: true });
    expect(p24.machine).toMatchObject({ pc: 1003, ar0: 64, ar1: 19, gr: { GR0: 64, GR1: 45, GR2: null } });
    expect(p24.machine.mem[1823]).toBe(45);
    expect(p24.arrows).toEqual(expect.arrayContaining([{ from: 'gr1', to: 'm1823', kind: 'data' }]));
  });

  it('1003 番地は命令でないので止まる。元のプログラムは書き換えない', () => {
    expect(frames[frames.length - 1]!.machine.pc).toBe(1003);
    expect(SLIDE_PROGRAM.memory[1823]).toBeUndefined();
  });

  it('値が変わった部品だけを changed に挙げる', () => {
    for (let i = 1; i < frames.length; i++) {
      const before = frames[i - 1]!.machine;
      const after = frames[i]!.machine;
      for (const part of frames[i]!.changed) {
        if (part === 'dec') continue;
        const get = (m: typeof before): unknown =>
          part.startsWith('m') ? m.mem[Number(part.slice(1))] : part.startsWith('gr') ? m.gr[part.toUpperCase() as 'GR0'] : m[part as 'pc' | 'ir' | 'ar0' | 'ar1'];
        expect(get(after), `${i} ${part}`).not.toEqual(get(before));
      }
    }
  });
});

describe('ほかのプログラム', () => {
  it('sw のベースがレジスタなら、その値を足す', () => {
    const f = runProgram({ start: 0, memory: { 0: 'add GR2, 10, 11', 1: 'sw GR2, 100(GR2)', 10: 3, 11: 4 } });
    expect(f[f.length - 1]!.machine.mem[107]).toBe(7);
  });
  it('空の番地を読むとエラー', () => {
    expect(() => runProgram({ start: 0, memory: { 0: 'add GR0, 5, 6' } })).toThrow(/5 番地/);
  });
});
