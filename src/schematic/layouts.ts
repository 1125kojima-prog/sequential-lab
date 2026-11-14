/**
 * 回路ごとの配置（素子の座標と母線の位置）。キーは回路の id。授業スライドの図に合わせている。
 * - FF の並び：カウンタは左から FF₀、レジスタ類は左から上位ビット。
 * - 母線：定数 1 は上。下は上から Cₚ、CLR の順。
 * - 座標の目安：FF は 60×60、上辺 y=90（下辺 150）、間隔 120。
 */
import type { Frame, LayoutSpec, Note } from './layout';

const FY = 90;
const PITCH = 120;
const RED = '#dc2626';
const BLUE = '#2563eb';

/** FF を横一列に並べる。 */
function row(ids: string[], x0: number, pitch = PITCH): Record<string, [number, number]> {
  return Object.fromEntries(ids.map((id, i) => [id, [x0 + i * pitch, FY]]));
}

const up = (n: number): string[] => Array.from({ length: n }, (_, k) => `ff${k}`);
const down = (n: number): string[] => up(n).reverse();
const qs = (n: number): string[] => Array.from({ length: n }, (_, k) => `q${k}`);
const widthOf = (n: number, x0: number): number => x0 + (n - 1) * PITCH + 60 + 60;

/** 「入力信号」の説明（Cₚ のラベルの上）。 */
const inputNote = (y: number, text = '入力信号'): Note => ({ x: 46, y: y - 12, text, anchor: 'end' });

/** 引き出した出力の名前を囲む点線の枠と説明。x1〜x2 は最初と最後の FF の左端。 */
function outputBox(x1: number, x2: number, outY: number, text: string): { notes: Note[]; frames: Frame[] } {
  const left = x1 + 52;
  return {
    notes: [{ x: left - 6, y: outY + 18, text, anchor: 'end' }],
    frames: [{ x: left, y: outY + 3, w: x2 + 96 - left, h: 22 }],
  };
}

/** 非同期式（リップル）カウンタ：定数 1 は上、CLR は下の母線。loop は D=Q̄ の帰還を FF の上に回す。 */
function ripple(n: number, extra: Partial<LayoutSpec> = {}, loop = false, ckY = 136): LayoutSpec {
  const x0 = 120;
  const feedback = loop ? Object.fromEntries(Array.from({ length: n }, (_, k) => [`nq${k}`, 72])) : {};
  const box = extra.outputs?.length === 0 ? { notes: [], frames: [] } : outputBox(x0, x0 + (n - 1) * PITCH, 205, '出力信号');
  return {
    width: widthOf(n, x0),
    height: 250,
    ffs: row(up(n), x0),
    outputs: qs(n),
    outY: 205,
    frames: box.frames,
    ...extra,
    notes: [inputNote(ckY), ...box.notes, ...(extra.notes ?? [])],
    tracks: { $1: 58, clr: 172, ...feedback, ...extra.tracks },
  };
}

/** 16-5 など：下にリセット信号を作るゲートを置く。FF は x=190 から。 */
function withReset(extra: Partial<LayoutSpec>, ckY = 136): LayoutSpec {
  const n = 3;
  const x0 = 190;
  const feedback = Object.fromEntries(Array.from({ length: n }, (_, k) => [`nq${k}`, 72]));
  return {
    width: widthOf(n, x0),
    height: 295,
    ffs: row(up(n), x0),
    outputs: qs(n),
    outY: 250,
    ...extra,
    notes: [inputNote(ckY), { x: 246, y: 268, text: '出力信号', anchor: 'end' }, ...(extra.notes ?? [])],
    tracks: { $1: 58, clr_all: 170, ...feedback, ...extra.tracks },
  };
}

/** 同期式カウンタ：下の母線は上が Cₚ、下が CLR。FF の名前を箱の上に書く。 */
function sync(n: number, extra: Partial<LayoutSpec> = {}): LayoutSpec {
  const x0 = extra.ffs?.ff0?.[0] ?? 120;
  return {
    width: widthOf(n, 120),
    height: 262,
    ffs: row(up(n), 120),
    outputs: qs(n),
    outY: 216,
    ffNames: true,
    ...extra,
    notes: [inputNote(168), { x: x0 + 52, y: 234, text: '出力信号', anchor: 'end' }, ...(extra.notes ?? [])],
    tracks: { cp: 168, clr: 192, ...extra.tracks },
  };
}

const REG_X = 150;

/** レジスタ・シフトレジスタ：左から上位ビット。端子名は添字なし（D、Q）。 */
function register(n: number, x0: number, extra: Partial<LayoutSpec> = {}): LayoutSpec {
  const box = outputBox(x0, x0 + (n - 1) * PITCH, 216, `出力データQ（${n}ビット）`);
  return {
    width: widthOf(n, x0),
    height: 262,
    ffs: row(down(n), x0),
    outputs: qs(n).reverse(),
    outY: 216,
    pinIndex: false,
    frames: box.frames,
    ...extra,
    notes: [...(extra.frames ? [] : box.notes), ...(extra.notes ?? [])],
    tracks: { cp: 168, clr: 192, ...extra.tracks },
  };
}

