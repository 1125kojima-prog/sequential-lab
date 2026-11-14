/**
 * 授業の回路。接続は docs/problems.md の書き起こしに従う。
 * 信号名：cp = Cₚ、clr = 外部CLR、q0 = Q₀、nq0 = Q̄₀。
 */
import { activeHigh, activeLow, ff, gate, wire } from '../engine/build';
import type { Circuit, Conn, FFType, FlipFlop, Trigger } from '../engine/types';

const Q3 = ['q2', 'q1', 'q0'];
const Q4 = ['q3', 'q2', 'q1', 'q0'];

// ---------- 第16回 ----------

/** 16-説明（p.5）：T-FF、立下り、CLR 負論理、Q→次段CK。非同期8進アップ。 */
export const c16_p5: Circuit = {
  id: '16-p5',
  title: '非同期式2³進アップカウンタ（T-FF）',
  inputs: ['cp', 'clr'],
  components: [
    ff('T', 'ff0', 'q0', { trigger: 'falling', clock: 'cp', t: 1, clr: activeLow('clr') }),
    ff('T', 'ff1', 'q1', { trigger: 'falling', clock: 'q0', t: 1, clr: activeLow('clr') }),
    ff('T', 'ff2', 'q2', { trigger: 'falling', clock: 'q1', t: 1, clr: activeLow('clr') }),
  ],
  buses: { Q: Q3 },
};

/** 16-3 上（p.6）：T-FF、立下り、Q̄→次段CK。 */
export const c16_3a: Circuit = {
  id: '16-3a',
  title: '練習3 上の回路',
  inputs: ['cp'],
  components: [
    ff('T', 'ff0', 'q0', { trigger: 'falling', clock: 'cp', t: 1 }),
    ff('T', 'ff1', 'q1', { trigger: 'falling', clock: 'nq0', t: 1 }),
    ff('T', 'ff2', 'q2', { trigger: 'falling', clock: 'nq1', t: 1 }),
  ],
  buses: { Q: Q3 },
};

/** 16-3 下（p.6）：T-FF、立上り、Q→次段CK。 */
export const c16_3b: Circuit = {
  id: '16-3b',
  title: '練習3 下の回路',
  inputs: ['cp'],
  components: [
    ff('T', 'ff0', 'q0', { trigger: 'rising', clock: 'cp', t: 1 }),
    ff('T', 'ff1', 'q1', { trigger: 'rising', clock: 'q0', t: 1 }),
    ff('T', 'ff2', 'q2', { trigger: 'rising', clock: 'q1', t: 1 }),
  ],
  buses: { Q: Q3 },
};

/** 16-4（p.7）：D-FF（D=Q̄）、立下り、CLR 負論理、Q→次段CK。 */
export const c16_4: Circuit = {
  id: '16-4',
  title: '練習4 D-FFによる非同期8進アップカウンタ',
  inputs: ['cp', 'clr'],
  components: [
    ff('D', 'ff0', 'q0', { trigger: 'falling', clock: 'cp', d: 'nq0', clr: activeLow('clr') }),
    ff('D', 'ff1', 'q1', { trigger: 'falling', clock: 'q0', d: 'nq1', clr: activeLow('clr') }),
    ff('D', 'ff2', 'q2', { trigger: 'falling', clock: 'q1', d: 'nq2', clr: activeLow('clr') }),
  ],
  buses: { Q: Q3 },
};

function async5(id: string, title: string, resetGates: Circuit['components']): Circuit {
  return {
    id,
    title,
    inputs: ['cp', 'clr'],
    components: [
      ...resetGates,
      gate('clr_all', 'OR', 'clr', 'rst'),
      ff('D', 'ff0', 'q0', { trigger: 'falling', clock: 'cp', d: 'nq0', clr: activeHigh('clr_all') }),
      ff('D', 'ff1', 'q1', { trigger: 'falling', clock: 'q0', d: 'nq1', clr: activeHigh('clr_all') }),
      ff('D', 'ff2', 'q2', { trigger: 'falling', clock: 'q1', d: 'nq2', clr: activeHigh('clr_all') }),
    ],
    buses: { Q: Q3 },
  };
}

/** 16-5（p.9）：リセット信号 = Q₂·Q̄₁·Q₀。CLR 正論理、外部CLRとOR。 */
export const c16_5: Circuit = async5('16-5', '練習5 非同期5進アップカウンタ', [
  gate('not_q1', 'NOT', 'q1'),
  gate('rst', 'AND', 'q0', 'not_q1', 'q2'),
]);

