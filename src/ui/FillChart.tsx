import { useRef } from 'react';
import { edgeTimes } from '../engine/sample';
import type { Level, Trace, Trigger } from '../engine/types';
import { busSegments, wave } from '../view/chart';
import type { Cell, Mark } from '../view/grade';
import type { Label, Namer } from '../view/label';
import { SvgLabel } from './SvgLabel';
import { EDGE_COLOR } from './TimingChart';

export type FillRow =
  | { kind: 'bit'; signal: string }
  | { kind: 'bus'; name: string; bits: string[] }
  | { kind: 'blank'; signal: string; cells: Cell<Level>[]; answers: (Level | undefined)[]; marks?: Mark[] }
  | { kind: 'busBlank'; name: string; bits: string[]; cells: Cell<string>[]; answers: string[]; marks?: Mark[] };

type Props = {
  trace: Trace;
  rows: FillRow[];
  namer: Namer;
  clock: string;
  edge: Trigger;
  /** マスの幅（ns）。 */
  cellNs: number;
  onBit: (signal: string, index: number, value: Level | undefined) => void;
  onBus: (name: string, index: number, value: string) => void;
};

const LABEL_W = 132;
const TOP = 26;
const ROW_H = 38;
const BOTTOM = 8;
const HIGH = 10;
const LOW = 30;
const CELL_W = 30;

const MARK_FILL: Record<Mark, string> = { given: '#f3f4f6', correct: '#dcfce7', wrong: '#fecaca', blank: '#fef3c7' };

function busLabel(namer: Namer, bits: string[]): Label {
  return [{ base: '(' }, ...bits.flatMap((b) => namer.label(b)), { base: ')' }];
}

