import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { SCENES, sceneById, type Scene } from '../../src/problems/scenes';
import { buildSteps } from '../../src/view/steps';

const run = (id: string, mode: 'ideal' | 'delay') => {
  const s = sceneById(id) as Scene;
  const trace = simulate(s.circuit, s.stimulus, { mode, delays: s.delays, init: s.init });
  return { s, trace, steps: buildSteps(s, trace) };
};

describe('ステップ実行：16-5（フェーズ2の完了条件）', () => {
  it('理想モード：6回目の立下りで (101) になり、リセットがかかって (000) に戻る', () => {
    const { steps } = run('16-5', 'ideal');
    const step = steps.find((st) => st.edgeNo === 6)!;
    expect(step.t).toBe(600);
    expect(step.title).toBe('Cₚ の6回目の立下り');
    expect(step.path).toEqual(['100', '101', '000']);
    expect(step.timeline).toBe(
      'Cₚ立下り → Q₀=1 → リセット信号=1 → 全FFのCLR=1 → Q₀リセット → Q₂リセット → リセット信号=0 → 全FFのCLR=0',
    );
    const texts = step.events.map((e) => e.text);
    expect(texts[1]).toBe('FF₀：Cₚ の立下りで CK が入った。D₀（=Q̄₀）=1（エッジ直前の値）を取り込み Q₀=1');
    expect(texts[2]).toBe('(Q₂Q₁Q₀)=(101) のとき、Q₀=1、NOT(Q₁)=1、Q₂=1 → リセット信号（AND）=1');
    expect(texts[4]).toBe(
      'FF₀：CLR 端子（正論理）につながる 全FFのCLR が 1 になり、CLR が働いた。クロックに関係なくリセットされ Q₀=0',
    );
    expect(step.changed).toEqual(expect.arrayContaining(['cp', 'q0', 'nq0', 'q2', 'rst', 'clr_all']));
    expect(step.changed).not.toContain('q1');
  });

  it('遅延モード：1つのエッジの中で、何ns後に何が変わったかが順に出る', () => {
    const { steps } = run('16-5', 'delay');
    const step = steps.find((st) => st.edgeNo === 6)!;
    expect(step.timeline).toBe(
      '0ns Cₚ立下り → 8ns Q₀=1 → 13ns リセット信号=1 → 18ns 全FFのCLR=1 → 26ns Q₀リセット → 26ns Q₂リセット → 31ns リセット信号=0 → 36ns 全FFのCLR=0',
    );
    expect(step.events.map((e) => e.dt)).toEqual([0, 8, 13, 18, 26, 26, 31, 36]);
    expect(step.path).toEqual(['100', '101', '000']);
  });

  it('CLR が働いている間のエッジは「変化しない」と表示する', () => {
    const { steps } = run('16-5', 'ideal');
    expect(steps[0]!.edgeNo).toBe(1);
    expect(steps[0]!.notes).toContain('このエッジでは、どのFFの出力も変化しない。');
  });

  it('入力（CLR）の変化もステップになる。FF が動かない側のクロックエッジはステップにしない', () => {
    const { steps } = run('16-5', 'ideal');
    expect(steps.map((st) => (st.kind === 'clock' ? `E${st.edgeNo}` : st.title))).toEqual([
      'E1', '入力の変化：CLR=0', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13',
      '入力の変化：CLR=1', 'E14', '入力の変化：CLR=0', 'E15', 'E16',
    ]);
  });
});

