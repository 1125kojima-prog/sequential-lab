/**
 * ステップ実行：シミュレーション結果を「入力が変化した時刻」ごとに区切り、
 * その中で何が・いつ・なぜ変化したかを文章にする。UI には依存しない。
 */
import type { Change, Circuit, Conn, DataPinName, FlipFlop, Gate, Level, Ref, Trace, Trigger } from '../engine/types';
import { makeNamer, subscript, type Namer } from './label';

export type StepSource = {
  circuit: Circuit;
  /** クロックの信号名。 */
  clock: string;
  /** FF が反応するエッジ。 */
  edge: Trigger;
  /** 状態として表示するビット（上位から）。 */
  stateBits: readonly string[];
  labels?: Record<string, string>;
  annotate?: (value: (signal: string) => Level) => string[];
};

export type StepEvent = {
  /** 変化した時刻（ns）。 */
  t: number;
  /** ステップの始まり（入力の変化）からの経過時間（ns）。 */
  dt: number;
  delta: number;
  kind: 'stimulus' | 'clock' | 'async' | 'gate';
  /** 変化した信号。 */
  signals: string[];
  /** 短い表現。例：'Q₀反転' */
  short: string;
  /** 変化の理由。 */
  text: string;
};

export type Step = {
  index: number;
  /** ステップの始まり（入力が変化した時刻）。 */
  t: number;
  /** 次のステップの始まり（最後は終了時刻）。 */
  end: number;
  kind: 'clock' | 'input';
  /** FF が反応するエッジなら、その番号（1 から）。 */
  edgeNo?: number;
  title: string;
  events: StepEvent[];
  /** このステップで変化した信号。 */
  changed: string[];
  /** 状態がたどった値。例：['100', '101', '000'] */
  path: string[];
  /** 例：'0ns Cₚ立下り → 8ns Q₀反転 → 16ns Q₁反転' */
  timeline: string;
  /** ステップの後に落ち着いた値からの補足。 */
  notes: string[];
};

const EDGE_NAME: Record<Trigger, string> = { rising: '立上り', falling: '立下り' };

function connRef(conn: Conn): Ref {
  return typeof conn === 'object' ? conn.from : conn;
}

function ffName(ff: FlipFlop, namer: Namer): string {
  const m = /^ff(\d+)$/.exec(ff.id);
  return m ? `FF${subscript(m[1]!)}` : `${namer.text(ff.q)} のFF`;
}

function pinName(ff: FlipFlop, pin: DataPinName): string {
  const m = /^ff(\d+)$/.exec(ff.id);
  return pin.toUpperCase() + (m ? subscript(m[1]!) : '');
}

/** 例：'D₁（=Q̄₁）=1'。端子名とつながる信号の表記が同じなら、信号名は省く。 */
function pinValue(ff: FlipFlop, pin: DataPinName, value: Level, namer: Namer): string {
  const name = pinName(ff, pin);
  const conn = ff[pin];
  const ref = conn === undefined ? undefined : connRef(conn);
  const source = typeof ref === 'string' && namer.text(ref) !== name ? `（=${namer.text(ref)}）` : '';
  return `${name}${source}=${value}`;
}

/** 2つの端子が同じ値のときの書き方。例：'J₁=K₁=1'、'J₁=K₁=Q₀=1' */
function pinPair(ff: FlipFlop, a: DataPinName, b: DataPinName, value: Level, namer: Namer): string | undefined {
  const ra = ff[a] === undefined ? undefined : connRef(ff[a]);
  const rb = ff[b] === undefined ? undefined : connRef(ff[b]);
  if (ra !== rb) return undefined;
  const source = typeof ra === 'string' ? `${namer.text(ra)}=` : '';
  return `${pinName(ff, a)}=${pinName(ff, b)}=${source}${value}`;
}

function clockReason(ff: FlipFlop, cause: Extract<Change['cause'], { kind: 'clock' }>, namer: Namer): string {
  const v = cause.inputs;
  const two = (a: DataPinName, b: DataPinName): string => {
    const va = v[a] ?? 0;
    const vb = v[b] ?? 0;
    const pair = va === vb ? pinPair(ff, a, b, va, namer) : undefined;
    return pair ?? `${pinValue(ff, a, va, namer)}、${pinValue(ff, b, vb, namer)}`;
  };
  switch (ff.type) {
    case 'D':
      return `${pinValue(ff, 'd', v.d ?? 0, namer)}（エッジ直前の値）を取り込み`;
    case 'T':
      return `${pinValue(ff, 't', v.t ?? 0, namer)} なので反転して`;
    case 'JK':
      return `${two('j', 'k')} なので${cause.action === 'toggle' ? '反転して' : cause.action === 'set' ? 'セットされ' : 'リセットされ'}`;
    case 'RS':
      return `${two('s', 'r')} なので${cause.action === 'set' ? 'セットされ' : 'リセットされ'}`;
  }
}

