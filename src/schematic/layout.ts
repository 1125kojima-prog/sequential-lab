/**
 * 回路図の作図。素子の座標（LayoutSpec）と回路の接続から、描く線分・点・ラベルを求める。
 * UI には依存しない。接続そのものは回路（Circuit）から取るので、配置を変えても電気的な意味は変わらない。
 *
 * 配線の決め方（信号ごと）：
 * - 出どころ（FF の Q／Q̄、ゲートの出力、外部入力の端子）から縦の線（幹）を引く。
 *   幹の x は出どころのすぐ横。spineX で離れた位置に動かせる（出どころからは横線でつなぐ）。
 * - 行き先の端子は、次のどちらかでつなぐ。
 *   - 横の母線（tracks で y を決めた線）へ縦に下ろす／上げる。
 *   - 端子の高さのまま、幹まで横に引く（tracks を決めていない信号、または taps に書いた端子）。
 * - outputs に書いた信号は幹を下へ伸ばして、outRight に書いた信号は右へ伸ばして、信号名を書く。
 * - 同じ素子の同じ側で同じ信号につながる端子（J と K に 1 など）は、1本の縦線から分岐させる。
 */
import { qnName } from '../engine/simulate';
import type { Circuit, Conn, DataPinName, FlipFlop, GateOp, Ref } from '../engine/types';

export type Pt = { x: number; y: number };
export type Seg = { x1: number; y1: number; x2: number; y2: number; dashed?: boolean };

export type GateDir = 'right' | 'left' | 'down';

/** 説明の文字。label を書くと、信号名の書式（view/label.ts）で描く。 */
export type Note = { x: number; y: number; text?: string; label?: string; anchor?: 'start' | 'middle' | 'end'; color?: string };
export type Frame = { x: number; y: number; w: number; h: number; color?: string };
/** LED（負論理：信号が 0 のとき点灯）。x, y は電源の丸の中心。飾りで、シミュレーションはしない。 */
export type Led = { x: number; y: number; signal: string };

export type LayoutSpec = {
  width: number;
  height: number;
  /** FF の左上の座標。キーは FF の id。 */
  ffs: Record<string, [x: number, y: number]>;
  /** ゲートの左上の座標。dir は出力の向き（既定は右）。 */
  gates?: Record<string, { at: [x: number, y: number]; dir?: GateDir }>;
  /** 外部入力と定数のラベルを置く x（既定 50）。 */
  portX?: number;
  /** 外部入力の端子の位置を個別に決める。3つ目はラベルの位置（既定は上）。 */
  ports?: Record<string, [x: number, y: number, side?: 'above' | 'left']>;
  /** 横の母線の y。キーは信号名。定数は '$1'／'$0'。 */
  tracks?: Record<string, number>;
  /** 母線ではなく、幹へ横につなぐ端子。例：'ff1.ck'、'rst.in0' */
  taps?: string[];
  /** 幹の x を出どころから離す。キーは信号名。 */
  spineX?: Record<string, number>;
  /** 下へ引き出して名前を書く信号。 */
  outputs?: string[];
  outY?: number;
  /** 右へ引き出して名前を書く信号と、その先の x。 */
  outRight?: Record<string, number>;
  /** 引き出した先に書く名前の上書き（書式は view/label.ts）。 */
  outLabels?: Record<string, string>;
  /** 信号に足す線（飾りの素子へつなぐ線）。 */
  extra?: Record<string, [x1: number, y1: number, x2: number, y2: number][]>;
  /** 点線で描く範囲（この枠に収まる線だけ）。 */
  dashed?: { net: string; box: [x1: number, y1: number, x2: number, y2: number] }[];
  /** 長い配線の省略記号を描く位置。 */
  breaks?: [x: number, y: number][];
  notes?: Note[];
  frames?: Frame[];
  leds?: Led[];
  /** FF の名前（FF₀）を箱の上に書く。 */
  ffNames?: boolean;
  /** 端子名に添字を付ける（D₀、Q₀）。false なら D、Q。既定 true。 */
  pinIndex?: boolean;
};

export type PinSide = 'left' | 'right' | 'top' | 'bottom';

export type PinDraw = {
  key: string;
  /** 'd' 'ck' 'clr' 'q' など。 */
  name: string;
  side: PinSide;
  /** 配線がつながる点。 */
  x: number;
  y: number;
  /** 丸印（立下りトリガ、負論理）。 */
  bubble: boolean;
  connected: boolean;
};

