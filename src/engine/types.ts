/** 論理レベル。0 = L、1 = H。 */
export type Level = 0 | 1;

/** 信号の参照。文字列は信号名、0/1 は定数。 */
export type Ref = string | Level;

/**
 * 素子の入力への接続。
 * `wire` を付けると、その配線に遅延を設定できる（Delays.wire[wire]）。
 */
export type Conn = Ref | { from: Ref; wire: string };

export type GateOp = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR';

/** ゲート。出力の信号名は `id`。 */
export type Gate = {
  kind: 'gate';
  id: string;
  op: GateOp;
  inputs: Conn[];
};

export type FFType = 'D' | 'T' | 'JK' | 'RS';
export type Trigger = 'rising' | 'falling';

/** 非同期入力（CLR / PR）。active: 'high' = 正論理、'low' = 負論理。 */
export type AsyncPin = { conn: Conn; active: 'high' | 'low' };

export type DataPinName = 'd' | 't' | 'j' | 'k' | 's' | 'r';

/** フリップフロップ。出力の信号名は `q` と `qn`（省略時は `n` + q）。 */
export type FlipFlop = {
  kind: 'ff';
  id: string;
  type: FFType;
  trigger: Trigger;
  clock: Conn;
  d?: Conn;
  t?: Conn;
  j?: Conn;
  k?: Conn;
  s?: Conn;
  r?: Conn;
  clr?: AsyncPin;
  pr?: AsyncPin;
  q: string;
  qn?: string;
  /** 初期値（省略時 0）。SimOptions.init で上書きできる。 */
  init?: Level;
};

export type Component = Gate | FlipFlop;

export type Circuit = {
  id: string;
  title?: string;
  /** 外部入力の信号名（Cₚ、CLR、A など）。 */
  inputs: string[];
  components: Component[];
  /** 多ビット信号。上位ビットから並べる。例：{ Q: ['q2', 'q1', 'q0'] } */
  buses?: Record<string, string[]>;
};

/** 入力の刺激列。時間の単位は ns。 */
export type Stimulus = {
  /** 入力の初期値（省略した入力は 0）。 */
  initial?: Record<string, Level>;
  /** 指定した時刻に入力の値を変える。 */
  changes: { t: number; signal: string; value: Level }[];
  /** シミュレーションを終える時刻。 */
  end: number;
};

/** 遅延の設定。単位は ns。 */
export type Delays = {
  /** FFの伝搬遅延（クロックエッジ／CLR／PR → Q）の既定値。 */
  ff: number;
  /** ゲートの伝搬遅延の既定値。 */
  gate: number;
  /** FFごとの上書き（キーは FF の id）。 */
  ffById?: Record<string, number>;
  /** ゲートごとの上書き（キーはゲートの id）。 */
  gateById?: Record<string, number>;
  /** 配線ごとの遅延（キーは Conn.wire）。 */
  wire?: Record<string, number>;
};

export type SimOptions = {
  /** 'ideal' は遅延をすべて 0 として扱う。'delay' は delays を使う。 */
  mode: 'ideal' | 'delay';
  delays?: Partial<Delays>;
  /**
   * 配線遅延のモデル。
   * 'inertial'（標準）：遅延より短いパルスは消える。
   * 'transport'：どんなパルスもそのまま遅れて届く。
   */
  wireModel?: 'inertial' | 'transport';
  /** FFの初期値の上書き（キーは FF の id）。 */
  init?: Record<string, Level>;
};

export type FFAction = 'set' | 'reset' | 'toggle' | 'hold' | 'load' | 'invalid';

/** 信号が変化した理由。 */
export type Cause =
  | { kind: 'stimulus' }
  | {
      kind: 'clock';
      ff: string;
      /** クロックエッジがFFに届いた時刻。 */
      at: number;
      edge: Trigger;
      /** クロック端子につながっている信号。 */
      clockSignal: Ref;
      /** エッジ直前の入力の値。例：{ j: 1, k: 1 } */
      inputs: Partial<Record<DataPinName, Level>>;
      action: FFAction;
    }
  | {
      kind: 'async';
      ff: string;
      at: number;
      pin: 'clr' | 'pr';
      /** CLR／PR 端子につながっている信号。 */
      by: Ref;
    }
  | { kind: 'gate'; gate: string; at: number; op: GateOp; inputs: Level[] };

export type Change = {
  /** 変化した時刻（ns）。 */
  t: number;
  /** 同じ時刻の中での順番（遅延 0 のときの因果の順）。 */
  delta: number;
  signal: string;
  value: Level;
  cause: Cause;
};

export type Trace = {
  /** すべての信号名。 */
  signals: string[];
  /** t=0 での値。 */
  initial: Record<string, Level>;
  /** 変化の一覧（時刻順）。 */
  changes: Change[];
  end: number;
};

export const DEFAULT_DELAYS: Delays = { ff: 8, gate: 5 };