/** 変化を1つ適用した後の値を順に持つための入れ物。 */
function snapshot(trace: Trace, t: number, deltaBefore: number | undefined): Record<string, Level> {
  const value = { ...trace.initial };
  for (const ch of trace.changes) {
    if (ch.t > t) break;
    if (ch.t === t && deltaBefore !== undefined && ch.delta >= deltaBefore) break;
    value[ch.signal] = ch.value;
  }
  return value;
}

/** 配線遅延の設定（遅延モードのときだけ渡す）。 */
export type WireTiming = {
  /** 配線ごとの遅延（ns）。キーは Conn.wire。 */
  wire: Record<string, number>;
  model: 'inertial' | 'transport';
};

type WiredPin = { wire: string; from: string; target: string };

/** 遅延を設定できる配線と、その行き先の端子。 */
function wiredPins(circuit: Circuit, namer: Namer): WiredPin[] {
  const out: WiredPin[] = [];
  const add = (conn: Conn | undefined, target: string): void => {
    if (conn !== undefined && typeof conn === 'object' && typeof conn.from === 'string') {
      out.push({ wire: conn.wire, from: conn.from, target });
    }
  };
  for (const comp of circuit.components) {
    if (comp.kind === 'gate') {
      comp.inputs.forEach((conn) => add(conn, `${namer.text(comp.id)} の入力`));
      continue;
    }
    const name = ffName(comp, namer);
    add(comp.clock, `${name} の CK 端子`);
    for (const pin of ['d', 't', 'j', 'k', 's', 'r'] as const) add(comp[pin], `${name} の ${pinName(comp, pin)} 端子`);
    add(comp.clr?.conn, `${name} の CLR 端子`);
    add(comp.pr?.conn, `${name} の PR 端子`);
  }
  return out;
}

