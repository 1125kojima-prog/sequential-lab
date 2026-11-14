/**
 * 設計ガイドの仕様と、拡大入力要求表。UI には依存しない。
 * 授業の手順：状態遷移表 → 符号化 → 拡大入力要求表 → カルノー図 → 論理式 → 回路。
 */

/** 0／1／X（don't care）。X は null。 */
export type Tri = 0 | 1 | null;

export type FFKind = 'D' | 'T' | 'JK' | 'RS';

/** 状態遷移表（符号化する前）。 */
export type FsmSpec = {
  id: string;
  title: string;
  /** counter は入力も出力もない。mealy は出力が入力と現状態で、moore は現状態だけで決まる。 */
  machine: 'counter' | 'mealy' | 'moore';
  /** 状態の名前。 */
  states: string[];
  /** 入力の変数名（上位から）。例：['x1', 'x0'] */
  inputVars: string[];
  /** 出力の変数名（上位から）。例：['y1', 'y0'] */
  outputVars: string[];
  /** next[状態][入力の値] = 次の状態の番号。null は don't care（使わない入力）。 */
  next: (number | null)[][];
  /** out[状態][入力の値] = 出力の値。null は don't care。moore では入力によらず同じ値を入れる。 */
  out: (number | null)[][];
  /** 入力の値の意味（表示用）。例：['0円', '1000円', '2000円'] */
  inputNames?: string[];
  outputNames?: string[];
};

/** 符号化した後の仕様。変数の並びは [状態変数（上位から）, 入力変数（上位から）]。 */
export type Encoded = {
  spec: FsmSpec;
  /** 状態の符号（states と同じ順）。 */
  codes: number[];
  /** 状態変数の数。 */
  n: number;
  /** 入力変数の数。 */
  m: number;
  /** 状態変数の名前（上位から）。例：['q1', 'q0'] */
  stateVars: string[];
  /** すべての変数（状態、入力の順）。 */
  vars: string[];
  /** 行（状態の符号 << m | 入力の値）ごとの、次の状態の符号と出力。使わない符号の行は null。 */
  next: (number | null)[];
  out: (number | null)[];
};

export function counterSpec(modulus: number, direction: 'up' | 'down'): FsmSpec {
  const states = Array.from({ length: modulus }, (_, k) => String(k));
  const step = direction === 'up' ? 1 : modulus - 1;
  return {
    id: `counter-${modulus}-${direction}`,
    title: `同期${modulus}進${direction === 'up' ? 'アップ' : 'ダウン'}カウンタ`,
    machine: 'counter',
    states,
    inputVars: [],
    outputVars: [],
    next: states.map((_, k) => [(k + step) % modulus]),
    out: states.map(() => [null]),
  };
}

/** 状態の数に必要な FF の数（N ≦ 2ᵏ を満たす最小の k。最低 1）。 */
export function bitsFor(states: number): number {
  return Math.max(1, Math.ceil(Math.log2(states)));
}

/** 符号化する。codes を省くと、状態の番号をそのまま2進数にする。 */
export function encode(spec: FsmSpec, codes: number[] = spec.states.map((_, k) => k)): Encoded {
  const n = bitsFor(Math.max(spec.states.length, ...codes.map((c) => c + 1)));
  const m = spec.inputVars.length;
  if (codes.length !== spec.states.length) throw new Error('状態の数と符号の数が合いません');
  if (new Set(codes).size !== codes.length) throw new Error('同じ符号を2つの状態に割り当てています');
  if (codes.some((c) => !Number.isInteger(c) || c < 0 || c >= 2 ** n)) throw new Error('符号が範囲の外です');
  const size = 2 ** (n + m);
  const next = Array<number | null>(size).fill(null);
  const out = Array<number | null>(size).fill(null);
  spec.states.forEach((_, s) => {
    for (let x = 0; x < 2 ** m; x++) {
      const row = (codes[s]! << m) | x;
      const to = spec.next[s]?.[x] ?? null;
      next[row] = to === null ? null : codes[to]!;
      out[row] = spec.out[s]?.[x] ?? null;
    }
  });
  const stateVars = Array.from({ length: n }, (_, i) => `q${n - 1 - i}`);
  return { spec, codes, n, m, stateVars, vars: [...stateVars, ...spec.inputVars], next, out };
}

/** FF の入力端子（上の段から）。 */
export const FF_PINS: Record<FFKind, string[]> = { D: ['d'], T: ['t'], JK: ['j', 'k'], RS: ['s', 'r'] };

/** Q → Q⁺ にするための FF の入力（入力要求）。Q⁺ が X なら全部 X。 */
export function required(kind: FFKind, q: 0 | 1, next: Tri): Tri[] {
  if (next === null) return FF_PINS[kind].map(() => null);
  switch (kind) {
    case 'D':
      return [next];
    case 'T':
      return [q === next ? 0 : 1];
    case 'JK':
      // 0→0：J=0,K=X／0→1：J=1,K=X／1→0：J=X,K=1／1→1：J=X,K=0
      return q === 0 ? [next, null] : [null, next === 1 ? 0 : 1];
    case 'RS':
      // 0→0：S=0,R=X／0→1：S=1,R=0／1→0：S=0,R=1／1→1：S=X,R=0
      if (q === 0) return next === 0 ? [0, null] : [1, 0];
      return next === 0 ? [0, 1] : [null, 0];
  }
}

/** 論理式を求める対象（FF の入力、または出力）。table は変数の全組み合わせに対する値。 */
export type Target = {
  /** 信号名。例：'j2'、'd0'、'y1' */
  name: string;
  /** 表記（書式は view/label.ts）。例：'J_2' */
  label: string;
  kind: 'ff' | 'output';
  table: Tri[];
};

const bit = (value: number, index: number): 0 | 1 => ((value >> index) & 1) as 0 | 1;

/** 変数名の表記。'q1' → 'Q_1'、'a' → 'A'。 */
export function varLabel(name: string): string {
  const m = /^([a-z]+)(\d*)$/.exec(name);
  if (!m) return name;
  return m[2] ? `${m[1]!.toUpperCase()}_${m[2]}` : m[1]!.toUpperCase();
}

/** 拡大入力要求表から、各 FF 入力と出力の真理値表を作る。 */
export function targets(enc: Encoded, kind: FFKind): Target[] {
  const { n, m } = enc;
  const size = 2 ** (n + m);
  const list: Target[] = [];
  for (let i = n - 1; i >= 0; i--) {
    FF_PINS[kind].forEach((pin, p) => {
      const table: Tri[] = [];
      for (let row = 0; row < size; row++) {
        const state = row >> m;
        const to = enc.next[row]!;
        table.push(required(kind, bit(state, i), to === null ? null : bit(to, i))[p]!);
      }
      list.push({ name: `${pin}${i}`, label: `${pin.toUpperCase()}_${i}`, kind: 'ff', table });
    });
  }
  const outs = enc.spec.outputVars;
  outs.forEach((name, k) => {
    const index = outs.length - 1 - k;
    const table: Tri[] = [];
    for (let row = 0; row < size; row++) {
      const value = enc.out[row]!;
      table.push(value === null ? null : bit(value, index));
    }
    list.push({ name, label: varLabel(name), kind: 'output', table });
  });
  return list;
}

/** 表示用：行の値を '01' のような文字列にする。null は 'X' を並べる。 */
export function bitsText(value: number | null, width: number): string {
  return value === null ? 'X'.repeat(width) : value.toString(2).padStart(width, '0');
}