/** 穴埋め用のタイミングチャート。空欄の行は、マスをクリック（ドラッグ）して H/L を描く。 */
export function FillChart({ trace, rows, namer, clock, edge, cellNs, onBit, onBus }: Props) {
  const px = CELL_W / cellNs;
  const x = (t: number): number => t * px;
  const width = x(trace.end) + 12;
  const height = TOP + rows.length * ROW_H + BOTTOM;
  const edges = edgeTimes(trace, clock, edge);
  /** ドラッグ中に塗る値。 */
  const paint = useRef<{ signal: string; value: Level | undefined } | null>(null);

  const wavePath = (signal: string, top: number, from = 0, to = trace.end): string => {
    const w = wave(trace, signal, to);
    const level = (v: number): number => top + (v === 1 ? HIGH : LOW);
    let current = w.initial;
    let d = '';
    for (const p of w.points) {
      if (p.t <= from) {
        current = p.value;
        continue;
      }
      if (d === '') d = `M${x(from)},${level(current)}`;
      d += ` H${x(p.t)} V${level(p.value)}`;
      current = p.value;
    }
    if (d === '') d = `M${x(from)},${level(current)}`;
    return `${d} H${x(to)}`;
  };

  return (
    <div className="chart" onMouseUp={() => (paint.current = null)} onMouseLeave={() => (paint.current = null)}>
      <svg className="chart-labels" width={LABEL_W} height={height}>
        {rows.map((row, i) => {
          const y = TOP + i * ROW_H;
          const blank = row.kind === 'blank' || row.kind === 'busBlank';
          const label = row.kind === 'bit' || row.kind === 'blank' ? namer.label(row.signal) : busLabel(namer, row.bits);
          return (
            <g key={i}>
              {blank && <rect x={0} y={y + 3} width={LABEL_W} height={ROW_H - 6} fill="#dbeafe" rx={4} />}
              <SvgLabel label={label} x={LABEL_W - 12} y={y + 25} anchor="end" bold={blank} size={row.kind === 'bus' || row.kind === 'busBlank' ? 12 : 14} />
            </g>
          );
        })}
      </svg>
      <div className="chart-scroll">
        <svg width={width} height={height} style={{ userSelect: 'none' }}>
          {rows.map((row, i) => {
            const top = TOP + i * ROW_H;
            if (row.kind === 'bit') {
              return <path key={i} d={wavePath(row.signal, top)} fill="none" stroke="#111827" strokeWidth={1.8} />;
            }
            if (row.kind === 'bus') {
              const mid = top + (HIGH + LOW) / 2;
              return (
                <g key={i}>
                  {busSegments(trace, row.bits).map((seg, k) => {
                    const x0 = x(seg.t0);
                    const x1 = x(seg.t1);
                    if (x1 - x0 < 1) return null;
                    const s = Math.min(4, (x1 - x0) / 2);
                    return (
                      <g key={k}>
                        <polygon
                          points={`${x0},${mid} ${x0 + s},${top + HIGH} ${x1 - s},${top + HIGH} ${x1},${mid} ${x1 - s},${top + LOW} ${x0 + s},${top + LOW}`}
                          fill="#eff6ff"
                          stroke="#111827"
                          strokeWidth={1.3}
                        />
                        {x1 - x0 >= 24 && (
                          <text x={(x0 + x1) / 2} y={mid + 4} fontSize={12} textAnchor="middle">
                            {seg.hex}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            }
            if (row.kind === 'blank') {
              const level = (v: number): number => top + (v === 1 ? HIGH : LOW);
              return (
                <g key={i}>
                  {row.cells.map((cell, k) => {
                    const answer = row.answers[k];
                    const mark = cell.given ? 'given' : row.marks?.[k];
                    const next: Level = answer === 1 ? 0 : 1;
                    return (
                      <rect
                        key={k}
                        x={x(cell.t0)}
                        y={top + 3}
                        width={x(cell.t1) - x(cell.t0)}
                        height={ROW_H - 6}
                        fill={mark ? MARK_FILL[mark] : '#fff'}
                        stroke="#d1d5db"
                        strokeWidth={0.8}
                        style={{ cursor: cell.given ? 'default' : 'pointer' }}
                        onMouseDown={(e) => {
                          if (cell.given) return;
                          const value = e.shiftKey ? undefined : next;
                          paint.current = { signal: row.signal, value };
                          onBit(row.signal, k, value);
                        }}
                        onMouseEnter={() => {
                          if (cell.given || paint.current?.signal !== row.signal) return;
                          onBit(row.signal, k, paint.current.value);
                        }}
                      />
                    );
                  })}
                  {/* 途中で変わるマスは、正しい波形を最初から見せる */}
                  {row.cells.map((cell, k) =>
                    cell.given ? (
                      <path key={`g${k}`} d={wavePath(row.signal, top, cell.t0, cell.t1)} fill="none" stroke="#6b7280" strokeWidth={1.8} pointerEvents="none" />
                    ) : null,
                  )}
                  {/* 自分で描いた波形 */}
                  {row.cells.map((cell, k) => {
                    const v = row.answers[k];
                    if (cell.given || v === undefined) return null;
                    const before = k > 0 && !row.cells[k - 1]!.given ? row.answers[k - 1] : undefined;
                    return (
                      <path
                        key={`a${k}`}
                        d={`${before !== undefined && before !== v ? `M${x(cell.t0)},${level(before)} V${level(v)}` : `M${x(cell.t0)},${level(v)}`} H${x(cell.t1)}`}
                        fill="none"
                        stroke="#1d4ed8"
                        strokeWidth={2.2}
                        pointerEvents="none"
                      />
                    );
                  })}
                </g>
              );
            }
            return (
              <g key={i}>
                {row.cells.map((cell, k) => {
                  const mark = cell.given ? 'given' : row.marks?.[k];
                  const w = x(cell.t1) - x(cell.t0);
                  return (
                    <g key={k}>
                      <rect x={x(cell.t0)} y={top + 3} width={w} height={ROW_H - 6} fill={mark ? MARK_FILL[mark] : '#fff'} stroke="#d1d5db" strokeWidth={0.8} />
                      {cell.given ? (
                        <text x={x(cell.t0) + w / 2} y={top + 24} fontSize={11} textAnchor="middle" fill="#6b7280">
                          途中
                        </text>
                      ) : (
                        <foreignObject x={x(cell.t0) + 2} y={top + 7} width={w - 4} height={ROW_H - 14}>
                          <input
                            className="bus-input"
                            value={row.answers[k] ?? ''}
                            maxLength={cell.value.length}
                            onChange={(e) => onBus(row.name, k, e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                          />
                        </foreignObject>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {edges.map((t, k) => (
            <g key={`edge${k}`} pointerEvents="none">
              <line x1={x(t)} x2={x(t)} y1={TOP - 6} y2={TOP + rows.length * ROW_H} stroke={EDGE_COLOR[edge]} strokeDasharray="3 3" strokeWidth={0.9} opacity={0.75} />
              <text x={x(t)} y={12} fontSize={11} textAnchor="middle" fill={EDGE_COLOR[edge]}>
                {k + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
