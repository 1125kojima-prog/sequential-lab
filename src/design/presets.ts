/** 授業の設計例（第21回・第22回）。表は docs/problems.md の書き起こしによる。 */
import type { FFKind, FsmSpec } from './fsm';

export type Preset = {
  spec: FsmSpec;
  /** 授業で使う FF。 */
  ff: FFKind;
  /** スライドの場所。 */
  source: string;
  /** タイミングチャートで確かめるときに入れる入力の値（順に）。 */
  inputs: number[];
};

const X = null;

/** 第21回：4000円のワインの自動販売機（ミーリー型）。入力 (X₁X₀)：00=0円、01=1000円、10=2000円。 */
export const VENDING: Preset = {
  ff: 'D',
  source: '21 p.3〜8',
  inputs: [1, 2, 1, 2, 1, 2],
  spec: {
    id: 'vending',
    title: '自動販売機（第21回）',
    machine: 'mealy',
    states: ['状態1（0円）', '状態2（1000円）', '状態3（2000円）', '状態4（3000円）'],
    inputVars: ['x1', 'x0'],
    outputVars: ['y1', 'y0'],
    inputNames: ['0円', '1000円', '2000円', '（使わない）'],
    outputNames: ['なし', 'ワイン', 'ワイン＆1000円'],
    next: [
      [0, 1, 2, X],
      [1, 2, 3, X],
      [2, 3, 0, X],
      [3, 0, 0, X],
    ],
    out: [
      [0, 0, 0, X],
      [0, 0, 0, X],
      [0, 0, 1, X],
      [0, 1, 2, X],
    ],
  },
};

/** 第22回 練5〜7：3進カウンタ（ムーア型）。入力 X=1 で次の状態へ。出力は状態の番号（Z=Q）。 */
export const MOORE3: Preset = {
  ff: 'D',
  source: '22 p.7〜9',
  inputs: [1, 1, 0, 1, 1],
  spec: {
    id: 'moore3',
    title: '3進カウンタ・ムーア型（第22回）',
    machine: 'moore',
    states: ['状態1（00出力）', '状態2（01出力）', '状態3（10出力）'],
    inputVars: ['x'],
    outputVars: ['z1', 'z0'],
    next: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
    out: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  },
};

/** 第22回 演1：ストップウォッチ（ミーリー型）。入力 (AB)：10=A、01=B、11=同時押し。 */
export const STOPWATCH: Preset = {
  ff: 'D',
  source: '22 p.25〜27',
  inputs: [2, 2, 1, 2, 3, 2, 1],
  spec: {
    id: 'stopwatch',
    title: 'ストップウォッチ（第22回）',
    machine: 'mealy',
    states: ['カウント前', 'カウント中', 'カウント停止'],
    inputVars: ['a', 'b'],
    outputVars: ['y1', 'y0'],
    inputNames: ['なし', 'Bボタン', 'Aボタン', '同時押し'],
    outputNames: ['命令なし', 'カウント開始', 'カウント停止', 'カウントリセット'],
    next: [
      [0, 0, 1, 0],
      [1, 1, 2, 1],
      [2, 0, 1, 2],
    ],
    out: [
      [0, 0, 1, 0],
      [0, 0, 2, 0],
      [0, 3, 1, 0],
    ],
  },
};

export const PRESETS: readonly Preset[] = [VENDING, MOORE3, STOPWATCH];
