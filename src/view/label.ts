/**
 * 信号名の表記。添字と上線（否定）を持つ。
 * 書式：部品を空白で区切る。`~` で始まる部品は上線、`_` の後ろは添字。
 * 例：'Q_0' → Q₀、'~Q_1 ~Q_0' → Q̄₁Q̄₀、'C_p' → Cₚ、'NOT( Q_1 )' → NOT(Q₁)
 */
import type { Ref } from '../engine/types';

export type LabelPart = { base: string; sub?: string; bar?: boolean };
export type Label = LabelPart[];

export function parseLabel(markup: string): Label {
  return markup
    .split(' ')
    .filter((s) => s.length > 0)
    .map((token) => {
      const bar = token.startsWith('~');
      const body = bar ? token.slice(1) : token;
      const at = body.indexOf('_');
      const part: LabelPart = at < 0 ? { base: body } : { base: body.slice(0, at), sub: body.slice(at + 1) };
      if (bar) part.bar = true;
      return part;
    });
}

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', p: 'ₚ',
};

export function subscript(s: string): string {
  return [...s].map((ch) => SUBSCRIPTS[ch] ?? ch).join('');
}

/** 文章の中で使う表記（Unicode の添字と合成用の上線）。 */
export function labelText(label: Label): string {
  return label
    .map((p) => {
      const base = p.bar ? [...p.base].map((ch) => `${ch}̄`).join('') : p.base;
      return base + (p.sub ? subscript(p.sub) : '');
    })
    .join('');
}

/** 信号の識別子から決まる標準の表記（書式つき文字列）。 */
export function defaultMarkup(id: string): string {
  if (id === 'cp') return 'C_p';
  if (id === 'clr') return 'CLR';
  let m = /^([a-z])(\d)in$/.exec(id);
  if (m) return `${m[1]!.toUpperCase()}_${m[2]} ′`;
  m = /^([a-z])(\d)next$/.exec(id);
  if (m) return `${m[1]!.toUpperCase()}_${m[2]} ′`;
  m = /^n([a-z])(\d*)$/.exec(id);
  if (m) return `~${m[1]!.toUpperCase()}${m[2] ? `_${m[2]}` : ''}`;
  m = /^([a-z])(\d*)$/.exec(id);
  if (m) return `${m[1]!.toUpperCase()}${m[2] ? `_${m[2]}` : ''}`;
  return id;
}

export type Namer = {
  label(signal: string): Label;
  /** 信号名または定数（0/1）の表記。 */
  text(ref: Ref): string;
  /** 多ビット信号の表記。例：(Q₂Q₁Q₀) */
  bus(bits: readonly string[]): string;
};

export function makeNamer(overrides: Record<string, string> = {}): Namer {
  const label = (signal: string): Label => parseLabel(overrides[signal] ?? defaultMarkup(signal));
  const text = (ref: Ref): string => (typeof ref === 'string' ? labelText(label(ref)) : String(ref));
  return { label, text, bus: (bits) => `(${bits.map((b) => text(b)).join('')})` };
}
