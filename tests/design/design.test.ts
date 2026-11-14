/**
 * 設計ガイド（フェーズ5の完了条件）：授業の答えと一致すること。
 * スライドの論理式は docs/problems.md から手で書き起こしたもの。ここを書き換えてテストを通してはいけない。
 * 最小形が1通りでない式があるので、文字列ではなく「真理値表と合う」「最小積和形と同じ大きさ」で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { judge, termsText } from '../../src/design/expr';
import { counterSpec, encode, required, targets, type Encoded, type FFKind, type Target } from '../../src/design/fsm';
import { generateCircuit, generateScene, type Solution } from '../../src/design/generate';
import { cost, covers, groupTerm, kmapLayout, minimize } from '../../src/design/minimize';
import { MOORE3, STOPWATCH, VENDING } from '../../src/design/presets';
import { edgeTimes, statesAfterEdges } from '../../src/engine/sample';
import { simulate } from '../../src/engine/simulate';
import { clock } from '../../src/engine/stimulus';
import { c18_p3, c21_vending } from '../../src/problems/circuits';
import { SLIDE_21 } from '../fixtures/scenarios';

function design(enc: Encoded, kind: FFKind): { list: Target[]; solutions: Solution[]; text: Record<string, string> } {
  const list = targets(enc, kind);
  const solutions = list.map((target) => ({ target, terms: minimize(target.table, enc.vars.length) }));
  const text = Object.fromEntries(solutions.map((s) => [s.target.name, termsText(s.terms, enc.vars)]));
  return { list, solutions, text };
}

/** スライドの式が、真理値表（X を除く全行）と合い、最小積和形と同じ大きさであること。 */
function expectSlide(enc: Encoded, kind: FFKind, slide: Record<string, string | string[]>): void {
  const { list, solutions } = design(enc, kind);
  expect(list.map((t) => t.name).sort()).toEqual(Object.keys(slide).sort());
  for (const { target, terms } of solutions) {
    // エンジン側の答え（最小積和形）も、真理値表の全行と照合する。
    target.table.forEach((want, row) => {
      if (want !== null) expect(terms.some((t) => covers(t, row)) ? 1 : 0, `${target.name} の行 ${row}`).toBe(want);
    });
    for (const expr of [slide[target.name]!].flat()) {
      expect(judge(expr, enc.vars, target.table), `${target.name} = ${expr}`).toEqual({ status: 'minimal' });
    }
  }
}

describe('入力要求（Q → Q⁺ にするための FF の入力）', () => {
  it('JK-FF', () => {
    expect(required('JK', 0, 0)).toEqual([0, null]);
    expect(required('JK', 0, 1)).toEqual([1, null]);
    expect(required('JK', 1, 0)).toEqual([null, 1]);
    expect(required('JK', 1, 1)).toEqual([null, 0]);
  });
  it('RS-FF（0→0 は S=0, R=X）', () => {
    expect(required('RS', 0, 0)).toEqual([0, null]);
    expect(required('RS', 0, 1)).toEqual([1, 0]);
    expect(required('RS', 1, 0)).toEqual([0, 1]);
    expect(required('RS', 1, 1)).toEqual([null, 0]);
  });
  it('D-FF と T-FF、次の状態が X なら入力も X', () => {
    expect(required('D', 1, 0)).toEqual([0]);
    expect(required('T', 1, 0)).toEqual([1]);
    expect(required('T', 1, 1)).toEqual([0]);
    expect(required('JK', 1, null)).toEqual([null, null]);
  });
});

describe('拡大入力要求表（18 p.11 の RS-FF の表）', () => {
  it('同期3進 RS-FF：S₁R₁S₀R₀ の列がスライドと一致する', () => {
    const list = targets(encode(counterSpec(3, 'up')), 'RS');
    const column = (name: string) => list.find((t) => t.name === name)!.table.map((v) => (v === null ? 'X' : String(v))).join('');
    // 行は (Q₁Q₀)=00,01,10,11。
    expect(column('s1')).toBe('010X');
    expect(column('r1')).toBe('X01X');
    expect(column('s0')).toBe('100X');
    expect(column('r0')).toBe('01XX');
  });
});

