/**
 * スライドの答えを手で書き起こした期待値。
 * エンジンの出力から作ったものではない。出典は docs/problems.md と各スライド。
 * ここを書き換えてテストを通してはいけない（食い違ったら報告する）。
 *
 * 時刻の決め方：回路が反応する k 番目のクロックエッジを t = 100k ns に置く。
 * スライド上の入力変化の位置は、前後のエッジとの比で ns に直した。
 */
import { clock, withInputs } from '../../src/engine/stimulus';
import type { Circuit, Level, Stimulus, Trigger } from '../../src/engine/types';
import * as c from '../../src/problems/circuits';

export type Scenario = {
  name: string;
  /** スライドの場所。 */
  source: string;
  circuit: Circuit;
  edge: Trigger;
  stimulus: Stimulus;
  init?: Record<string, Level>;
  /** 見る信号（上位ビットから）。 */
  bits: string[];
  /** 各エッジの後（次のエッジの直前）の値。 */
  afterEdges: string[];
};

const repeat = <T>(items: T[], times: number): T[] => Array.from({ length: times }, () => items).flat();

/** 多ビット入力を16進の値に変える刺激。names は上位ビットから。 */
export function busSet(names: string[], t: number, hex: string): [number, string, Level][] {
  const v = parseInt(hex, 16);
  return names.map((name, i) => [t, name, ((v >> (names.length - 1 - i)) & 1) as Level]);
}

export function busInit(names: string[], hex: string): Record<string, Level> {
  return Object.fromEntries(busSet(names, 0, hex).map(([, name, value]) => [name, value]));
}

const fall = (edges: number): Stimulus => clock({ signal: 'cp', edge: 'falling', period: 100, edges });
const rise = (edges: number): Stimulus => clock({ signal: 'cp', edge: 'rising', period: 100, edges });

const DOWN8 = ['111', '110', '101', '100', '011', '010', '001', '000', '111', '110'];

