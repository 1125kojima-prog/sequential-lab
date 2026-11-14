/**
 * 問題の一覧。問題文は docs/problems.md（スライドの書き起こし）による。
 * 答えは書かない：タイミングチャートと動作表はエンジンの結果、
 * 選択・数値問題は回路の解析か、問題の条件からの計算（answer 関数）で求める。
 * 記述問題だけは、スライドの解答例を載せる。
 */
import { simulate } from '../engine/simulate';
import { counterKind, type CounterKind } from '../view/grade';
import { sceneById } from './scenes';

/** タイミングチャートのマスの幅（クロックの半周期、ns）。 */
export const CELL_NS = 50;

export type Question =
  | { kind: 'choice'; prompt: string; options: string[]; answer: () => number }
  | { kind: 'number'; prompt: string; unit?: string; answer: () => number; tolerance?: number };

type Base = { id: string; lecture: number; title: string; source: string; statement: string };

export type TimingProblem = Base & {
  kind: 'timing';
  sceneId: string;
  /** 自分で描く1ビット信号。 */
  blanks: string[];
  /** 値（16進）を入力する多ビット信号（回路の buses の名前）。 */
  busBlanks?: string[];
};
export type TableProblem = Base & { kind: 'table'; sceneId: string };
export type QuizProblem = Base & {
  kind: 'quiz';
  /** 一緒に表示する回路図（場面の id）。 */
  sceneIds?: string[];
  questions: Question[];
};
export type EssayProblem = Base & { kind: 'essay'; answer: string[] };
export type Problem = TimingProblem | TableProblem | QuizProblem | EssayProblem;

/** 場面の回路を理想モードで動かして、カウンタの種類を求める。 */
export function kindOf(sceneId: string): CounterKind {
  const scene = sceneById(sceneId);
  if (!scene) throw new Error(`場面がありません: ${sceneId}`);
  const trace = simulate(scene.circuit, scene.stimulus, { mode: 'ideal', init: scene.init });
  return counterKind(scene.circuit, trace, scene.stateBits, scene.clock, scene.edge);
}

const MODULI = [4, 5, 7, 8, 10, 16];
const DIRECTIONS: CounterKind['direction'][] = ['up', 'down', 'other'];

/** 「同期式か非同期式か、何進か、アップかダウンか」の3問。答えは回路から求める。 */
function nameQuestions(sceneId: string, label: string): Question[] {
  return [
    {
      kind: 'choice',
      prompt: `${label}：同期式か、非同期式か`,
      options: ['同期式', '非同期式'],
      answer: () => (kindOf(sceneId).sync ? 0 : 1),
    },
    {
      kind: 'choice',
      prompt: `${label}：何進カウンタか`,
      options: MODULI.map((m) => `${m}進`),
      answer: () => MODULI.indexOf(kindOf(sceneId).modulus ?? -1),
    },
    {
      kind: 'choice',
      prompt: `${label}：アップカウンタか、ダウンカウンタか`,
      options: ['アップカウンタ', 'ダウンカウンタ', 'どちらでもない'],
      answer: () => DIRECTIONS.indexOf(kindOf(sceneId).direction),
    },
  ];
}

/** N 進カウンタに必要な FF の最低個数（N ≦ 2ᵏ を満たす最小の k）。 */
const bitsFor = (n: number): number => Math.ceil(Math.log2(n));

/** n 個の FF で何進になるかの候補（20-練7）。 */
const FORMULAS: { text: string; f: (n: number) => number }[] = [
  { text: 'n 進', f: (n) => n },
  { text: '2n 進', f: (n) => 2 * n },
  { text: '2ⁿ 進', f: (n) => 2 ** n },
  { text: 'n² 進', f: (n) => n * n },
  { text: '2ⁿ−1 進', f: (n) => 2 ** n - 1 },
];

