import { useEffect, useRef } from 'react';
import { edgeTimes } from '../engine/sample';
import type { Trace, Trigger } from '../engine/types';
import { busSegments, timeTicks, wave } from '../view/chart';
import type { Label, Namer } from '../view/label';
import type { Step } from '../view/steps';
import { SvgLabel } from './SvgLabel';

export type ChartRow = { kind: 'bit'; signal: string } | { kind: 'bus'; name: string; bits: string[] };

type Props = {
  trace: Trace;
  rows: ChartRow[];
  namer: Namer;
  /** 外部入力（常に最後まで描く）。 */
  inputs: ReadonlySet<string>;
  /** 出力を描く範囲の終わり（ns）。 */
  reveal: number;
  pxPerNs: number;
  clock: string;
  edge: Trigger;
  step: Step | undefined;
};

const LABEL_W = 132;
const TOP = 26;
const ROW_H = 38;
const BOTTOM = 24;
const PAD_R = 28;
const HIGH = 12;
const LOW = 30;

export const EDGE_COLOR: Record<Trigger, string> = { rising: '#2563eb', falling: '#dc2626' };

function busLabel(namer: Namer, bits: string[]): Label {
  return [{ base: '(' }, ...bits.flatMap((b) => namer.label(b)), { base: ')' }];
}

