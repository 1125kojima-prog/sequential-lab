/**
 * 回路ごとの配置（素子の座標と母線の位置）。キーは回路の id。
 * FF の並びはスライドに合わせる：カウンタは左から FF₀、レジスタ類は左から上位ビット。
 * 座標の目安：FF の上辺 y=90（下辺 150）。上の母線は y=20〜76、下の母線は y=160〜。
 */
import type { LayoutSpec } from './layout';

const FY = 90;
const PITCH = 150;

/** FF を横一列に並べる。 */
function row(ids: string[], x0: number, pitch = PITCH): Record<string, [number, number]> {
  return Object.fromEntries(ids.map((id, i) => [id, [x0 + i * pitch, FY]]));
}

const up = (n: number): string[] => Array.from({ length: n }, (_, k) => `ff${k}`);
const down = (n: number): string[] => up(n).reverse();
const qs = (n: number): string[] => Array.from({ length: n }, (_, k) => `q${k}`);
const widthOf = (n: number, x0: number): number => x0 + (n - 1) * PITCH + 60 + 70;

/** 非同期式（リップル）カウンタ：FF を左から並べ、定数 1 は上、CLR は下の母線。 */
function ripple(n: number, extra: Partial<LayoutSpec> = {}, loop = false): LayoutSpec {
  // loop：D=Q̄ の帰還を FF の上に回す。
  const feedback = loop ? Object.fromEntries(Array.from({ length: n }, (_, k) => [`nq${k}`, 72])) : {};
  return {
    width: widthOf(n, 120),
    height: 245,
    ffs: row(up(n), 120),
    outputs: qs(n),
    outY: 205,
    ...extra,
    tracks: { $1: 58, clr: 172, ...feedback, ...extra.tracks },
  };
}

/** 16-5 など：下にリセット信号を作るゲートを置く。FF は x=190 から。 */
function withReset(extra: Partial<LayoutSpec>): LayoutSpec {
  const n = 3;
  const feedback = Object.fromEntries(Array.from({ length: n }, (_, k) => [`nq${k}`, 72]));
  return {
    width: widthOf(n, 190),
    height: 290,
    ffs: row(up(n), 190),
    outputs: qs(n),
    outY: 250,
    ...extra,
    tracks: { $1: 58, clr_all: 170, ...feedback, ...extra.tracks },
  };
}

/** 同期式カウンタ：クロックと CLR は下の母線。 */
function sync(n: number, extra: Partial<LayoutSpec> = {}): LayoutSpec {
  return {
    width: widthOf(n, 120),
    height: 255,
    ffs: row(up(n), 120),
    outputs: qs(n),
    outY: 215,
    ...extra,
    tracks: { cp: 190, clr: 174, ...extra.tracks },
  };
}

/** レジスタ・シフトレジスタ：左から上位ビット。クロックと CLR は下の母線。 */
function register(n: number, x0: number, extra: Partial<LayoutSpec> = {}): LayoutSpec {
  return {
    width: widthOf(n, x0),
    height: 255,
    ffs: row(down(n), x0),
    outputs: qs(n).reverse(),
    outY: 215,
    ...extra,
    tracks: { cp: 190, clr: 174, ...extra.tracks },
  };
}

/** 各 FF の上から入る入力（A₃ → D、または A₃ → PR）。 */
function topPorts(n: number, x0: number, dx: number): Record<string, [number, number]> {
  return Object.fromEntries(down(n).map((_, i) => [`a${n - 1 - i}`, [x0 + i * PITCH + dx, 46]]));
}

