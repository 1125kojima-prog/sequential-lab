/**
 * 命令実行サイクル（第22回 p.11〜24）。
 *
 * スライドの小さな計算機（PC、命令レジスタ、デコーダ、ALU、ALUラッチ AR0/AR1、汎用レジスタ GR0〜GR2、
 * メインメモリ）で、プログラムを1段階ずつ実行し、各段階の「前後の値・矢印・説明」をコマにして返す。
 * UI から切り離した純粋な TypeScript。値はスライドに書いてあるものではなく、ここで計算した結果。
 *
 * 命令（p.13 右下の定義。MIPS ライク）
 *   add $s1, $s2, $s3   $s1 に $s2 + $s3 を格納
 *   sub $s1, $s2, $s3   $s1 に $s2 − $s3 を格納
 *   sw  $s1, N($s2)     $s1 の内容をアドレス N + $s2 に格納
 * オペランドは GRn（レジスタ）か数（メインメモリのアドレス）。
 */

export type Reg = 'GR0' | 'GR1' | 'GR2';
export const REGS: readonly Reg[] = ['GR0', 'GR1', 'GR2'];

/** オペランド。reg＝レジスタオペランド、mem＝メモリオペランド（アドレス）、imm＝即値（sw の N(x) の x が数のとき）。 */
export type Operand = { kind: 'reg'; reg: Reg } | { kind: 'mem'; addr: number } | { kind: 'imm'; value: number };

export type Instr =
  | { op: 'add' | 'sub'; dst: Reg; a: Operand; b: Operand; text: string }
  | { op: 'sw'; src: Reg; offset: number; base: Operand; text: string };

/** 5つの処理（p.11）。 */
export type Stage = 'fetch' | 'decode' | 'address' | 'operand' | 'execute';
export const STAGES: readonly { id: Stage; name: string; what: string }[] = [
  { id: 'fetch', name: '命令フェッチ', what: 'これから実行する命令をメインメモリから読み出し、命令レジスタに保存' },
  { id: 'decode', name: '命令デコード', what: '読み出した命令を解読し、オペコードとオペランドを認識' },
  { id: 'address', name: '実効アドレス計算', what: 'オペランドから、実際にアクセスすべきメインメモリのアドレス（実効アドレス）を計算' },
  { id: 'operand', name: 'オペランド読み出し', what: '実効アドレスにアクセスし、データを読み出して CPU 内部のレジスタに保存' },
  { id: 'execute', name: '命令実行', what: '命令を実行し、結果を CPU 内部のレジスタに保存（命令によってはメインメモリに書き戻す）' },
];

/** スライド p.13〜24 の3段階。 */
export type Phase = 1 | 2 | 3;
export const PHASES: readonly { no: Phase; name: string; what: string[] }[] = [
  { no: 1, name: '命令の取得', what: ['PCが持つアドレスの値をメモリから命令レジスタにロード', '同時に次命令のロードに備えてPCの値をインクリメント'] },
  { no: 2, name: '命令の解読', what: ['命令レジスタの値をデコードしてオペコードとオペランドの取得'] },
  { no: 3, name: '命令の実行', what: ['オペコードとオペランドに従って命令を実行'] },
];

/** 図の部品。メモリの行は `m<アドレス>`。 */
export type Part = 'ir' | 'dec' | 'alu' | 'pc' | 'ar0' | 'ar1' | 'gr0' | 'gr1' | 'gr2' | `m${number}`;

export type Machine = {
  pc: number;
  /** 命令レジスタに入っている命令（の文字列）。 */
  ir: string | null;
  ar0: number | null;
  ar1: number | null;
  gr: Record<Reg, number | null>;
  /** メインメモリ。値は命令の文字列か数。 */
  mem: Record<number, string | number>;
};

/** デコーダが取り出した内容。operands は実効アドレス計算の後の表記（sw は N+x を計算済みにする）。 */
export type Decoded = { opcode: string; operands: string; addressed: boolean };

export type Arrow = {
  from: Part;
  to: Part;
  /** addr＝アドレスで指す（赤）、data＝データが移る（青）。 */
  kind: 'addr' | 'data';
};

export type Frame = {
  /** 何命令目か（0 は実行前）。 */
  instr: number;
  stage: Stage | null;
  phase: Phase | null;
  /** 対応するスライドのページ。 */
  slide: number;
  machine: Machine;
  decoded: Decoded | null;
  /** このコマで値が書き換わった部品。 */
  changed: Part[];
  /** このコマで参照した部品（値は変わらない）。 */
  used: Part[];
  arrows: Arrow[];
  /** 説明（1行目が見出し）。 */
  text: string[];
};