export function TimingChart({ trace, rows, namer, inputs, reveal, pxPerNs, clock, edge, step }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const x = (t: number): number => t * pxPerNs;
  const width = x(trace.end) + PAD_R;
  const height = TOP + rows.length * ROW_H + BOTTOM;
  const edges = edgeTimes(trace, clock, edge);
  const changed = new Set(step?.changed ?? []);
  const rowChanged = (row: ChartRow): boolean =>
    row.kind === 'bit' ? changed.has(row.signal) : row.bits.some((b) => changed.has(b));
  const untilOf = (signals: string[]): number => (signals.every((s) => inputs.has(s)) ? trace.end : reveal);

  // ステップや拡大率が変わったら、いまのステップが見える位置へスクロールする。
  const stepT = step?.t;
  const lastZoom = useRef(pxPerNs);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const zoomed = lastZoom.current !== pxPerNs;
    lastZoom.current = pxPerNs;
    if (stepT === undefined) {
      el.scrollLeft = 0;
      return;
    }
    const pos = stepT * pxPerNs;
    if (zoomed || pos < el.scrollLeft + 20 || pos > el.scrollLeft + el.clientWidth - 140) {
      el.scrollLeft = Math.max(0, pos - (zoomed ? 80 : el.clientWidth / 3));
    }
  }, [stepT, pxPerNs]);

  return (
    <div className="chart">
      <svg className="chart-labels" width={LABEL_W} height={height}>
        {rows.map((row, i) => {
          const y = TOP + i * ROW_H;
          const hot = rowChanged(row);
          const label = row.kind === 'bit' ? namer.label(row.signal) : busLabel(namer, row.bits);
          return (
            <g key={i}>
              {hot && <rect x={0} y={y + 3} width={LABEL_W} height={ROW_H - 6} fill="#fde68a" rx={4} />}
              <SvgLabel label={label} x={LABEL_W - 12} y={y + 26} anchor="end" bold={hot} size={row.kind === 'bus' ? 12 : 14} />
            </g>
          );
        })}
      </svg>
      <div className="chart-scroll" ref={scroller}>
        <svg width={width} height={height}>
          {step && (
            <rect
              x={x(step.t)}
              y={TOP - 4}
              width={Math.max(2, x(step.end) - x(step.t))}
              height={rows.length * ROW_H + 8}
              fill="#fef9c3"
            />
          )}
          {rows.map((row, i) =>
            step && rowChanged(row) ? (
              <rect
                key={`hot${i}`}
                x={x(step.t)}
                y={TOP + i * ROW_H + 3}
                width={Math.max(2, x(step.end) - x(step.t))}
                height={ROW_H - 6}
                fill="#fde68a"
              />
            ) : null,
          )}
          {rows.map((_, i) => (
            <line key={`sep${i}`} x1={0} x2={width} y1={TOP + (i + 1) * ROW_H} y2={TOP + (i + 1) * ROW_H} stroke="#eef0f3" />
          ))}

          {/* FF が反応するクロックエッジ */}
          {edges.map((t, k) => (
            <g key={`edge${k}`}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={TOP - 6}
                y2={TOP + rows.length * ROW_H}
                stroke={EDGE_COLOR[edge]}
                strokeDasharray="3 3"
                strokeWidth={step?.t === t ? 1.6 : 0.9}
                opacity={0.75}
              />
              <text x={x(t)} y={12} fontSize={11} textAnchor="middle" fill={EDGE_COLOR[edge]} fontWeight={step?.t === t ? 700 : 400}>
                {k + 1}
              </text>
            </g>
          ))}

          {/* 時間軸 */}
          {timeTicks(trace.end, pxPerNs).map((t) => (
            <g key={`tick${t}`}>
              <line x1={x(t)} x2={x(t)} y1={height - BOTTOM} y2={height - BOTTOM + 5} stroke="#9ca3af" />
              <text x={x(t)} y={height - 6} fontSize={10} textAnchor={t === 0 ? 'start' : 'middle'} fill="#6b7280">
                {t}
                {t === 0 ? ' ns' : ''}
              </text>
            </g>
          ))}

          {rows.map((row, i) => {
            const top = TOP + i * ROW_H;
            if (row.kind === 'bit') {
              const w = wave(trace, row.signal, untilOf([row.signal]));
              const level = (v: number): number => top + (v === 1 ? HIGH : LOW);
              let d = `M0,${level(w.initial)}`;
              for (const p of w.points) d += ` H${x(p.t)} V${level(p.value)}`;
              d += ` H${x(w.until)}`;
              return <path key={i} d={d} fill="none" stroke="#111827" strokeWidth={1.8} strokeLinejoin="miter" />;
            }
            const until = untilOf(row.bits);
            const mid = top + (HIGH + LOW) / 2;
            return (
              <g key={i}>
                {busSegments(trace, row.bits, until).map((seg, k) => {
                  const x0 = x(seg.t0);
                  const x1 = x(seg.t1);
                  const w = x1 - x0;
                  if (w < 1) return <line key={k} x1={x0} x2={x0} y1={top + HIGH} y2={top + LOW} stroke="#111827" strokeWidth={1.8} />;
                  const s = Math.min(4, w / 2);
                  const left = k === 0 ? `${x0},${top + HIGH} ` : `${x0},${mid} ${x0 + s},${top + HIGH} `;
                  const leftBack = k === 0 ? `${x0},${top + LOW}` : `${x0 + s},${top + LOW}`;
                  const closed = seg.t1 < trace.end || until < trace.end;
                  const right = closed ? `${x1 - s},${top + HIGH} ${x1},${mid} ${x1 - s},${top + LOW} ` : `${x1},${top + HIGH} ${x1},${top + LOW} `;
                  return (
                    <g key={k}>
                      <polygon points={`${left}${right}${leftBack}`} fill="#eff6ff" stroke="#111827" strokeWidth={1.4} />
                      {w >= 24 && (
                        <text x={(x0 + x1) / 2} y={mid + 4} fontSize={12} textAnchor="middle" fill="#111827">
                          {seg.hex}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* いまのステップの中で、エッジから何ns後に変わったか */}
          {step &&
            pxPerNs >= 2 &&
            step.events
              .filter((e) => e.dt > 0)
              .flatMap((e) =>
                rows.flatMap((row, i) =>
                  row.kind === 'bit' && e.signals.includes(row.signal)
                    ? [
                        <text key={`${e.t}-${i}`} x={x(e.t) + 3} y={TOP + i * ROW_H + 9} fontSize={9} fill="#b45309">
                          +{e.dt}
                        </text>,
                      ]
                    : [],
                ),
              )}
        </svg>
      </div>
    </div>
  );
}