/** 各 FF の上から入る入力（A₃ → D、または A₃ → PR）。 */
function topPorts(n: number, x0: number, dx: number): Record<string, [number, number]> {
  return Object.fromEntries(down(n).map((_, i) => [`a${n - 1 - i}`, [x0 + i * PITCH + dx, 46]]));
}

/** 19-演3：各 Q の引き出し線の途中に下向きの NOT、その先に抵抗と LED。 */
function ledChain(): LayoutSpec {
  const n = 4;
  const outY = 272;
  const gates: NonNullable<LayoutSpec['gates']> = {};
  const extra: NonNullable<LayoutSpec['extra']> = {};
  const leds: NonNullable<LayoutSpec['leds']> = [];
  down(n).forEach((_, i) => {
    const k = n - 1 - i;
    const sx = REG_X + i * PITCH + 70; // Q の引き出し線
    gates[`y${k}`] = { at: [sx - 8, 204], dir: 'down' };
    extra[`y${k}`] = [
      [sx, outY, sx + 28, outY],
      [sx + 28, outY, sx + 28, outY - 8],
    ];
    leds.push({ x: sx + 28, y: 206, signal: `y${k}` });
  });
  return register(n, REG_X, {
    gates,
    extra,
    leds,
    ports: { a: [REG_X - 26, 46] },
    outputs: ['y3', 'y2', 'y1', 'y0'],
    outY,
    height: 310,
    frames: [],
    notes: [{ x: REG_X - 36, y: 44, text: '入力データ', anchor: 'end' }],
  });
}

const BITS3: Note = { x: 166, y: 237, text: '（3ビット）', anchor: 'end' };

