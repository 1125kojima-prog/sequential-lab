/**
 * 論理式の読み取りと判定。
 * 書き方：否定は後ろに '（Q1'）か、前に ~ ! /（~Q1）。積は並べて書く（Q1Q0）か * ・ &。和は +。
 * 排他的論理和は ^。定数は 0 と 1。かっこも使える。変数名は大文字・小文字を区別しない。
 */
import type { Tri } from './fsm';
import { cost, evalTerms, minimize, type Term } from './minimize';

type Node =
  | { op: 'var'; index: number }
  | { op: 'const'; value: 0 | 1 }
  | { op: 'not'; a: Node }
  | { op: 'and' | 'or' | 'xor'; a: Node; b: Node };

type Token = { kind: 'var'; index: number } | { kind: 'sym'; text: string };

function tokenize(text: string, vars: readonly string[]): Token[] {
  const names = vars.map((v, index) => ({ name: v.toUpperCase(), index })).sort((a, b) => b.name.length - a.name.length);
  const src = text.toUpperCase().replace(/[’′]/g, "'").replace(/[·・＊×]/g, '*').replace(/＋/g, '+').replace(/[⊕]/g, '^').replace(/[¬￢]/g, '~');
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const hit = names.find((n) => src.startsWith(n.name, i));
    if (hit) {
      tokens.push({ kind: 'var', index: hit.index });
      i += hit.name.length;
      continue;
    }
    if ("'~!/*&+|^()01".includes(ch)) {
      tokens.push({ kind: 'sym', text: ch });
      i++;
      continue;
    }
    throw new Error(`読めない文字があります：「${text[i]}」（使える変数：${vars.map((v) => v.toUpperCase()).join('、')}）`);
  }
  return tokens;
}

/** 式を読む。優先順位は 否定 > 積 > 排他的論理和 > 和。 */
function parse(text: string, vars: readonly string[]): Node {
  const tokens = tokenize(text, vars);
  if (tokens.length === 0) throw new Error('式が空です');
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const isSym = (t: Token | undefined, s: string): boolean => t?.kind === 'sym' && s.includes(t.text);

  const atom = (): Node => {
    const t = tokens[pos++];
    if (!t) throw new Error('式が途中で終わっています');
    let node: Node;
    if (t.kind === 'var') node = { op: 'var', index: t.index };
    else if (t.text === '0' || t.text === '1') node = { op: 'const', value: t.text === '1' ? 1 : 0 };
    else if ('~!/'.includes(t.text)) return { op: 'not', a: atom() };
    else if (t.text === '(') {
      node = or();
      if (!isSym(tokens[pos++], ')')) throw new Error('かっこが閉じていません');
    } else throw new Error(`「${t.text}」の位置が正しくありません`);
    while (isSym(peek(), "'")) {
      pos++;
      node = { op: 'not', a: node };
    }
    return node;
  };
  const startsAtom = (t: Token | undefined): boolean => t !== undefined && (t.kind === 'var' || '~!/(01'.includes(t.text));
  const and = (): Node => {
    let node = atom();
    for (;;) {
      if (isSym(peek(), '*&')) pos++;
      else if (!startsAtom(peek())) break;
      node = { op: 'and', a: node, b: atom() };
    }
    return node;
  };
  const xor = (): Node => {
    let node = and();
    while (isSym(peek(), '^')) {
      pos++;
      node = { op: 'xor', a: node, b: and() };
    }
    return node;
  };
  function or(): Node {
    let node = xor();
    while (isSym(peek(), '+|')) {
      pos++;
      node = { op: 'or', a: node, b: xor() };
    }
    return node;
  }
  const root = or();
  if (pos < tokens.length) throw new Error('式の終わりに余分な文字があります');
  return root;
}