describe('カウンタの設計が授業の答えと一致する', () => {
  it('同期3進 D-FF：D₁=Q₀、D₀=Q̄₁Q̄₀', () => {
    const enc = encode(counterSpec(3, 'up'));
    expectSlide(enc, 'D', { d1: 'Q0', d0: "Q1'Q0'" });
    expect(design(enc, 'D').text).toEqual({ d1: 'Q0', d0: "Q1'Q0'" });
  });

  it('同期3進 RS-FF：S₁=Q₀、R₁=Q̄₀（R₁=Q₁ でもよい）、S₀=Q̄₁Q̄₀、R₀=Q₀', () => {
    expectSlide(encode(counterSpec(3, 'up')), 'RS', { s1: 'Q0', r1: ["Q0'", 'Q1'], s0: "Q1'Q0'", r0: 'Q0' });
  });

  it('同期5進 JK-FF：J₂=Q₁Q₀、K₂=1、J₁=K₁=Q₀、J₀=Q̄₂、K₀=1', () => {
    const enc = encode(counterSpec(5, 'up'));
    expectSlide(enc, 'JK', { j2: 'Q1Q0', k2: '1', j1: 'Q0', k1: 'Q0', j0: "Q2'", k0: '1' });
    expect(design(enc, 'JK').text).toEqual({ j2: 'Q1Q0', k2: '1', j1: 'Q0', k1: 'Q0', j0: "Q2'", k0: '1' });
  });

  it('同期8進 JK-FF：J₂=K₂=Q₁Q₀、J₁=K₁=Q₀、J₀=K₀=1。練習3の回路と同じ動きをする', () => {
    const enc = encode(counterSpec(8, 'up'));
    expectSlide(enc, 'JK', { j2: 'Q1Q0', k2: 'Q1Q0', j1: 'Q0', k1: 'Q0', j0: '1', k0: '1' });
    const { circuit } = generateCircuit(enc, 'JK', design(enc, 'JK').solutions);
    const stim = clock({ signal: 'cp', edge: 'falling', period: 100, edges: 17 });
    const bits = ['q2', 'q1', 'q0'];
    const states = (c: typeof circuit) => {
      const trace = simulate(c, stim);
      return statesAfterEdges(trace, bits, edgeTimes(trace, 'cp', 'falling'));
    };
    expect(states(circuit)).toEqual(states(c18_p3));
  });

  it.each([
    [3, 'D'], [5, 'JK'], [6, 'T'], [7, 'RS'], [10, 'JK'], [12, 'D'], [16, 'T'],
  ] as const)('同期%i進（%s-FF）：作った回路は N 回のクロックで元の状態に戻り、0〜N−1 を順に数える', (modulus, kind) => {
    const enc = encode(counterSpec(modulus, 'up'));
    const scene = generateScene(enc, kind, design(enc, kind).solutions, []);
    const trace = simulate(scene.circuit, scene.stimulus);
    const states = statesAfterEdges(trace, scene.stateBits, edgeTimes(trace, 'cp', 'falling')).map((s) => parseInt(s, 2));
    expect(states.slice(0, 2 * modulus)).toEqual(Array.from({ length: 2 * modulus }, (_, k) => (k + 1) % modulus));
  });

  it('ダウンカウンタ（同期5進 JK-FF）は 4,3,2,1,0 と数える', () => {
    const enc = encode(counterSpec(5, 'down'));
    const scene = generateScene(enc, 'JK', design(enc, 'JK').solutions, []);
    const trace = simulate(scene.circuit, scene.stimulus);
    const states = statesAfterEdges(trace, scene.stateBits, edgeTimes(trace, 'cp', 'falling')).map((s) => parseInt(s, 2));
    expect(states.slice(0, 6)).toEqual([4, 3, 2, 1, 0, 4]);
  });
});

describe('自動販売機（第21回）', () => {
  const enc = encode(VENDING.spec);

  it('論理式がスライド（練習4、別解を含む）と一致する', () => {
    expectSlide(enc, 'D', {
      d1: ["Q1'X1 + Q1'Q0X0 + Q1Q0'X1' + Q1X1'X0'", "Q1'X1 + Q1'Q0X0 + Q1Q0'X0 + Q1X1'X0'"],
      d0: ["Q0'X0 + Q0X1'X0' + Q1'Q0X0'", "Q0'X0 + Q0X1'X0' + Q1'Q0X1"],
      y1: 'Q1Q0X1',
      y0: "Q1Q0X0 + Q1Q0'X1",
    });
  });

  it('作った回路は、スライドの入力波形（練習6）で授業の回路と同じ動きをする', () => {
    const { circuit } = generateCircuit(enc, 'D', design(enc, 'D').solutions);
    const mine = simulate(circuit, SLIDE_21.stimulus);
    const slide = simulate(c21_vending, SLIDE_21.stimulus);
    const edges = edgeTimes(slide, 'cp', 'rising');
    for (const bits of [['q1', 'q0'], ['x1', 'x0'], ['y1', 'y0']]) {
      expect(statesAfterEdges(mine, bits, edges), bits.join()).toEqual(statesAfterEdges(slide, bits, edges));
    }
  });
});

describe('3進カウンタのムーア型（第22回 練習7）', () => {
  const enc = encode(MOORE3.spec);

  it('論理式がスライドと一致する。出力は Z₁=Q₁、Z₀=Q₀', () => {
    expectSlide(enc, 'D', { d1: "Q1X' + Q0X", d0: "Q0X' + Q1'Q0'X", z1: 'Q1', z0: 'Q0' });
  });

  it('別解 Q̄₁(Q₀⊕X) も真理値表と合う（積和形ではないので、最小かどうかは判定しない）', () => {
    const d0 = targets(enc, 'D').find((t) => t.name === 'd0')!;
    expect(judge("Q1'(Q0 ^ X)", enc.vars, d0.table).status).toBe('correct');
  });

  it('作った回路は X=1 のたびに 00→01→10→00 と進む', () => {
    const scene = generateScene(enc, 'D', design(enc, 'D').solutions, [1, 1, 1, 0, 1]);
    const trace = simulate(scene.circuit, scene.stimulus);
    const states = statesAfterEdges(trace, ['q1', 'q0'], edgeTimes(trace, 'cp', 'rising'));
    // k 番目の入力は立上り 2k+3 でラッチされ、次の立上り 2k+4 で状態が変わる。
    expect([4, 6, 8, 10, 12].map((e) => states[e - 1])).toEqual(['01', '10', '00', '00', '01']);
  });
});