describe('ステップ実行：変化の理由', () => {
  it('非同期式（17-1）：遅延モードで 8ns → 16ns → 24ns と段々に遅れる', () => {
    const { steps } = run('17-1', 'delay');
    const step = steps.find((st) => st.edgeNo === 4)!; // 011 → 100
    expect(step.timeline).toBe('0ns Cₚ立下り → 8ns Q₀反転 → 16ns Q₁反転 → 24ns Q₂反転');
    expect(step.events[2]!.text).toBe('FF₁：Q₀ の立下りで CK が入った。J₁=K₁=1 なので反転して Q₁=0（8ns 遅れて変化）');
    expect(step.path).toEqual(['011', '010', '000', '100']);
  });

  it('同期式（18-練3）：全FFが同時に 8ns 遅れて変わる', () => {
    const { steps } = run('18-p3', 'delay');
    const step = steps.find((st) => st.edgeNo === 4)!; // 011 → 100
    expect(step.events.filter((e) => e.kind === 'clock').map((e) => e.dt)).toEqual([8, 8, 8]);
    expect(step.events.find((e) => e.signals.includes('q2'))!.text).toBe(
      'FF₂：Cₚ の立下りで CK が入った。J₂=K₂=Q₀Q₁=1 なので反転して Q₂=1（8ns 遅れて変化）',
    );
  });

  it('17-2：リセット信号は FF₂ にだけ効き、FF₀ には届かない', () => {
    const { steps } = run('17-2', 'delay');
    const step = steps.find((st) => st.edgeNo === 5)!;
    expect(step.path).toEqual(['100', '101', '001']);
    expect(step.events.filter((e) => e.kind === 'async').map((e) => e.short)).toEqual(['Q₂リセット']);
  });

  it('17-2：配線遅延より短いパルスが消えたことを説明する（慣性のときだけ）', () => {
    const s = sceneById('17-2') as Scene;
    const trace = simulate(s.circuit, s.stimulus, { mode: 'delay', delays: s.delays });
    const find = (model: 'inertial' | 'transport') =>
      buildSteps(s, trace, { wire: s.delays.wire ?? {}, model }).find((st) => st.edgeNo === 5)!;
    expect(find('inertial').notes).toEqual([
      'リセット信号 のパルス（幅 13ns）は配線遅延 20ns より短いので、FF₀ の CLR 端子には届かずに消えた。',
    ]);
    expect(find('transport').notes).toEqual([]);
    // 配線遅延 4ns なら届くので、説明は出ない。
    const ok = simulate(s.circuit, s.stimulus, { mode: 'delay', delays: { ...s.delays, wire: { rst_ff0: 4 } } });
    const step = buildSteps(s, ok, { wire: { rst_ff0: 4 }, model: 'inertial' }).find((st) => st.edgeNo === 5)!;
    expect(step.notes).toEqual([]);
    expect(step.path.at(-1)).toBe('000');
  });

  it('PR（19 PISO）：入力の変化でプリセットされる', () => {
    const { steps } = run('19-piso', 'ideal');
    const step = steps.find((st) => st.t === 132)!;
    expect(step.kind).toBe('input');
    expect(step.path).toEqual(['0000', '1001']);
    expect(step.events.at(-1)!.text).toBe(
      'FF₀：PR 端子（正論理）につながる A₀ が 1 になり、PR が働いた。クロックに関係なくプリセットされ Q₀=1',
    );
  });

  it('RS-FF（18-練5）と負論理 CLR（16-演3）の説明', () => {
    const rs = run('18-rs3', 'ideal').steps[1]!;
    expect(rs.events.map((e) => e.text)).toContain(
      'FF₁：Cₚ の立下りで CK が入った。S₁（=Q₀）=1、R₁（=Q̄₀）=0 なのでセットされ Q₁=1',
    );
    const ex3 = run('16-ex3', 'ideal').steps.find((st) => st.path.includes('111'))!;
    expect(ex3.path.at(-1)).toBe('000');
    expect(ex3.events.some((e) => e.text.includes('CLR 端子（負論理）につながる 全FFのCLR が 0 になり'))).toBe(true);
  });

  it('自動販売機：クロックのステップに、状態・入力・出力の読み方が付く', () => {
    const { steps } = run('21-vending', 'ideal');
    const step = steps.find((st) => st.t === 900)!; // 3000円状態で1000円をラッチ
    expect(step.notes).toEqual([
      '現状態 (Q₁Q₀)=(11)：状態4（3000円状態）。現入力 (X₁X₀)=(01)：1000円が入力された。',
      '真理値表より、次状態 (Q₁′Q₀′)=(00)：状態1（0円状態）。出力 (Y₁Y₀)=(01)：ワインだけが出力される。',
    ]);
  });
});

describe('ステップ実行：全場面', () => {
  it.each(SCENES.flatMap((s) => (['ideal', 'delay'] as const).map((mode) => ({ id: s.id, mode }))))(
    '$id（$mode）：ステップは時刻順で、クロック以外の変化がすべてどれかのステップに入る',
    ({ id, mode }) => {
      const { trace, steps } = run(id, mode);
      expect(steps.length).toBeGreaterThan(0);
      steps.forEach((st, i) => {
        expect(st.index).toBe(i);
        expect(st.end).toBeGreaterThan(st.t);
        if (i > 0) expect(st.t).toBeGreaterThanOrEqual(steps[i - 1]!.end);
        expect(st.events.every((e) => e.dt >= 0 && e.text.length > 0)).toBe(true);
      });
      const caused = trace.changes.filter((ch) => ch.cause.kind !== 'stimulus').length;
      const inSteps = steps.reduce(
        (n, st) => n + st.events.filter((e) => e.kind !== 'stimulus').reduce((m, e) => m + e.signals.length, 0),
        0,
      );
      expect(inSteps).toBe(caused);
    },
  );
});
