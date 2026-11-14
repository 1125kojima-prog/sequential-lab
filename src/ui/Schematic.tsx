import type { Level, Ref } from '../engine/types';
import { gateSize, type Drawing, type FFDraw, type GateDraw, type Led, type PinDraw } from '../schematic/layout';
import { parseLabel, type Label, type Namer } from '../view/label';
import { SvgLabel } from './SvgLabel';

type Props = {
  drawing: Drawing;
  namer: Namer;
  /** いまの時点の信号の値。 */
  values: Record<string, Level>;
  /** いまのステップで変化した信号。 */
  changed: ReadonlySet<string>;
};

export const WIRE_HIGH = '#ea580c';
export const WIRE_LOW = '#9ca3af';
const INK = '#111827';

const PIN_TEXT: Record<string, string> = { d: 'D', t: 'T', j: 'J', k: 'K', s: 'S', r: 'R', clr: 'CLR', pr: 'PR' };

function ffIndex(id: string): string | undefined {
  return /^ff(\d+)$/.exec(id)?.[1];
}

function pinLabel(ff: FFDraw, pin: PinDraw, namer: Namer, indexed: boolean): Label {
  if (pin.name === 'q' || pin.name === 'qn') {
    const q: Label = indexed ? namer.label(ff.def.q) : [{ base: 'Q' }];
    return pin.name === 'q' ? q : [{ ...q[0]!, bar: true }, ...q.slice(1)];
  }
  const index = indexed ? ffIndex(ff.id) : undefined;
  const text = PIN_TEXT[pin.name] ?? '';
  return pin.name === 'clr' || pin.name === 'pr' || index === undefined ? [{ base: text }] : parseLabel(`${text}_${index}`);
}

function FFSymbol({ ff, namer, named, indexed }: { ff: FFDraw; namer: Namer; named: boolean; indexed: boolean }) {
  const { x, y, w, h } = ff;
  const index = ffIndex(ff.id);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke={INK} strokeWidth={1.4} />
      {named && index !== undefined && (
        <SvgLabel label={parseLabel(`FF_${index}`)} x={x + w / 2} y={y - 6} anchor="middle" size={12} bold fill={INK} />
      )}
      {ff.pins.map((pin) => {
        const edgeX = pin.side === 'left' ? x : pin.side === 'right' ? x + w : pin.x;
        const edgeY = pin.side === 'top' ? y : pin.side === 'bottom' ? y + h : pin.y;
        const bubble = pin.bubble && (
          <circle cx={(edgeX + pin.x) / 2} cy={(edgeY + pin.y) / 2} r={3} fill="#fff" stroke={INK} strokeWidth={1.2} />
        );
        if (pin.name === 'ck') {
          return (
            <g key={pin.key}>
              <path d={`M${x},${pin.y - 5} L${x + 8},${pin.y} L${x},${pin.y + 5}`} fill="none" stroke={INK} strokeWidth={1.2} />
              {bubble}
            </g>
          );
        }
        // スライドのレジスタ（D-FF）は、使わない Q̄ を書かない。
        if (pin.name === 'qn' && !indexed && !pin.connected && ff.def.type === 'D') return null;
        const label = pinLabel(ff, pin, namer, indexed);
        const small = pin.name === 'clr' || pin.name === 'pr';
        return (
          <g key={pin.key}>
            {pin.side === 'left' && <SvgLabel label={label} x={x + 4} y={pin.y + 4} size={11} />}
            {pin.side === 'right' && <SvgLabel label={label} x={x + w - 4} y={pin.y + 4} size={11} anchor="end" />}
            {pin.side === 'bottom' && <SvgLabel label={label} x={pin.x} y={y + h - 3} size={small ? 7 : 11} anchor="middle" />}
            {pin.side === 'top' && <SvgLabel label={label} x={pin.x} y={y + 9} size={small ? 7 : 11} anchor="middle" />}
            {bubble}
          </g>
        );
      })}
    </g>
  );
}

function GateSymbol({ gate }: { gate: GateDraw }) {
  const { op } = gate;
  // 右向きの形を描いて、向きに合わせて反転・回転する。w は入力から出力への長さ。
  const { length: w, breadth: h } = gateSize(op, gate.inputs);
  const and = `M0,0 H${w - h / 2} A${h / 2},${h / 2} 0 0 1 ${w - h / 2},${h} H0 Z`;
  const or = `M0,0 Q${w * 0.6},0 ${w},${h / 2} Q${w * 0.6},${h} 0,${h} Q${w * 0.28},${h / 2} 0,0 Z`;
  const body = op === 'NOT' ? `M0,0 L${w},${h / 2} L0,${h} Z` : op === 'AND' || op === 'NAND' ? and : or;
  const curved = op === 'OR' || op === 'NOR' || op === 'XOR';
  const bubble = op === 'NOT' || op === 'NAND' || op === 'NOR';
  const transform =
    gate.dir === 'left'
      ? `translate(${gate.x + w},${gate.y}) scale(-1,1)`
      : gate.dir === 'down'
        ? `translate(${gate.x + h},${gate.y}) rotate(90)`
        : `translate(${gate.x},${gate.y})`;
  return (
    <g transform={transform}>
      {/* OR 系は入力側がへこんでいるので、入力の線を少し中まで伸ばす */}
      {curved &&
        Array.from({ length: gate.inputs }, (_, i) => {
          const py = (h * (i + 0.5)) / gate.inputs;
          return <line key={i} x1={0} x2={w * 0.14} y1={py} y2={py} stroke={INK} strokeWidth={1.2} />;
        })}
      <path d={body} fill="#fff" stroke={INK} strokeWidth={1.4} />
      {op === 'XOR' && <path d={`M-5,0 Q${w * 0.28 - 5},${h / 2} -5,${h}`} fill="none" stroke={INK} strokeWidth={1.4} />}
      {bubble && <circle cx={w + 3.5} cy={h / 2} r={3} fill="#fff" stroke={INK} strokeWidth={1.2} />}
    </g>
  );
}

