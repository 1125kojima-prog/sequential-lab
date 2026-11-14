import {
  DEFAULT_DELAYS,
  type Cause,
  type Change,
  type Circuit,
  type Conn,
  type DataPinName,
  type FFAction,
  type FlipFlop,
  type Gate,
  type GateOp,
  type Level,
  type Ref,
  type SimOptions,
  type Stimulus,
  type Trace,
} from './types';

const MAX_DELTAS = 10_000;

const DATA_PINS: Record<FlipFlop['type'], DataPinName[]> = {
  D: ['d'],
  T: ['t'],
  JK: ['j', 'k'],
  RS: ['s', 'r'],
};

export function evalGate(op: GateOp, inputs: readonly Level[]): Level {
  switch (op) {
    case 'AND':
      return inputs.every((v) => v === 1) ? 1 : 0;
    case 'NAND':
      return inputs.every((v) => v === 1) ? 0 : 1;
    case 'OR':
      return inputs.some((v) => v === 1) ? 1 : 0;
    case 'NOR':
      return inputs.some((v) => v === 1) ? 0 : 1;
    case 'XOR':
      return inputs.reduce<number>((acc, v) => acc ^ v, 0) === 1 ? 1 : 0;
    case 'NOT':
      return inputs[0] === 1 ? 0 : 1;
  }
}

/** クロックエッジでのFFの動作。q は現在の値、inputs はエッジ直前の入力。 */
export function ffNext(
  type: FlipFlop['type'],
  q: Level,
  inputs: Partial<Record<DataPinName, Level>>,
): { next: Level; action: FFAction } {
  const inv: Level = q === 1 ? 0 : 1;
  switch (type) {
    case 'D':
      return { next: inputs.d ?? 0, action: 'load' };
    case 'T':
      return inputs.t === 1 ? { next: inv, action: 'toggle' } : { next: q, action: 'hold' };
    case 'JK':
      if (inputs.j === 1 && inputs.k === 1) return { next: inv, action: 'toggle' };
      if (inputs.j === 1) return { next: 1, action: 'set' };
      if (inputs.k === 1) return { next: 0, action: 'reset' };
      return { next: q, action: 'hold' };
    case 'RS':
      // S=R=1 は禁止入力。値は変えず 'invalid' として記録する。
      if (inputs.s === 1 && inputs.r === 1) return { next: q, action: 'invalid' };
      if (inputs.s === 1) return { next: 1, action: 'set' };
      if (inputs.r === 1) return { next: 0, action: 'reset' };
      return { next: q, action: 'hold' };
  }
}

type Pin = {
  owner: number;
  source: Ref;
  wire: string | undefined;
  delay: number;
  value: Level;
  /** 慣性遅延で、保留中の変化を取り消すための通し番号。 */
  serial: number;
};

type GateRt = { kind: 'gate'; def: Gate; pins: number[]; decided: Level; delay: number };
type FFRt = {
  kind: 'ff';
  def: FlipFlop;
  qn: string;
  clock: number;
  data: Partial<Record<DataPinName, number>>;
  clr: number | undefined;
  pr: number | undefined;
  q: Level;
  delay: number;
};
type Rt = GateRt | FFRt;

type Ev = { t: number; delta: number; seq: number } & (
  | { kind: 'sig'; signal: string; value: Level; cause: Cause }
  | { kind: 'pin'; pin: number; value: Level; serial: number | undefined }
);

function connRef(conn: Conn): Ref {
  return typeof conn === 'object' ? conn.from : conn;
}

function connWire(conn: Conn): string | undefined {
  return typeof conn === 'object' ? conn.wire : undefined;
}

export function qnName(ff: FlipFlop): string {
  return ff.qn ?? `n${ff.q}`;
}

/** 回路の全信号名（入力、ゲート出力、FFの Q と Q̄）。 */
export function signalNames(circuit: Circuit): string[] {
  const names = [...circuit.inputs];
  for (const c of circuit.components) {
    if (c.kind === 'gate') names.push(c.id);
    else names.push(c.q, qnName(c));
  }
  return names;
}