describe('ストップウォッチ（第22回 演習1）', () => {
  const enc = encode(STOPWATCH.spec);

  it('論理式がスライドと一致する', () => {
    expectSlide(enc, 'D', {
      d1: "Q1A'B' + Q0AB' + Q1AB",
      d0: "Q0A' + Q0B + Q0'AB'",
      y1: "Q1A'B + Q0AB'",
      y0: "Q1A'B + Q0'AB'",
    });
  });

  it('作った回路は仕様どおりに動く：A→開始、A→停止、B→リセット、A→開始、同時押し→無効', () => {
    const scene = generateScene(enc, 'D', design(enc, 'D').solutions, [2, 2, 1, 2, 3]);
    const trace = simulate(scene.circuit, scene.stimulus);
    const edges = edgeTimes(trace, 'cp', 'rising');
    const states = statesAfterEdges(trace, ['q1', 'q0'], edges);
    const outputs = statesAfterEdges(trace, ['y1', 'y0'], edges);
    // 入力をラッチした周期（立上り 2k+3 の後）に命令が出て、次の立上りで状態が変わる。
    expect([3, 5, 7, 9, 11].map((e) => outputs[e - 1])).toEqual(['01', '10', '11', '01', '00']);
    expect([4, 6, 8, 10, 12].map((e) => states[e - 1])).toEqual(['01', '10', '00', '01', '01']);
  });
});

describe('論理式の判定', () => {
  const enc = encode(counterSpec(5, 'up'));
  const j2 = targets(enc, 'JK').find((t) => t.name === 'j2')!;

  it('いろいろな書き方を読める', () => {
    for (const expr of ['Q1Q0', 'q1 q0', 'Q1*Q0', 'Q1・Q0', "(Q1')'Q0", '~(~Q1 + ~Q0)']) {
      expect(judge(expr, enc.vars, j2.table).status, expr).not.toBe('wrong');
      expect(judge(expr, enc.vars, j2.table).status, expr).not.toBe('error');
    }
  });

  it('まちがいは、合わない行を示す', () => {
    expect(judge('Q1', enc.vars, j2.table)).toEqual({ status: 'wrong', row: 2, expected: 0 });
  });

  it('正しいが最小でない式', () => {
    const result = judge("Q2'Q1Q0", enc.vars, j2.table);
    expect(result.status).toBe('correct');
  });

  it('読めない式はエラーにする', () => {
    expect(judge('Q1 +', enc.vars, j2.table).status).toBe('error');
    expect(judge('Q9', enc.vars, j2.table).status).toBe('error');
    expect(judge('', enc.vars, j2.table).status).toBe('error');
  });
});

describe('カルノー図', () => {
  it('行と列はグレイコード順（00, 01, 11, 10）。4変数は列が前半の2変数、行が後半の2変数', () => {
    const layout = kmapLayout(4);
    expect(layout.cols).toEqual([0, 1, 3, 2]);
    expect(layout.rows).toEqual([0, 1, 3, 2]);
    // 列 Q₁Q₀=11、行 X₁X₀=01 → 行番号 0b1101
    expect(layout.index(1, 2)).toBe(0b1101);
    expect(kmapLayout(3).cols).toEqual([0, 1, 3, 2]);
    expect(kmapLayout(3).rows).toEqual([0, 1]);
    expect(kmapLayout(2).cols).toEqual([0, 1]);
  });

  it('グループの判定：2のべき乗個で、1つの積項になるマスだけを認める', () => {
    // 3変数 (Q₂Q₁Q₀)。011 と 111 → Q₁Q₀
    expect(groupTerm([0b011, 0b111], 3)).toEqual({ mask: 0b011, value: 0b011 });
    // 端をまたぐグループ：000 と 100 → Q̄₁Q̄₀
    expect(groupTerm([0b000, 0b100], 3)).toEqual({ mask: 0b011, value: 0 });
    expect(groupTerm([0b000, 0b011], 3)).toBeUndefined(); // 斜め
    expect(groupTerm([0b000, 0b001, 0b011], 3)).toBeUndefined(); // 3個
    expect(groupTerm([0, 1, 2, 3, 4, 5, 6, 7], 3)).toEqual({ mask: 0, value: 0 }); // 全部 → 1
  });

  it('最小積和形の大きさ：同期5進の K₂ は 1（積項 1 個・リテラル 0 個）', () => {
    const k2 = targets(encode(counterSpec(5, 'up')), 'JK').find((t) => t.name === 'k2')!;
    expect(cost(minimize(k2.table, 3))).toEqual({ terms: 1, literals: 0 });
  });
});