export const SCENARIOS: Scenario[] = [
  {
    name: '16-3 上の回路（立下り、Q̄→CK）',
    source: '16 p.6',
    circuit: c.c16_3a,
    edge: 'falling',
    stimulus: fall(10),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: DOWN8,
  },
  {
    name: '16-3 下の回路（立上り、Q→CK）',
    source: '16 p.6',
    circuit: c.c16_3b,
    edge: 'rising',
    stimulus: rise(10),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: DOWN8,
  },
  {
    name: '16-4 D-FFの非同期8進アップ',
    source: '16 p.7',
    circuit: c.c16_4,
    edge: 'falling',
    stimulus: withInputs(fall(10), { clr: 1 }),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: ['001', '010', '011', '100', '101', '110', '111', '000', '001', '010'],
  },
  {
    name: '17-1 JK-FFの非同期5進アップ',
    source: '17 p.2',
    circuit: c.c17_1,
    edge: 'falling',
    stimulus: fall(13),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: ['001', '010', '011', '100', '000', '001', '010', '011', '100', '000', '001', '010', '011'],
  },
  {
    name: '17-3 改良型非同期5進（Q）',
    source: '17 p.4',
    circuit: c.c17_3,
    edge: 'falling',
    stimulus: fall(7),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: ['001', '010', '011', '100', '000', '001', '010'],
  },
  {
    name: '17-3 改良型非同期5進（J₂）',
    source: '17 p.4',
    circuit: c.c17_3,
    edge: 'falling',
    stimulus: fall(7),
    bits: ['j2'],
    afterEdges: ['0', '0', '1', '0', '0', '0', '0'],
  },
  {
    name: '17-5 1/2分周',
    source: '17 p.6',
    circuit: c.c17_5,
    edge: 'falling',
    stimulus: fall(6),
    bits: ['q'],
    afterEdges: ['1', '0', '1', '0', '1', '0'],
  },
  {
    // CLR は最初 1、E1 の直後に 0。E17 と E18 の間で 1 に戻る。
    name: '18-1 同期4進',
    source: '18 p.3',
    circuit: c.c18_1,
    edge: 'falling',
    stimulus: withInputs(fall(18), { clr: 1 }, [
      [130, 'clr', 0],
      [1730, 'clr', 1],
    ]),
    bits: ['q1', 'q0'],
    afterEdges: ['00', ...repeat(['01', '10', '11', '00'], 4), '00'],
  },
  {
    name: '18-2 単純に連結した3ビット回路',
    source: '18 p.4',
    circuit: c.c18_2,
    edge: 'falling',
    stimulus: withInputs(fall(18), { clr: 1 }, [
      [130, 'clr', 0],
      [1730, 'clr', 1],
    ]),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: ['000', ...repeat(['001', '010', '111', '000'], 4), '000'],
  },
  {
    name: '18-練3 同期8進（動作表 P=1〜8）',
    source: '18 p.6',
    circuit: c.c18_p3,
    edge: 'falling',
    stimulus: fall(8),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: ['001', '010', '011', '100', '101', '110', '111', '000'],
  },
  {
    name: '18 同期3進 D-FF（動作表）',
    source: '18 p.9',
    circuit: c.c18_d3,
    edge: 'falling',
    stimulus: fall(3),
    bits: ['q1', 'q0'],
    afterEdges: ['01', '10', '00'],
  },
  {
    name: '18-練5 同期3進 RS-FF（動作表）',
    source: '18 p.11',
    circuit: c.c18_rs3,
    edge: 'falling',
    stimulus: fall(3),
    bits: ['q1', 'q0'],
    afterEdges: ['01', '10', '00'],
  },
  {
    name: '18-演2 同期5進 JK-FF（動作表）',
    source: '18 p.15',
    circuit: c.c18_ex2,
    edge: 'falling',
    stimulus: fall(5),
    bits: ['q2', 'q1', 'q0'],
    afterEdges: ['001', '010', '011', '100', '000'],
  },
  {
    // CLR は E1 の後に 1。A は E2 と E6 のときだけ 1。
    name: '19 SIPO シフトレジスタ',
    source: '19 p.7',
    circuit: c.c19_sipo,
    edge: 'rising',
    stimulus: withInputs(rise(8), { clr: 0, a: 1 }, [
      [130, 'clr', 1],
      [230, 'a', 0],
      [585, 'a', 1],
      [650, 'a', 0],
    ]),
    bits: ['q3', 'q2', 'q1', 'q0'],
    afterEdges: ['0000', '1000', '0100', '0010', '0001', '1000', '0100', '0010'],
  },
  {
    // (1001) をプリセット → 1,0,0,1。CLR パルスの後 (1110) をプリセット → 0,1,1,1。
    name: '19 PISO シフトレジスタ（出力 Q）',
    source: '19 p.8',
    circuit: c.c19_piso,
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
    bits: ['q0'],
    afterEdges: ['1', '0', '0', '1', '0', '0', '0', '1', '1', '1', '0', '0'],
  },
  {
    // (110) プリセット → CLR パルス → (001) プリセット → (111) プリセット。
    name: '19-演2 3ビットPISO（出力 Q）',
    source: '19 p.10',
    circuit: c.c19_ex2,
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
    bits: ['q0'],
    afterEdges: ['0', '1', '1', '0', '1', '0', '1', '1', '1', '0', '0'],
  },
  {
    // A の単発パルスが E2 をまたぐ。LED は負論理（0 で点灯）。
    name: '19-演3 LEDが順に点灯（Q̄₃〜Q̄₀）',
    source: '19 p.12',
    circuit: c.c19_ex3,
    edge: 'rising',
    stimulus: withInputs(rise(6), { clr: 0, a: 0 }, [
      [130, 'clr', 1],
      [178, 'a', 1],
      [230, 'a', 0],
    ]),
    bits: ['y3', 'y2', 'y1', 'y0'],
    afterEdges: ['1111', '0111', '1011', '1101', '1110', '1111'],
  },
  {
    name: '20 リングカウンタ（初期値 1000、動作表）',
    source: '20 p.2',
    circuit: c.c20_ring,
    edge: 'rising',
    stimulus: withInputs(rise(4), { clr: 1 }),
    init: { ff3: 1 },
    bits: ['q3', 'q2', 'q1', 'q0'],
    afterEdges: ['0100', '0010', '0001', '1000'],
  },
  {
    name: '20-練3 リングカウンタ（初期値 1110、CLR=1）',
    source: '20 p.3',
    circuit: c.c20_ring,
    edge: 'rising',
    stimulus: withInputs(rise(9), { clr: 1 }),
    init: { ff3: 1, ff2: 1, ff1: 1 },
    bits: ['q3', 'q2', 'q1', 'q0'],
    afterEdges: ['0111', '1011', '1101', '1110', '0111', '1011', '1101', '1110', '0111'],
  },
  {
    // CLR は E1 の前に 1 になる。
    name: '20-練5／練6 ジョンソンカウンタ',
    source: '20 p.5〜6',
    circuit: c.c20_johnson,
    edge: 'rising',
    stimulus: withInputs(rise(9), { clr: 0 }, [[60, 'clr', 1]]),
    bits: ['q3', 'q2', 'q1', 'q0'],
    afterEdges: ['1000', '1100', '1110', '1111', '0111', '0011', '0001', '0000', '1000'],
  },
];