/** 16-5 簡略版（p.10）：リセット信号 = Q₂·Q₀。 */
export const c16_5s: Circuit = async5('16-5s', '練習5 簡略版（Q₂とQ₀のAND）', [gate('rst', 'AND', 'q0', 'q2')]);

function dRipple(id: string, title: string, bits: number, next: 'q' | 'nq'): Circuit {
  const components: FlipFlop[] = [];
  for (let k = 0; k < bits; k++) {
    components.push(
      ff('D', `ff${k}`, `q${k}`, {
        trigger: 'rising',
        clock: k === 0 ? 'cp' : `${next}${k - 1}`,
        d: `nq${k}`,
        clr: activeLow('clr'),
      }),
    );
  }
  return { id, title, inputs: ['cp', 'clr'], components, buses: { Q: Q4 } };
}

/** 16-演2 上（p.11）：立上り D-FF、Q→次段CK。 */
export const c16_ex2a: Circuit = dRipple('16-ex2a', '演習2 上の回路', 4, 'q');
/** 16-演2 下（p.11）：立上り D-FF、Q̄→次段CK。 */
export const c16_ex2b: Circuit = dRipple('16-ex2b', '演習2 下の回路', 4, 'nq');

/** 16-演3（p.12）：立上り D-FF、CLR 負論理。CLR = AND(外部CLR, NAND(Q₂,Q₁,Q₀))。 */
export const c16_ex3: Circuit = {
  id: '16-ex3',
  title: '演習3 非同期7進アップカウンタ',
  inputs: ['cp', 'clr'],
  components: [
    gate('rst_n', 'NAND', 'q0', 'q1', 'q2'),
    gate('clr_all', 'AND', 'clr', 'rst_n'),
    ff('D', 'ff0', 'q0', { trigger: 'rising', clock: 'cp', d: 'nq0', clr: activeLow('clr_all') }),
    ff('D', 'ff1', 'q1', { trigger: 'rising', clock: 'nq0', d: 'nq1', clr: activeLow('clr_all') }),
    ff('D', 'ff2', 'q2', { trigger: 'rising', clock: 'nq1', d: 'nq2', clr: activeLow('clr_all') }),
  ],
  buses: { Q: Q3 },
};

// ---------- 第17回 ----------

/**
 * 17-1（p.1）／17-2（p.3）：JK-FF、立下り、CLR 正論理、リセット信号 = Q₂·Q₀。
 * 配線 'rst_ff0'（リセット信号 → FF₀ の CLR）に遅延を入れると 17-2 の誤動作になる。
 */
export const c17_1: Circuit = {
  id: '17-1',
  title: '練習1 JK-FFによる非同期5進アップカウンタ',
  inputs: ['cp'],
  components: [
    gate('rst', 'AND', 'q0', 'q2'),
    ff('JK', 'ff0', 'q0', { trigger: 'falling', clock: 'cp', j: 1, k: 1, clr: activeHigh(wire('rst', 'rst_ff0')) }),
    ff('JK', 'ff1', 'q1', { trigger: 'falling', clock: 'q0', j: 1, k: 1, clr: activeHigh('rst') }),
    ff('JK', 'ff2', 'q2', { trigger: 'falling', clock: 'q1', j: 1, k: 1, clr: activeHigh('rst') }),
  ],
  buses: { Q: Q3 },
};

/**
 * 17-3（p.4）：改良型。FF₂ は Cₚ で動き、J₂ = Q₀·Q₁、K₂ = J̄₂。Q₂ が FF₀ と FF₁ の CLR。
 * 見比べ用に、Q₂ → FF₀ の CLR にも配線 'rst_ff0' を置く。
 */
export const c17_3: Circuit = {
  id: '17-3',
  title: '改良型非同期5進カウンタ',
  inputs: ['cp'],
  components: [
    gate('j2', 'AND', 'q0', 'q1'),
    gate('k2', 'NOT', 'j2'),
    ff('JK', 'ff0', 'q0', { trigger: 'falling', clock: 'cp', j: 1, k: 1, clr: activeHigh(wire('q2', 'rst_ff0')) }),
    ff('JK', 'ff1', 'q1', { trigger: 'falling', clock: 'q0', j: 1, k: 1, clr: activeHigh('q2') }),
    ff('JK', 'ff2', 'q2', { trigger: 'falling', clock: 'cp', j: 'j2', k: 'k2', clr: activeHigh(0) }),
  ],
  buses: { Q: Q3 },
};

