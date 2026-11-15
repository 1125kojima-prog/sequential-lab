/**
 * 回路図の自動配置。第21回 p.8、第22回 p.9・p.27 の回路と同じ形にする。
 *
 *   入力ラッチ（左上）→ 縦の母線（X, X̄, Q, Q̄）→ AND の列 → OR の列 → FF（右）
 *   FF の Q／Q̄ は右へ出して下に回し、左の母線へ戻す。Cₚ と CLR は下の横線から各 FF へ上げる。
 *
 * 扱える回路：
 * - ゲートは AND と OR だけ。OR の入力は AND の出力か、母線の信号（リテラル）。リテラルは AND より前に並ぶ。
 * - 1つのゲートの出力は1か所だけで使う（共用しない）。
 * - FF のデータ入力は、ゲートの出力、母線の信号、定数のどれか。PR は使わない。
 * - 入力ラッチ＝D が外部入力の D-FF。
 * 扱えない回路には undefined を返す（回路図を出さない）。
 */
import { qnName } from '../engine/simulate';
import type { Circuit, Conn, FlipFlop, Gate, Ref } from '../engine/types';
import { FF_W, FF_H, gateSize, type LayoutSpec } from './layout';

const PORT_X = 50;
const TOP = 40;
const LATCH_DX = 50;
const LATCH_DY = 80;
const FF_DX = 50;
const BUS_GAP = 12;
const SLOT = 8;
const GROUP_GAP = 16;

const refOf = (conn: Conn): Ref => (typeof conn === 'object' ? conn.from : conn);

type Group = {
  /** この組の出力の信号（FF の入力、または回路の出力）。 */
  net: string;
  /** 組の中の座標（上端が 0）。 */
  gates: { id: string; x: 'and' | 'or'; y: number }[];
  /** AND の出力を OR へつなぐ縦線の位置（AND の右端からの番号）。 */
  slots: Record<string, number>;
  /** 出力の y（組の中）。 */
  out: number;
  height: number;
};

function dataPins(ff: FlipFlop): Conn[] {
  return ff.type === 'D' ? [ff.d!] : ff.type === 'T' ? [ff.t!] : ff.type === 'JK' ? [ff.j!, ff.k!] : [ff.s!, ff.r!];
}

