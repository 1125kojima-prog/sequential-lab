/** 命令実行サイクルのアニメーション（第22回 p.11〜24）。値と矢印は src/cpu/cycle.ts が計算したもの。 */
import { useEffect, useMemo } from 'react';
import { memPart, PHASES, runProgram, SLIDE_PROGRAM, STAGES, type Arrow, type Frame, type Part } from '../cpu/cycle';

type Box = { x: number; y: number; w: number; h: number };

const CPU: Box = { x: 14, y: 40, w: 386, h: 296 };
const LEFT_X = 30;
const RIGHT_X = 214;
const BOXES: Record<string, Box> = {
  ir: { x: LEFT_X, y: 56, w: 166, h: 44 },
  dec: { x: LEFT_X, y: 124, w: 166, h: 74 },
  alu: { x: LEFT_X + 8, y: 232, w: 150, h: 76 },
  pc: { x: RIGHT_X, y: 56, w: 170, h: 36 },
  ar0: { x: RIGHT_X, y: 104, w: 170, h: 36 },
  ar1: { x: RIGHT_X, y: 140, w: 170, h: 36 },
  gr0: { x: RIGHT_X, y: 176, w: 170, h: 36 },
  gr1: { x: RIGHT_X, y: 212, w: 170, h: 36 },
  gr2: { x: RIGHT_X, y: 248, w: 170, h: 36 },
};
const MEM_ADDR_X = 520;
const MEM_X = 540;
const MEM_W = 220;
const MEM_TOP = 56;
const ROW_H = 30;

const RED = '#dc2626';
const BLUE = '#2563eb';
const CHANGED_FILL = '#fde68a';
const USED_STROKE = '#2563eb';

type MemRow = { kind: 'gap' } | { kind: 'cell'; addr: number };

/** メモリの表に出す行：使う番地を並べ、離れているところに「⋮」を入れる（スライドと同じ形）。 */
function memoryRows(frames: Frame[]): MemRow[] {
  const addrs = new Set<number>();
  for (const f of frames) for (const a of Object.keys(f.machine.mem)) addrs.add(Number(a));
  const sorted = [...addrs].sort((a, b) => a - b);
  const rows: MemRow[] = [{ kind: 'gap' }];
  sorted.forEach((a, i) => {
    if (i > 0 && a !== sorted[i - 1]! + 1) rows.push({ kind: 'gap' });
    rows.push({ kind: 'cell', addr: a });
  });
  rows.push({ kind: 'gap' });
  return rows;
}

function boxOf(part: Part, rowY: Map<number, number>): Box {
  if (part.startsWith('m')) {
    const y = rowY.get(Number(part.slice(1))) ?? MEM_TOP;
    return { x: MEM_X, y, w: MEM_W, h: ROW_H };
  }
  return BOXES[part]!;
}

/** 矢印の端点。アドレスで指す矢印はメモリの「番地」へ、データの矢印はメモリの「中身」から出入りする。 */
function anchor(part: Part, other: Part, kind: Arrow['kind'], rowY: Map<number, number>, end: 'from' | 'to'): [number, number] {
  const b = boxOf(part, rowY);
  if (part.startsWith('m')) {
    if (kind === 'addr') return [MEM_ADDR_X - 44, b.y + b.h / 2];
    return [b.x + b.w / 2 - 24, b.y + b.h / 2];
  }
  const o = boxOf(other, rowY);
  // 同じ列の中なら右端どうし、ALU とは上下、それ以外は相手の側の辺。
  if (part === 'alu') return end === 'to' ? [b.x + b.w / 2 + (o.y < 180 ? 0 : 30), b.y + 4] : [b.x + b.w - 24, b.y + b.h / 2];
  if (other === 'alu' && end === 'from') return [b.x, b.y + b.h / 2];
  if (o.x > b.x + b.w || other.startsWith('m')) return [b.x + b.w, b.y + b.h / 2];
  if (o.x + o.w < b.x) return [b.x, b.y + b.h / 2];
  return [b.x + b.w, b.y + b.h / 2];
}