/** 17-5（p.6）：2進カウンタによる 1/2 分周。 */
export const c17_5: Circuit = {
  id: '17-5',
  title: '2進カウンタによる分周',
  inputs: ['cp'],
  components: [ff('JK', 'ff0', 'q', { trigger: 'falling', clock: 'cp', j: 1, k: 1 })],
};

/** 17-演1（p.7）：非同期16進カウンタ（JK-FF×4）。出力は Q₃。 */
export const c17_ex1: Circuit = {
  id: '17-ex1',
  title: '演習1 1/16 プリスケーラ',
  inputs: ['cp'],
  components: [0, 1, 2, 3].map((k) =>
    ff('JK', `ff${k}`, `q${k}`, { trigger: 'falling', clock: k === 0 ? 'cp' : `q${k - 1}`, j: 1, k: 1 }),
  ),
  buses: { Q: Q4 },
};

// ---------- 第18回 ----------

type SyncSpec = { type: FFType; inputs: Record<string, Conn>[]; gates?: Circuit['components']; clr?: boolean };

function syncCounter(id: string, title: string, spec: SyncSpec): Circuit {
  const n = spec.inputs.length;
  const ffs = spec.inputs.map((pins, k) =>
    ff(spec.type, `ff${k}`, `q${k}`, {
      trigger: 'falling',
      clock: 'cp',
      ...pins,
      ...(spec.clr ? { clr: activeHigh('clr') } : {}),
    }),
  );
  return {
    id,
    title,
    inputs: spec.clr ? ['cp', 'clr'] : ['cp'],
    components: [...(spec.gates ?? []), ...ffs],
    buses: { Q: Array.from({ length: n }, (_, k) => `q${n - 1 - k}`) },
  };
}

/** 18-1（p.3）：J₀=K₀=1、J₁=K₁=Q₀。同期4進。CLR 正論理。 */
export const c18_1: Circuit = syncCounter('18-1', '練習1 同期4進カウンタ', {
  type: 'JK',
  clr: true,
  inputs: [
    { j: 1, k: 1 },
    { j: 'q0', k: 'q0' },
  ],
});

/** 18-2（p.4）：J₂=K₂=Q₁ と単純に連結した回路（8進にならない）。 */
export const c18_2: Circuit = syncCounter('18-2', '練習2 単純に連結した3ビット回路', {
  type: 'JK',
  clr: true,
  inputs: [
    { j: 1, k: 1 },
    { j: 'q0', k: 'q0' },
    { j: 'q1', k: 'q1' },
  ],
});

/** 18-練3（p.6）：J₂=K₂=Q₀·Q₁。同期8進。 */
export const c18_p3: Circuit = syncCounter('18-p3', '練習3 同期8進カウンタ', {
  type: 'JK',
  gates: [gate('a01', 'AND', 'q0', 'q1')],
  inputs: [
    { j: 1, k: 1 },
    { j: 'q0', k: 'q0' },
    { j: 'a01', k: 'a01' },
  ],
});

/** 18-練4（p.8）：AND を共用した同期16進。 */
export const c18_p4: Circuit = syncCounter('18-p4', '練習4 同期16進カウンタ', {
  type: 'JK',
  gates: [gate('a01', 'AND', 'q0', 'q1'), gate('a012', 'AND', 'a01', 'q2')],
  inputs: [
    { j: 1, k: 1 },
    { j: 'q0', k: 'q0' },
    { j: 'a01', k: 'a01' },
    { j: 'a012', k: 'a012' },
  ],
});

/** 18 p.10：同期3進 D-FF。D₁=Q₀、D₀=Q̄₁Q̄₀。 */
export const c18_d3: Circuit = syncCounter('18-d3', '同期3進カウンタ（D-FF）', {
  type: 'D',
  clr: true,
  gates: [gate('d0', 'AND', 'nq1', 'nq0')],
  inputs: [{ d: 'd0' }, { d: 'q0' }],
});

/** 18-練5（p.12）：同期3進 RS-FF。S₁=Q₀、R₁=Q̄₀、S₀=Q̄₁Q̄₀、R₀=Q₀。 */
export const c18_rs3: Circuit = syncCounter('18-rs3', '練習5 同期3進カウンタ（RS-FF）', {
  type: 'RS',
  clr: true,
  gates: [gate('s0', 'AND', 'nq1', 'nq0')],
  inputs: [
    { s: 's0', r: 'q0' },
    { s: 'q0', r: 'nq0' },
  ],
});

