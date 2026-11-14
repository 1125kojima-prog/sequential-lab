/**
 * 設計した論理式から回路と場面（タイミングチャートで確かめるための入力波形）を作る。
 * - カウンタ：立下りの FF だけ（第18回の回路と同じ形）。
 * - 状態遷移表（ミーリー型／ムーア型）：立上りの FF、CLR 負論理。入力は D-FF でラッチする（第21・22回の回路と同じ形）。
 */
import { activeLow, ff, gate } from '../engine/build';
import { clock, withInputs } from '../engine/stimulus';
import type { Circuit, Component, Conn, FlipFlop, Level, Stimulus } from '../engine/types';
import type { Scene } from '../problems/scenes';
import { FF_PINS, varLabel, type Encoded, type FFKind, type Target } from './fsm';
import { termsLabel } from './expr';
import type { Term } from './minimize';

export type Solution = { target: Target; terms: Term[] };

/** 積和形を AND／OR に展開する。戻り値は、その値を表す信号（または定数）。 */
function buildSum(name: string, terms: readonly Term[], literal: (index: number, positive: boolean) => string, nvars: number, out: Component[]): Conn {
  if (terms.length === 0) return 0;
  if (terms.some((t) => t.mask === 0)) return 1;
  const products = terms.map((t, k): string => {
    const inputs: string[] = [];
    for (let i = 0; i < nvars; i++) {
      const bit = 1 << (nvars - 1 - i);
      if (t.mask & bit) inputs.push(literal(i, (t.value & bit) !== 0));
    }
    if (inputs.length === 1) return inputs[0]!;
    const id = terms.length === 1 ? name : `${name}_t${k + 1}`;
    out.push(gate(id, 'AND', ...inputs));
    return id;
  });
  if (products.length === 1) return products[0]!;
  out.push(gate(name, 'OR', ...products));
  return name;
}

export type Generated = {
  circuit: Circuit;
  /** 各対象（FF の入力、出力）の値を表す信号。定数や、ほかの信号そのものになることもある。 */
  signals: Record<string, Conn>;
};

export function generateCircuit(enc: Encoded, kind: FFKind, solutions: readonly Solution[]): Generated {
  const { n, vars, spec } = enc;
  const counter = spec.machine === 'counter';
  const components: Component[] = [];
  const literal = (index: number, positive: boolean): string => {
    const name = vars[index]!;
    if (positive) return name;
    // 状態変数と、ラッチした入力は FF の Q̄ を使う。
    return `n${name}`;
  };

  // 入力のラッチ（X′ → X）。
  const latches: FlipFlop[] = spec.inputVars.map((name) =>
    ff('D', `ff_${name}`, name, { trigger: 'rising', clock: 'cp', d: `${name}in`, clr: activeLow('clr') }),
  );

  const signals: Record<string, Conn> = {};
  const logic: Component[] = [];
  for (const { target, terms } of solutions) {
    signals[target.name] = buildSum(target.name, terms, literal, vars.length, logic);
  }

  const ffs: FlipFlop[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const pins = Object.fromEntries(
      FF_PINS[kind].map((pin) => {
        const conn = signals[`${pin}${i}`];
        if (conn === undefined) throw new Error(`論理式がありません: ${pin}${i}`);
        return [pin, conn];
      }),
    );
    ffs.push(
      ff(kind, `ff${i}`, `q${i}`, {
        trigger: counter ? 'falling' : 'rising',
        clock: 'cp',
        ...pins,
        ...(counter ? {} : { clr: activeLow('clr') }),
      }),
    );
  }
  components.push(...latches, ...logic, ...ffs);

  const stateBits = enc.stateVars;
  const buses: Record<string, string[]> = { Q: stateBits };
  return {
    circuit: {
      id: `design-${spec.id}-${kind}`,
      title: `${spec.title}（${kind}-FF で設計）`,
      inputs: counter ? ['cp'] : ['cp', 'clr', ...spec.inputVars.map((v) => `${v}in`)],
      components,
      buses,
    },
    signals,
  };
}

/** 入力の値の列から刺激列を作る。k 番目の入力は、立上り 2k+3 をまたぐ短いパルス（スライド 21 p.9 と同じ形）。 */
export function inputStimulus(inputVars: readonly string[], values: readonly number[]): Stimulus {
  const edges = 2 * values.length + 4;
  const changes: [number, string, Level][] = [[150, 'clr', 1]];
  values.forEach((value, k) => {
    const t = 100 * (2 * k + 3);
    inputVars.forEach((name, i) => {
      if ((value >> (inputVars.length - 1 - i)) & 1) {
        changes.push([t - 20, `${name}in`, 1], [t + 25, `${name}in`, 0]);
      }
    });
  });
  const initial: Record<string, Level> = { clr: 0 };
  for (const name of inputVars) initial[`${name}in`] = 0;
  return withInputs(clock({ signal: 'cp', edge: 'rising', period: 100, edges }), initial, changes);
}

/** 設計した回路を、タイミングチャートの画面で確かめるための場面。 */
export function generateScene(enc: Encoded, kind: FFKind, solutions: readonly Solution[], inputs: readonly number[]): Scene {
  const { circuit, signals } = generateCircuit(enc, kind, solutions);
  const { spec } = enc;
  const counter = spec.machine === 'counter';
  const stateRows = [...enc.stateVars].reverse();
  // 出力は、ゲートがあればその信号。ほかの信号そのもの（Z₁=Q₁ など）なら、その信号を見る。
  const outputRows = spec.outputVars.flatMap((name) => {
    const conn = signals[name];
    return typeof conn === 'string' && !stateRows.includes(conn) ? [conn] : [];
  });
  const labels: Record<string, string> = {};
  for (const name of spec.inputVars) labels[`${name}in`] = `${varLabel(name)} ′`;
  const varLabels = enc.vars.map(varLabel);
  for (const { target, terms } of solutions) {
    labels[target.name] = target.label;
    // 積項の AND ゲートには、その積項を名前として付ける（変化の理由の文章で使う）。
    terms.forEach((t, k) => {
      labels[`${target.name}_t${k + 1}`] = termsLabel([t], varLabels);
    });
  }
  const cycles = spec.states.length;
  return {
    id: circuit.id,
    lecture: 0,
    title: circuit.title ?? circuit.id,
    source: '設計ガイド',
    circuit,
    clock: 'cp',
    edge: counter ? 'falling' : 'rising',
    stimulus: counter
      ? clock({ signal: 'cp', edge: 'falling', period: 100, edges: 2 * cycles + 1 })
      : inputStimulus(spec.inputVars, inputs),
    rows: counter
      ? ['cp', ...stateRows]
      : ['clr', 'cp', ...spec.inputVars.map((v) => `${v}in`), ...spec.inputVars, ...stateRows, ...outputRows],
    stateBits: enc.stateVars,
    labels,
    delays: { ff: 8, gate: 5 },
    note: counter
      ? '設計ガイドで求めた論理式から作った回路。回路図は表示しない（自動配置はしていない）。'
      : '設計ガイドで求めた論理式から作った回路。入力 X′ は D-FF でラッチしてから使う（授業の回路と同じ形）。回路図は表示しない。',
  };
}
