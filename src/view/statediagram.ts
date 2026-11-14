/**
 * 状態遷移図の作図。状態を丸、遷移を矢印で描くための座標を求める。UI には依存しない。
 * - specDiagram：設計ガイドの状態遷移表（ミーリー型／ムーア型／カウンタ）の図。
 * - circuitDiagram：回路の全状態（FF の値の全組み合わせ）について、クロック1回での行き先をエンジンで求めた図。
 */
import { bitsText, type FsmSpec } from '../design/fsm';
import { busAt } from '../engine/sample';
import { simulate } from '../engine/simulate';
import { clock, withInputs } from '../engine/stimulus';
import type { Circuit, Level, Trigger } from '../engine/types';
import { resetLevel } from './chart';

export type DiagramNode = {
  id: number;
  /** 丸の中の1行目。 */
  label: string;
  /** 丸の中の2行目（ムーア型の出力など）。 */
  sub?: string;
  x: number;
  y: number;
  r: number;
  /** 定常ループ（周期的に回る状態）に入っている。 */
  onLoop?: boolean;
};

export type DiagramEdge = {
  from: number;
  to: number;
  label: string;
  /** SVG の path。 */
  d: string;
  labelX: number;
  labelY: number;
  onLoop?: boolean;
};

export type Diagram = { width: number; height: number; nodes: DiagramNode[]; edges: DiagramEdge[] };

type Pt = { x: number; y: number };

/** from から to への矢印。bend が 0 でなければ、進む向きの右側へふくらませる。 */
function arrow(a: DiagramNode, b: DiagramNode, bend: number): { d: string; label: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // 右側の法線。
  const nx = -uy;
  const ny = ux;
  const mid = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
  const trim = (from: DiagramNode, toward: Pt, extra: number): Pt => {
    const l = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
    return { x: from.x + ((toward.x - from.x) / l) * (from.r + extra), y: from.y + ((toward.y - from.y) / l) * (from.r + extra) };
  };
  const p0 = trim(a, mid, 0);
  const p1 = trim(b, mid, 3);
  const f = (v: number): string => v.toFixed(1);
  const d =
    bend === 0
      ? `M${f(p0.x)},${f(p0.y)} L${f(p1.x)},${f(p1.y)}`
      : `M${f(p0.x)},${f(p0.y)} Q${f(mid.x + nx * bend)},${f(mid.y + ny * bend)} ${f(p1.x)},${f(p1.y)}`;
  const off = bend === 0 ? 10 : bend * 1.5 + Math.sign(bend) * 10;
  return { d, label: { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off + 4 } };
}

/** 自分に戻る矢印。(ox, oy) の向き（中心から外向き）に輪を描く。 */
function selfLoop(a: DiagramNode, ox: number, oy: number): { d: string; label: Pt } {
  const l = Math.hypot(ox, oy) || 1;
  const ux = ox / l;
  const uy = oy / l;
  const px = -uy;
  const py = ux;
  const f = (v: number): string => v.toFixed(1);
  const start = { x: a.x + ux * a.r * 0.8 + px * a.r * 0.6, y: a.y + uy * a.r * 0.8 + py * a.r * 0.6 };
  const end = { x: a.x + ux * a.r * 0.86 - px * a.r * 0.62, y: a.y + uy * a.r * 0.86 - py * a.r * 0.62 };
  const c1 = { x: a.x + ux * (a.r + 44) + px * 26, y: a.y + uy * (a.r + 44) + py * 26 };
  const c2 = { x: a.x + ux * (a.r + 44) - px * 26, y: a.y + uy * (a.r + 44) - py * 26 };
  return {
    d: `M${f(start.x)},${f(start.y)} C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(end.x)},${f(end.y)}`,
    label: { x: a.x + ux * (a.r + 44), y: a.y + uy * (a.r + 44) + 4 },
  };
}