/**
 * 16-5（p.10 のチャート）。外部 CLR は最初 1、E1 の直後に 0。
 * E13 と E14 の間で CLR パルスが入り、E14 をまたぐ。
 * 最後の E16 は、スライドでは Q₁ が 0 のまま描かれている（docs/problems.md の D10）。
 */
export const SLIDE_16_5 = {
  stimulus: withInputs(fall(16), { clr: 1 }, [
    [127, 'clr', 0],
    [1370, 'clr', 1],
    [1430, 'clr', 0],
  ]),
  bits: ['q2', 'q1', 'q0'],
  // 値は「次のエッジの直前」で読む。E13 の直後は (010) だが、E14 より前に外部 CLR で
  // (000) に戻るので、E13 の欄は '000'。直後の (010) は afterE13 で別に確かめる。
  afterEdges: [
    '000', '001', '010', '011', '100', '000', '001', '010', '011', '100', '000', '001', '000', '000', '001',
    '000', // E16：スライドの絵のとおり
  ],
  /** E13 の後、外部 CLR が入る前（t=1350）の値。スライドでは Q₁ だけ 1。 */
  afterE13: { t: 1350, value: '010' },
};

/** 20-練4（p.4）の状態図。現状態 → 次状態（Q₃Q₂Q₁Q₀）。 */
export const SLIDE_20_SELF: Record<string, string> = {
  '1000': '0100', '0100': '0010', '0010': '0001', '0001': '1000',
  '0000': '1000', '1001': '0100', '0101': '0010', '0011': '0001',
  '1010': '0101', '1011': '0101', '0110': '0011', '0111': '0011',
  '1100': '0110', '1101': '0110', '1110': '0111', '1111': '0111',
};

/**
 * 21-練6（p.9）。スライドのエッジ Ek は t = 100(k+1)。Clr は E0 と E1 の間で 1。
 * 値は「1 になっている区間 [開始, 終了]」。
 */
export const SLIDE_21 = {
  stimulus: withInputs(rise(19), { clr: 0, x1in: 0, x0in: 0 }, [
    [150, 'clr', 1],
    [380, 'x0in', 1], [425, 'x0in', 0], // 1000円（E3）
    [580, 'x1in', 1], [625, 'x1in', 0], // 2000円（E5）
    [880, 'x0in', 1], [925, 'x0in', 0], // 1000円（E8）
    [1280, 'x1in', 1], [1325, 'x1in', 0], // 2000円（E12）
    [1480, 'x0in', 1], [1525, 'x0in', 0], // 1000円（E14）
    [1680, 'x1in', 1], [1725, 'x1in', 0], // 2000円（E16）
  ]),
  high: {
    x0: [[400, 500], [900, 1000], [1500, 1600]],
    x1: [[600, 700], [1300, 1400], [1700, 1800]],
    q0: [[500, 1000], [1600, 1800]],
    q1: [[700, 1000], [1400, 1800]],
    q0next: [[400, 900], [1500, 1700]],
    q1next: [[600, 900], [1300, 1700]],
    y0: [[900, 1000]],
    y1: [[1700, 1800]],
  } as Record<string, [number, number][]>,
};
