/**
 * 場面（シーン）：回路 ＋ 入力の刺激列 ＋ 表示のしかた。
 * タイミングチャート画面はこの一覧から選んで動かす。
 * 入力波形は docs/problems.md の書き起こし（スライドのチャート）に合わせている。
 * 時刻の決め方：回路が反応する k 番目のクロックエッジを t = 100k ns に置く。
 */
import { busInit, busSet, clock, withInputs } from '../engine/stimulus';
import type { Circuit, Delays, Level, Stimulus, Trigger } from '../engine/types';
import * as c from './circuits';

export type WireControl = {
  /** Conn.wire の名前。 */
  id: string;
  label: string;
  /** スライダーの上限（ns）。 */
  max: number;
};

export type Scene = {
  id: string;
  lecture: number;
  title: string;
  /** スライドの場所。例：'16 p.10' */
  source: string;
  circuit: Circuit;
  /** クロックの信号名。 */
  clock: string;
  /** FF が反応するエッジ。 */
  edge: Trigger;
  stimulus: Stimulus;
  /** FF の初期値（キーは FF の id）。 */
  init?: Record<string, Level>;
  /** チャートに並べる信号（上から）。 */
  rows: string[];
  /** 動作表と状態の表示に使うビット（上位から）。 */
  stateBits: string[];
  /** 最初からバス表示（16進）にする。 */
  busView?: boolean;
  /** 表記の上書き（書式は view/label.ts）。 */
  labels?: Record<string, string>;
  /** 遅延の初期値。 */
  delays: Delays;
  /** 遅延を変えられる配線。 */
  wires?: WireControl[];
  note?: string;
  /** 各ステップの後の値から、補足の説明を作る。 */
  annotate?: (value: (signal: string) => Level) => string[];
};

const fall = (edges: number): Stimulus => clock({ signal: 'cp', edge: 'falling', period: 100, edges });
const rise = (edges: number): Stimulus => clock({ signal: 'cp', edge: 'rising', period: 100, edges });

const D: Delays = { ff: 8, gate: 5 };
const Q2 = ['q1', 'q0'];
const Q3 = ['q2', 'q1', 'q0'];
const Q4 = ['q3', 'q2', 'q1', 'q0'];
const A4 = ['a3', 'a2', 'a1', 'a0'];
const A3 = ['a2', 'a1', 'a0'];
const up = (bits: string[]): string[] => [...bits].reverse();

const RST_WIRE: WireControl = { id: 'rst_ff0', label: 'リセット信号 → FF₀ の CLR の配線', max: 60 };

const RESET_LABELS = {
  rst: 'リセット信号',
  clr_all: '全FFのCLR',
  not_q1: 'NOT( Q_1 )',
};

/** 16-5（p.10）：外部 CLR は最初 1、E1 の直後に 0。E13 と E14 の間で CLR パルス。 */
const STIM_16_5 = withInputs(fall(16), { clr: 1 }, [
  [127, 'clr', 0],
  [1370, 'clr', 1],
  [1430, 'clr', 0],
]);

/** 18-1／18-2（p.3〜4）：CLR は最初 1、E1 の直後に 0。E17 と E18 の間で 1 に戻る。 */
const STIM_18_CLR = withInputs(fall(18), { clr: 1 }, [
  [130, 'clr', 0],
  [1730, 'clr', 1],
]);

/** 19 p.7：CLR は E1 の後に 1。A は E2 と E6 のときだけ 1。 */
const STIM_SIPO = withInputs(rise(8), { clr: 0, a: 1 }, [
  [130, 'clr', 1],
  [230, 'a', 0],
  [585, 'a', 1],
  [650, 'a', 0],
]);

const VENDING_STATE = ['状態1（0円状態）', '状態2（1000円状態）', '状態3（2000円状態）', '状態4（3000円状態）'];
const VENDING_INPUT = ['何も入力されていない', '1000円が入力された', '2000円が入力された', '（使わない入力）'];
const VENDING_OUTPUT = ['何も出力されない', 'ワインだけが出力される', 'ワインと1000円が出力される', '（使わない出力）'];