export type FFDraw = { id: string; def: FlipFlop; x: number; y: number; w: number; h: number; pins: PinDraw[] };
export type GateDraw = {
  id: string;
  op: GateOp;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: GateDir;
  inputs: number;
};

export type NetLabel = {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** 信号名（表記は UI 側で決める）。 */
  signal?: string;
  /** 書式つきの文字列（定数、上書きした名前）。 */
  text?: string;
};

export type NetDraw = {
  key: string;
  /** 色を決める信号。定数は 0／1。 */
  ref: Ref;
  segs: Seg[];
  dots: Pt[];
  labels: NetLabel[];
  /** この信号につながる端子（テスト用）。 */
  pins: Pt[];
};

export type Drawing = {
  width: number;
  height: number;
  ffs: FFDraw[];
  gates: GateDraw[];
  nets: NetDraw[];
  notes: Note[];
  frames: Frame[];
  leds: Led[];
  breaks: Pt[];
  ffNames: boolean;
  pinIndex: boolean;
};

export const FF_W = 60;
export const FF_H = 60;
const BUBBLE = 7;
const GATE_W = 36;
const NOT_W = 24;

const DATA_PINS: Record<FlipFlop['type'], DataPinName[]> = { D: ['d'], T: ['t'], JK: ['j', 'k'], RS: ['s', 'r'] };

function connRef(conn: Conn): Ref {
  return typeof conn === 'object' ? conn.from : conn;
}

/** ゲートの大きさ（右向きのとき）。length は入力から出力の向き。 */
export function gateSize(op: GateOp, inputs: number): { length: number; breadth: number; bubble: boolean } {
  if (op === 'NOT') return { length: NOT_W, breadth: 16, bubble: true };
  return { length: GATE_W, breadth: Math.max(24, inputs * 12), bubble: op === 'NAND' || op === 'NOR' };
}

type Pin = PinDraw & {
  ref: Ref;
  /** 出力端子か。 */
  drives: boolean;
  part: string;
  net: string;
  /** 配線が縦に曲がる点の x（左右の端子はスタブの先）。 */
  ax: number;
  base: number;
  step: number;
  /** -1 上へ、1 下へ、0 横のまま、2 上下の両方、3 値を書くだけ（定数）。 */
  dir: number;
};

type Net = {
  key: string;
  ref: Ref;
  source?: Pin;
  port?: Pt & { above: boolean };
  sinks: Pin[];
  trackY?: number;
  output: boolean;
  right?: number;
  constLabel?: boolean;
};