function arrowPath(a: Arrow, rowY: Map<number, number>): string {
  const [x1, y1] = anchor(a.from, a.to, a.kind, rowY, 'from');
  const [x2, y2] = anchor(a.to, a.from, a.kind, rowY, 'to');
  const sameColumn = Math.abs(x1 - x2) < 4;
  if (sameColumn) {
    const bulge = 36 + Math.abs(y2 - y1) * 0.25;
    return `M${x1},${y1} C${x1 + bulge},${y1} ${x2 + bulge},${y2} ${x2},${y2}`;
  }
  // メモリから命令レジスタへのデータは、スライドのように CPU の上を回る。
  if (a.kind === 'data' && a.from.startsWith('m') && a.to === 'ir') {
    const ir = BOXES.ir!;
    const tx = ir.x + ir.w / 2 + 40;
    return `M${x1},${y1} C${x1},${CPU.y - 34} ${tx + 60},${CPU.y - 34} ${tx},${ir.y}`;
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - (a.kind === 'data' ? 40 : 0);
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
}

type Props = { index: number; onMove: (index: number) => void };

export function CpuCycle({ index, onMove }: Props) {
  const frames = useMemo(() => runProgram(SLIDE_PROGRAM), []);
  const last = frames.length - 1;
  const i = Math.min(Math.max(index, 0), last);
  const f = frames[i]!;
  const m = f.machine;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') onMove(Math.min(i + 1, last));
      else if (e.key === 'ArrowLeft') onMove(Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, last, onMove]);

  const rows = useMemo(() => memoryRows(frames), [frames]);
  const rowY = new Map<number, number>();
  rows.forEach((r, k) => {
    if (r.kind === 'cell') rowY.set(r.addr, MEM_TOP + k * ROW_H);
  });
  const height = Math.max(CPU.y + CPU.h, MEM_TOP + rows.length * ROW_H) + 16;
  const changed = new Set(f.changed);
  const used = new Set(f.used);
  const fill = (p: Part): string => (changed.has(p) ? CHANGED_FILL : '#fff');
  const stroke = (p: Part): string => (used.has(p) ? USED_STROKE : '#374151');
  const strokeW = (p: Part): number => (used.has(p) || changed.has(p) ? 2.2 : 1.2);
  const pointed = new Set(f.arrows.filter((a) => a.kind === 'addr').map((a) => a.to));

  const reg = (part: Part, label: string, value: number | null, extra?: string) => {
    const b = BOXES[part]!;
    return (
      <g key={part}>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill(part)} stroke={stroke(part)} strokeWidth={strokeW(part)} />
        <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 5} textAnchor="middle" fontSize={15}>
          {value === null ? (
            <>
              {extra}
              <tspan fontWeight={700}>{label}</tspan>
            </>
          ) : (
            <>
              <tspan fontWeight={700}>{label}</tspan>：
              <tspan fill={changed.has(part) ? BLUE : '#111827'} fontWeight={700}>
                {value}
              </tspan>
            </>
          )}
        </text>
      </g>
    );
  };

  const alu = BOXES.alu!;
  const aluPoly = [
    [alu.x, alu.y],
    [alu.x + alu.w / 2 - 12, alu.y],
    [alu.x + alu.w / 2, alu.y + 14],
    [alu.x + alu.w / 2 + 12, alu.y],
    [alu.x + alu.w, alu.y],
    [alu.x + alu.w - 38, alu.y + alu.h],
    [alu.x + 38, alu.y + alu.h],
  ]
    .map((p) => p.join(','))
    .join(' ');

  return (
    <div className="cpu-cycle">
      <header>
        <h2>命令実行サイクル</h2>
        <p className="muted">スライド 22 p.11〜24　／　ノイマン型の計算機で、メインメモリの命令を1つずつ実行する流れ</p>
      </header>

      <section className="panel step-panel">
        <div className="step-buttons">
          <button onClick={() => onMove(0)} disabled={i === 0}>
            ⏮ 最初へ
          </button>
          <button onClick={() => onMove(i - 1)} disabled={i === 0}>
            ◀ 前へ
          </button>
          <button className="primary" onClick={() => onMove(i + 1)} disabled={i >= last}>
            次へ ▶
          </button>
          <button onClick={() => onMove(last)} disabled={i >= last}>
            最後へ ⏭
          </button>
          <span className="muted">
            {i} / {last}（← → キーでも動く）　スライド p.{f.slide}
          </span>
        </div>
        <ol className="cpu-stages">
          {STAGES.map((s) => (
            <li key={s.id} className={f.stage === s.id ? 'current' : ''} title={s.what}>
              {s.name}
            </li>
          ))}
        </ol>
        <h3>
          {f.text[0]}
          {f.instr > 0 && <span className="muted">（{f.instr}命令目：{frames.find((g) => g.instr === f.instr)!.machine.ir}）</span>}
        </h3>
        {f.text.slice(1).map((t, k) => (
          <p key={k}>{t}</p>
        ))}
      </section>

      <section className="panel schematic">
        <svg viewBox={`0 0 780 ${height}`} width="100%" style={{ maxWidth: 900 }} role="img" aria-label="CPU とメインメモリ">
          <defs>
            {[
              ['addr', RED],
              ['data', BLUE],
            ].map(([id, color]) => (
              <marker key={id} id={`cpu-arrow-${id}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
            ))}
          </defs>

          <text x={CPU.x + 90} y={CPU.y - 10} fontSize={14}>
            プロセッサ（CPU）
          </text>
          <rect x={CPU.x} y={CPU.y} width={CPU.w} height={CPU.h} fill="none" stroke="#374151" />

          {/* 命令レジスタ */}
          <rect x={BOXES.ir!.x} y={BOXES.ir!.y} width={BOXES.ir!.w} height={BOXES.ir!.h} fill={fill('ir')} stroke={stroke('ir')} strokeWidth={strokeW('ir')} />
          <text x={BOXES.ir!.x + BOXES.ir!.w / 2} y={BOXES.ir!.y + BOXES.ir!.h / 2 + 5} textAnchor="middle" fontSize={m.ir ? 13 : 15} fill={m.ir && changed.has('ir') ? BLUE : '#111827'}>
            {m.ir ?? '命令レジスタ'}
          </text>
          <path d={`M${LEFT_X + 70},${BOXES.ir!.y + BOXES.ir!.h + 4} h26 v6 h10 l-23,12 l-23,-12 h10 z`} fill="#111827" />

          {/* デコーダ */}
          <rect x={BOXES.dec!.x} y={BOXES.dec!.y} width={BOXES.dec!.w} height={BOXES.dec!.h} fill={fill('dec')} stroke={stroke('dec')} strokeWidth={strokeW('dec')} />
          {f.decoded ? (
            <text x={BOXES.dec!.x + BOXES.dec!.w / 2} y={BOXES.dec!.y + 22} textAnchor="middle" fontSize={13}>
              <tspan x={BOXES.dec!.x + BOXES.dec!.w / 2}>オペコード：{f.decoded.opcode}</tspan>
              <tspan x={BOXES.dec!.x + BOXES.dec!.w / 2} dy={19}>
                オペランド：
              </tspan>
              <tspan x={BOXES.dec!.x + BOXES.dec!.w / 2} dy={19} fill={RED} fontWeight={700}>
                {f.decoded.operands}
              </tspan>
            </text>
          ) : (
            <text x={BOXES.dec!.x + BOXES.dec!.w / 2} y={BOXES.dec!.y + BOXES.dec!.h / 2 + 5} textAnchor="middle" fontSize={15}>
              デコーダ
            </text>
          )}

          {/* ALU */}
          <polygon points={aluPoly} fill={used.has('alu') ? CHANGED_FILL : '#fff'} stroke={stroke('alu')} strokeWidth={strokeW('alu')} />
          <text x={alu.x + alu.w / 2} y={alu.y + 50} textAnchor="middle" fontSize={18}>
            ALU
          </text>

          {/* PC とレジスタ */}
          {reg('pc', 'PC', m.pc)}
          {reg('ar0', 'AR0', m.ar0, 'ALUラッチ ')}
          {reg('ar1', 'AR1', m.ar1, 'ALUラッチ ')}
          {reg('gr0', 'GR0', m.gr.GR0, 'レジスタ ')}
          {reg('gr1', 'GR1', m.gr.GR1, 'レジスタ ')}
          {reg('gr2', 'GR2', m.gr.GR2, 'レジスタ ')}

          {/* メインメモリ */}
          <text x={MEM_ADDR_X - 50} y={MEM_TOP - 10} fontSize={14}>
            アドレス
          </text>
          <text x={MEM_X + 60} y={MEM_TOP - 10} fontSize={14}>
            メインメモリ
          </text>
          {rows.map((r, k) => {
            const y = MEM_TOP + k * ROW_H;
            if (r.kind === 'gap')
              return (
                <g key={`gap${k}`}>
                  <rect x={MEM_X} y={y} width={MEM_W} height={ROW_H} fill="#fff" stroke="#374151" />
                  <text x={MEM_ADDR_X - 22} y={y + 20} textAnchor="middle" fontSize={15}>
                    ⋮
                  </text>
                </g>
              );
            const part = memPart(r.addr);
            const v = m.mem[r.addr];
            const isPc = m.pc === r.addr && f.stage === 'fetch' && f.changed.includes('ir');
            return (
              <g key={r.addr}>
                <rect x={MEM_X} y={y} width={MEM_W} height={ROW_H} fill={fill(part)} stroke={used.has(part) ? USED_STROKE : '#374151'} strokeWidth={used.has(part) ? 2.2 : 1} />
                <text x={MEM_ADDR_X} y={y + 20} textAnchor="end" fontSize={15} fontWeight={700} fill={pointed.has(part) || isPc ? RED : '#111827'}>
                  {r.addr}
                </text>
                <text
                  x={typeof v === 'number' ? MEM_X + MEM_W / 2 : MEM_X + 10}
                  y={y + 20}
                  textAnchor={typeof v === 'number' ? 'middle' : 'start'}
                  fontSize={14}
                  fill={used.has(part) || changed.has(part) ? BLUE : '#111827'}
                >
                  {v ?? ''}
                </text>
              </g>
            );
          })}

          {/* 矢印 */}
          {f.arrows.map((a, k) => (
            <path
              key={k}
              d={arrowPath(a, rowY)}
              fill="none"
              stroke={a.kind === 'addr' ? RED : BLUE}
              strokeWidth={2}
              markerEnd={`url(#cpu-arrow-${a.kind})`}
            />
          ))}
        </svg>
        <p className="legend">
          <span style={{ color: RED }}>━ 赤：アドレスで指す</span>　<span style={{ color: BLUE }}>━ 青：データが移る</span>
          <span style={{ background: CHANGED_FILL, padding: '0 4px' }}>黄色：このステップで値が変わった</span>
          <span style={{ color: USED_STROKE }}>青い枠：読んだところ</span>
        </p>
      </section>

      <div className="below">
        <section className="panel">
          <h3>スライドの3段階（p.13〜24）</h3>
          <ol className="cpu-phases">
            {PHASES.map((p) => (
              <li key={p.no} className={f.phase === p.no ? 'current' : ''}>
                <strong>{p.name}</strong>
                {p.what.map((w, k) => (
                  <div key={k}>{w}</div>
                ))}
              </li>
            ))}
          </ol>
          <p className="muted">
            p.11 の5つの処理との対応：命令の取得＝命令フェッチ、命令の解読＝命令デコード・実効アドレス計算・オペランド読み出し、命令の実行＝命令実行。
          </p>
        </section>
        <section className="panel cpu-defs">
          <h3>例で登場する命令（MIPS ライク）</h3>
          <dl>
            <dt>add $s1, $s2, $s3</dt>
            <dd>$s1 に「$s2 ＋ $s3」の結果を格納</dd>
            <dt>sub $s1, $s2, $s3</dt>
            <dd>$s1 に「$s2 − $s3」の結果を格納</dd>
            <dt>sw $s1, N($s2)</dt>
            <dd>$s1 の内容をアドレス「N ＋ $s2」に格納</dd>
          </dl>
          <p className="muted">実際は命令、データ、アドレスはすべて2進数で格納されている。</p>
        </section>
      </div>
    </div>
  );
}
