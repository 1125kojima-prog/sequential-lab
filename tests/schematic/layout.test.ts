/** 回路図の配置を幾何的に検査する。見た目の崩れ（突き抜け、重なり、つながっていない線）を見つける。 */
import { describe, expect, it } from 'vitest';
import { CIRCUITS } from '../../src/problems/circuits';
import { SCENES } from '../../src/problems/scenes';
import { buildDrawing, junctions, splitPieces, type Drawing, type Pt, type Seg } from '../../src/schematic/layout';
import { LAYOUTS, layoutFor, specFor } from '../../src/schematic/layouts';
import { autoLayout } from '../../src/schematic/auto';
import { counterSpec, encode, targets, type FFKind } from '../../src/design/fsm';
import { generateCircuit } from '../../src/design/generate';
import { minimize } from '../../src/design/minimize';
import { PRESETS } from '../../src/design/presets';
import type { Circuit } from '../../src/engine/types';

const KINDS: FFKind[] = ['D', 'T', 'JK', 'RS'];

/** 設計ガイドで作れる回路（カウンタ 2〜16進のアップ／ダウン、授業の設計例）を、4種の FF で。 */
function designed(): Circuit[] {
  const specs = [
    ...Array.from({ length: 15 }, (_, k) => counterSpec(k + 2, 'up')),
    ...Array.from({ length: 15 }, (_, k) => counterSpec(k + 2, 'down')),
    ...PRESETS.map((p) => p.spec),
  ];
  return specs.flatMap((spec) => {
    const enc = encode(spec);
    return KINDS.map((kind) => {
      const solutions = targets(enc, kind).map((target) => ({ target, terms: minimize(target.table, enc.vars.length) }));
      return generateCircuit(enc, kind, solutions).circuit;
    });
  });
}
const DESIGNED = designed();
const AUTO: Circuit[] = [CIRCUITS.find((c) => c.id === '21-vending')!, ...DESIGNED];

const key = (p: Pt): string => `${p.x},${p.y}`;
const ends = (s: Seg): [Pt, Pt] => [
  { x: s.x1, y: s.y1 },
  { x: s.x2, y: s.y2 },
];
const onSeg = (p: Pt, s: Seg): boolean =>
  s.x1 === s.x2 ? p.x === s.x1 && p.y >= s.y1 && p.y <= s.y2 : p.y === s.y1 && p.x >= s.x1 && p.x <= s.x2;

function drawingOf(id: string): Drawing {
  const auto = AUTO.find((c) => c.id === id);
  if (auto && !LAYOUTS[id]) return buildDrawing(auto, autoLayout(auto)!);
  const circuit = CIRCUITS.find((c) => c.id === id) ?? SCENES.find((s) => s.id === id)?.circuit;
  if (!circuit) throw new Error(`回路がありません: ${id}`);
  return buildDrawing(circuit, LAYOUTS[id]!);
}

describe('線分の整理', () => {
  it('T字に交わる線分を区切り、3本が集まる点を見つける', () => {
    const pieces = splitPieces([
      { x1: 0, y1: 10, x2: 100, y2: 10 },
      { x1: 40, y1: 10, x2: 40, y2: 50 },
    ]);
    expect(pieces).toHaveLength(3);
    expect(junctions(pieces)).toEqual([{ x: 40, y: 10 }]);
  });

  it('重なった線分は1本にまとめる。角は接続点にしない', () => {
    const pieces = splitPieces([
      { x1: 10, y1: 0, x2: 10, y2: 60 },
      { x1: 10, y1: 20, x2: 10, y2: 60 },
      { x1: 10, y1: 60, x2: 50, y2: 60 },
    ]);
    expect(pieces).toHaveLength(3);
    expect(junctions(pieces)).toEqual([]);
  });
});