/** 18-演2（p.16）：同期5進 JK-FF。J₂=Q₁Q₀、K₂=1、J₁=K₁=Q₀、J₀=Q̄₂、K₀=1。 */
export const c18_ex2: Circuit = syncCounter('18-ex2', '演習2 同期5進カウンタ', {
  type: 'JK',
  gates: [gate('a01', 'AND', 'q0', 'q1')],
  inputs: [
    { j: 'nq2', k: 1 },
    { j: 'q0', k: 'q0' },
    { j: 'a01', k: 1 },
  ],
});

// ---------- 第19回 ----------

function parallelRegister(id: string, title: string, bits: number, trigger: Trigger): Circuit {
  const order = Array.from({ length: bits }, (_, i) => bits - 1 - i);
  return {
    id,
    title,
    inputs: ['cp', 'clr', ...order.map((k) => `a${k}`)],
    components: order.map((k) =>
      ff('D', `ff${k}`, `q${k}`, { trigger, clock: 'cp', d: `a${k}`, clr: activeLow('clr') }),
    ),
    buses: { A: order.map((k) => `a${k}`), Q: order.map((k) => `q${k}`) },
  };
}

/** 19 p.6：4ビットパラレルレジスタ（立上り、CLR 負論理）。 */
export const c19_reg4: Circuit = parallelRegister('19-reg4', '4ビットパラレルレジスタ', 4, 'rising');
/** 19-演1（p.9）：3ビットパラレルレジスタ（立下り）。 */
export const c19_ex1: Circuit = parallelRegister('19-ex1', '演習1 3ビットパラレルレジスタ', 3, 'falling');

/** 19 p.7：SIPO。A→Q₃→Q₂→Q₁→Q₀。 */
export const c19_sipo: Circuit = {
  id: '19-sipo',
  title: '4ビットシフトレジスタ（シリアル-パラレル変換）',
  inputs: ['cp', 'clr', 'a'],
  components: [3, 2, 1, 0].map((k) =>
    ff('D', `ff${k}`, `q${k}`, {
      trigger: 'rising',
      clock: 'cp',
      d: k === 3 ? 'a' : `q${k + 1}`,
      clr: activeLow('clr'),
    }),
  ),
  buses: { Q: Q4 },
};

function piso(id: string, title: string, bits: number, trigger: Trigger): Circuit {
  const order = Array.from({ length: bits }, (_, i) => bits - 1 - i);
  return {
    id,
    title,
    inputs: ['cp', 'clr', ...order.map((k) => `a${k}`)],
    components: order.map((k) =>
      ff('D', `ff${k}`, `q${k}`, {
        trigger,
        clock: 'cp',
        d: k === bits - 1 ? 0 : `q${k + 1}`,
        clr: activeLow('clr'),
        pr: activeHigh(`a${k}`),
      }),
    ),
    buses: { A: order.map((k) => `a${k}`), Q: order.map((k) => `q${k}`) },
  };
}

/** 19 p.8：PISO（立上り、PR 正論理）。出力は q0。 */
export const c19_piso: Circuit = piso('19-piso', '4ビットシフトレジスタ（パラレル-シリアル変換）', 4, 'rising');
/** 19-演2（p.10）：3ビット PISO（立下り）。出力は q0。 */
export const c19_ex2: Circuit = piso('19-ex2', '演習2 3ビット（パラレル-シリアル）シフトレジスタ', 3, 'falling');

/** 19-演3（p.11）：SIPO の各 Q に NOT を付けて LED（負論理）を駆動。出力は y3〜y0。 */
export const c19_ex3: Circuit = {
  id: '19-ex3',
  title: '演習3 LEDが順に点灯する回路',
  inputs: c19_sipo.inputs,
  components: [...c19_sipo.components, ...[3, 2, 1, 0].map((k) => gate(`y${k}`, 'NOT', `q${k}`))],
  buses: { Q: Q4, Y: ['y3', 'y2', 'y1', 'y0'] },
};

// ---------- 第20回 ----------

function jkShift(id: string, title: string, head: { j: Conn; k: Conn }, extra: Circuit['components'], inputs: string[]): Circuit {
  return {
    id,
    title,
    inputs,
    components: [
      ...extra,
      ...[3, 2, 1, 0].map((k) =>
        ff('JK', `ff${k}`, `q${k}`, {
          trigger: 'rising',
          clock: 'cp',
          j: k === 3 ? head.j : `q${k + 1}`,
          k: k === 3 ? head.k : `nq${k + 1}`,
          clr: activeLow('clr'),
        }),
      ),
    ],
    buses: { Q: Q4 },
  };
}