export function buildDrawing(circuit: Circuit, spec: LayoutSpec): Drawing {
  const portX = spec.portX ?? 50;
  const taps = new Set(spec.taps ?? []);
  const pins: Pin[] = [];
  const ffs: FFDraw[] = [];
  const gates: GateDraw[] = [];

  const addPin = (
    part: string,
    name: string,
    side: PinSide,
    x: number,
    y: number,
    ref: Ref,
    drives: boolean,
    bubble: boolean,
    base: number,
    step: number,
  ): Pin => {
    const off = bubble ? BUBBLE : 0;
    const px = side === 'left' ? x - off : side === 'right' ? x + off : x;
    const py = side === 'top' ? y - off : side === 'bottom' ? y + off : y;
    const pin: Pin = {
      key: `${part}.${name}`, name, side, x: px, y: py, bubble, connected: false,
      ref, drives, part, net: '', ax: px, base, step, dir: 0,
    };
    pins.push(pin);
    return pin;
  };

  for (const comp of circuit.components) {
    if (comp.kind === 'ff') {
      const at = spec.ffs[comp.id];
      if (!at) throw new Error(`回路図に FF の座標がありません: ${comp.id}（${circuit.id}）`);
      const [x, y] = at;
      const data = DATA_PINS[comp.type];
      const own: Pin[] = [];
      const two = data.length === 2;
      data.forEach((name, i) => {
        own.push(addPin(comp.id, name, 'left', x, y + (i === 0 ? 14 : 46), connRef(comp[name]!), false, false, 10, 8));
      });
      own.push(addPin(comp.id, 'ck', 'left', x, y + (two ? 30 : 46), connRef(comp.clock), false, comp.trigger === 'falling', 10, 8));
      own.push(addPin(comp.id, 'q', 'right', x + FF_W, y + 14, comp.q, true, false, 10, 8));
      own.push(addPin(comp.id, 'qn', 'right', x + FF_W, y + 46, qnName(comp), true, false, 10, 8));
      if (comp.clr) own.push(addPin(comp.id, 'clr', 'bottom', x + FF_W / 2, y + FF_H, connRef(comp.clr.conn), false, comp.clr.active === 'low', 0, 0));
      if (comp.pr) own.push(addPin(comp.id, 'pr', 'top', x + FF_W / 2, y, connRef(comp.pr.conn), false, comp.pr.active === 'low', 0, 0));
      ffs.push({ id: comp.id, def: comp, x, y, w: FF_W, h: FF_H, pins: own });
    } else {
      const place = spec.gates?.[comp.id];
      if (!place) throw new Error(`回路図にゲートの座標がありません: ${comp.id}（${circuit.id}）`);
      const [x, y] = place.at;
      const dir = place.dir ?? 'right';
      const size = gateSize(comp.op, comp.inputs.length);
      const n = comp.inputs.length;
      const w = dir === 'down' ? size.breadth : size.length;
      const h = dir === 'down' ? size.length : size.breadth;
      comp.inputs.forEach((conn, i) => {
        const along = (size.breadth * (i + 0.5)) / n;
        if (dir === 'down') addPin(comp.id, `in${i}`, 'top', x + w - along, y, connRef(conn), false, false, 0, 0);
        else addPin(comp.id, `in${i}`, dir === 'left' ? 'right' : 'left', dir === 'left' ? x + w : x, y + along, connRef(conn), false, false, 8, 6);
      });
      if (dir === 'down') addPin(comp.id, 'out', 'bottom', x + w / 2, y + h, comp.id, true, size.bubble, 0, 0);
      else addPin(comp.id, 'out', dir === 'left' ? 'left' : 'right', dir === 'left' ? x : x + w, y + h / 2, comp.id, true, size.bubble, 8, 6);
      gates.push({ id: comp.id, op: comp.op, x, y, w, h, dir, inputs: n });
    }
  }

  // ---- 信号ごとにまとめる ----
  const nets = new Map<string, Net>();
  const netOf = (key: string, ref: Ref): Net => {
    let net = nets.get(key);
    if (!net) {
      net = { key, ref, sinks: [], output: false };
      nets.set(key, net);
    }
    return net;
  };
  for (const pin of pins) {
    if (typeof pin.ref === 'string') {
      const net = netOf(pin.ref, pin.ref);
      pin.net = net.key;
      if (pin.drives) net.source = pin;
      else net.sinks.push(pin);
    } else {
      // 定数。母線を決めていなければ、端子ごとに値を書く。
      const shared = spec.tracks?.[`$${pin.ref}`] !== undefined;
      const net = netOf(shared ? `$${pin.ref}` : `$${pin.ref}@${pin.key}`, pin.ref);
      pin.net = net.key;
      net.sinks.push(pin);
      net.constLabel = !shared;
    }
  }
  for (const signal of spec.outputs ?? []) {
    const net = nets.get(signal);
    if (!net?.source) throw new Error(`出力に指定した信号に出どころがありません: ${signal}（${circuit.id}）`);
    net.output = true;
  }
  for (const [signal, x] of Object.entries(spec.outRight ?? {})) {
    const net = nets.get(signal);
    if (!net?.source) throw new Error(`出力に指定した信号に出どころがありません: ${signal}（${circuit.id}）`);
    net.right = x;
  }

  const active = [...nets.values()].filter((net) => net.sinks.length > 0 || net.output || net.right !== undefined);
  const tapped = (net: Net, pin: Pin): boolean => net.trackY === undefined || taps.has(pin.key);

  for (const net of active) {
    const track = spec.tracks?.[net.key];
    if (net.constLabel) continue;
    if (net.source) {
      net.trackY = track;
      continue;
    }
    // 外部入力、または母線のある定数。
    const explicit = typeof net.ref === 'string' ? spec.ports?.[net.ref] : undefined;
    if (explicit) {
      net.port = { x: explicit[0], y: explicit[1], above: explicit[2] !== 'left' };
      net.trackY = track;
      continue;
    }
    if (typeof net.ref === 'string' && !circuit.inputs.includes(net.ref)) {
      throw new Error(`信号の出どころがありません: ${net.ref}（${circuit.id}）`);
    }
    const y = track ?? (net.sinks.length === 1 ? net.sinks[0]!.y : undefined);
    if (y === undefined) throw new Error(`母線の位置（tracks）が必要です: ${net.key}（${circuit.id}）`);
    net.trackY = y;
    net.port = { x: portX, y, above: false };
  }

  // ---- 端子から出る線の向きと、スタブの長さ ----
  const outY = spec.outY ?? spec.height - 30;
  const span = (net: Net, ys: number): { lo: number; hi: number } => {
    const all = [ys];
    for (const pin of net.sinks) {
      if (tapped(net, pin)) all.push(pin.y);
    }
    if (net.trackY !== undefined && net.sinks.some((pin) => !tapped(net, pin))) all.push(net.trackY);
    if (net.output) all.push(outY);
    return { lo: Math.min(...all), hi: Math.max(...all) };
  };
  for (const net of active) {
    for (const pin of net.sinks) {
      pin.connected = true;
      pin.dir = net.constLabel ? 3 : tapped(net, pin) ? 0 : Math.sign(net.trackY! - pin.y);
    }
    if (net.source) {
      net.source.connected = true;
      const { lo, hi } = span(net, net.source.y);
      const moved = spec.spineX?.[net.key] !== undefined;
      net.source.dir = moved ? 0 : lo < net.source.y && hi > net.source.y ? 2 : lo < net.source.y ? -1 : hi > net.source.y ? 1 : 0;
    }
  }
  const groups = new Map<string, Pin[]>();
  for (const pin of pins) {
    if (!pin.connected || pin.side === 'top' || pin.side === 'bottom') continue;
    const key = `${pin.part}/${pin.side}`;
    groups.set(key, [...(groups.get(key) ?? []), pin]);
  }
  for (const group of groups.values()) {
    const ups = group.filter((p) => p.dir === -1).sort((a, b) => a.y - b.y);
    const downs = group.filter((p) => p.dir === 1).sort((a, b) => b.y - a.y);
    const both = group.filter((p) => p.dir === 2);
    // 同じ信号につながる端子は、同じ縦線を使う（1本を分岐させる）。
    const rank = (list: Pin[]): Map<Pin, number> => {
      const order: string[] = [];
      const out = new Map<Pin, number>();
      for (const p of list) {
        if (!order.includes(p.net)) order.push(p.net);
        out.set(p, order.indexOf(p.net));
      }
      return out;
    };
    const upRank = rank(ups);
    const downRank = rank(downs);
    const upCount = new Set(ups.map((p) => p.net)).size;
    const downCount = new Set(downs.map((p) => p.net)).size;
    const clash = ups.some((u) => downs.some((d) => u.y > d.y));
    for (const pin of group) {
      let len = pin.base;
      if (pin.dir === -1) len = pin.base + upRank.get(pin)! * pin.step;
      else if (pin.dir === 1) len = pin.base + (downRank.get(pin)! + (clash ? upCount : 0)) * pin.step;
      else if (pin.dir === 2) len = pin.base + (upCount + downCount + both.indexOf(pin)) * pin.step;
      else if (pin.dir === 3) len = pin.base + 2 * pin.step;
      pin.ax = pin.side === 'left' ? pin.x - len : pin.x + len;
    }
  }

  // ---- 線分を作る ----
  const draws: NetDraw[] = [];
  for (const net of active) {
    const segs: Seg[] = [];
    const labels: NetLabel[] = [];
    const add = (x1: number, y1: number, x2: number, y2: number): void => {
      if (x1 !== x2 || y1 !== y2) segs.push({ x1, y1, x2, y2 });
    };
    const members = [...net.sinks, ...(net.source ? [net.source] : [])];
    for (const pin of members) add(pin.x, pin.y, pin.ax, pin.y);

    if (net.constLabel) {
      const pin = net.sinks[0]!;
      const text = String(net.ref);
      if (pin.side === 'left') labels.push({ x: pin.ax - 4, y: pin.y + 4, anchor: 'end', text });
      else if (pin.side === 'right') labels.push({ x: pin.ax + 4, y: pin.y + 4, anchor: 'start', text });
      else if (pin.side === 'bottom') {
        add(pin.x, pin.y, pin.x, pin.y + 8);
        labels.push({ x: pin.x, y: pin.y + 20, anchor: 'middle', text });
      } else {
        add(pin.x, pin.y, pin.x, pin.y - 8);
        labels.push({ x: pin.x, y: pin.y - 11, anchor: 'middle', text });
      }
    } else {
      const fromX = net.source ? net.source.ax : net.port!.x;
      const sy = net.source ? net.source.y : net.port!.y;
      const sx = spec.spineX?.[net.key] ?? fromX;
      add(fromX, sy, sx, sy);
      const { lo, hi } = span(net, sy);
      add(sx, lo, sx, hi);
      const trunkPins = net.sinks.filter((pin) => !tapped(net, pin));
      if (net.trackY !== undefined && (trunkPins.length > 0 || net.port)) {
        const xs = [sx, ...trunkPins.map((pin) => pin.ax)];
        add(Math.min(...xs), net.trackY, Math.max(...xs), net.trackY);
        for (const pin of trunkPins) add(pin.ax, pin.y, pin.ax, net.trackY);
      }
      for (const pin of net.sinks) {
        if (tapped(net, pin)) add(pin.ax, pin.y, sx, pin.y);
      }
      const override = typeof net.ref === 'string' ? spec.outLabels?.[net.ref] : undefined;
      const name = typeof net.ref === 'string' ? { signal: net.ref } : { text: String(net.ref) };
      const outName = override !== undefined ? { text: override } : name;
      if (net.port) {
        labels.push(
          net.port.above
            ? { x: net.port.x, y: net.port.y - 6, anchor: 'middle', ...name }
            : { x: net.port.x - 6, y: net.port.y + 4, anchor: 'end', ...name },
        );
      }
      if (net.output) labels.push({ x: sx, y: outY + 16, anchor: 'middle', ...outName });
      if (net.right !== undefined) {
        add(Math.min(fromX, sx), sy, net.right, sy);
        labels.push({ x: net.right + 5, y: sy + 4, anchor: 'start', ...outName });
      }
    }
    for (const [x1, y1, x2, y2] of spec.extra?.[net.key] ?? []) add(x1, y1, x2, y2);

    const pieces = splitPieces(segs);
    for (const rule of spec.dashed ?? []) {
      if (rule.net !== net.key) continue;
      const [bx1, by1, bx2, by2] = rule.box;
      for (const s of pieces) {
        if (s.x1 >= bx1 && s.x2 <= bx2 && s.y1 >= by1 && s.y2 <= by2) s.dashed = true;
      }
    }
    draws.push({
      key: net.key,
      ref: net.ref,
      segs: pieces,
      dots: junctions(pieces),
      labels,
      pins: members.map((pin) => ({ x: pin.x, y: pin.y })),
    });
  }

  return {
    width: spec.width,
    height: spec.height,
    ffs,
    gates,
    nets: draws,
    notes: spec.notes ?? [],
    frames: spec.frames ?? [],
    leds: spec.leds ?? [],
    breaks: (spec.breaks ?? []).map(([x, y]) => ({ x, y })),
    ffNames: spec.ffNames ?? false,
    pinIndex: spec.pinIndex ?? true,
  };
}