export const LAYOUTS: Record<string, LayoutSpec> = {
  // ---------- 第16回 ----------
  '16-p5': ripple(3, { notes: [BITS3] }),
  // Q の引き出し線を、Q̄ から次段へ向かう線の途中（右寄り）に置く。
  '16-3a': ripple(3, { spineX: { q0: 196, q1: 316, q2: 436 } }),
  '16-3b': ripple(3),
  '16-4': ripple(3, { notes: [BITS3] }, true),
  '16-5': withReset({
    gates: {
      clr_all: { at: [95, 158] },
      rst: { at: [150, 192], dir: 'left' },
      not_q1: { at: [300, 202], dir: 'left' },
    },
    tracks: { rst: 210 },
    frames: [{ x: 140, y: 184, w: 400, h: 48, color: RED }],
    notes: [{ x: 60, y: 248, text: 'リセット信号発生回路', anchor: 'start', color: RED }],
  }),
  '16-5s': withReset({
    gates: { clr_all: { at: [95, 158] }, rst: { at: [150, 198], dir: 'left' } },
    tracks: { rst: 210 },
  }),
  '16-ex2a': ripple(4, {}, true),
  '16-ex2b': ripple(4, { taps: ['ff1.ck', 'ff2.ck', 'ff3.ck'] }, true),
  '16-ex3': withReset({
    gates: { clr_all: { at: [95, 158] }, rst_n: { at: [150, 192], dir: 'left' } },
    tracks: { rst_n: 210 },
    taps: ['ff1.ck', 'ff2.ck'],
  }),

  // ---------- 第17回 ----------
  '17-1': withReset({ gates: { rst: { at: [150, 198], dir: 'left' } }, tracks: { rst: 172 } }, 120),
  // p.3：FF₀ だけ左に離し、リセット信号が FF₀ に届くまでの経路を長く描く。
  '17-2': {
    width: 800,
    height: 302,
    ffs: { ff0: [120, FY], ff1: [540, FY], ff2: [660, FY] },
    gates: { rst: { at: [450, 196], dir: 'left' } },
    tracks: { $1: 58, rst: 172 },
    spineX: { q0: 508 },
    outputs: ['q0', 'q1', 'q2'],
    outY: 252,
    ffNames: true,
    dashed: [{ net: 'rst', box: [0, 150, 442, 172] }],
    breaks: [
      [330, 58],
      [330, 104],
      [330, 172],
    ],
    notes: [
      inputNote(120),
      { x: 494, y: 270, text: '出力信号', anchor: 'end' },
      { x: 160, y: 200, text: 'この経路が遅く、FF₀ のリセットに時間がかかる', anchor: 'start', color: RED },
      { x: 530, y: 294, text: 'FF₁ と FF₂ は直ちにリセットされる', anchor: 'start', color: BLUE },
    ],
  },
  '17-3': {
    width: 690,
    height: 312,
    ffs: { ff0: [150, FY], ff1: [270, FY], ff2: [530, FY] },
    gates: { j2: { at: [400, 200] }, k2: { at: [470, 128] } },
    ports: { cp: [50, 120, 'left'] },
    spineX: { cp: 126 },
    taps: ['ff0.ck'],
    tracks: { $1: 58, q2: 186, cp: 246 },
    outputs: ['q0', 'q1', 'q2'],
    outY: 268,
    ffNames: true,
    notes: [inputNote(120), { x: 200, y: 286, text: '出力信号', anchor: 'end' }],
  },
  '17-5': ripple(
    1,
    { outputs: [], outRight: { q: 224 }, notes: [{ x: 228, y: 92, text: '出力信号', anchor: 'start' }], width: 300 },
    false,
    120,
  ),
  '17-ex1': ripple(
    4,
    {
      outputs: [],
      outRight: { q3: 584 },
      outLabels: { q3: 'Q' },
      notes: [{ x: 588, y: 92, text: '出力信号', anchor: 'start' }],
      width: 660,
    },
    false,
    120,
  ),

  // ---------- 第18回 ----------
  '18-1': sync(2, { tracks: { $1: 58 } }),
  '18-2': sync(3, { tracks: { $1: 58 } }),
  '18-p3': sync(3, {
    ffs: { ff0: [120, FY], ff1: [240, FY], ff2: [440, FY] },
    gates: { a01: { at: [350, 26] } },
    tracks: { $1: 58 },
    width: 580,
  }),
  '18-p4': sync(4, {
    ffs: { ff0: [120, FY], ff1: [240, FY], ff2: [440, FY], ff3: [650, FY] },
    gates: { a01: { at: [350, 26] }, a012: { at: [560, 26] } },
    tracks: { $1: 58 },
    width: 790,
  }),
  // p.10：AND は2つの FF の間の上で、左向き。
  '18-d3': sync(2, {
    ffs: { ff0: [150, FY], ff1: [300, FY] },
    gates: { d0: { at: [196, 26], dir: 'left' } },
    tracks: { d0: 38 },
    spineX: { nq0: 250 },
    ffNames: false,
    width: 440,
  }),
  '18-rs3': sync(2, {
    ffs: { ff0: [150, FY], ff1: [300, FY] },
    gates: { s0: { at: [196, 26], dir: 'left' } },
    tracks: { s0: 38, q0: 160 },
    spineX: { nq0: 250 },
    taps: ['ff1.s'],
    ffNames: false,
    width: 440,
  }),
  // p.16：K₀ と K₂ の 1 は、端子のすぐ左に書く。
  '18-ex2': sync(3, {
    ffs: { ff0: [120, FY], ff1: [240, FY], ff2: [440, FY] },
    gates: { a01: { at: [350, 30] } },
    tracks: { nq2: 16 },
    width: 580,
  }),

  // ---------- 第19回 ----------
  '19-reg4': register(4, REG_X, {
    ports: topPorts(4, REG_X, -26),
    notes: [{ x: REG_X - 40, y: 44, text: '入力データ', anchor: 'end' }],
  }),
  '19-ex1': register(3, REG_X, { ports: topPorts(3, REG_X, -26) }),
  '19-sipo': register(4, REG_X, {
    ports: { a: [REG_X - 26, 46] },
    notes: [{ x: REG_X - 36, y: 44, text: '入力データ', anchor: 'end' }],
  }),
  '19-piso': register(4, REG_X, {
    ports: topPorts(4, REG_X, 30),
    outputs: ['q0'],
    outLabels: { q0: 'Q' },
    frames: [],
    notes: [
      { x: REG_X + 16, y: 44, text: '入力データ', anchor: 'end' },
      { x: 3 * PITCH + REG_X + 60, y: 234, text: '出力データ（1ビット）', anchor: 'end' },
    ],
  }),
  '19-ex2': register(3, REG_X, { ports: topPorts(3, REG_X, 30), outputs: ['q0'], outLabels: { q0: 'Q' }, frames: [] }),
  '19-ex3': ledChain(),

  // ---------- 第20回 ----------
  '20-p1': register(4, 200, {
    gates: { na: { at: [142, 105], dir: 'down' } },
    tracks: { a: 104 },
    notes: [{ x: 46, y: 92, text: '入力データ', anchor: 'end' }],
  }),
  // p.2〜3：Q₀→J₃ は上回り、Q̄₀→K₃ は下回り。
  '20-ring': register(4, REG_X, { tracks: { q0: 62, nq0: 180 } }),
  // p.5：Q̄₀→J₃ は上回り、Q₀→K₃ は下回り。
  '20-johnson': register(4, REG_X, { tracks: { nq0: 62, q0: 180 } }),
  '20-self': register(4, 220, {
    gates: { j3: { at: [150, 24], dir: 'left' }, k3: { at: [134, 105], dir: 'down' } },
    notes: [{ x: 132, y: 22, label: '~Q_3 ~Q_2 ~Q_1', anchor: 'end', color: RED }],
  }),
};

/** 場面の回路図。場面の id に専用の配置があればそれを、なければ回路の id の配置を使う。 */
export function layoutFor(sceneId: string, circuitId: string): { key: string; spec: LayoutSpec } | undefined {
  const key = LAYOUTS[sceneId] ? sceneId : circuitId;
  const spec = LAYOUTS[key];
  return spec ? { key, spec } : undefined;
}