/** 20-練1（p.1）：JK-FF による SIPO。J=A、K=Ā。 */
export const c20_p1: Circuit = jkShift('20-p1', '練習1 JK-FFのシフトレジスタ', { j: 'a', k: 'na' }, [gate('na', 'NOT', 'a')], ['cp', 'clr', 'a']);

/** 20 p.3：リングカウンタ。J₃=Q₀、K₃=Q̄₀。 */
export const c20_ring: Circuit = jkShift('20-ring', 'リングカウンタ', { j: 'q0', k: 'nq0' }, [], ['cp', 'clr']);

/** 20-練4（p.4）：自己補正型リングカウンタ。J₃=Q̄₃Q̄₂Q̄₁、K₃=J̄₃。 */
export const c20_self: Circuit = jkShift(
  '20-self',
  '自己補正型リングカウンタ',
  { j: 'j3', k: 'k3' },
  [gate('j3', 'AND', 'nq3', 'nq2', 'nq1'), gate('k3', 'NOT', 'j3')],
  ['cp', 'clr'],
);

/** 20-練5（p.5）：ジョンソンカウンタ。J₃=Q̄₀、K₃=Q₀。 */
export const c20_johnson: Circuit = jkShift('20-johnson', 'ジョンソンカウンタ', { j: 'nq0', k: 'q0' }, [], ['cp', 'clr']);

// ---------- 第21回 ----------

/**
 * 21-練5（p.8）：自動販売機。入力ラッチ（x1in→x1、x0in→x0）と状態FF（q1, q0）。
 * すべて立上り D-FF、CLR 負論理。論理式は練習4の1つ目の解。
 */
export const c21_vending: Circuit = {
  id: '21-vending',
  title: '自動販売機の順序回路',
  inputs: ['cp', 'clr', 'x1in', 'x0in'],
  components: [
    ff('D', 'ffx1', 'x1', { trigger: 'rising', clock: 'cp', d: 'x1in', clr: activeLow('clr') }),
    ff('D', 'ffx0', 'x0', { trigger: 'rising', clock: 'cp', d: 'x0in', clr: activeLow('clr') }),
    // Y₁ = Q₁Q₀X₁
    gate('y1', 'AND', 'q1', 'q0', 'x1'),
    // Y₀ = Q₁Q₀X₀ + Q₁Q̄₀X₁
    gate('y0_a', 'AND', 'q1', 'q0', 'x0'),
    gate('y0_b', 'AND', 'q1', 'nq0', 'x1'),
    gate('y0', 'OR', 'y0_a', 'y0_b'),
    // Q₁′ = Q̄₁X₁ + Q̄₁Q₀X₀ + Q₁Q̄₀X̄₁ + Q₁X̄₁X̄₀
    gate('q1n_a', 'AND', 'nq1', 'x1'),
    gate('q1n_b', 'AND', 'nq1', 'q0', 'x0'),
    gate('q1n_c', 'AND', 'q1', 'nq0', 'nx1'),
    gate('q1n_d', 'AND', 'q1', 'nx1', 'nx0'),
    gate('q1next', 'OR', 'q1n_a', 'q1n_b', 'q1n_c', 'q1n_d'),
    // Q₀′ = Q̄₀X₀ + Q₀X̄₁X̄₀ + Q̄₁Q₀X̄₀
    gate('q0n_a', 'AND', 'nq0', 'x0'),
    gate('q0n_b', 'AND', 'q0', 'nx1', 'nx0'),
    gate('q0n_c', 'AND', 'nq1', 'q0', 'nx0'),
    gate('q0next', 'OR', 'q0n_a', 'q0n_b', 'q0n_c'),
    ff('D', 'ff1', 'q1', { trigger: 'rising', clock: 'cp', d: 'q1next', clr: activeLow('clr') }),
    ff('D', 'ff0', 'q0', { trigger: 'rising', clock: 'cp', d: 'q0next', clr: activeLow('clr') }),
  ],
  buses: { Q: ['q1', 'q0'], X: ['x1', 'x0'], Y: ['y1', 'y0'], 'Q′': ['q1next', 'q0next'] },
};

export const CIRCUITS: readonly Circuit[] = [
  c16_p5, c16_3a, c16_3b, c16_4, c16_5, c16_5s, c16_ex2a, c16_ex2b, c16_ex3,
  c17_1, c17_3, c17_5, c17_ex1,
  c18_1, c18_2, c18_p3, c18_p4, c18_d3, c18_rs3, c18_ex2,
  c19_reg4, c19_ex1, c19_sipo, c19_piso, c19_ex2, c19_ex3,
  c20_p1, c20_ring, c20_self, c20_johnson,
  c21_vending,
];