export function autoLayout(circuit: Circuit): LayoutSpec | undefined {
  const comps = circuit.components;
  const ffs = comps.filter((c): c is FlipFlop => c.kind === 'ff');
  const gates = comps.filter((c): c is Gate => c.kind === 'gate');
  if (gates.some((g) => g.op !== 'AND' && g.op !== 'OR')) return undefined;
  if (ffs.some((f) => f.pr)) return undefined;
  const clockNets = new Set(ffs.map((f) => refOf(f.clock)));
  const clrNets = new Set(ffs.flatMap((f) => (f.clr ? [refOf(f.clr.conn)] : [])));
  if (clockNets.size !== 1 || clrNets.size > 1) return undefined;
  const cp = [...clockNets][0] as string;
  const clr = [...clrNets][0] as string | undefined;
  const dataInputs = circuit.inputs.filter((i) => i !== cp && i !== clr);

  const latches = ffs.filter((f) => f.type === 'D' && typeof refOf(f.d!) === 'string' && dataInputs.includes(refOf(f.d!) as string));
  const states = ffs.filter((f) => !latches.includes(f));
  if (states.length === 0) return undefined;

  // 母線に乗せる信号：ラッチと FF の Q／Q̄。
  const qnOf = qnName;
  const literal = new Set(ffs.flatMap((f) => [f.q, qnOf(f)]));
  const gateById = new Map(gates.map((g) => [g.id, g]));

  // ゲートの出力を使う場所の数（共用は扱わない）。
  const uses = new Map<string, number>();
  const use = (conn: Conn): void => {
    const r = refOf(conn);
    if (typeof r === 'string' && gateById.has(r)) uses.set(r, (uses.get(r) ?? 0) + 1);
  };
  for (const c of comps) {
    if (c.kind === 'gate') c.inputs.forEach(use);
    else dataPins(c).forEach(use);
  }
  if ([...uses.values()].some((n) => n > 1)) return undefined;

  /** 1つの対象（ゲートの出力）の組を作る。 */
  const buildGroup = (id: string): Group | undefined => {
    const g = gateById.get(id)!;
    const andH = (a: Gate): number => gateSize('AND', a.inputs.length).breadth;
    for (const conn of g.inputs) {
      const r = refOf(conn);
      if (typeof r !== 'string' || !(literal.has(r) || (g.op === 'OR' && gateById.get(r)?.op === 'AND'))) return undefined;
    }
    if (g.op === 'AND') {
      const h = andH(g);
      return { net: id, gates: [{ id, x: 'and', y: 0 }], slots: {}, out: h / 2, height: h };
    }
    const kinds = g.inputs.map((c) => (literal.has(refOf(c) as string) ? 'lit' : 'and'));
    const lits = kinds.filter((k) => k === 'lit').length;
    if (kinds.slice(0, lits).some((k) => k !== 'lit')) return undefined;
    const ands = g.inputs.slice(lits).map((c) => gateById.get(refOf(c) as string)!);
    const n = g.inputs.length;
    const breadth = gateSize('OR', n).breadth;
    const pinOff = (i: number): number => (breadth * (i + 0.5)) / n - breadth / 2;
    // AND を上から積む（上端 andTop）。OR の中心は AND の中心に合わせ、リテラルの線が AND に当たらないよう上へずらす。
    const andTop = lits > 0 ? 12 * lits + 8 : 0;
    const tops: number[] = [];
    let y = andTop;
    for (const a of ands) {
      tops.push(y);
      y += andH(a) + 12;
    }
    const stackBottom = y - 12;
    let c = ands.length > 0 ? (andTop + stackBottom) / 2 : breadth / 2;
    if (lits > 0 && ands.length > 0) c = Math.min(c, andTop - 6 - pinOff(lits - 1));
    c = Math.floor(c);
    const orTop = c - breadth / 2;
    const shift = Math.max(0, -Math.min(orTop, 0));
    const placed: Group['gates'] = ands.map((a, k) => ({ id: a.id, x: 'and', y: tops[k]! + shift }));
    placed.push({ id, x: 'or', y: orTop + shift });
    // AND→OR の縦線。下へ行く線は上のものほど右、上へ行く線は上のものほど左に置くと交差しない。
    const moves = ands.map((a, k) => ({ id: a.id, from: tops[k]! + andH(a) / 2, to: c + pinOff(lits + k) }));
    const downs = moves.filter((m) => m.to > m.from);
    const upsList = moves.filter((m) => m.to < m.from);
    const slots: Record<string, number> = {};
    downs.forEach((m, k) => (slots[m.id] = downs.length - 1 - k));
    upsList.forEach((m, k) => (slots[m.id] = k));
    moves.filter((m) => m.to === m.from).forEach((m) => (slots[m.id] = -1));
    const height = Math.max(stackBottom, c + breadth / 2) + shift;
    return { net: id, gates: placed, slots, out: c + shift, height };
  };

  // ---- 組を作る：回路の出力（どこにもつながらないゲート）、FF ごとのデータ入力 ----
  const consumed = new Set(uses.keys());
  const outputs = gates.filter((g) => !consumed.has(g.id));
  const outGroups: Group[] = [];
  for (const g of outputs) {
    const grp = buildGroup(g.id);
    if (!grp) return undefined;
    outGroups.push(grp);
  }
  const ordered = [...states].sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  const ffGroups: Group[][] = [];
  for (const f of ordered) {
    const list: Group[] = [];
    for (const conn of dataPins(f)) {
      const r = refOf(conn);
      if (typeof r === 'number' || literal.has(r)) continue;
      if (!gateById.has(r)) return undefined;
      const grp = buildGroup(r);
      if (!grp) return undefined;
      list.push(grp);
    }
    ffGroups.push(list);
  }
  const all = [...outGroups, ...ffGroups.flat()];
  // 組に入らなかったゲートがあれば扱えない。
  const covered = new Set(all.flatMap((g) => g.gates.map((x) => x.id)));
  if (gates.some((g) => !covered.has(g.id))) return undefined;

  // ---- 横の位置 ----
  const latchX0 = PORT_X + 60;
  const latchRight = latches.length > 0 ? latchX0 + (latches.length - 1) * LATCH_DX + FF_W : PORT_X;
  const used = (signal: string): boolean =>
    comps.some((c) => (c.kind === 'gate' ? c.inputs : dataPins(c)).some((conn) => refOf(conn) === signal));
  const latchNets = latches.flatMap((f) => [f.q, qnOf(f)]).filter(used);
  const stateNets = ordered.flatMap((f) => [f.q, qnOf(f)]).filter(used);
  const busX0 = latchRight + 30;
  const latchBusX = latchNets.map((_, k) => busX0 + k * BUS_GAP);
  const qBus0 = busX0 + latchNets.length * BUS_GAP + (latchNets.length > 0 ? BUS_GAP : 0);
  // FF の Q の線：外側（上の FF の Q）ほど、下で戻る線が低く、左の母線へ入る。
  const stateBusX = stateNets.map((_, k) => qBus0 + k * BUS_GAP);
  const busEnd = Math.max(busX0, ...latchBusX, ...stateBusX);
  const andX = busEnd + 40;
  const andW = gateSize('AND', 2).length;
  const maxAndSlots = Math.max(0, ...all.map((g) => Math.max(-1, ...Object.values(g.slots)) + 1));
  const orX = andX + andW + 8 + maxAndSlots * SLOT + 12;
  const orW = gateSize('OR', 2).length;
  const laneX0 = orX + orW + 10;
  const maxLane = Math.max(1, ...ffGroups.map((l) => l.length));
  const ffX0 = laneX0 + maxLane * SLOT + 30;
  const ffX = (k: number): number => ffX0 + k * FF_DX;
  const ffRight = ffX(ordered.length - 1) + FF_W;
  // Q の縦線：下の FF の Q̄ がいちばん内側。
  const laneOf = new Map<string, number>();
  [...stateNets].reverse().forEach((net, k) => laneOf.set(net, ffRight + 20 + k * BUS_GAP));
  const laneOuter = Math.max(ffRight + 20, ...laneOf.values());

  // ---- 縦の位置 ----
  const spec: LayoutSpec = {
    width: 0,
    height: 0,
    ffs: {},
    gates: {},
    portX: PORT_X,
    tracks: {},
    spineX: {},
    buses: {},
    outRight: {},
  };
  latches.forEach((f, k) => (spec.ffs[f.id] = [latchX0 + k * LATCH_DX, TOP + k * LATCH_DY]));
  const latchBottom = latches.length > 0 ? TOP + (latches.length - 1) * LATCH_DY + FF_H : TOP;

  let cursor = TOP;
  const place = (g: Group, outRight?: number): void => {
    for (const gate of g.gates) {
      spec.gates![gate.id] = { at: [gate.x === 'and' ? andX : orX, cursor + gate.y] };
      const slot = g.slots[gate.id];
      if (slot !== undefined && slot >= 0) spec.spineX![gate.id] = andX + andW + 8 + slot * SLOT;
    }
    if (outRight !== undefined) spec.outRight![g.net] = outRight;
    cursor += g.height + GROUP_GAP;
  };
  const outX = laneOuter + 20;
  for (const g of outGroups) place(g, outX);
  ordered.forEach((f, k) => {
    const list = ffGroups[k]!;
    list.forEach((g, i) => {
      place(g);
      spec.spineX![g.net] = laneX0 + (list.length - 1 - i) * SLOT;
    });
    // FF の上の入力線が、どの組とも重ならない高さに置く。
    spec.ffs[f.id] = [ffX(k), cursor + 4];
    cursor += 4 + FF_H + 24;
  });
  const bottom = Math.max(cursor, latchBottom + 30);

  // Q を下で戻す高さ：外側ほど低い。
  const retY = (k: number): number => bottom + (stateNets.length - 1 - k) * BUS_GAP;
  stateNets.forEach((net, k) => {
    spec.buses![net] = { x: stateBusX[k]!, lane: laneOf.get(net)!, y: retY(k) };
  });
  latchNets.forEach((net, k) => (spec.buses![net] = { x: latchBusX[k]! }));
  const cpY = bottom + stateNets.length * BUS_GAP + 14;
  spec.tracks![cp] = cpY;
  if (clr) spec.tracks![clr] = cpY + 16;
  spec.height = cpY + (clr ? 16 : 0) + 24;
  spec.width = outX + 60;
  return spec;
}