const REG_PART: Record<Reg, Part> = { GR0: 'gr0', GR1: 'gr1', GR2: 'gr2' };
export const memPart = (addr: number): Part => `m${addr}`;

function parseOperand(s: string): Operand {
  const t = s.trim();
  if (/^GR[0-2]$/.test(t)) return { kind: 'reg', reg: t as Reg };
  if (/^\d+$/.test(t)) return { kind: 'mem', addr: Number(t) };
  throw new Error(`オペランドが読めません: ${s}`);
}

/** "add GR0, 1820, 1821" のような命令の文字列を読む。 */
export function parseInstr(text: string): Instr {
  const m = /^\s*(add|sub|sw)\s+(.+)$/.exec(text);
  if (!m) throw new Error(`命令が読めません: ${text}`);
  const op = m[1] as 'add' | 'sub' | 'sw';
  if (op === 'sw') {
    const s = /^(GR[0-2])\s*,\s*(\d+)\s*\(\s*(GR[0-2]|\d+)\s*\)\s*$/.exec(m[2]!);
    if (!s) throw new Error(`sw の形が違います（sw GRn, N(x)）: ${text}`);
    const base = parseOperand(s[3]!);
    return {
      op,
      src: s[1] as Reg,
      offset: Number(s[2]),
      base: base.kind === 'mem' ? { kind: 'imm', value: base.addr } : base,
      text,
    };
  }
  const parts = m[2]!.split(',');
  if (parts.length !== 3) throw new Error(`${op} のオペランドは3つです: ${text}`);
  const dst = parseOperand(parts[0]!);
  if (dst.kind !== 'reg') throw new Error(`${op} の格納先はレジスタです: ${text}`);
  return { op, dst: dst.reg, a: parseOperand(parts[1]!), b: parseOperand(parts[2]!), text };
}

export type Program = {
  start: number;
  /** メインメモリの初期内容（命令は文字列、データは数）。 */
  memory: Record<number, string | number>;
};

/** スライド p.13 の初期状態。 */
export const SLIDE_PROGRAM: Program = {
  start: 1000,
  memory: {
    1000: 'add GR0, 1820, 1821',
    1001: 'sub GR1, GR0, 1822',
    1002: 'sw GR1, 1000(823)',
    1820: 38,
    1821: 26,
    1822: 19,
  },
};

const clone = (m: Machine): Machine => ({ ...m, gr: { ...m.gr }, mem: { ...m.mem } });

function showOperand(o: Operand): string {
  return o.kind === 'reg' ? o.reg : o.kind === 'mem' ? String(o.addr) : String(o.value);
}

function where(o: Operand): string {
  return o.kind === 'reg' ? `レジスタ ${o.reg}` : `メインメモリの ${showOperand(o)} 番地`;
}

/**
 * プログラムを実行し、コマの列を返す。PC の指す番地が命令でなくなったら止まる。
 * 値の読めないオペランド（空のレジスタ・空の番地）はエラーにする。
 */
