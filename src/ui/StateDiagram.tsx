import { useId } from 'react';
import type { Diagram } from '../view/statediagram';

type Props = {
  diagram: Diagram;
  /** いまの状態（丸を強調する）。 */
  current?: number;
  /** 直前の遷移（矢印を強調する）。 */
  from?: number;
  to?: number;
};

const INK = '#111827';
const HOT = '#ea580c';
const LOOP_FILL = '#dbeafe';

/** 丸の中の文字。「状態1（0円）」のように（ が入る名前は2行に分ける。 */
function nodeLines(label: string): string[] {
  const at = label.indexOf('（');
  return at > 0 ? [label.slice(0, at), label.slice(at)] : [label];
}

export function StateDiagram({ diagram, current, from, to }: Props) {
  const id = useId().replace(/:/g, '');
  const anyOff = diagram.nodes.some((n) => !n.onLoop) && diagram.nodes.some((n) => n.onLoop);
  return (
    <svg width={diagram.width} height={diagram.height} className="state-diagram">
      <defs>
        <marker id={`${id}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={INK} />
        </marker>
        <marker id={`${id}-h`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={HOT} />
        </marker>
      </defs>
      {diagram.edges.map((e, i) => {
        const hot = e.from === from && e.to === to;
        const quick = e.label === 'すぐ';
        return (
          <g key={i}>
            <path
              d={e.d}
              fill="none"
              stroke={hot ? HOT : INK}
              strokeWidth={hot ? 2.6 : 1.3}
              strokeDasharray={quick ? '5 3' : undefined}
              markerEnd={`url(#${id}-${hot ? 'h' : 'a'})`}
            />
            {e.label && (
              <text x={e.labelX} y={e.labelY} fontSize={12} textAnchor="middle" fill={hot ? HOT : quick ? '#6b7280' : INK} fontWeight={hot ? 700 : 400} className="edge-label">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {diagram.nodes.map((n) => {
        const now = n.id === current;
        const lines = nodeLines(n.label);
        const fill = now ? '#fde68a' : anyOff && n.onLoop ? LOOP_FILL : '#fff';
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={n.r} fill={fill} stroke={now ? HOT : INK} strokeWidth={now ? 2.6 : 1.4} />
            {n.sub !== undefined ? (
              <>
                {/* ムーア型：上が状態、下が出力 */}
                <line x1={n.x - n.r * 0.8} x2={n.x + n.r * 0.8} y1={n.y + 4} y2={n.y + 4} stroke={INK} strokeWidth={1} />
                {lines.map((line, k) => (
                  <text key={k} x={n.x} y={n.y - 6 - (lines.length - 1 - k) * 11} fontSize={k === 0 ? 12 : 9} textAnchor="middle">
                    {line}
                  </text>
                ))}
                <text x={n.x} y={n.y + 19} fontSize={12} textAnchor="middle" fontWeight={600}>
                  {n.sub}
                </text>
              </>
            ) : (
              lines.map((line, k) => (
                <text
                  key={k}
                  x={n.x}
                  y={n.y + 4 + (k - (lines.length - 1) / 2) * 13}
                  fontSize={k === 0 ? (lines.length > 1 ? 12 : 13) : 9}
                  textAnchor="middle"
                  fontWeight={now ? 700 : 400}
                >
                  {line}
                </text>
              ))
            )}
          </g>
        );
      })}
    </svg>
  );
}