/** 状態遷移表の図。状態を円周に並べ、同じ行き先の遷移は1本にまとめてラベルを並べる。 */
export function specDiagram(spec: FsmSpec): Diagram {
  const n = spec.states.length;
  const m = spec.inputVars.length;
  const w = spec.outputVars.length;
  const r = 36;
  const radius = Math.max(95, n * 34);
  const pad = r + 84;
  const cx = radius + pad;
  const cy = radius + pad;
  const nodes: DiagramNode[] = spec.states.map((name, k) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * k) / n;
    const node: DiagramNode = { id: k, label: name, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r };
    // ムーア型は、丸の中に出力を書く。
    if (spec.machine === 'moore' && w > 0) node.sub = bitsText(spec.out[k]?.[0] ?? null, w);
    return node;
  });

  const labels = new Map<string, string[]>();
  spec.states.forEach((_, s) => {
    for (let x = 0; x < 2 ** m; x++) {
      const to = spec.next[s]?.[x];
      if (to === null || to === undefined) continue;
      const input = m > 0 ? bitsText(x, m) : '';
      const text = spec.machine === 'mealy' && w > 0 ? `${input}/${bitsText(spec.out[s]?.[x] ?? null, w)}` : input;
      const key = `${s}>${to}`;
      labels.set(key, [...(labels.get(key) ?? []), text]);
    }
  });

  const edges: DiagramEdge[] = [];
  for (const [key, texts] of labels) {
    const [from, to] = key.split('>').map(Number) as [number, number];
    const a = nodes[from]!;
    const b = nodes[to]!;
    const label = texts.filter((t) => t !== '').join(', ');
    const shape = from === to ? selfLoop(a, a.x - cx, a.y - cy || -1) : arrow(a, b, labels.has(`${to}>${from}`) ? 16 : 0);
    edges.push({ from, to, label, d: shape.d, labelX: shape.label.x, labelY: shape.label.y });
  }
  return { width: 2 * cx, height: 2 * cy, nodes, edges };
}

export type Transitions = {
  /** next[状態の値] = 次の状態の値。 */
  next: number[];
  /** その状態を保てず、クロックを待たずに次の状態へ移る（リセット信号が出る状態など）。 */
  transient: boolean[];
};

/** 回路の各状態について、クロック1回での次の状態を求める。 */
export function nextStates(circuit: Circuit, bits: readonly string[], clockSignal: string, edge: Trigger, extra: Record<string, Level> = {}): Transitions {
  const ffOf = bits.map((bit) => {
    const found = circuit.components.find((comp) => comp.kind === 'ff' && comp.q === bit);
    if (!found) throw new Error(`FF の出力ではありません: ${bit}`);
    return found.id;
  });
  const stimulus = withInputs(clock({ signal: clockSignal, edge, period: 100, edges: 1 }), extra);
  const next: number[] = [];
  const transient: boolean[] = [];
  for (let state = 0; state < 2 ** bits.length; state++) {
    const init: Record<string, Level> = {};
    ffOf.forEach((id, i) => {
      init[id] = ((state >> (bits.length - 1 - i)) & 1) as Level;
    });
    const trace = simulate(circuit, stimulus, { mode: 'ideal', init });
    // その値を保てない状態（リセット信号が出るなど）は、t=0 で別の値に落ち着く。行き先はその値にする。
    const settled = parseInt(busAt(trace, bits, 0), 2);
    transient.push(settled !== state);
    next.push(settled !== state ? settled : parseInt(busAt(trace, bits, trace.end), 2));
  }
  return { next, transient };
}

/**
 * 行き先が1つずつ決まっている図（カウンタの全状態）の配置。
 * 周期的に回る状態（定常ループ）を内側の円に、そこへ流れ込む状態を外側に並べる。
 */