export function buildSteps(source: StepSource, trace: Trace, timing?: WireTiming): Step[] {
  const { circuit, clock, edge, stateBits } = source;
  const namer = makeNamer(source.labels);
  const ffs = new Map<string, FlipFlop>();
  const gates = new Map<string, Gate>();
  for (const comp of circuit.components) {
    if (comp.kind === 'ff') ffs.set(comp.id, comp);
    else gates.set(comp.id, comp);
  }
  const activeValue: Level = edge === 'rising' ? 1 : 0;
  const stateName = namer.bus(stateBits);
  const readState = (value: Record<string, Level>): string => stateBits.map((b) => value[b] ?? 0).join('');

  // 入力が変化した時刻で区切る。
  const starts = [...new Set(trace.changes.filter((ch) => ch.cause.kind === 'stimulus').map((ch) => ch.t))].sort(
    (a, b) => a - b,
  );

  const describe = (group: Change[], t0: number): StepEvent => {
    const first = group[0]!;
    const cause = first.cause;
    const base = { t: first.t, dt: first.t - t0, delta: first.delta, signals: group.map((ch) => ch.signal) };
    const lag = (at: number): string => (first.t > at ? `（${first.t - at}ns 遅れて変化）` : '');

    if (cause.kind === 'stimulus') {
      const name = namer.text(first.signal);
      if (first.signal === clock) {
        const dir: Trigger = first.value === 1 ? 'rising' : 'falling';
        const active = first.value === activeValue;
        return {
          ...base,
          kind: 'stimulus',
          short: `${name}${EDGE_NAME[dir]}`,
          text: `${name} が${EDGE_NAME[dir]}（${first.value === 1 ? '0→1' : '1→0'}）。${active ? '' : 'このエッジではFFは動かない。'}`,
        };
      }
      return { ...base, kind: 'stimulus', short: `${name}=${first.value}`, text: `入力 ${name} が ${first.value} になった。` };
    }

    if (cause.kind === 'clock' || cause.kind === 'async') {
      const ff = ffs.get(cause.ff)!;
      const q = group.find((ch) => ch.signal === ff.q) ?? first;
      const qValue: Level = q.signal === ff.q ? q.value : q.value === 1 ? 0 : 1;
      const qName = namer.text(ff.q);
      const result = `${qName}=${qValue}`;
      if (cause.kind === 'clock') {
        const clockText = `${namer.text(cause.clockSignal)} の${EDGE_NAME[cause.edge]}で CK が入った`;
        return {
          ...base,
          kind: 'clock',
          short: cause.action === 'toggle' ? `${qName}反転` : result,
          text: `${ffName(ff, namer)}：${clockText}。${clockReason(ff, cause, namer)} ${result}${lag(cause.at)}`,
        };
      }
      const pin = ff[cause.pin]!;
      const pinLabel = cause.pin === 'clr' ? 'CLR' : 'PR';
      const logic = pin.active === 'high' ? '正論理' : '負論理';
      const level = pin.active === 'high' ? 1 : 0;
      const act = cause.pin === 'clr' ? 'リセット' : 'プリセット';
      return {
        ...base,
        kind: 'async',
        short: `${qName}${act}`,
        text: `${ffName(ff, namer)}：${pinLabel} 端子（${logic}）につながる ${namer.text(cause.by)} が ${level} になり、${pinLabel} が働いた。クロックに関係なく${act}され ${result}${lag(cause.at)}`,
      };
    }

    const gate = gates.get(cause.gate)!;
    const name = namer.text(gate.id);
    const inputs = gate.inputs.map((conn, i) => `${namer.text(connRef(conn))}=${cause.inputs[i] ?? 0}`).join('、');
    // ゲートが入力を見た時点の状態。理想モードでは同じ時刻の、原因になった変化まで。
    const seen = snapshot(trace, cause.at, first.t === cause.at ? first.delta : undefined);
    const state = stateBits.length > 1 ? `${stateName}=(${readState(seen)}) のとき、` : '';
    return {
      ...base,
      kind: 'gate',
      short: `${name}=${first.value}`,
      text: `${state}${inputs} → ${name}（${gate.op}）=${first.value}${lag(cause.at)}`,
    };
  };

  const wired = timing?.model === 'inertial' ? wiredPins(circuit, namer) : [];
  /** 配線遅延より短いパルスが、行き先に届かずに消えたことの説明。 */
  const lostPulses = (group: Change[]): string[] => {
    const notes: string[] = [];
    for (const pin of wired) {
      const delay = timing?.wire[pin.wire] ?? 0;
      if (delay <= 0) continue;
      const own = group.filter((ch) => ch.signal === pin.from);
      for (let k = 0; k + 1 < own.length; k++) {
        const width = own[k + 1]!.t - own[k]!.t;
        if (width < delay) {
          notes.push(
            `${namer.text(pin.from)} のパルス（幅 ${width}ns）は配線遅延 ${delay}ns より短いので、${pin.target}には届かずに消えた。`,
          );
          k++;
        }
      }
    }
    return notes;
  };

  const steps: Step[] = [];
  const value = { ...trace.initial };
  let edgeNo = 0;
  let cursor = 0;

  starts.forEach((t0, i) => {
    const end = starts[i + 1] ?? trace.end;
    const group: Change[] = [];
    while (cursor < trace.changes.length && trace.changes[cursor]!.t < end) group.push(trace.changes[cursor++]!);
    if (i === starts.length - 1) while (cursor < trace.changes.length) group.push(trace.changes[cursor++]!);

    const clockChange = group.find((ch) => ch.cause.kind === 'stimulus' && ch.signal === clock);
    const active = clockChange !== undefined && clockChange.value === activeValue;
    if (active) edgeNo++;

    // 同じ時刻・同じ原因の変化（Q と Q̄ など）を1つにまとめる。
    const bundles: Change[][] = [];
    const keyOf = (ch: Change): string => {
      const cause = ch.cause;
      const who = cause.kind === 'stimulus' ? ch.signal : cause.kind === 'gate' ? cause.gate : cause.ff;
      return `${ch.t}/${ch.delta}/${cause.kind}/${who}`;
    };
    for (const ch of group) {
      const last = bundles[bundles.length - 1];
      if (last && keyOf(last[0]!) === keyOf(ch)) last.push(ch);
      else bundles.push([ch]);
    }

    const path = [readState(value)];
    for (let k = 0; k < group.length; k++) {
      const ch = group[k]!;
      value[ch.signal] = ch.value;
      const next = group[k + 1];
      if (next && next.t === ch.t && next.delta === ch.delta) continue;
      const state = readState(value);
      if (path[path.length - 1] !== state) path.push(state);
    }

    // FF が動かない側のクロックエッジだけのステップは飛ばす。
    const onlyIdleClock = !active && group.every((ch) => ch.signal === clock);
    if (onlyIdleClock) return;

    const events = bundles.map((b) => describe(b, t0));
    const idealOnly = events.every((e) => e.dt === 0);
    const clockName = namer.text(clock);
    const title = active
      ? `${clockName} の${edgeNo}回目の${EDGE_NAME[edge]}`
      : `入力の変化：${events
          .filter((e) => e.kind === 'stimulus')
          .map((e) => e.short)
          .join('、')}`;
    const step: Step = {
      index: steps.length,
      t: t0,
      end,
      kind: active ? 'clock' : 'input',
      title,
      events,
      changed: [...new Set(group.map((ch) => ch.signal))],
      path,
      timeline: events.map((e) => (idealOnly ? e.short : `${e.dt}ns ${e.short}`)).join(' → '),
      notes: active && source.annotate ?source.annotate((signal) => value[signal] ?? 0) : [],
    };
    if (active) step.edgeNo = edgeNo;
    if (active && events.length === 1) step.notes.unshift('このエッジでは、どのFFの出力も変化しない。');
    step.notes.unshift(...lostPulses(group));
    steps.push(step);
  });

  return steps;
}