describe('回路図の配置', () => {
  it('第16〜20回の場面には、すべて回路図がある', () => {
    const missing = SCENES.filter((s) => s.lecture <= 20 && !layoutFor(s.id, s.circuit.id)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('第21回の回路と、設計ガイドで作れる回路は、すべて自動で配置できる', () => {
    const missing = AUTO.filter((c) => !autoLayout(c)).map((c) => c.id);
    expect(missing).toEqual([]);
    expect(specFor('21-vending', AUTO[0]!)?.auto).toBe(true);
    // 授業の回路は手書きの配置を優先する。
    expect(specFor('16-5', CIRCUITS.find((c) => c.id === '16-5')!)?.auto).toBe(false);
  });

  describe.each([...Object.keys(LAYOUTS), ...AUTO.map((c) => c.id).filter((id) => !LAYOUTS[id])])('%s', (id) => {
    const drawing = drawingOf(id);
    const boxes = [...drawing.ffs, ...drawing.gates].map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));

    it('入力端子はすべて配線されている', () => {
      for (const ff of drawing.ffs) {
        for (const pin of ff.pins) {
          if (pin.name !== 'q' && pin.name !== 'qn') expect(pin.connected, pin.key).toBe(true);
        }
      }
    });

    it('信号ごとに、線が1つにつながっていて、全端子に届いている', () => {
      for (const net of drawing.nets) {
        const parent = new Map<string, string>();
        const find = (k: string): string => {
          const p = parent.get(k) ?? k;
          if (p === k) return k;
          const root = find(p);
          parent.set(k, root);
          return root;
        };
        for (const s of net.segs) {
          const [a, b] = ends(s);
          parent.set(find(key(a)), find(key(b)));
        }
        const roots = new Set(net.segs.flatMap((s) => ends(s).map((p) => find(key(p)))));
        expect(roots.size, `${net.key} が分かれている`).toBe(1);
        for (const pin of net.pins) {
          expect(net.segs.some((s) => onSeg(pin, s)), `${net.key} が端子 (${pin.x},${pin.y}) に届いていない`).toBe(true);
        }
      }
    });

    it('線が FF やゲートの中を通らない', () => {
      for (const net of drawing.nets) {
        for (const s of net.segs) {
          for (const b of boxes) {
            const inside =
              Math.max(s.x1, b.x) < Math.min(s.x2, b.x + b.w) || (s.x1 === s.x2 && s.x1 > b.x && s.x1 < b.x + b.w)
                ? Math.max(s.y1, b.y) < Math.min(s.y2, b.y + b.h) || (s.y1 === s.y2 && s.y1 > b.y && s.y1 < b.y + b.h)
                : false;
            expect(inside, `${net.key} の線 (${s.x1},${s.y1})-(${s.x2},${s.y2}) が ${b.id} を通る`).toBe(false);
          }
        }
      }
    });

    it('別の信号の線と重ならない。線の端が別の信号の線に触れない', () => {
      const nets = drawing.nets;
      for (let i = 0; i < nets.length; i++) {
        const a = nets[i]!;
        const degree = new Map<string, number>();
        for (const s of a.segs) for (const p of ends(s)) degree.set(key(p), (degree.get(key(p)) ?? 0) + 1);
        const pinKeys = new Set(a.pins.map(key));
        const loose = a.segs.flatMap(ends).filter((p) => degree.get(key(p)) === 1 && !pinKeys.has(key(p)));
        for (let j = 0; j < nets.length; j++) {
          if (i === j) continue;
          const b = nets[j]!;
          for (const t of b.segs) {
            for (const p of loose) {
              expect(onSeg(p, t), `${a.key} の端 (${p.x},${p.y}) が ${b.key} に触れている`).toBe(false);
            }
            if (j < i) continue;
            for (const s of a.segs) {
              const sv = s.x1 === s.x2;
              const tv = t.x1 === t.x2;
              if (sv !== tv) continue;
              const overlap = sv
                ? s.x1 === t.x1 && Math.max(s.y1, t.y1) < Math.min(s.y2, t.y2)
                : s.y1 === t.y1 && Math.max(s.x1, t.x1) < Math.min(s.x2, t.x2);
              expect(overlap, `${a.key} と ${b.key} が (${s.x1},${s.y1})-(${s.x2},${s.y2}) で重なる`).toBe(false);
            }
          }
        }
      }
    });

    it('すべて枠の中に収まる', () => {
      for (const net of drawing.nets) {
        for (const s of net.segs) {
          expect(s.x1).toBeGreaterThanOrEqual(0);
          expect(s.x2).toBeLessThanOrEqual(drawing.width);
          expect(s.y1).toBeGreaterThanOrEqual(0);
          expect(s.y2).toBeLessThanOrEqual(drawing.height);
        }
        for (const label of net.labels) {
          expect(label.x).toBeGreaterThan(0);
          expect(label.x).toBeLessThan(drawing.width);
          expect(label.y).toBeGreaterThan(0);
          expect(label.y).toBeLessThanOrEqual(drawing.height);
        }
      }
    });
  });
});