export const PROBLEMS: readonly Problem[] = [
  // ---------- 第16回 ----------
  {
    kind: 'essay',
    id: '16-1',
    lecture: 16,
    title: '練習1 アップカウンタをダウンカウンタにする',
    source: '16 p.2',
    statement: 'p.1 で作成したカウンタ（10進）の回路を修正して、ダウンカウンタを設計せよ。ヒント：論理素子のプロパティを確認する。',
    answer: [
      'スライドには回路の解答例はない（シミュレータ上で確かめる問題）。',
      '参考（p.2 の表）：5進アップは 000→001→010→011→100、5進ダウンは 000→100→011→010→001 の順に進む。',
    ],
  },
  {
    kind: 'table',
    id: '16-2',
    lecture: 16,
    title: '練習2 7進アップカウンタの動作表',
    source: '16 p.3',
    statement: '7進アップカウンタの動作表を埋めよ（演習3の回路。外部 CLR は最初だけ働く）。スライドには7進ダウンの表もあるが、ダウンの回路は資料にないので、ここではアップだけを扱う。',
    sceneId: '16-ex3',
  },
  {
    kind: 'timing',
    id: '16-3a',
    lecture: 16,
    title: '練習3 上の回路のタイミングチャート',
    source: '16 p.6',
    statement: '図の8進カウンタのタイミングチャートを示せ。初期状態の出力は (000)₂ とする。',
    sceneId: '16-3a',
    blanks: ['q0', 'q1', 'q2'],
  },
  {
    kind: 'timing',
    id: '16-3b',
    lecture: 16,
    title: '練習3 下の回路のタイミングチャート',
    source: '16 p.6',
    statement: '図の8進カウンタのタイミングチャートを示せ。初期状態の出力は (000)₂ とする。',
    sceneId: '16-3b',
    blanks: ['q0', 'q1', 'q2'],
  },
  {
    kind: 'timing',
    id: '16-4',
    lecture: 16,
    title: '練習4 D-FFによる8進アップカウンタ',
    source: '16 p.7',
    statement: 'D-FF を3個用いた8進アップカウンタのタイミングチャートを示せ。',
    sceneId: '16-4',
    blanks: ['q0', 'q1', 'q2'],
  },
  {
    kind: 'timing',
    id: '16-5',
    lecture: 16,
    title: '練習5 非同期5進アップカウンタ',
    source: '16 p.9〜10',
    statement: '非同期5進アップカウンタ（外部 CLR 付き）のタイミングチャートを示せ。(101) は一瞬だけなので、マスには落ち着いた後の値を描く。',
    sceneId: '16-5',
    blanks: ['q0', 'q1', 'q2'],
  },
  {
    kind: 'quiz',
    id: '16-ex1',
    lecture: 16,
    title: '演習1 非同期64進カウンタのFFの個数',
    source: '16 p.11',
    statement: '非同期式64進カウンタ回路を構成する場合、フリップフロップは最低何個必要か答えよ。',
    questions: [{ kind: 'number', prompt: 'FF の最低個数', unit: '個', answer: () => bitsFor(64) }],
  },
  {
    kind: 'quiz',
    id: '16-ex2',
    lecture: 16,
    title: '演習2 カウンタ回路の名称',
    source: '16 p.11',
    statement: '2つのカウンタ回路の名称を答えよ（同期式か非同期式か、何進か、アップカウンタかダウンカウンタか）。',
    sceneIds: ['16-ex2a', '16-ex2b'],
    questions: [...nameQuestions('16-ex2a', '上の回路'), ...nameQuestions('16-ex2b', '下の回路')],
  },
  {
    kind: 'timing',
    id: '16-ex3',
    lecture: 16,
    title: '演習3 非同期7進アップカウンタ',
    source: '16 p.12',
    statement: 'D-FF（立上り、CLR 負論理）による非同期7進アップカウンタのタイミングチャートを示せ。入力波形はスライドにないので、外部 CLR を最初だけ 0 にしている。',
    sceneId: '16-ex3',
    blanks: ['q0', 'q1', 'q2'],
  },

  // ---------- 第17回 ----------
  {
    kind: 'timing',
    id: '17-1',
    lecture: 17,
    title: '練習1 JK-FFによる非同期5進アップカウンタ',
    source: '17 p.1〜2',
    statement: 'JK-FF による非同期5進アップカウンタのタイミングチャートを示せ（外部 CLR なし）。',
    sceneId: '17-1',
    blanks: ['q0', 'q1', 'q2'],
  },
  {
    kind: 'timing',
    id: '17-3',
    lecture: 17,
    title: '改良型非同期5進カウンタ',
    source: '17 p.4',
    statement: '改良型非同期5進カウンタのタイミングチャートを、J₂ を含めて示せ。',
    sceneId: '17-3',
    blanks: ['q0', 'q1', 'q2', 'j2'],
  },
  {
    kind: 'timing',
    id: '17-5',
    lecture: 17,
    title: '2進カウンタによる分周',
    source: '17 p.6',
    statement: '2進カウンタにクロック信号を入力したときの、出力 Q のタイミングチャートを示せ。',
    sceneId: '17-5',
    blanks: ['q'],
  },
  {
    kind: 'quiz',
    id: '17-ex1',
    lecture: 17,
    title: '演習1 プリスケーラ',
    source: '17 p.7',
    statement: '520Hz のクロック信号を 32.5Hz に分周するプリスケーラ（分周器）を設計せよ。',
    sceneIds: ['17-ex1'],
    questions: [
      { kind: 'number', prompt: '何進の非同期カウンタを構成すればよいか', unit: '進', answer: () => 520 / 32.5 },
      { kind: 'number', prompt: '必要な FF の個数', unit: '個', answer: () => bitsFor(520 / 32.5) },
    ],
  },
  {
    kind: 'quiz',
    id: '17-ex2',
    lecture: 17,
    title: '演習2 70MHzのクロックでLEDを点滅させる',
    source: '17 p.8',
    statement:
      'CPU のシステムクロック（デューティ比 50% で 0V と 3.3V を繰り返す）の周波数は 70MHz である。これを用いて、1秒間に2回程度 LED が点滅する回路を作りたい。電流制限抵抗は、LED に 10mA 流し、順方向降下電圧を 2.0V と仮定して求める。',
    questions: [
      {
        kind: 'number',
        prompt: '分周に必要な FF の個数（70MHz を 2Hz 程度まで落とす）',
        unit: '個',
        answer: () => Math.round(Math.log2(70e6 / 2)),
      },
      { kind: 'number', prompt: '電流制限抵抗の値', unit: 'Ω', answer: () => (3.3 - 2.0) / 0.01, tolerance: 5 },
    ],
  },

  // ---------- 第18回 ----------
  {
    kind: 'timing',
    id: '18-1',
    lecture: 18,
    title: '練習1 2ビットのJK-FF回路',
    source: '18 p.3',
    statement: '回路のタイミングチャートを示せ。',
    sceneId: '18-1',
    blanks: ['q0', 'q1'],
  },
  {
    kind: 'timing',
    id: '18-2',
    lecture: 18,
    title: '練習2 3ビットのJK-FF回路',
    source: '18 p.4',
    statement: '回路のタイミングチャートを示せ。同期式カウンタは、非同期式のように FF を同じ形で連結すればよいわけではない。',
    sceneId: '18-2',
    blanks: ['q0', 'q1', 'q2'],
  },
  {
    kind: 'table',
    id: '18-p3',
    lecture: 18,
    title: '練習3 同期8進カウンタの動作表',
    source: '18 p.6',
    statement: '同期8進カウンタの動作表を埋めよ。',
    sceneId: '18-p3',
  },
  {
    kind: 'table',
    id: '18-d3',
    lecture: 18,
    title: '同期3進カウンタ（D-FF）の動作表',
    source: '18 p.9〜10',
    statement: 'D₁=Q₀、D₀=Q̄₁Q̄₀ の同期3進カウンタの動作表を埋めよ。',
    sceneId: '18-d3',
  },
  {
    kind: 'table',
    id: '18-rs3',
    lecture: 18,
    title: '練習5 同期3進カウンタ（RS-FF）の動作表',
    source: '18 p.11〜12',
    statement: 'S₁=Q₀、R₁=Q̄₀、S₀=Q̄₁Q̄₀、R₀=Q₀ の同期3進カウンタの動作表を埋めよ。',
    sceneId: '18-rs3',
  },
  {
    kind: 'table',
    id: '18-ex2',
    lecture: 18,
    title: '演習2 同期5進カウンタの動作表',
    source: '18 p.15〜16',
    statement: 'J₂=Q₁Q₀、K₂=1、J₁=K₁=Q₀、J₀=Q̄₂、K₀=1 の同期5進カウンタの動作表を埋めよ。',
    sceneId: '18-ex2',
  },

  // ---------- 第19回 ----------
  {
    kind: 'timing',
    id: '19-reg4',
    lecture: 19,
    title: '4ビットパラレルレジスタ（バス表記）',
    source: '19 p.6',
    statement: '4ビットパラレルレジスタの出力データ Q を、16進で答えよ（X は付けずに、0〜F の1文字を入力する）。',
    sceneId: '19-reg4',
    blanks: [],
    busBlanks: ['Q'],
  },
  {
    kind: 'timing',
    id: '19-ex1',
    lecture: 19,
    title: '演習1 3ビットパラレルレジスタ',
    source: '19 p.9',
    statement: '回路の名称は「3ビットパラレルレジスタ」。タイミングチャートの空白 (Q₂Q₁Q₀)₂ を16進で埋めよ。',
    sceneId: '19-ex1',
    blanks: [],
    busBlanks: ['Q'],
  },
  {
    kind: 'timing',
    id: '19-ex2',
    lecture: 19,
    title: '演習2 3ビット（パラレル-シリアル）シフトレジスタ',
    source: '19 p.10',
    statement: '回路の名称は「3ビット（パラレル-シリアル）シフトレジスタ」。出力 Q（最終段の Q₀）のタイミングチャートを埋めよ。',
    sceneId: '19-ex2',
    blanks: ['q0'],
  },
  {
    kind: 'timing',
    id: '19-ex3',
    lecture: 19,
    title: '演習3 LEDが順に点灯する回路',
    source: '19 p.11〜12',
    statement: 'A に単発のパルスを入れたときの Q̄₃〜Q̄₀（LED は 0 で点灯）のタイミングチャートを示せ。',
    sceneId: '19-ex3',
    blanks: ['y3', 'y2', 'y1', 'y0'],
  },

  // ---------- 第20回 ----------
  {
    kind: 'timing',
    id: '20-p3',
    lecture: 20,
    title: '練習3 リングカウンタ（初期値 1110）',
    source: '20 p.3',
    statement: 'リングカウンタで、初期値が (Q₃Q₂Q₁Q₀)₂=(1110)₂ のときのタイミングチャートを示せ。常に CLR=1（インアクティブ）とする。',
    sceneId: '20-ring',
    blanks: ['q3', 'q2', 'q1', 'q0'],
  },
  {
    kind: 'timing',
    id: '20-p5',
    lecture: 20,
    title: '練習5 ジョンソンカウンタ',
    source: '20 p.5',
    statement: 'ジョンソンカウンタのタイミングチャートを示せ。',
    sceneId: '20-johnson',
    blanks: ['q3', 'q2', 'q1', 'q0'],
  },
  {
    kind: 'table',
    id: '20-p6',
    lecture: 20,
    title: '練習6 ジョンソンカウンタの動作表',
    source: '20 p.6',
    statement: 'ジョンソンカウンタの動作表（Cₚ が 0〜8 のとき）を書け。',
    sceneId: '20-johnson',
  },
  {
    kind: 'quiz',
    id: '20-p6q',
    lecture: 20,
    title: '練習6・7 ジョンソンカウンタは何進か',
    source: '20 p.6',
    statement: 'p.5 のジョンソンカウンタは、同期式と非同期式のどちらで、何進カウンタになるか。また、一般に FF を n 個用いるジョンソンカウンタは何進カウンタになるか。',
    sceneIds: ['20-johnson'],
    questions: [
      ...nameQuestions('20-johnson', 'ジョンソンカウンタ').slice(0, 2),
      {
        kind: 'choice',
        prompt: 'FF を n 個用いるジョンソンカウンタ',
        options: FORMULAS.map((x) => x.text),
        // FF 4個の回路の結果と合う式を選ぶ。
        answer: () => FORMULAS.findIndex((x) => x.f(4) === kindOf('20-johnson').modulus),
      },
    ],
  },
  {
    kind: 'essay',
    id: '20-ex1',
    lecture: 20,
    title: '演習1 入力Sの付いた回路の動作',
    source: '20 p.7',
    statement: 'JK-FF×4（PR 付き）で、各 PR に AND(Aₖ, S) がつながり、先頭の J に 0 が入る回路の動作を説明せよ。',
    answer: [
      'パラレル-シリアル変換回路である。',
      'S=1 なら入力 A が PR に入り、S=0 なら入らない。S は、入力データを受け付けるかどうかの許可信号（イネーブル）である。',
      'データを記憶した後は、クロックごとに Q から1ビットずつ取り出せる。',
    ],
  },
  {
    kind: 'quiz',
    id: '20-ex2',
    lecture: 20,
    title: '演習2 同期10進カウンタのFFの数',
    source: '20 p.8',
    statement: '同期10進カウンタを作るのに必要な FF の数を、それぞれ答えよ。',
    questions: [
      { kind: 'number', prompt: '(1) 通常の同期カウンタ（最低個数）', unit: '個', answer: () => bitsFor(10) },
      // リングカウンタは FF の数だけ状態を持つ（FF 4個の回路が4進になることから求める）。
      { kind: 'number', prompt: '(2) リングカウンタ', unit: '個', answer: () => 10 / ((kindOf('20-ring').modulus ?? NaN) / 4) },
      // ジョンソンカウンタは n 個で 2n 進（20-練7）。
      { kind: 'number', prompt: '(3) ジョンソンカウンタ', unit: '個', answer: () => 10 / ((kindOf('20-johnson').modulus ?? NaN) / 4) },
    ],
  },

  // ---------- 第21回 ----------
  {
    kind: 'timing',
    id: '21-p6',
    lecture: 21,
    title: '練習6 自動販売機のタイミングチャート',
    source: '21 p.9',
    statement:
      '自動販売機の回路の動作を考え、タイミングチャートを埋めよ。X と Q は FF を通るので CK に反応して変わる。Q′ と Y は組み合わせ回路なので、X と Q の変化にすぐ反応する。',
    sceneId: '21-vending',
    blanks: ['q1', 'q0', 'x1', 'x0', 'q1next', 'q0next', 'y1', 'y0'],
  },

  // ---------- 第22回 ----------
  {
    kind: 'essay',
    id: '22-p1',
    lecture: 22,
    title: '練習1 ミーリー型とムーア型の出力',
    source: '22 p.2〜3',
    statement: 'ミーリー型とムーア型の出力 z(t) を、入力 x(t) と現状態 s(t) を使った式で表せ。',
    answer: [
      'ミーリー型：z(t)=δ[x(t), s(t)]（出力は入力と現状態で決まる）。',
      'ムーア型：z(t)=δ[s(t)]（出力は現状態だけで決まる）。',
      '注意：スライド p.3 のムーア型の説明文は「入力と現状態で決まる」となっているが、式のとおり現状態だけで決まる（docs/problems.md の D5）。',
    ],
  },
  {
    kind: 'essay',
    id: '22-p2',
    lecture: 22,
    title: '練習2 自動販売機はどちらの型か',
    source: '22 p.4',
    statement: '自動販売機の回路で、出力決定回路部・次状態決定回路部・記憶回路部を示し、ミーリー型とムーア型のどちらかを答えよ。',
    answer: [
      '出力決定回路部：Y₁、Y₀ を作る AND／OR。',
      '次状態決定回路部：Q₁′、Q₀′ を作る AND／OR。',
      '記憶回路部：D-FF 2個。',
      '出力決定回路部に入力が反映されるので、ミーリー型である。',
    ],
  },
  {
    kind: 'essay',
    id: '22-ex2',
    lecture: 22,
    title: '演習2 計算機の中の論理回路',
    source: '22 p.28',
    statement: '(1) 計算機内の論理回路の例を挙げよ。(2) 命令実行サイクルの5段階を答えよ。(3) プログラムカウンタの役割を説明せよ。',
    answer: [
      '(1) レジスタ（多ビットの情報を一時的に記憶する高速な記憶装置）、ALU（加減乗除・論理演算を行う）、制御機構（他の機構に適切なタイミングで信号を送る）、プログラムカウンタ（実行中または次に実行する命令のメインメモリアドレスを管理するカウンタ）。',
      '(2) 命令フェッチ → 命令デコード → 実効アドレス計算 → オペランド読み出し → 命令実行。',
      '(3) 実行中（または次に実行する予定）の命令のメインメモリアドレスを記憶し、適切なタイミングでインクリメントすることで、命令列の実行順を管理する。',
    ],
  },
];

export function problemById(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