export function simulate(
  circuit: Circuit,
  stimulus: Stimulus,
  options: SimOptions = { mode: 'ideal' },
): Trace {
  const ideal = options.mode === 'ideal';
  const delays = { ...DEFAULT_DELAYS, ...options.delays };
  const wireModel = options.wireModel ?? 'inertial';

  const signals = signalNames(circuit);
  const known = new Set<string>();
  for (const name of signals) {
    if (known.has(name)) throw new Error(`信号名が重複しています: ${name}`);
    known.add(name);
  }

  // ---- 実行時の構造を作る ----
  const pins: Pin[] = [];
  const fanout = new Map<string, number[]>();
  const rts: Rt[] = [];

  const addPin = (owner: number, conn: Conn): number => {
    const source = connRef(conn);
    const wire = connWire(conn);
    if (typeof source === 'string' && !known.has(source)) {
      throw new Error(`未定義の信号を参照しています: ${source}（${circuit.id}）`);
    }
    const delay = ideal || wire === undefined ? 0 : (delays.wire?.[wire] ?? 0);
    const index = pins.length;
    pins.push({ owner, source, wire, delay, value: 0, serial: 0 });
    if (typeof source === 'string') {
      const list = fanout.get(source);
      if (list) list.push(index);
      else fanout.set(source, [index]);
    }
    return index;
  };

  circuit.components.forEach((def, owner) => {
    if (def.kind === 'gate') {
      if (def.inputs.length === 0 || (def.op === 'NOT' && def.inputs.length !== 1)) {
        throw new Error(`ゲートの入力数が不正です: ${def.id}`);
      }
      rts.push({
        kind: 'gate',
        def,
        pins: def.inputs.map((conn) => addPin(owner, conn)),
        decided: 0,
        delay: ideal ? 0 : (delays.gateById?.[def.id] ?? delays.gate),
      });
      return;
    }
    const data: Partial<Record<DataPinName, number>> = {};
    for (const name of DATA_PINS[def.type]) {
      const conn = def[name];
      if (conn === undefined) throw new Error(`${def.id} の入力 ${name} が接続されていません`);
      data[name] = addPin(owner, conn);
    }
    rts.push({
      kind: 'ff',
      def,
      qn: qnName(def),
      clock: addPin(owner, def.clock),
      data,
      clr: def.clr ? addPin(owner, def.clr.conn) : undefined,
      pr: def.pr ? addPin(owner, def.pr.conn) : undefined,
      q: options.init?.[def.id] ?? def.init ?? 0,
      delay: ideal ? 0 : (delays.ffById?.[def.id] ?? delays.ff),
    });
  });

  // ---- 初期状態を決める（t=0 より前に落ち着いた状態）----
  const value: Record<string, Level> = {};
  for (const name of circuit.inputs) value[name] = stimulus.initial?.[name] ?? 0;
  for (const name of Object.keys(stimulus.initial ?? {})) {
    if (!circuit.inputs.includes(name)) throw new Error(`入力ではない信号に初期値があります: ${name}`);
  }
  const refValue = (ref: Ref): Level => (typeof ref === 'string' ? (value[ref] ?? 0) : ref);
  const asyncActive = (rt: FFRt, which: 'clr' | 'pr'): boolean => {
    const index = rt[which];
    const def = rt.def[which];
    if (index === undefined || def === undefined) return false;
    return pins[index]!.value === (def.active === 'high' ? 1 : 0);
  };

  for (let round = 0; ; round++) {
    if (round > 1000) throw new Error(`初期状態が定まりません（発振）: ${circuit.id}`);
    let changed = false;
    for (const rt of rts) {
      if (rt.kind === 'ff') {
        value[rt.def.q] = rt.q;
        value[rt.qn] = rt.q === 1 ? 0 : 1;
      }
    }
    for (const rt of rts) {
      if (rt.kind !== 'gate') continue;
      const out = evalGate(
        rt.def.op,
        rt.def.inputs.map((conn) => refValue(connRef(conn))),
      );
      if (value[rt.def.id] !== out) {
        value[rt.def.id] = out;
        changed = true;
      }
      rt.decided = out;
    }
    for (const pin of pins) pin.value = refValue(pin.source);
    for (const rt of rts) {
      if (rt.kind !== 'ff') continue;
      const forced: Level | undefined = asyncActive(rt, 'clr') ? 0 : asyncActive(rt, 'pr') ? 1 : undefined;
      if (forced !== undefined && rt.q !== forced) {
        rt.q = forced;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const initial = { ...value };

  // ---- イベントキュー ----
  const queue: Ev[] = [];
  let seq = 0;
  const before = (a: Ev, b: Ev): boolean =>
    a.t !== b.t ? a.t < b.t : a.delta !== b.delta ? a.delta < b.delta : a.seq < b.seq;
  const push = (ev: Ev): void => {
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (before(queue[mid]!, ev)) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, ev);
  };

  for (const change of stimulus.changes) {
    if (!circuit.inputs.includes(change.signal)) {
      throw new Error(`入力ではない信号を刺激しています: ${change.signal}`);
    }
    push({
      kind: 'sig',
      t: change.t,
      delta: 0,
      seq: seq++,
      signal: change.signal,
      value: change.value,
      cause: { kind: 'stimulus' },
    });
  }

  const changes: Change[] = [];

  // ---- メインループ ----
  while (queue.length > 0) {
    const head = queue[0]!;
    if (head.t > stimulus.end) break;
    const { t, delta } = head;
    if (delta > MAX_DELTAS) throw new Error(`t=${t} で回路が発振しています: ${circuit.id}`);

    const batch: Ev[] = [];
    while (queue.length > 0 && queue[0]!.t === t && queue[0]!.delta === delta) batch.push(queue.shift()!);

    /** この delta で変化した端子と、その変化前の値。 */
    const pinOld = new Map<number, Level>();
    const setPin = (index: number, v: Level): void => {
      const pin = pins[index]!;
      if (pin.value === v) return;
      if (!pinOld.has(index)) pinOld.set(index, pin.value);
      pin.value = v;
    };

    const changedSignals: string[] = [];
    for (const ev of batch) {
      if (ev.kind === 'sig') {
        if (value[ev.signal] === ev.value) continue;
        value[ev.signal] = ev.value;
        changes.push({ t, delta, signal: ev.signal, value: ev.value, cause: ev.cause });
        changedSignals.push(ev.signal);
      } else {
        const pin = pins[ev.pin]!;
        if (ev.serial !== undefined && ev.serial !== pin.serial) continue; // 取り消された変化
        setPin(ev.pin, ev.value);
      }
    }

    for (const name of changedSignals) {
      const v = value[name]!;
      for (const index of fanout.get(name) ?? []) {
        const pin = pins[index]!;
        if (pin.delay === 0) {
          setPin(index, v);
        } else if (wireModel === 'transport') {
          push({ kind: 'pin', t: t + pin.delay, delta: 0, seq: seq++, pin: index, value: v, serial: undefined });
        } else {
          // 慣性遅延：届く前に元の値へ戻ったら、その変化（短いパルス）は消える。
          pin.serial++;
          if (v !== pin.value) {
            push({ kind: 'pin', t: t + pin.delay, delta: 0, seq: seq++, pin: index, value: v, serial: pin.serial });
          }
        }
      }
    }

    const owners = [...new Set([...pinOld.keys()].map((index) => pins[index]!.owner))].sort((a, b) => a - b);
    const schedule = (delay: number, signal: string, v: Level, cause: Cause): void => {
      push({
        kind: 'sig',
        t: delay > 0 ? t + delay : t,
        delta: delay > 0 ? 0 : delta + 1,
        seq: seq++,
        signal,
        value: v,
        cause,
      });
    };

    for (const owner of owners) {
      const rt = rts[owner]!;
      if (rt.kind === 'gate') {
        const inputs = rt.pins.map((index) => pins[index]!.value);
        const out = evalGate(rt.def.op, inputs);
        if (out === rt.decided) continue;
        rt.decided = out;
        schedule(rt.delay, rt.def.id, out, { kind: 'gate', gate: rt.def.id, at: t, op: rt.def.op, inputs });
        continue;
      }

      let next: Level | undefined;
      let cause: Cause | undefined;
      if (asyncActive(rt, 'clr')) {
        // CLR が働いている間はクロックを無視する（PR より優先）。
        next = 0;
        cause = { kind: 'async', ff: rt.def.id, at: t, pin: 'clr', by: pins[rt.clr!]!.source };
      } else if (asyncActive(rt, 'pr')) {
        next = 1;
        cause = { kind: 'async', ff: rt.def.id, at: t, pin: 'pr', by: pins[rt.pr!]!.source };
      } else if (pinOld.has(rt.clock) && pins[rt.clock]!.value === (rt.def.trigger === 'rising' ? 1 : 0)) {
        // クロックエッジ。入力はエッジ直前の値を読む。
        const inputs: Partial<Record<DataPinName, Level>> = {};
        for (const name of DATA_PINS[rt.def.type]) {
          const index = rt.data[name]!;
          inputs[name] = pinOld.get(index) ?? pins[index]!.value;
        }
        const result = ffNext(rt.def.type, rt.q, inputs);
        next = result.next;
        cause = {
          kind: 'clock',
          ff: rt.def.id,
          at: t,
          edge: rt.def.trigger,
          clockSignal: pins[rt.clock]!.source,
          inputs,
          action: result.action,
        };
      }
      if (next === undefined || cause === undefined || next === rt.q) continue;
      rt.q = next;
      schedule(rt.delay, rt.def.q, next, cause);
      schedule(rt.delay, rt.qn, next === 1 ? 0 : 1, cause);
    }
  }

  return { signals, initial, changes, end: stimulus.end };
}