const norm = (s: Seg): Seg => (s.x1 < s.x2 || (s.x1 === s.x2 && s.y1 <= s.y2) ? s : { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 });

/** 線分を、ほかの線分の端点で区切り、重なりを取り除く。 */
export function splitPieces(segs: Seg[]): Seg[] {
  const points: Pt[] = segs.flatMap((s) => [
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ]);
  const seen = new Set<string>();
  const out: Seg[] = [];
  for (const raw of segs) {
    const s = norm(raw);
    const vertical = s.x1 === s.x2;
    const cuts = points
      .filter((p) => (vertical ? p.x === s.x1 && p.y > s.y1 && p.y < s.y2 : p.y === s.y1 && p.x > s.x1 && p.x < s.x2))
      .map((p) => (vertical ? p.y : p.x));
    const stops = [...new Set([vertical ? s.y1 : s.x1, ...cuts, vertical ? s.y2 : s.x2])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < stops.length; i++) {
      const piece: Seg = vertical
        ? { x1: s.x1, y1: stops[i]!, x2: s.x1, y2: stops[i + 1]! }
        : { x1: stops[i]!, y1: s.y1, x2: stops[i + 1]!, y2: s.y1 };
      const key = `${piece.x1},${piece.y1},${piece.x2},${piece.y2}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(piece);
      }
    }
  }
  return out;
}

/** 3本以上の線が集まる点（黒丸を描く）。 */
export function junctions(pieces: Seg[]): Pt[] {
  const degree = new Map<string, { p: Pt; n: number }>();
  const bump = (x: number, y: number): void => {
    const key = `${x},${y}`;
    const entry = degree.get(key) ?? { p: { x, y }, n: 0 };
    entry.n++;
    degree.set(key, entry);
  };
  for (const s of pieces) {
    bump(s.x1, s.y1);
    bump(s.x2, s.y2);
  }
  return [...degree.values()].filter((e) => e.n >= 3).map((e) => e.p);
}