export function functionalDiagram(next: readonly number[], labelOf: (state: number) => string, edgeLabel: (state: number) => string = () => ''): Diagram {
  const n = next.length;
  // ---- ループに入っている状態を見つける ----
  const onLoop = Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    let p = s;
    for (let i = 0; i < n; i++) p = next[p]!;
    // n 回進めば必ずループの上にいる。
    let q = p;
    do {
      onLoop[q] = true;
      q = next[q]!;
    } while (q !== p);
  }
  // ---- ループごとにまとめる ----
  const loops: number[][] = [];
  const loopIndex = Array<number>(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (!onLoop[s] || loopIndex[s]! >= 0) continue;
    const members: number[] = [];
    let p = s;
    do {
      loopIndex[p] = loops.length;
      members.push(p);
      p = next[p]!;
    } while (p !== s);
    loops.push(members);
  }
  const children = new Map<number, number[]>();
  for (let s = 0; s < n; s++) {
    if (onLoop[s]) continue;
    children.set(next[s]!, [...(children.get(next[s]!) ?? []), s]);
  }
  const leaves = (s: number): number => {
    const kids = children.get(s) ?? [];
    return kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + leaves(k), 0);
  };

  const r = 26;
  const ring = 78;
  const nodes: DiagramNode[] = [];
  const pos = new Map<number, DiagramNode>();
  let offsetX = 0;
  let height = 0;

  /** 隣り合う丸の中心の間隔（丸の直径＋すき間）。 */
  const gap = 2 * r + 12;
  loops.forEach((members) => {
    const k = members.length;
    const inner = k === 1 ? 0 : Math.max(52, (k * gap) / (2 * Math.PI));
    const local: { s: number; angle: number; radius: number }[] = [];
    const place = (s: number, angle: number, radius: number, sector: number): void => {
      local.push({ s, angle, radius });
      const kids = children.get(s) ?? [];
      const total = kids.reduce((sum, c) => sum + leaves(c), 0);
      // 子が多い段は、弧の上で丸どうしが重ならない半径まで広げる。
      const next = Math.max(radius + ring, (total * gap) / sector);
      let start = angle - sector / 2;
      for (const c of kids) {
        const share = (sector * leaves(c)) / total;
        place(c, start + share / 2, next, share);
        start += share;
      }
    };
    members.forEach((s, i) => {
      // ループは時計回りに並べる。
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / k;
      place(s, angle, inner, (2 * Math.PI) / k);
    });
    const size = Math.max(...local.map((item) => item.radius)) + r + 44;
    const cx = offsetX + size;
    offsetX += 2 * size;
    height = Math.max(height, 2 * size);
    for (const item of local) {
      const node: DiagramNode = {
        id: item.s,
        label: labelOf(item.s),
        x: cx + item.radius * Math.cos(item.angle),
        y: item.radius * Math.sin(item.angle),
        r,
        onLoop: onLoop[item.s]!,
      };
      nodes.push(node);
      pos.set(item.s, node);
    }
  });
  // 自分に戻る矢印とラベルが枠からはみ出さないように、まわりに余白を取る。
  const PAD = 34;
  for (const node of nodes) {
    node.x += PAD;
    node.y += height / 2 + PAD;
  }

  const edges: DiagramEdge[] = [];
  for (let s = 0; s < n; s++) {
    const a = pos.get(s)!;
    const b = pos.get(next[s]!)!;
    const loop = onLoop[s]! && onLoop[next[s]!]!;
    if (s === next[s]) {
      const shape = selfLoop(a, 0, -1);
      edges.push({ from: s, to: s, label: edgeLabel(s), d: shape.d, labelX: shape.label.x, labelY: shape.label.y, onLoop: true });
    } else {
      // 2状態のループは、行きと帰りが重ならないようにふくらませる。
      const bend = loop && next[next[s]!] === s ? 14 : 0;
      const shape = arrow(a, b, bend);
      edges.push({ from: s, to: next[s]!, label: edgeLabel(s), d: shape.d, labelX: shape.label.x, labelY: shape.label.y, onLoop: loop });
    }
  }
  nodes.sort((a, b) => a.id - b.id);
  return { width: Math.max(offsetX, 2 * (r + 44)) + 2 * PAD, height: Math.max(height, 2 * (r + 60)) + 2 * PAD, nodes, edges };
}

/** 回路の全状態の状態遷移図。 */
export function circuitDiagram(circuit: Circuit, bits: readonly string[], clockSignal: string, edge: Trigger, extra: Record<string, Level> = {}): { diagram: Diagram } & Transitions {
  const t = nextStates(circuit, bits, clockSignal, edge, extra);
  const diagram = functionalDiagram(t.next, (s) => bitsText(s, bits.length), (s) => (t.transient[s] ? 'すぐ' : ''));
  return { diagram, ...t };
}

/**
 * 場面の回路の全状態の図。クロックと CLR 以外の入力がなく、FF が5個以下の回路だけ描ける。
 * CLR は、働いていない側の値（状態が動く側）にする。どちらで働くかは回路から求める。
 */
export function sceneDiagram(scene: { circuit: Circuit; stateBits: readonly string[]; clock: string; edge: Trigger }): ({ diagram: Diagram } & Transitions) | undefined {
  const { circuit, stateBits, clock: clockSignal, edge } = scene;
  const ffs = circuit.components.filter((comp) => comp.kind === 'ff');
  const others = circuit.inputs.filter((name) => name !== clockSignal);
  if (others.some((name) => name !== 'clr') || ffs.length > 5 || ffs.length !== stateBits.length) return undefined;
  if (!stateBits.every((bit) => ffs.some((f) => f.kind === 'ff' && f.q === bit))) return undefined;
  if (others.length === 0) return circuitDiagram(circuit, stateBits, clockSignal, edge);
  const active = resetLevel(circuit);
  if (active === undefined) return undefined;
  return circuitDiagram(circuit, stateBits, clockSignal, edge, { clr: active === 1 ? 0 : 1 });
}