export const SCENES: readonly Scene[] = [
  // ---------- 第16回 ----------
  {
    id: '16-p5',
    lecture: 16,
    title: '説明 非同期式2³進アップカウンタ（T-FF）',
    source: '16 p.5',
    circuit: c.c16_p5,
    clock: 'cp',
    edge: 'falling',
    stimulus: withInputs(fall(10), { clr: 1 }),
    rows: ['cp', 'clr', ...up(Q3)],
    stateBits: Q3,
    delays: D,
  },
  {
    id: '16-3a',
    lecture: 16,
    title: '練習3 上の回路（立下り、Q̄→次段CK）',
    source: '16 p.6',
    circuit: c.c16_3a,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(10),
    rows: ['cp', ...up(Q3)],
    stateBits: Q3,
    delays: D,
  },
  {
    id: '16-3b',
    lecture: 16,
    title: '練習3 下の回路（立上り、Q→次段CK）',
    source: '16 p.6',
    circuit: c.c16_3b,
    clock: 'cp',
    edge: 'rising',
    stimulus: rise(10),
    rows: ['cp', ...up(Q3)],
    stateBits: Q3,
    delays: D,
  },
  {
    id: '16-4',
    lecture: 16,
    title: '練習4 D-FFによる非同期8進アップカウンタ',
    source: '16 p.7',
    circuit: c.c16_4,
    clock: 'cp',
    edge: 'falling',
    stimulus: withInputs(fall(10), { clr: 1 }),
    rows: ['cp', ...up(Q3)],
    stateBits: Q3,
    delays: D,
    note: '外部 CLR（負論理）は 1 のまま（スライドのチャートには描かれていない）。',
  },
  {
    id: '16-5',
    lecture: 16,
    title: '練習5 非同期5進アップカウンタ',
    source: '16 p.9〜10',
    circuit: c.c16_5,
    clock: 'cp',
    edge: 'falling',
    stimulus: STIM_16_5,
    rows: ['cp', 'clr', ...up(Q3), 'rst'],
    stateBits: Q3,
    labels: RESET_LABELS,
    delays: D,
    note: '(101) になった瞬間にリセット信号が出て (000) に戻る。スライド p.10 の最後のエッジは Q₁ が 0 のままだが、機構上は (010) になる（docs/problems.md の D10）。',
  },
  {
    id: '16-5s',
    lecture: 16,
    title: '練習5 簡略版（Q₂ と Q₀ の AND）',
    source: '16 p.10',
    circuit: c.c16_5s,
    clock: 'cp',
    edge: 'falling',
    stimulus: STIM_16_5,
    rows: ['cp', 'clr', ...up(Q3), 'rst'],
    stateBits: Q3,
    labels: RESET_LABELS,
    delays: D,
  },
  {
    id: '16-ex2a',
    lecture: 16,
    title: '演習2 上の回路（Q→次段CK）',
    source: '16 p.11',
    circuit: c.c16_ex2a,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(17), { clr: 1 }),
    rows: ['cp', ...up(Q4)],
    stateBits: Q4,
    delays: D,
  },
  {
    id: '16-ex2b',
    lecture: 16,
    title: '演習2 下の回路（Q̄→次段CK）',
    source: '16 p.11',
    circuit: c.c16_ex2b,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(17), { clr: 1 }),
    rows: ['cp', ...up(Q4)],
    stateBits: Q4,
    delays: D,
  },
  {
    id: '16-ex3',
    lecture: 16,
    title: '演習3 非同期7進アップカウンタ（CLR 負論理）',
    source: '16 p.12',
    circuit: c.c16_ex3,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(9), { clr: 0 }, [[50, 'clr', 1]]),
    rows: ['cp', 'clr', ...up(Q3), 'rst_n'],
    stateBits: Q3,
    labels: { rst_n: 'NAND出力', clr_all: '全FFのCLR' },
    delays: D,
    note: '入力波形はスライドにないので、外部 CLR（負論理）を最初だけ 0 にしている。',
  },

  // ---------- 第17回 ----------
  {
    id: '17-1',
    lecture: 17,
    title: '練習1 JK-FFによる非同期5進アップカウンタ',
    source: '17 p.1〜2',
    circuit: c.c17_1,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(13),
    rows: ['cp', ...up(Q3), 'rst'],
    stateBits: Q3,
    labels: RESET_LABELS,
    delays: { ...D, wire: { rst_ff0: 0 } },
    wires: [RST_WIRE],
  },
  {
    id: '17-2',
    lecture: 17,
    title: '解説 リセット信号の伝達が遅れると誤動作する',
    source: '17 p.3',
    circuit: c.c17_1,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(14),
    rows: ['cp', ...up(Q3), 'rst'],
    stateBits: Q3,
    labels: RESET_LABELS,
    delays: { ...D, wire: { rst_ff0: 20 } },
    wires: [RST_WIRE],
    note: '回路は練習1と同じ。配線遅延を 0〜4ns にすると正常な5進、8ns 前後では (010) へ飛び、20ns ではリセットが FF₀ に届かず (101) の次が (001) になる。スライドの系列（…→100→101→100→101…）は再現されない（docs/problems.md の D1）。',
  },
  {
    id: '17-3',
    lecture: 17,
    title: '改良型非同期5進カウンタ',
    source: '17 p.4',
    circuit: c.c17_3,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(7),
    rows: ['cp', ...up(Q3), 'j2'],
    stateBits: Q3,
    delays: { ...D, wire: { rst_ff0: 0 } },
    wires: [{ id: 'rst_ff0', label: 'Q₂ → FF₀ の CLR の配線', max: 60 }],
    note: 'Q₂ が1周期のあいだ 1 を保つので、配線が遅くても FF₀ にリセットが届く。',
  },
  {
    id: '17-5',
    lecture: 17,
    title: '2進カウンタによる分周（1/2）',
    source: '17 p.6',
    circuit: c.c17_5,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(6),
    rows: ['cp', 'q'],
    stateBits: ['q'],
    delays: D,
  },
  {
    id: '17-ex1',
    lecture: 17,
    title: '演習1 1/16 プリスケーラ（非同期16進）',
    source: '17 p.7',
    circuit: c.c17_ex1,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(17),
    rows: ['cp', ...up(Q4)],
    stateBits: Q4,
    delays: D,
  },

  // ---------- 第18回 ----------
  {
    id: '18-1',
    lecture: 18,
    title: '練習1 同期4進カウンタ',
    source: '18 p.3',
    circuit: c.c18_1,
    clock: 'cp',
    edge: 'falling',
    stimulus: STIM_18_CLR,
    rows: ['cp', 'clr', ...up(Q2)],
    stateBits: Q2,
    delays: D,
  },
  {
    id: '18-2',
    lecture: 18,
    title: '練習2 単純に連結した3ビット回路',
    source: '18 p.4',
    circuit: c.c18_2,
    clock: 'cp',
    edge: 'falling',
    stimulus: STIM_18_CLR,
    rows: ['cp', 'clr', ...up(Q3)],
    stateBits: Q3,
    delays: D,
    note: 'J₂=K₂=Q₁ とつないだだけでは 8進にならない（001→010→111→000）。',
  },
  {
    id: '18-p3',
    lecture: 18,
    title: '練習3 同期8進カウンタ',
    source: '18 p.6',
    circuit: c.c18_p3,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(9),
    rows: ['cp', ...up(Q3), 'a01'],
    stateBits: Q3,
    labels: { a01: 'Q_0 Q_1' },
    delays: D,
  },
  {
    id: '18-p4',
    lecture: 18,
    title: '練習4 同期16進カウンタ',
    source: '18 p.8',
    circuit: c.c18_p4,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(17),
    rows: ['cp', ...up(Q4)],
    stateBits: Q4,
    labels: { a01: 'Q_0 Q_1', a012: 'Q_0 Q_1 Q_2' },
    delays: D,
  },
  {
    id: '18-d3',
    lecture: 18,
    title: '同期3進カウンタ（D-FF）',
    source: '18 p.9〜10',
    circuit: c.c18_d3,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(7),
    rows: ['cp', ...up(Q2), 'd0'],
    stateBits: Q2,
    delays: D,
  },
  {
    id: '18-rs3',
    lecture: 18,
    title: '練習5 同期3進カウンタ（RS-FF）',
    source: '18 p.11〜12',
    circuit: c.c18_rs3,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(7),
    rows: ['cp', ...up(Q2), 's0'],
    stateBits: Q2,
    delays: D,
  },
  {
    id: '18-ex2',
    lecture: 18,
    title: '演習2 同期5進カウンタ（JK-FF）',
    source: '18 p.15〜16',
    circuit: c.c18_ex2,
    clock: 'cp',
    edge: 'falling',
    stimulus: fall(11),
    rows: ['cp', ...up(Q3)],
    stateBits: Q3,
    labels: { a01: 'Q_0 Q_1' },
    delays: D,
  },

  // ---------- 第19回 ----------
  {
    id: '19-reg4',
    lecture: 19,
    title: '4ビットパラレルレジスタ',
    source: '19 p.6',
    circuit: c.c19_reg4,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(8), { clr: 0, ...busInit(A4, '3') }, [
      [80, 'clr', 1],
      ...busSet(A4, 140, '1'),
      ...busSet(A4, 215, 'A'),
      ...busSet(A4, 365, '6'),
      ...busSet(A4, 465, '1'),
      [535, 'clr', 0],
      [555, 'clr', 1],
      ...busSet(A4, 620, 'F'),
      ...busSet(A4, 715, '5'),
    ]),
    rows: ['cp', 'clr', ...A4, ...Q4],
    stateBits: Q4,
    busView: true,
    delays: D,
  },
  {
    id: '19-ex1',
    lecture: 19,
    title: '演習1 3ビットパラレルレジスタ（立下り）',
    source: '19 p.9',
    circuit: c.c19_ex1,
    clock: 'cp',
    edge: 'falling',
    stimulus: withInputs(fall(8), { clr: 0, ...busInit(A3, '1') }, [
      [30, 'clr', 1],
      ...busSet(A3, 87, '2'),
      ...busSet(A3, 165, '3'),
      ...busSet(A3, 316, '4'),
      ...busSet(A3, 413, '5'),
      [484, 'clr', 0],
      [532, 'clr', 1],
      ...busSet(A3, 570, '6'),
      ...busSet(A3, 663, '7'),
      ...busSet(A3, 787, '0'),
    ]),
    rows: ['cp', 'clr', ...A3, ...Q3],
    stateBits: Q3,
    busView: true,
    delays: D,
  },
  {
    id: '19-sipo',
    lecture: 19,
    title: '4ビットシフトレジスタ（シリアル-パラレル変換）',
    source: '19 p.7',
    circuit: c.c19_sipo,
    clock: 'cp',
    edge: 'rising',
    stimulus: STIM_SIPO,
    rows: ['cp', 'clr', 'a', ...Q4],
    stateBits: Q4,
    delays: D,
  },
  {
    id: '19-piso',
    lecture: 19,
    title: '4ビットシフトレジスタ（パラレル-シリアル変換）',
    source: '19 p.8',
    circuit: c.c19_piso,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(12), { clr: 0 }, [
      [113, 'clr', 1],
      [132, 'a3', 1],
      [132, 'a0', 1],
      [190, 'a3', 0],
      [190, 'a0', 0],
      [644, 'clr', 0],
      [667, 'clr', 1],
      [723, 'a3', 1],
      [723, 'a2', 1],
      [723, 'a1', 1],
      [780, 'a3', 0],
      [780, 'a2', 0],
      [780, 'a1', 0],
    ]),
    rows: ['cp', 'clr', ...A4, ...Q4],
    stateBits: Q4,
    delays: D,
    note: '出力は最終段の Q₀。A₃〜A₀ は各FFの PR（正論理）につながる。',
  },
  {
    id: '19-ex2',
    lecture: 19,
    title: '演習2 3ビット（パラレル-シリアル）シフトレジスタ',
    source: '19 p.10',
    circuit: c.c19_ex2,
    clock: 'cp',
    edge: 'falling',
    stimulus: withInputs(fall(11), { clr: 0 }, [
      [63, 'clr', 1],
      [132, 'a2', 1],
      [132, 'a1', 1],
      [190, 'a2', 0],
      [190, 'a1', 0],
      [443, 'clr', 0],
      [465, 'clr', 1],
      [531, 'a0', 1],
      [589, 'a0', 0],
      [723, 'a2', 1],
      [723, 'a1', 1],
      [723, 'a0', 1],
      [781, 'a2', 0],
      [781, 'a1', 0],
      [781, 'a0', 0],
    ]),
    rows: ['cp', 'clr', ...A3, ...Q3],
    stateBits: Q3,
    delays: D,
    note: '出力は最終段の Q₀。',
  },
  {
    id: '19-ex3',
    lecture: 19,
    title: '演習3 LEDが順に点灯する回路',
    source: '19 p.11〜12',
    circuit: c.c19_ex3,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(6), { clr: 0, a: 0 }, [
      [130, 'clr', 1],
      [178, 'a', 1],
      [230, 'a', 0],
    ]),
    rows: ['cp', 'clr', 'a', 'y3', 'y2', 'y1', 'y0'],
    stateBits: ['y3', 'y2', 'y1', 'y0'],
    labels: { y3: '~Q_3', y2: '~Q_2', y1: '~Q_1', y0: '~Q_0' },
    delays: D,
    note: 'LED は負論理（0 で点灯）。各 Q に NOT を付けた出力を表示している。',
  },

  // ---------- 第20回 ----------
  {
    id: '20-p1',
    lecture: 20,
    title: '練習1 JK-FFのシフトレジスタ（SIPO）',
    source: '20 p.1',
    circuit: c.c20_p1,
    clock: 'cp',
    edge: 'rising',
    stimulus: STIM_SIPO,
    rows: ['cp', 'clr', 'a', ...Q4],
    stateBits: Q4,
    labels: { na: '~A' },
    delays: D,
    note: '入力波形は 19 p.7 の SIPO と同じものを使っている。',
  },
  {
    id: '20-ring0',
    lecture: 20,
    title: '練習2 リングカウンタ（初期値 0000 だと動かない）',
    source: '20 p.2〜3',
    circuit: c.c20_ring,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(5), { clr: 1 }),
    rows: ['cp', 'clr', ...Q4],
    stateBits: Q4,
    delays: D,
  },
  {
    id: '20-ring',
    lecture: 20,
    title: '練習3 リングカウンタ（初期値 1110）',
    source: '20 p.3',
    circuit: c.c20_ring,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(9), { clr: 1 }),
    init: { ff3: 1, ff2: 1, ff1: 1 },
    rows: ['cp', 'clr', ...Q4],
    stateBits: Q4,
    delays: D,
    note: 'CLR=1（インアクティブ）。定常ループ（1000→0100→0010→0001）には戻れない。',
  },
  {
    id: '20-self',
    lecture: 20,
    title: '練習4 自己補正型リングカウンタ（初期値 1110）',
    source: '20 p.4',
    circuit: c.c20_self,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(9), { clr: 1 }),
    init: { ff3: 1, ff2: 1, ff1: 1 },
    rows: ['cp', 'clr', ...Q4, 'j3'],
    stateBits: Q4,
    delays: D,
    note: '練習3と同じ初期値 (1110) から始めても、定常ループに戻る。',
  },
  {
    id: '20-johnson',
    lecture: 20,
    title: '練習5／6 ジョンソンカウンタ',
    source: '20 p.5〜6',
    circuit: c.c20_johnson,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(9), { clr: 0 }, [[60, 'clr', 1]]),
    rows: ['cp', 'clr', ...Q4],
    stateBits: Q4,
    delays: D,
  },

  // ---------- 第21回 ----------
  {
    id: '21-vending',
    lecture: 21,
    title: '練習6 自動販売機のタイミングチャート',
    source: '21 p.8〜11',
    circuit: c.c21_vending,
    clock: 'cp',
    edge: 'rising',
    stimulus: withInputs(rise(19), { clr: 0, x1in: 0, x0in: 0 }, [
      [150, 'clr', 1],
      [380, 'x0in', 1], [425, 'x0in', 0], // 1000円
      [580, 'x1in', 1], [625, 'x1in', 0], // 2000円
      [880, 'x0in', 1], [925, 'x0in', 0], // 1000円
      [1280, 'x1in', 1], [1325, 'x1in', 0], // 2000円
      [1480, 'x0in', 1], [1525, 'x0in', 0], // 1000円
      [1680, 'x1in', 1], [1725, 'x1in', 0], // 2000円
    ]),
    rows: ['clr', 'cp', 'x1in', 'x0in', 'q1', 'q0', 'x1', 'x0', 'q1next', 'q0next', 'y1', 'y0'],
    stateBits: Q2,
    labels: {
      cp: 'CK',
      clr: 'Clr',
      y0_a: 'Q_1 Q_0 X_0',
      y0_b: 'Q_1 ~Q_0 X_1',
      q1n_a: '~Q_1 X_1',
      q1n_b: '~Q_1 Q_0 X_0',
      q1n_c: 'Q_1 ~Q_0 ~X_1',
      q1n_d: 'Q_1 ~X_1 ~X_0',
      q0n_a: '~Q_0 X_0',
      q0n_b: 'Q_0 ~X_1 ~X_0',
      q0n_c: '~Q_1 Q_0 ~X_0',
    },
    delays: D,
    note: 'X′ は次入力（ラッチ前）、X はラッチ後の現入力。Q′ と Y は組み合わせ回路の出力なので、CK に関係なく X と Q の変化にすぐ反応する。',
    annotate: (value) => {
      const pair = (hi: string, lo: string): number => value(hi) * 2 + value(lo);
      const bits = (n: number): string => n.toString(2).padStart(2, '0');
      const q = pair('q1', 'q0');
      const x = pair('x1', 'x0');
      const next = pair('q1next', 'q0next');
      const y = pair('y1', 'y0');
      return [
        `現状態 (Q₁Q₀)=(${bits(q)})：${VENDING_STATE[q]}。現入力 (X₁X₀)=(${bits(x)})：${VENDING_INPUT[x]}。`,
        `真理値表より、次状態 (Q₁′Q₀′)=(${bits(next)})：${VENDING_STATE[next]}。出力 (Y₁Y₀)=(${bits(y)})：${VENDING_OUTPUT[y]}。`,
      ];
    },
  },
];

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
