/** 問題の答え（計算で求めたもの）が、スライドの答えと一致することを確認する。 */
import { describe, expect, it } from 'vitest';
import { signalNames, simulate } from '../../src/engine/simulate';
import { PROBLEMS, problemById, type QuizProblem } from '../../src/problems/problems';
import { sceneById } from '../../src/problems/scenes';
import { operationTable } from '../../src/view/chart';

/** スライドの答え（docs/problems.md から手で書き起こしたもの）。選択問題は選択肢の文字。 */
const SLIDE_ANSWERS: Record<string, (number | string)[]> = {
  '16-ex1': [6],
  '16-ex2': ['非同期式', '16進', 'ダウンカウンタ', '非同期式', '16進', 'アップカウンタ'],
  '17-ex1': [16, 4],
  '17-ex2': [25, 130],
  '20-p6q': ['同期式', '8進', '2n 進'],
  '20-ex2': [4, 10, 5],
};

describe('選択・数値問題の答え', () => {
  it.each(Object.entries(SLIDE_ANSWERS))('%s はスライドの答えと一致する', (id, expected) => {
    const problem = problemById(id) as QuizProblem;
    expect(problem.kind).toBe('quiz');
    const got = problem.questions.map((q) =>
      q.kind === 'choice' ? q.options[q.answer()] : Math.round(q.answer() * 1000) / 1000,
    );
    expect(got).toEqual(expected);
  });

  it('スライドの答えを書き起こしていない選択・数値問題はない', () => {
    const quiz = PROBLEMS.filter((p) => p.kind === 'quiz').map((p) => p.id);
    expect(quiz.sort()).toEqual(Object.keys(SLIDE_ANSWERS).sort());
  });
});

describe('動作表の問題', () => {
  const table = (sceneId: string): string[] => {
    const scene = sceneById(sceneId)!;
    const trace = simulate(scene.circuit, scene.stimulus, { mode: 'ideal', init: scene.init });
    return operationTable(scene.circuit, trace, scene.stateBits, scene.clock, scene.edge)
      .filter((r) => r.kind !== 'transient')
      .map((r) => r.bits);
  };

  it('16-2：7進アップカウンタの動作表（P=0〜7）がスライドと一致する', () => {
    expect(table('16-ex3').slice(0, 8)).toEqual(['000', '001', '010', '011', '100', '101', '110', '000']);
  });

  it('20-練6：ジョンソンカウンタの動作表（Cₚ=0〜8）がスライドと一致する', () => {
    expect(table('20-johnson').slice(0, 9)).toEqual([
      '0000', '1000', '1100', '1110', '1111', '0111', '0011', '0001', '0000',
    ]);
  });
});

describe('問題の定義', () => {
  it('id が重複していない', () => {
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
  });

  it.each(PROBLEMS.map((p) => ({ id: p.id, p })))('$id：場面・信号・選択肢がそろっている', ({ p }) => {
    if (p.kind === 'timing' || p.kind === 'table') {
      const scene = sceneById(p.sceneId);
      expect(scene, p.sceneId).toBeDefined();
      if (p.kind === 'timing') {
        const names = new Set(signalNames(scene!.circuit));
        for (const s of p.blanks) {
          expect(names.has(s), s).toBe(true);
          expect(scene!.rows.includes(s), `${s} がチャートの行にない`).toBe(true);
          expect(scene!.circuit.inputs.includes(s), `${s} は入力`).toBe(false);
        }
        for (const bus of p.busBlanks ?? []) expect(scene!.circuit.buses?.[bus], bus).toBeDefined();
        expect(p.blanks.length + (p.busBlanks?.length ?? 0)).toBeGreaterThan(0);
      }
    } else if (p.kind === 'quiz') {
      for (const id of p.sceneIds ?? []) expect(sceneById(id), id).toBeDefined();
      for (const q of p.questions) {
        const a = q.answer();
        expect(Number.isFinite(a)).toBe(true);
        if (q.kind === 'choice') {
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(q.options.length);
        }
      }
    } else {
      expect(p.answer.length).toBeGreaterThan(0);
    }
  });
});
