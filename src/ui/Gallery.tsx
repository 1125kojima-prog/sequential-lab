import { counterSpec, encode, targets, type FFKind, type FsmSpec } from '../design/fsm';
import { generateScene } from '../design/generate';
import { minimize } from '../design/minimize';
import { PRESETS } from '../design/presets';
import { SCENES, type Scene } from '../problems/scenes';
import { buildDrawing } from '../schematic/layout';
import { specFor } from '../schematic/layouts';
import { makeNamer } from '../view/label';
import { Schematic } from './Schematic';

const NONE: ReadonlySet<string> = new Set();

/** 設計ガイドで作る回路の例（自動配置の確認用）。 */
function designedScenes(): Scene[] {
  const make = (spec: FsmSpec, kind: FFKind, inputs: number[] = []): Scene => {
    const enc = encode(spec);
    const solutions = targets(enc, kind).map((target) => ({ target, terms: minimize(target.table, enc.vars.length) }));
    return generateScene(enc, kind, solutions, inputs);
  };
  return [
    make(counterSpec(3, 'up'), 'D'),
    make(counterSpec(3, 'up'), 'RS'),
    make(counterSpec(5, 'up'), 'JK'),
    make(counterSpec(8, 'up'), 'JK'),
    make(counterSpec(10, 'down'), 'T'),
    ...PRESETS.map((p) => make(p.spec, p.ff, p.inputs)),
    make(PRESETS[0]!.spec, 'JK', PRESETS[0]!.inputs),
  ];
}

/** 回路図の一覧（配置の確認用）。URL に #gallery=1 を付けると表示する。design=1 を足すと設計ガイドの回路だけ。 */
export function Gallery() {
  const seen = new Set<string>();
  const designed = window.location.hash.includes('design=1');
  const scenes = (designed ? designedScenes() : SCENES).flatMap((s) => {
    const layout = specFor(s.id, s.circuit);
    if (!layout || seen.has(layout.key)) return [];
    seen.add(layout.key);
    return [{ s, layout }];
  });
  const from = Number(new URLSearchParams(window.location.hash.replace(/^#/, '')).get('from') ?? 0);
  return (
    <div style={{ padding: 12 }}>
      {scenes.slice(from).map(({ s, layout }) => (
        <section key={layout.key}>
          <h3 style={{ margin: '10px 0 0' }}>
            {layout.key}　{s.title}（スライド {s.source}）
          </h3>
          <Schematic
            drawing={buildDrawing(s.circuit, layout.spec)}
            namer={makeNamer(s.labels)}
            values={Object.fromEntries(s.stateBits.map((b, i) => [b, i % 2 === 0 ? 1 : 0]))}
            changed={NONE}
          />
        </section>
      ))}
    </div>
  );
}
