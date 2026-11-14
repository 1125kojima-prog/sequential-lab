/** 状態遷移図：行き先をエンジンで求めた結果が、スライドの図と一致すること。配置が重ならないこと。 */
import { describe, expect, it } from 'vitest';
import { counterSpec } from '../../src/design/fsm';
import { MOORE3, STOPWATCH, VENDING } from '../../src/design/presets';
import { SCENES, sceneById } from '../../src/problems/scenes';
import { sceneDiagram, specDiagram, type Diagram } from '../../src/view/statediagram';
import { SLIDE_20_SELF } from '../fixtures/scenarios';

const bin = (s: string): number => parseInt(s, 2);
const str = (v: number, w: number): string => v.toString(2).padStart(w, '0');

function nextOf(id: string): { next: string[]; transient: boolean[] } {
  const scene = sceneById(id)!;
  const result = sceneDiagram(scene);
  if (!result) throw new Error(`図が描けません: ${id}`);
  const w = scene.stateBits.length;
  return { next: result.next.map((v) => str(v, w)), transient: result.transient };
}

/** 丸どうしが重ならず、すべて枠の中に収まる。 */
function expectTidy(diagram: Diagram): void {
  const { nodes } = diagram;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    expect(a.x - a.r, `${a.label} 左`).toBeGreaterThanOrEqual(0);
    expect(a.y - a.r, `${a.label} 上`).toBeGreaterThanOrEqual(0);
    expect(a.x + a.r, `${a.label} 右`).toBeLessThanOrEqual(diagram.width);
    expect(a.y + a.r, `${a.label} 下`).toBeLessThanOrEqual(diagram.height);
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.label} と ${b.label}`).toBeGreaterThanOrEqual(a.r + b.r + 4);
    }
  }
  for (const e of diagram.edges) {
    expect(e.labelX).toBeGreaterThan(0);
    expect(e.labelY).toBeGreaterThan(0);
    expect(e.labelX).toBeLessThan(diagram.width);
    expect(e.labelY).toBeLessThan(diagram.height);
  }
}

describe('回路の全状態の状態遷移図（行き先はエンジンで求める）', () => {
  it('20-練4：自己補正型リングカウンタの全16状態がスライドの図と一致する', () => {
    const { next } = nextOf('20-self');
    for (const [state, to] of Object.entries(SLIDE_20_SELF)) {
      expect(next[bin(state)], state).toBe(to);
    }
  });

  it('20-練4：定常ループは 1000→0100→0010→0001 の4状態で、ほかの12状態はそこへ流れ込む', () => {
    const scene = sceneById('20-self')!;
    const { diagram } = sceneDiagram(scene)!;
    const loop = diagram.nodes.filter((n) => n.onLoop).map((n) => n.label).sort();
    expect(loop).toEqual(['0001', '0010', '0100', '1000']);
  });

  it('20 リングカウンタ（自己補正なし）：(0000) は動かず、定常ループに戻れない状態がある', () => {
    const { next } = nextOf('20-ring');
    expect(next[bin('0000')]).toBe('0000');
    expect(next[bin('1110')]).toBe('0111');
    expect(next[bin('0111')]).toBe('1011');
    const scene = sceneById('20-ring')!;
    const { diagram } = sceneDiagram(scene)!;
    // すべての状態がどこかのループの上にある（流れ込む状態がない）。
    expect(diagram.nodes.every((n) => n.onLoop)).toBe(true);
  });

  it('20 ジョンソンカウンタ：8状態のループが2つ', () => {
    const { next } = nextOf('20-johnson');
    const cycle = (start: string): string[] => {
      const out = [start];
      for (let s = next[bin(start)]!; s !== start; s = next[bin(s)]!) out.push(s);
      return out;
    };
    expect(cycle('0000')).toEqual(['0000', '1000', '1100', '1110', '1111', '0111', '0011', '0001']);
    expect(cycle('0100')).toHaveLength(8);
  });

  it('16-5：(100) からのクロックでは (101) が一瞬現れて (000) へ。(101) はクロックを待たずに (000) へ移る', () => {
    const { next, transient } = nextOf('16-5');
    expect(next).toEqual(['001', '010', '011', '100', '000', '000', '111', '000']);
    expect(transient.map((t, i) => (t ? str(i, 3) : '')).filter((s) => s)).toEqual(['101']);
  });

  it('16-演3（7進、CLR 負論理）：(111) は一瞬で (000) へ。外部 CLR は働かない側（1）で描く', () => {
    const { next, transient } = nextOf('16-ex3');
    // (110) からのクロックで (111) が一瞬現れ、すぐ (000) に戻る。
    expect(next[bin('110')]).toBe('000');
    expect(next[bin('111')]).toBe('000');
    expect(transient[bin('111')]).toBe(true);
  });

  it('18-演2（同期5進 JK）：使わない状態 (101)(110)(111) の行き先も描く', () => {
    const { next } = nextOf('18-ex2');
    expect(next.slice(0, 5)).toEqual(['001', '010', '011', '100', '000']);
    expect(next.slice(5)).toEqual(['010', '010', '000']);
  });

  it('描ける場面：入力がクロックと CLR だけの回路。データ入力のあるレジスタは描かない', () => {
    const drawable = SCENES.filter((s) => sceneDiagram(s) !== undefined).map((s) => s.id);
    expect(drawable).toEqual(expect.arrayContaining(['16-5', '17-1', '18-p3', '20-self', '20-johnson']));
    for (const id of ['19-reg4', '19-sipo', '19-piso', '19-ex3', '20-p1', '21-vending']) expect(drawable).not.toContain(id);
  });

  it.each(SCENES.filter((s) => sceneDiagram(s) !== undefined).map((s) => s.id))('%s：丸が重ならず、枠に収まる', (id) => {
    expectTidy(sceneDiagram(sceneById(id)!)!.diagram);
  });
});

describe('状態遷移表の図（設計ガイド）', () => {
  it('ムーア型（22 p.7）：丸の中に出力、矢印に入力だけを書く', () => {
    const d = specDiagram(MOORE3.spec);
    expect(d.nodes.map((n) => n.sub)).toEqual(['00', '01', '10']);
    const edges = d.edges.map((e) => `${e.from}>${e.to}:${e.label}`).sort();
    expect(edges).toEqual(['0>0:0', '0>1:1', '1>1:0', '1>2:1', '2>0:1', '2>2:0']);
  });

  it('ミーリー型（自動販売機）：矢印に「入力/出力」を書き、同じ行き先はまとめる', () => {
    const d = specDiagram(VENDING.spec);
    const label = (from: number, to: number): string | undefined => d.edges.find((e) => e.from === from && e.to === to)?.label;
    expect(label(3, 0)).toBe('01/01, 10/10'); // 3000円状態で 1000円 → ワイン、2000円 → ワイン＆1000円
    expect(label(2, 0)).toBe('10/01');
    expect(label(0, 0)).toBe('00/00');
    expect(d.nodes.every((n) => n.sub === undefined)).toBe(true);
  });

  it('カウンタ：入力も出力もないので、矢印にラベルはない', () => {
    const d = specDiagram(counterSpec(5, 'up'));
    expect(d.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['0>1', '1>2', '2>3', '3>4', '4>0']);
    expect(d.edges.every((e) => e.label === '')).toBe(true);
  });

  it.each([MOORE3, VENDING, STOPWATCH].map((p) => [p.spec.title, p.spec] as const))('%s：丸が重ならず、枠に収まる', (_, spec) => {
    expectTidy(specDiagram(spec));
  });
});
