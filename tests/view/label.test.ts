import { describe, expect, it } from 'vitest';
import { defaultMarkup, labelText, makeNamer, parseLabel } from '../../src/view/label';

describe('信号名の表記', () => {
  it('書式を部品に分ける', () => {
    expect(parseLabel('~Q_1 ~Q_0')).toEqual([
      { base: 'Q', sub: '1', bar: true },
      { base: 'Q', sub: '0', bar: true },
    ]);
    expect(parseLabel('リセット信号')).toEqual([{ base: 'リセット信号' }]);
  });

  it.each([
    ['cp', 'Cₚ'],
    ['clr', 'CLR'],
    ['q0', 'Q₀'],
    ['nq1', 'Q̄₁'],
    ['a3', 'A₃'],
    ['a', 'A'],
    ['na', 'Ā'],
    ['j2', 'J₂'],
    ['x1in', 'X₁′'],
    ['q0next', 'Q₀′'],
    ['nx0', 'X̄₀'],
  ])('標準の表記：%s → %s', (id, text) => {
    expect(labelText(parseLabel(defaultMarkup(id)))).toBe(text);
  });

  it('上書きとバスの表記', () => {
    const namer = makeNamer({ rst: 'リセット信号', not_q1: 'NOT( Q_1 )' });
    expect(namer.text('rst')).toBe('リセット信号');
    expect(namer.text('not_q1')).toBe('NOT(Q₁)');
    expect(namer.text(1)).toBe('1');
    expect(namer.bus(['q2', 'q1', 'q0'])).toBe('(Q₂Q₁Q₀)');
  });
});