export const LAYOUTS: Record<string, LayoutSpec> = {
  // ---------- 第16回 ----------
  '16-p5': ripple(3),
  '16-3a': ripple(3),
  '16-3b': ripple(3),
  '16-4': ripple(3, {}, true),
  '16-5': withReset({
    gates: {
      clr_all: { at: [95, 158] },
      rst: { at: [150, 192], flip: true },
      not_q1: { at: [330, 202], flip: true },
    },
    tracks: { rst: 210 },
  }),
  '16-5s': withReset({
    gates: { clr_all: { at: [95, 158] }, rst: { at: [150, 198], flip: true } },
    tracks: { rst: 210 },
  }),
  '16-ex2a': ripple(4, {}, true),
  '16-ex2b': ripple(4, { taps: ['ff1.ck', 'ff2.ck', 'ff3.ck'] }, true),
  '16-ex3': withReset({
    gates: { clr_all: { at: [95, 158] }, rst_n: { at: [150, 192], flip: true } },
    tracks: { rst_n: 210 },
    taps: ['ff1.ck', 'ff2.ck'],
  }),

  // ---------- 第17回 ----------
  '17-1': withReset({
    gates: { rst: { at: [150, 198], flip: true } },
    tracks: { rst: 172 },
  }),
  '17-3': {
    width: 740,
    height: 310,
    ffs: { ff0: [150, FY], ff1: [300, FY], ff2: [600, FY] },
    gates: { j2: { at: [460, 200] }, k2: { at: [540, 128] } },
    tracks: { $1: 58, q2: 186, cp: 244 },
    outputs: ['q0', 'q1', 'q2'],
    outY: 266,
  },
  '17-5': ripple(1, { outputs: ['q'] }),
  '17-ex1': ripple(4),

  // ---------- 第18回 ----------
  '18-1': sync(2, { tracks: { $1: 58 } }),
  '18-2': sync(3, { tracks: { $1: 58 } }),
  '18-p3': sync(3, {
    ffs: { ff0: [120, FY], ff1: [270, FY], ff2: [520, FY] },
    gates: { a01: { at: [420, 30] } },
    tracks: { $1: 58 },
    width: 660,
  }),
  '18-p4': sync(4, {
    ffs: { ff0: [120, FY], ff1: [270, FY], ff2: [520, FY], ff3: [770, FY] },
    gates: { a01: { at: [420, 30] }, a012: { at: [670, 30] } },
    tracks: { $1: 58 },
    width: 910,
  }),
  '18-d3': sync(2, {
    ffs: { ff0: [150, FY], ff1: [300, FY] },
    gates: { d0: { at: [160, 30], flip: true } },
    tracks: { d0: 42 },
    width: 440,
  }),
  '18-rs3': sync(2, {
    ffs: { ff0: [150, FY], ff1: [300, FY] },
    gates: { s0: { at: [160, 30], flip: true } },
    tracks: { s0: 42, q0: 160, clr: 176, cp: 192 },
    taps: ['ff1.s'],
    width: 440,
  }),
  '18-ex2': sync(3, {
    ffs: { ff0: [120, FY], ff1: [270, FY], ff2: [520, FY] },
    gates: { a01: { at: [420, 30] } },
    tracks: { nq2: 16, $1: 62 },
    width: 660,
  }),

  // ---------- 第19回 ----------
  '19-reg4': register(4, 120, { ports: topPorts(4, 120, -26) }),
  '19-ex1': register(3, 120, { ports: topPorts(3, 120, -26) }),
  '19-sipo': register(4, 120),
  '19-piso': register(4, 120, { ports: topPorts(4, 120, 30), outputs: ['q0'] }),
  '19-ex2': register(3, 120, { ports: topPorts(3, 120, 30), outputs: ['q0'] }),
  '19-ex3': register(4, 120, {
    gates: {
      y3: { at: [204, 202] },
      y2: { at: [354, 202] },
      y1: { at: [504, 202] },
      y0: { at: [654, 202] },
    },
    outputs: ['y3', 'y2', 'y1', 'y0'],
    outY: 240,
    height: 280,
    width: 770,
  }),

  // ---------- 第20回 ----------
  '20-p1': register(4, 200, { gates: { na: { at: [140, 128] } }, tracks: { a: 104 } }),
  '20-ring': register(4, 120, { tracks: { q0: 58, nq0: 44 } }),
  '20-johnson': register(4, 120, { tracks: { nq0: 44, q0: 58 } }),
  '20-self': register(4, 220, {
    gates: { j3: { at: [150, 24], flip: true }, k3: { at: [164, 128] } },
  }),
};