export function runProgram(program: Program = SLIDE_PROGRAM, maxInstr = 50): Frame[] {
  let m: Machine = { pc: program.start, ir: null, ar0: null, ar1: null, gr: { GR0: null, GR1: null, GR2: null }, mem: { ...program.memory } };
  const frames: Frame[] = [
    {
      instr: 0,
      stage: null,
      phase: null,
      slide: 13,
      machine: clone(m),
      decoded: null,
      changed: [],
      used: [],
      arrows: [],
      text: [
        '実行前',
        `プログラム（命令）とデータはメインメモリに入っている。PC は最初の命令のアドレス ${m.pc} を指している。`,
        '「次へ」で、1命令ずつ 命令フェッチ → 命令デコード → 実効アドレス計算 → オペランド読み出し → 命令実行 と進める。',
      ],
    },
  ];
  // スライドのページ：1命令あたり4枚（取得・PC更新・解読・実行）。sw は解読と実行が1枚（p.24）。
  const slideBase = (k: number): number => 14 + 4 * (k - 1);

  for (let k = 1; k <= maxInstr; k++) {
    const word = m.mem[m.pc];
    if (typeof word !== 'string') break;
    const ins = parseInstr(word);
    const base = slideBase(k);
    const push = (f: Omit<Frame, 'instr' | 'machine'>): void => {
      frames.push({ instr: k, machine: clone(m), ...f });
    };

    // 1. 命令フェッチ：IR ← mem[PC]
    const at = m.pc;
    m.ir = word;
    push({
      stage: 'fetch',
      phase: 1,
      slide: base,
      decoded: null,
      changed: ['ir'],
      used: ['pc', memPart(at)],
      arrows: [
        { from: 'pc', to: memPart(at), kind: 'addr' },
        { from: memPart(at), to: 'ir', kind: 'data' },
      ],
      text: [
        '命令フェッチ',
        `PC の値 ${at} が「実行する命令のアドレス」。メインメモリの ${at} 番地から命令「${word}」を読み出し、命令レジスタに保存する。`,
      ],
    });
    // 同時に PC をインクリメント
    m.pc = at + 1;
    push({
      stage: 'fetch',
      phase: 1,
      slide: base + 1,
      decoded: null,
      changed: ['pc'],
      used: [],
      arrows: [],
      text: [
        'PC のインクリメント',
        `次に実行する命令のアドレスを指すように、PC を ${at} → ${m.pc} にする（命令フェッチと同時に行う）。`,
        'PC は同期式カウンタ（第18回）で管理されている。',
      ],
    });

    // 2. 命令デコード
    const decodeSlide = base + 2;
    if (ins.op === 'sw') {
      const raw = `${ins.src}, ${ins.offset}(${showOperand(ins.base)})`;
      let decoded: Decoded = { opcode: 'sw', operands: raw, addressed: false };
      push({
        stage: 'decode',
        phase: 2,
        slide: decodeSlide,
        decoded,
        changed: ['dec'],
        used: ['ir'],
        arrows: [],
        text: [
          '命令デコード',
          `命令レジスタの「${word}」を解読する。オペコード sw（ストア：レジスタの内容をメインメモリに格納）、オペランド ${raw}。`,
          `${ins.src} はレジスタオペランド、${ins.offset}(${showOperand(ins.base)}) はメモリオペランド（格納先は ${ins.offset}＋${showOperand(ins.base)} 番地）。`,
        ],
      });
      // 実効アドレス計算
      const baseValue = ins.base.kind === 'reg' ? need(m.gr[ins.base.reg], ins.base.reg) : ins.base.kind === 'imm' ? ins.base.value : ins.base.addr;
      const ea = ins.offset + baseValue;
      decoded = { opcode: 'sw', operands: `${ins.src}, ${ea}`, addressed: true };
      push({
        stage: 'address',
        phase: 2,
        slide: decodeSlide,
        decoded,
        changed: ['dec'],
        used: ins.base.kind === 'reg' ? [REG_PART[ins.base.reg]] : [],
        arrows: [{ from: 'dec', to: memPart(ea), kind: 'addr' }],
        text: [
          '実効アドレス計算',
          `格納先のアドレスを計算する：${ins.offset} ＋ ${baseValue}${ins.base.kind === 'reg' ? `（${ins.base.reg} の値）` : ''} ＝ ${ea}。オペランドは「${ins.src}, ${ea}」になる。`,
        ],
      });
      // オペランド読み出し：格納するデータ（ソースのレジスタ）
      const value = need(m.gr[ins.src], ins.src);
      push({
        stage: 'operand',
        phase: 2,
        slide: decodeSlide,
        decoded,
        changed: [],
        used: [REG_PART[ins.src]],
        arrows: [{ from: 'dec', to: REG_PART[ins.src], kind: 'addr' }],
        text: [
          'オペランド読み出し',
          `レジスタオペランド ${ins.src} にアクセスし、格納するデータ ${value} を取り出す。`,
          'メインメモリから読むデータはないので、ALUラッチは変わらない。',
        ],
      });
      // 命令実行：mem[ea] ← src
      m.mem[ea] = value;
      push({
        stage: 'execute',
        phase: 3,
        slide: decodeSlide,
        decoded,
        changed: [memPart(ea)],
        used: [REG_PART[ins.src]],
        arrows: [
          { from: 'dec', to: memPart(ea), kind: 'addr' },
          { from: REG_PART[ins.src], to: memPart(ea), kind: 'data' },
        ],
        text: ['命令実行', `${ins.src} のデータ ${value} を、メインメモリの ${ea} 番地にストアする（メモリに書き戻す命令）。`],
      });
      continue;
    }

    const operands = `${ins.dst}, ${showOperand(ins.a)}, ${showOperand(ins.b)}`;
    const decoded: Decoded = { opcode: ins.op, operands, addressed: true };
    const opWord = ins.op === 'add' ? '足し算' : '引き算';
    push({
      stage: 'decode',
      phase: 2,
      slide: decodeSlide,
      decoded,
      changed: ['dec'],
      used: ['ir'],
      arrows: [],
      text: [
        '命令デコード',
        `命令レジスタの「${word}」を解読する。オペコード ${ins.op}（${opWord}をしなさい）、オペランド ${operands}。`,
        `${showOperand(ins.a)} と ${showOperand(ins.b)} の値を${opWord}し、結果を ${ins.dst} に格納する、という意味。`,
      ],
    });
    const memOps = [ins.a, ins.b].filter((o): o is Extract<Operand, { kind: 'mem' }> => o.kind === 'mem');
    push({
      stage: 'address',
      phase: 2,
      slide: decodeSlide,
      decoded,
      changed: [],
      used: [],
      arrows: memOps.map((o) => ({ from: 'dec' as Part, to: memPart(o.addr), kind: 'addr' as const })),
      text: [
        '実効アドレス計算',
        memOps.length > 0
          ? `メモリオペランド ${memOps.map((o) => o.addr).join(', ')} はアドレスがそのまま書いてあるので、実効アドレスは ${memOps.map((o) => o.addr).join(', ')}（計算はいらない）。`
          : 'メモリオペランドがないので、実効アドレスの計算はない。',
      ],
    });
    // オペランド読み出し：AR0 ← a、AR1 ← b
    const read = (o: Operand): { value: number; from: Part } =>
      o.kind === 'reg'
        ? { value: need(m.gr[o.reg], o.reg), from: REG_PART[o.reg] }
        : o.kind === 'mem'
          ? { value: needMem(m.mem[o.addr], o.addr), from: memPart(o.addr) }
          : { value: o.value, from: 'dec' };
    const a = read(ins.a);
    const b = read(ins.b);
    m.ar0 = a.value;
    m.ar1 = b.value;
    const arrows: Arrow[] = [];
    for (const o of [ins.a, ins.b]) if (o.kind !== 'imm') arrows.push({ from: 'dec', to: o.kind === 'reg' ? REG_PART[o.reg] : memPart(o.addr), kind: 'addr' });
    arrows.push({ from: a.from, to: 'ar0', kind: 'data' }, { from: b.from, to: 'ar1', kind: 'data' });
    push({
      stage: 'operand',
      phase: 2,
      slide: decodeSlide,
      decoded,
      changed: ['ar0', 'ar1'],
      used: [a.from, b.from],
      arrows,
      text: [
        'オペランド読み出し',
        `ALUラッチに各オペランドのデータをロードする：AR0 ← ${a.value}（${where(ins.a)}）、AR1 ← ${b.value}（${where(ins.b)}）。`,
      ],
    });
    // 命令実行：dst ← AR0 ± AR1
    const result = ins.op === 'add' ? a.value + b.value : a.value - b.value;
    m.gr[ins.dst] = result;
    push({
      stage: 'execute',
      phase: 3,
      slide: base + 3,
      decoded,
      changed: [REG_PART[ins.dst]],
      used: ['ar0', 'ar1', 'alu'],
      arrows: [
        { from: 'ar0', to: 'alu', kind: 'data' },
        { from: 'ar1', to: 'alu', kind: 'data' },
        { from: 'alu', to: REG_PART[ins.dst], kind: 'data' },
      ],
      text: [
        '命令実行',
        `ALU で AR0 ${ins.op === 'add' ? '＋' : '−'} AR1 ＝ ${a.value} ${ins.op === 'add' ? '＋' : '−'} ${b.value} ＝ ${result} を計算し、結果をレジスタオペランドの指定場所 ${ins.dst} に格納する。`,
      ],
    });
  }
  return frames;
}

function need(v: number | null, name: string): number {
  if (v === null) throw new Error(`${name} に値が入っていません`);
  return v;
}

function needMem(v: string | number | undefined, addr: number): number {
  if (typeof v !== 'number') throw new Error(`メインメモリの ${addr} 番地に数が入っていません`);
  return v;
}
