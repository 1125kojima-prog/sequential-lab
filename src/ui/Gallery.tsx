import { SCENES } from '../problems/scenes';
import { buildDrawing } from '../schematic/layout';
import { layoutFor } from '../schematic/layouts';
import { makeNamer } from '../view/label';
import { Schematic } from './Schematic';

const NONE: ReadonlySet<string> = new Set();

/** 回路図の一覧（配置の確認用）。URL に #gallery=1 を付けると表示する。 */
export function Gallery() {
  const seen = new Set<string>();
  const scenes = SCENES.flatMap((s) => {
    const layout = layoutFor(s.id, s.circuit.id);
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