/** 電源の丸 → 抵抗 → LED。下端（y+58）が配線につながる。信号が 0 のとき点灯。 */
function LedSymbol({ led, lit }: { led: Led; lit: boolean }) {
  const { x, y } = led;
  const zig = `M${x},${y + 10} l4,2 l-8,4 l8,4 l-8,4 l8,4 l-4,2`;
  return (
    <g stroke={INK} strokeWidth={1.2} fill="none">
      <circle cx={x} cy={y} r={4} />
      <line x1={x - 4} x2={x + 4} y1={y} y2={y} />
      <line x1={x} x2={x} y1={y - 4} y2={y + 10} />
      <path d={zig} />
      <line x1={x} x2={x} y1={y + 30} y2={y + 36} />
      <path d={`M${x - 7},${y + 36} H${x + 7} L${x},${y + 48} Z`} fill={lit ? '#facc15' : '#fff'} />
      <line x1={x - 7} x2={x + 7} y1={y + 48} y2={y + 48} />
      <line x1={x} x2={x} y1={y + 48} y2={y + 58} />
      {lit && <path d={`M${x + 10},${y + 38} l6,-5 M${x + 11},${y + 45} l6,-5`} stroke="#ca8a04" />}
    </g>
  );
}

export function Schematic({ drawing, namer, values, changed }: Props) {
  const level = (ref: Ref): Level => (typeof ref === 'string' ? (values[ref] ?? 0) : ref);
  return (
    <div className="schematic">
      <svg width={drawing.width} height={drawing.height}>
        {drawing.frames.map((f, i) => (
          <rect
            key={i}
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={6}
            fill="none"
            stroke={f.color ?? '#6b7280'}
            strokeWidth={1.2}
            strokeDasharray={f.color ? '5 3' : '2 3'}
          />
        ))}
        {drawing.nets.map((net) => {
          const color = level(net.ref) === 1 ? WIRE_HIGH : WIRE_LOW;
          const hot = typeof net.ref === 'string' && changed.has(net.ref);
          return (
            <g key={net.key}>
              {net.segs.map((s, i) => (
                <line
                  key={i}
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke={color}
                  strokeWidth={hot ? 3.2 : 2}
                  strokeLinecap={s.dashed ? 'butt' : 'square'}
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                />
              ))}
              {net.dots.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.2} fill={color} />
              ))}
              {net.labels.map((label, i) => (
                <SvgLabel
                  key={i}
                  label={label.signal !== undefined ? namer.label(label.signal) : parseLabel(label.text ?? '')}
                  x={label.x}
                  y={label.y}
                  anchor={label.anchor}
                  size={13}
                  bold={hot}
                  fill={INK}
                />
              ))}
            </g>
          );
        })}
        {drawing.breaks.map((p, i) => (
          <g key={i}>
            <rect x={p.x - 5} y={p.y - 4} width={10} height={8} fill="#fff" />
            <path d={`M${p.x - 6},${p.y + 6} l5,-12 M${p.x + 1},${p.y + 6} l5,-12`} stroke={INK} strokeWidth={1.2} fill="none" />
          </g>
        ))}
        {drawing.gates.map((gate) => (
          <GateSymbol key={gate.id} gate={gate} />
        ))}
        {drawing.leds.map((led, i) => (
          <LedSymbol key={i} led={led} lit={level(led.signal) === 0} />
        ))}
        {drawing.ffs.map((ff) => (
          <FFSymbol key={ff.id} ff={ff} namer={namer} named={drawing.ffNames} indexed={drawing.pinIndex} />
        ))}
        {drawing.notes.map((note, i) =>
          note.label !== undefined ? (
            <SvgLabel key={i} label={parseLabel(note.label)} x={note.x} y={note.y} anchor={note.anchor} size={11} fill={note.color ?? '#4b5563'} />
          ) : (
            <text key={i} x={note.x} y={note.y} fontSize={11} textAnchor={note.anchor ?? 'start'} fill={note.color ?? '#4b5563'}>
              {note.text}
            </text>
          ),
        )}
      </svg>
      <p className="legend">
        <svg width={26} height={10}>
          <line x1={2} x2={24} y1={5} y2={5} stroke={WIRE_HIGH} strokeWidth={2.4} />
        </svg>
        H（1）
        <svg width={26} height={10}>
          <line x1={2} x2={24} y1={5} y2={5} stroke={WIRE_LOW} strokeWidth={2.4} />
        </svg>
        L（0）　太い線はいまのステップで変化した信号。丸印は立下りトリガ／負論理。
      </p>
    </div>
  );
}
