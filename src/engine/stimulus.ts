import type { Level, Stimulus, Trigger } from './types';

export type ClockSpec = {
  signal: string;
  /** 回路が反応するエッジ。k 番目（k=1,2,…）のエッジを t = k × period に置く。 */
  edge: Trigger;
  period: number;
  /** 反応するエッジの数。 */
  edges: number;
};

/**
 * クロックの刺激列を作る。
 * 立下りで動く回路：0 から始まり、k×period − period/2 で立上り、k×period で立下る。
 * 立上りで動く回路：0 から始まり、k×period で立上り、k×period + period/2 で立下る。
 * 終了時刻は (edges + 1) × period。
 */
export function clock(spec: ClockSpec): Stimulus {
  const { signal, edge, period, edges } = spec;
  const half = period / 2;
  const changes: Stimulus['changes'] = [];
  for (let k = 1; k <= edges; k++) {
    if (edge === 'falling') {
      changes.push({ t: k * period - half, signal, value: 1 });
      changes.push({ t: k * period, signal, value: 0 });
    } else {
      changes.push({ t: k * period, signal, value: 1 });
      changes.push({ t: k * period + half, signal, value: 0 });
    }
  }
  return { initial: { [signal]: 0 }, changes, end: (edges + 1) * period };
}

/** 刺激列に、入力の初期値と変化を足す。 */
export function withInputs(
  base: Stimulus,
  initial: Record<string, Level>,
  changes: [t: number, signal: string, value: Level][] = [],
): Stimulus {
  return {
    initial: { ...base.initial, ...initial },
    changes: [...base.changes, ...changes.map(([t, signal, value]) => ({ t, signal, value }))].sort(
      (a, b) => a.t - b.t,
    ),
    end: base.end,
  };
}

/** 多ビット入力を16進の値に変える刺激。names は上位ビットから。 */
export function busSet(names: readonly string[], t: number, hex: string): [number, string, Level][] {
  const v = parseInt(hex, 16);
  return names.map((name, i) => [t, name, ((v >> (names.length - 1 - i)) & 1) as Level]);
}

/** 多ビット入力の初期値。 */
export function busInit(names: readonly string[], hex: string): Record<string, Level> {
  return Object.fromEntries(busSet(names, 0, hex).map(([, name, value]) => [name, value]));
}
