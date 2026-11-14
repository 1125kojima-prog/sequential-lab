import { SCENES } from '../problems/scenes';
import { buildDrawing } from '../schematic/layout';
import { LAYOUTS } from '../schematic/layouts';
import { makeNamer } from '../view/label';
import { Schematic } from './Schematic';

const NONE: ReadonlySet<string> = new Set();

/** 回路図の一覧（配置の確認用）。URL に #gallery=1 を付けると表示する。 */
export function Gallery() {
  const seen = new Set<string>();
  const scenes = SCENES.filter((s) => {
    if (!LAYOUTS[s.circuit.id] || seen.has(s.circuit.id)) return false;
    seen.add(s.circuit.id);
    return true;
  });
  const from = Number(new URLSearchParams(window.location.hash.replace(/^#/, '')).get('from') ?? 0);
  return (
    <div style={{ padding: 12 }}>
      {scenes.slice(from).map((s) => (
        <section key={s.circuit.id}>
          <h3 style={{ margin: '10px 0 0' }}>
            {s.circuit.id}　{s.circuit.title}
          </h3>
          <Schematic
            drawing={buildDrawing(s.circuit, LAYOUTS[s.circuit.id]!)}
            namer={makeNamer(s.labels)}
            values={Object.fromEntries(s.stateBits.map((b, i) => [b, i % 2 === 0 ? 1 : 0]))}
            changed={NONE}
          />
        </section>
      ))}
    </div>
  );
}
