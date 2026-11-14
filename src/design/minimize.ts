/**
 * 論理式の簡単化（クワイン・マクラスキー法）と、カルノー図のグループの判定。
 * 変数は上位から並べ、行の番号の最上位ビットが最初の変数に対応する。
 */
import type { Tri } from './fsm';

/**
 * 積項。mask のビットが 1 の変数だけが式に現れ、value がその値（1 ならそのまま、0 なら否定）。
 * ビットの位置は行の番号と同じ（最初の変数が最上位）。
 */
export type Term = { mask: number; value: number };

export function covers(term: Term, row: number): boolean {
  return (row & term.mask) === term.value;
}

export function evalTerms(terms: readonly Term[], row: number): 0 | 1 {
  return terms.some((t) => covers(t, row)) ? 1 : 0;
}

const popcount = (x: number): number => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n++;
  return n;
};

/** 式の大きさ：積項の数と、リテラル（変数の出現）の数。 */
export function cost(terms: readonly Term[]): { terms: number; literals: number } {
  return { terms: terms.length, literals: terms.reduce((n, t) => n + popcount(t.mask), 0) };
}

/** 主項（これ以上まとめられない積項）をすべて求める。1 と X の行を使う。 */
export function primeImplicants(table: readonly Tri[], nvars: number): Term[] {
  const full = 2 ** nvars - 1;
  let current = new Map<string, Term>();
  table.forEach((v, row) => {
    if (v !== 0) current.set(`${full}/${row}`, { mask: full, value: row });
  });
  const primes: Term[] = [];
  while (current.size > 0) {
    const next = new Map<string, Term>();
    const used = new Set<string>();
    const list = [...current.entries()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [ka, a] = list[i]!;
        const [kb, b] = list[j]!;
        if (a.mask !== b.mask) continue;
        const diff = a.value ^ b.value;
        if (popcount(diff) !== 1) continue;
        const merged: Term = { mask: a.mask & ~diff, value: a.value & ~diff };
        next.set(`${merged.mask}/${merged.value}`, merged);
        used.add(ka);
        used.add(kb);
      }
    }
    for (const [key, term] of list) if (!used.has(key)) primes.push(term);
    current = next;
  }
  return primes;
}

/** 最小積和形を1つ求める（積項の数が最小、その中でリテラルの数が最小）。全部 0 なら []。 */
export function minimize(table: readonly Tri[], nvars: number): Term[] {
  const ones = table.flatMap((v, row) => (v === 1 ? [row] : []));
  if (ones.length === 0) return [];
  const primes = primeImplicants(table, nvars).filter((p) => ones.some((row) => covers(p, row)));
  let best: Term[] | undefined;
  const better = (a: Term[], b: Term[] | undefined): boolean => {
    if (!b) return true;
    const ca = cost(a);
    const cb = cost(b);
    return ca.terms < cb.terms || (ca.terms === cb.terms && ca.literals < cb.literals);
  };
  const search = (chosen: Term[], rest: number[]): void => {
    if (best && chosen.length > best.length) return;
    if (rest.length === 0) {
      if (better(chosen, best)) best = [...chosen];
      return;
    }
    // 覆える主項がいちばん少ない行から決める（必須主項が先に決まる）。
    let pick = rest[0]!;
    let options = primes.filter((p) => covers(p, pick));
    for (const row of rest) {
      const c = primes.filter((p) => covers(p, row));
      if (c.length < options.length) {
        pick = row;
        options = c;
      }
    }
    for (const p of options) {
      chosen.push(p);
      search(chosen, rest.filter((row) => !covers(p, row)));
      chosen.pop();
    }
  };
  search([], ones);
  // 表示が安定するように、上位の変数を含む項、値の大きい項の順に並べる。
  return (best ?? []).sort((a, b) => b.mask - a.mask || b.value - a.value);
}

/**
 * カルノー図で選んだマス（行の番号）が、1つのグループ（積項）になっているか。
 * 数が 2 のべき乗で、まとめた変数以外の値がそろっていれば積項を返す。
 */
export function groupTerm(rows: readonly number[], nvars: number): Term | undefined {
  const unique = [...new Set(rows)];
  if (unique.length === 0 || (unique.length & (unique.length - 1)) !== 0) return undefined;
  const full = 2 ** nvars - 1;
  let same = full;
  for (const row of unique) same &= ~(row ^ unique[0]!);
  const term: Term = { mask: same, value: unique[0]! & same };
  // そろっていない変数が k 個なら、2ᵏ 個のマスが全部入っている必要がある。
  return 2 ** (nvars - popcount(same)) === unique.length ? term : undefined;
}

/** カルノー図の並び（グレイコード順）。列は前半の変数、行は残りの変数。 */
export type KMapLayout = {
  colVars: number[];
  rowVars: number[];
  /** 列・行の見出しの値（グレイコード順）。 */
  cols: number[];
  rows: number[];
  /** (行, 列) のマスに対応する真理値表の行の番号。 */
  index: (r: number, c: number) => number;
};

const GRAY: Record<number, number[]> = { 0: [0], 1: [0, 1], 2: [0, 1, 3, 2], 3: [0, 1, 3, 2, 6, 7, 5, 4] };

export function kmapLayout(nvars: number): KMapLayout {
  if (nvars < 1 || nvars > 6) throw new Error('カルノー図は 1〜6 変数まで');
  const nc = Math.ceil(nvars / 2);
  const nr = nvars - nc;
  const colVars = Array.from({ length: nc }, (_, i) => i);
  const rowVars = Array.from({ length: nr }, (_, i) => nc + i);
  return {
    colVars,
    rowVars,
    cols: GRAY[nc]!,
    rows: GRAY[nr]!,
    // 列の値が上位（前半の変数）、行の値が下位。
    index: (r, c) => (GRAY[nc]![c]! << nr) | GRAY[nr]![r]!,
  };
}