function evaluate(node: Node, row: number, nvars: number): 0 | 1 {
  switch (node.op) {
    case 'var':
      return ((row >> (nvars - 1 - node.index)) & 1) as 0 | 1;
    case 'const':
      return node.value;
    case 'not':
      return evaluate(node.a, row, nvars) === 1 ? 0 : 1;
    case 'and':
      return evaluate(node.a, row, nvars) === 1 && evaluate(node.b, row, nvars) === 1 ? 1 : 0;
    case 'or':
      return evaluate(node.a, row, nvars) === 1 || evaluate(node.b, row, nvars) === 1 ? 1 : 0;
    case 'xor':
      return evaluate(node.a, row, nvars) !== evaluate(node.b, row, nvars) ? 1 : 0;
  }
}

/** 積和形（リテラルの積の和）なら、積項とリテラルの数を数える。そうでなければ undefined。 */
function sopCost(node: Node): { terms: number; literals: number } | undefined {
  const literal = (x: Node): boolean => x.op === 'var' || (x.op === 'not' && x.a.op === 'var');
  const product = (x: Node): number | undefined => {
    if (literal(x)) return 1;
    if (x.op !== 'and') return undefined;
    const a = product(x.a);
    const b = product(x.b);
    return a === undefined || b === undefined ? undefined : a + b;
  };
  if (node.op === 'const') return { terms: node.value, literals: 0 };
  const sum = (x: Node): { terms: number; literals: number } | undefined => {
    if (x.op === 'or') {
      const a = sum(x.a);
      const b = sum(x.b);
      return a && b ? { terms: a.terms + b.terms, literals: a.literals + b.literals } : undefined;
    }
    const p = product(x);
    return p === undefined ? undefined : { terms: 1, literals: p };
  };
  return sum(node);
}

export type Judgement =
  | { status: 'error'; message: string }
  /** 真理値表と合わない。row は合わない行の番号、expected はその行の正しい値。 */
  | { status: 'wrong'; row: number; expected: 0 | 1 }
  /** 正しいが、最小積和形より大きい（または積和形ではない）。 */
  | { status: 'correct'; note: string }
  | { status: 'minimal' };

/** 入力した式を、真理値表（X は除く）の全行と照合する。 */
export function judge(text: string, vars: readonly string[], table: readonly Tri[]): Judgement {
  let node: Node;
  try {
    node = parse(text, vars);
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  const nvars = vars.length;
  for (let row = 0; row < table.length; row++) {
    const want = table[row]!;
    if (want !== null && evaluate(node, row, nvars) !== want) return { status: 'wrong', row, expected: want };
  }
  const best = cost(minimize(table, nvars));
  const mine = sopCost(node);
  if (!mine) return { status: 'correct', note: '積和形ではないので、最小かどうかは判定していません。' };
  if (mine.terms <= best.terms && mine.literals <= best.literals) return { status: 'minimal' };
  return {
    status: 'correct',
    note: `最小積和形は 積項 ${best.terms} 個・リテラル ${best.literals} 個です（この式は 積項 ${mine.terms} 個・リテラル ${mine.literals} 個）。`,
  };
}

/** 式の値（テストや回路との照合用）。 */
export function evalExpr(text: string, vars: readonly string[], row: number): 0 | 1 {
  return evaluate(parse(text, vars), row, vars.length);
}

/** 積和形を、入力欄に書く形の文字列にする。例：Q1'Q0' + Q0 */
export function termsText(terms: readonly Term[], vars: readonly string[]): string {
  if (terms.length === 0) return '0';
  return terms
    .map((t) => {
      if (t.mask === 0) return '1';
      return vars
        .map((v, i) => {
          const bit = 1 << (vars.length - 1 - i);
          return t.mask & bit ? v.toUpperCase() + (t.value & bit ? '' : "'") : '';
        })
        .join('');
    })
    .join(' + ');
}

/** 積和形を、表示用の書式（view/label.ts）にする。例：'~Q_1 ~Q_0 + Q_0' */
export function termsLabel(terms: readonly Term[], labels: readonly string[]): string {
  if (terms.length === 0) return '0';
  return terms
    .map((t) => {
      if (t.mask === 0) return '1';
      return labels
        .map((label, i) => {
          const bit = 1 << (labels.length - 1 - i);
          return t.mask & bit ? (t.value & bit ? label : `~${label}`) : '';
        })
        .filter((s) => s !== '')
        .join(' ');
    })
    .join(' ＋ ');
}

export { evalTerms };
