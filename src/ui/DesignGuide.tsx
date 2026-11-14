import { useMemo, useState } from 'react';
import { judge, termsLabel, type Judgement } from '../design/expr';
import {
  bitsFor,
  bitsText,
  counterSpec,
  encode,
  FF_PINS,
  targets,
  varLabel,
  type Encoded,
  type FFKind,
  type FsmSpec,
  type Target,
  type Tri,
} from '../design/fsm';
import { generateScene } from '../design/generate';
import { covers, groupTerm, kmapLayout, minimize, type Term } from '../design/minimize';
import { PRESETS } from '../design/presets';
import type { Scene } from '../problems/scenes';
import { labelText, parseLabel } from '../view/label';

type Props = { onSimulate: (scene: Scene) => void };

const show = (markup: string): string => labelText(parseLabel(markup));
const tri = (v: Tri): string => (v === null ? 'X' : String(v));
const GROUP_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2'];
const FF_KINDS: FFKind[] = ['D', 'JK', 'RS', 'T'];

/** 入力要求の表（Q → Q⁺ ごとの FF の入力）。 */
const RULES: Record<FFKind, string[][]> = {
  D: [['0→0', '0'], ['0→1', '1'], ['1→0', '0'], ['1→1', '1']],
  T: [['0→0', '0'], ['0→1', '1'], ['1→0', '1'], ['1→1', '0']],
  JK: [['0→0', '0', 'X'], ['0→1', '1', 'X'], ['1→0', 'X', '1'], ['1→1', 'X', '0']],
  RS: [['0→0', '0', 'X'], ['0→1', '1', '0'], ['1→0', '0', '1'], ['1→1', 'X', '0']],
};

function blankSpec(machine: 'mealy' | 'moore', states: number, inputs: number, outputs: number): FsmSpec {
  const names = inputs === 1 ? ['x'] : Array.from({ length: inputs }, (_, i) => `x${inputs - 1 - i}`);
  const outs = Array.from({ length: outputs }, (_, i) => (outputs === 1 ? 'y' : `y${outputs - 1 - i}`));
  return {
    id: 'custom',
    title: '自分で作る状態遷移表',
    machine,
    states: Array.from({ length: states }, (_, k) => `状態${k + 1}`),
    inputVars: names,
    outputVars: outs,
    next: Array.from({ length: states }, (_, s) => Array.from({ length: 2 ** inputs }, () => s)),
    out: Array.from({ length: states }, () => Array.from({ length: 2 ** inputs }, () => 0)),
  };
}

export function DesignGuide({ onSimulate }: Props) {
  const [mode, setMode] = useState<'counter' | 'fsm'>('counter');
  const [modulus, setModulus] = useState(5);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [fsm, setFsm] = useState<FsmSpec>(PRESETS[0]!.spec);
  const [sequence, setSequence] = useState<string>(PRESETS[0]!.inputs.join(' '));
  const [ff, setFf] = useState<FFKind>('JK');
  const [codeText, setCodeText] = useState<string[] | undefined>();
  const [custom, setCustom] = useState({ machine: 'mealy' as 'mealy' | 'moore', states: 3, inputs: 1, outputs: 1 });

  const spec = useMemo(() => (mode === 'counter' ? counterSpec(modulus, direction) : fsm), [mode, modulus, direction, fsm]);
  const width = bitsFor(spec.states.length);

  const encoded = useMemo((): { enc: Encoded } | { error: string } => {
    try {
      const codes = codeText?.map((t) => (/^[01]+$/.test(t) ? parseInt(t, 2) : NaN));
      return { enc: encode(spec, codes) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [spec, codeText]);
  const enc = 'enc' in encoded ? encoded.enc : undefined;
  const list = useMemo(() => (enc ? targets(enc, ff) : []), [enc, ff]);
  const key = `${spec.id}/${JSON.stringify(spec.next)}/${JSON.stringify(spec.out)}/${codeText?.join(',') ?? 'auto'}/${ff}`;

  const loadPreset = (id: string): void => {
    const preset = PRESETS.find((p) => p.spec.id === id);
    if (!preset) return;
    setFsm(preset.spec);
    setFf(preset.ff);
    setSequence(preset.inputs.join(' '));
    setCodeText(undefined);
  };
  const editCell = (table: 'next' | 'out', s: number, x: number, value: number | null): void => {
    setFsm((prev) => {
      const copy = { ...prev, id: prev.id.startsWith('custom') ? prev.id : `custom-${prev.id}`, next: prev.next.map((r) => [...r]), out: prev.out.map((r) => [...r]) };
      if (table === 'out' && prev.machine === 'moore') copy.out[s] = copy.out[s]!.map(() => value);
      else copy[table][s]![x] = value;
      return copy;
    });
  };

  const simulate = (): void => {
    if (!enc) return;
    const solutions = list.map((target) => ({ target, terms: minimize(target.table, enc.vars.length) }));
    const inputs = sequence
      .split(/[\s,]+/)
      .filter((t) => t !== '')
      .map((t) => Number(t))
      .filter((v) => Number.isInteger(v) && v >= 0 && v < 2 ** enc.m);
    onSimulate(generateScene(enc, ff, solutions, inputs));
  };

  const m = spec.inputVars.length;
  const inputCodes = Array.from({ length: 2 ** m }, (_, x) => x);
  const inputHead = (x: number): string => (m === 0 ? '' : `${spec.inputVars.map((v) => show(varLabel(v))).join('')}=${bitsText(x, m)}`);

  return (
    <>
      <header>
        <h2>設計ガイド：拡大入力要求表を使う設計方法</h2>
        <p className="muted">状態遷移表 → 符号化 → 拡大入力要求表 → カルノー図 → 論理式 → 回路 → タイミングチャートで確認</p>
      </header>

      {/* ---- 1. 仕様 ---- */}
      <section className="panel">
        <h3>ステップ1　仕様</h3>
        <div className="control-row">
          <label>
            <input type="radio" checked={mode === 'counter'} onChange={() => { setMode('counter'); setCodeText(undefined); setFf('JK'); }} /> 同期N進カウンタ
          </label>
          <label>
            <input type="radio" checked={mode === 'fsm'} onChange={() => { setMode('fsm'); setCodeText(undefined); setFf('D'); }} /> 状態遷移表（ミーリー型／ムーア型）
          </label>
        </div>
        {mode === 'counter' && (
          <div className="control-row">
            <label>
              N ={' '}
              <input type="number" min={2} max={16} value={modulus} onChange={(e) => { setModulus(Math.min(16, Math.max(2, Math.round(Number(e.target.value)) || 2))); setCodeText(undefined); }} /> 進
            </label>
            <label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as 'up' | 'down')}>
                <option value="up">アップカウンタ</option>
                <option value="down">ダウンカウンタ</option>
              </select>
            </label>
            <span className="muted">FF は {width} 個必要（{modulus} ≦ 2{'^'}{width}）。授業の例：3進（D、RS）、5進・8進（JK）。</span>
          </div>
        )}
        {mode === 'fsm' && (
          <>
            <div className="control-row">
              <strong>授業の例</strong>
              {PRESETS.map((p) => (
                <button key={p.spec.id} className={fsm.id === p.spec.id ? 'primary' : ''} onClick={() => loadPreset(p.spec.id)}>
                  {p.spec.title}
                </button>
              ))}
            </div>
            <div className="control-row">
              <strong>新しく作る</strong>
              <select value={custom.machine} onChange={(e) => setCustom({ ...custom, machine: e.target.value as 'mealy' | 'moore' })}>
                <option value="mealy">ミーリー型</option>
                <option value="moore">ムーア型</option>
              </select>
              <label>状態 <input type="number" min={2} max={8} value={custom.states} onChange={(e) => setCustom({ ...custom, states: Math.min(8, Math.max(2, Number(e.target.value) || 2)) })} /> 個</label>
              <label>入力 <input type="number" min={0} max={2} value={custom.inputs} onChange={(e) => setCustom({ ...custom, inputs: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })} /> ビット</label>
              <label>出力 <input type="number" min={0} max={2} value={custom.outputs} onChange={(e) => setCustom({ ...custom, outputs: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })} /> ビット</label>
              <button onClick={() => { setFsm(blankSpec(custom.machine, custom.states, custom.inputs, custom.outputs)); setCodeText(undefined); setSequence(''); }}>
                空の表を作る
              </button>
            </div>
            <p className="muted">
              {spec.title}（{spec.machine === 'mealy' ? 'ミーリー型：出力は入力と現状態で決まる' : 'ムーア型：出力は現状態だけで決まる'}）。表のマスは書き換えられる。X は don’t care。
            </p>
            <table className="op-table design">
              <thead>
                <tr>
                  <th rowSpan={2}>現状態</th>
                  <th colSpan={inputCodes.length}>次状態</th>
                  {spec.outputVars.length > 0 && <th colSpan={spec.machine === 'moore' ? 1 : inputCodes.length}>出力 ({spec.outputVars.map((v) => show(varLabel(v))).join('')})</th>}
                </tr>
                <tr>
                  {inputCodes.map((x) => (
                    <th key={x}>{inputHead(x)}{spec.inputNames?.[x] ? `（${spec.inputNames[x]}）` : ''}</th>
                  ))}
                  {spec.outputVars.length > 0 && (spec.machine === 'moore' ? <th>（状態で決まる）</th> : inputCodes.map((x) => <th key={x}>{inputHead(x)}</th>))}
                </tr>
              </thead>
              <tbody>
                {spec.states.map((name, s) => (
                  <tr key={s}>
                    <td>{name}</td>
                    {inputCodes.map((x) => (
                      <td key={x}>
                        <select value={spec.next[s]?.[x] ?? 'X'} onChange={(e) => editCell('next', s, x, e.target.value === 'X' ? null : Number(e.target.value))}>
                          {spec.states.map((n2, k) => (
                            <option key={k} value={k}>{n2}</option>
                          ))}
                          <option value="X">X</option>
                        </select>
                      </td>
                    ))}
                    {spec.outputVars.length > 0 &&
                      (spec.machine === 'moore' ? [0] : inputCodes).map((x) => (
                        <td key={`o${x}`}>
                          <select value={spec.out[s]?.[x] ?? 'X'} onChange={(e) => editCell('out', s, x, e.target.value === 'X' ? null : Number(e.target.value))}>
                            {Array.from({ length: 2 ** spec.outputVars.length }, (_, v) => (
                              <option key={v} value={v}>{bitsText(v, spec.outputVars.length)}{spec.outputNames?.[v] ? `（${spec.outputNames[v]}）` : ''}</option>
                            ))}
                            <option value="X">X</option>
                          </select>
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* ---- 2. 符号化 ---- */}
      <section className="panel">
        <h3>ステップ2　状態の符号化</h3>
        <p className="muted">状態に2進数の符号を割り当てる。自動では、上から順に 0, 1, 2 … を割り当てる。使わない符号の行は don’t care（X）になる。</p>
        <div className="control-row">
          {spec.states.map((name, s) => (
            <label key={s}>
              {name} ={' '}
              <input
                className="code-input"
                value={codeText?.[s] ?? bitsText(s, width)}
                onChange={(e) => {
                  const next = codeText ? [...codeText] : spec.states.map((_, k) => bitsText(k, width));
                  next[s] = e.target.value.replace(/[^01]/g, '');
                  setCodeText(next);
                }}
              />
            </label>
          ))}
          <button onClick={() => setCodeText(undefined)} disabled={!codeText}>自動に戻す</button>
        </div>
        {'error' in encoded && <p className="error">符号を直してください：{encoded.error}</p>}
      </section>

      {enc && (
        <>
          {/* ---- 3. 拡大入力要求表 ---- */}
          <section className="panel">
            <h3>ステップ3　拡大入力要求表</h3>
            <div className="control-row">
              <strong>使う FF</strong>
              {FF_KINDS.map((kind) => (
                <label key={kind}>
                  <input type="radio" checked={ff === kind} onChange={() => setFf(kind)} /> {kind}-FF
                </label>
              ))}
              <span className="rule">
                入力要求（Q→Q⁺）：
                {RULES[ff].map((r) => `${r[0]} は ${FF_PINS[ff].map((p, i) => `${p.toUpperCase()}=${r[i + 1]}`).join(', ')}`).join('／')}
              </span>
            </div>
            <ExcitationTable key={key} enc={enc} ff={ff} list={list} />
          </section>

          {/* ---- 4. カルノー図 ---- */}
          <section className="panel">
            <h3>ステップ4　カルノー図と論理式</h3>
            <p className="muted">
              マスをクリックして選び、「グループにする」で囲む。式は、否定を後ろに ' を付けて書く（例：Q1'Q0' + Q0）。~Q1 でもよい。定数は 0 と 1。
              判定は、真理値表の全行（X を除く）との照合で行う。
            </p>
            <div className="kmaps">
              {list.map((target) => (
                <KMap key={`${key}/${target.name}`} target={target} enc={enc} />
              ))}
            </div>
          </section>

          {/* ---- 5. 回路 ---- */}
          <section className="panel">
            <h3>ステップ5　回路を作って確かめる</h3>
            <p className="muted">最小積和形の模範解答から回路を作り、タイミングチャートの画面で動かす（真理値表の全行と照合済みの式を使う）。</p>
            <details>
              <summary>回路に使う論理式（模範解答）を見る</summary>
              <ul className="equations">
                {list.map((target) => (
                  <li key={target.name}>
                    {show(target.label)} = {show(termsLabel(minimize(target.table, enc.vars.length), enc.vars.map(varLabel)))}
                  </li>
                ))}
              </ul>
            </details>
            {spec.machine !== 'counter' && (
              <div className="control-row">
                <label>
                  入れる入力の値（順に、10進で。空白で区切る）{' '}
                  <input className="seq-input" value={sequence} onChange={(e) => setSequence(e.target.value)} />
                </label>
                <span className="muted">例：{spec.inputVars.map((v) => show(varLabel(v))).join('')}=01 なら 1、10 なら 2</span>
              </div>
            )}
            <div className="step-buttons">
              <button className="primary" onClick={simulate}>
                この回路をタイミングチャートで確認する
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** 拡大入力要求表。FF の入力の列は、自分で埋めて採点できる。 */
function ExcitationTable({ enc, ff, list }: { enc: Encoded; ff: FFKind; list: Target[] }) {
  const { n, m, vars } = enc;
  const rows = Array.from({ length: 2 ** (n + m) }, (_, r) => r);
  const ffTargets = list.filter((t) => t.kind === 'ff');
  const outTargets = list.filter((t) => t.kind === 'output');
  const [fill, setFill] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState(false);

  const cycle = (id: string): void => {
    setAnswers((prev) => ({ ...prev, [id]: { '': '0', '0': '1', '1': 'X', X: '' }[prev[id] ?? ''] ?? '' }));
    setGraded(false);
  };
  const cells = ffTargets.flatMap((t) => rows.map((r) => ({ id: `${t.name}/${r}`, want: tri(t.table[r]!) })));
  const wrong = cells.filter((c) => (answers[c.id] ?? '') !== '' && answers[c.id] !== c.want).length;
  const blank = cells.filter((c) => (answers[c.id] ?? '') === '').length;

  return (
    <>
      <div className="control-row">
        <label>
          <input type="checkbox" checked={fill} onChange={(e) => { setFill(e.target.checked); setGraded(false); }} /> {FF_PINS[ff].map((p) => p.toUpperCase()).join('・')} の列を自分で埋める
        </label>
        {fill && (
          <>
            <button className="primary" onClick={() => setGraded(true)}>採点</button>
            <button onClick={() => { setAnswers({}); setGraded(false); }}>クリア</button>
            <button onClick={() => { setAnswers(Object.fromEntries(cells.map((c) => [c.id, c.want]))); setGraded(false); }}>答えを表示</button>
            <span className="muted">マスをクリックすると 空欄 → 0 → 1 → X と切り替わる。</span>
          </>
        )}
      </div>
      {fill && graded && (
        <p className={wrong === 0 && blank === 0 ? 'result ok' : 'result ng'}>
          {wrong === 0 && blank === 0 ? '全部正解です。' : `まちがい ${wrong} か所、空欄 ${blank} か所。`}
        </p>
      )}
      <table className="op-table design">
        <thead>
          <tr>
            {vars.map((v) => (
              <th key={v}>{show(varLabel(v))}</th>
            ))}
            {enc.stateVars.map((v) => (
              <th key={`n${v}`} className="sep">{show(varLabel(v))}⁺</th>
            ))}
            {ffTargets.map((t, i) => (
              <th key={t.name} className={i === 0 ? 'sep' : ''}>{show(t.label)}</th>
            ))}
            {outTargets.map((t, i) => (
              <th key={t.name} className={i === 0 ? 'sep' : ''}>{show(t.label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              {[...bitsText(r, n + m)].map((ch, i) => (
                <td key={i}>{ch}</td>
              ))}
              {[...bitsText(enc.next[r]!, n)].map((ch, i) => (
                <td key={`n${i}`} className={i === 0 ? 'sep' : ''}>{ch}</td>
              ))}
              {ffTargets.map((t, i) => {
                const id = `${t.name}/${r}`;
                const want = tri(t.table[r]!);
                if (!fill) return <td key={t.name} className={i === 0 ? 'sep' : ''}>{want}</td>;
                const mine = answers[id] ?? '';
                const mark = !graded ? '' : mine === '' ? 'blank' : mine === want ? 'correct' : 'wrong';
                return (
                  <td key={t.name} className={`cell ${mark} ${i === 0 ? 'sep' : ''}`} onClick={() => cycle(id)}>
                    {mine}
                  </td>
                );
              })}
              {outTargets.map((t, i) => (
                <td key={t.name} className={i === 0 ? 'sep' : ''}>{tri(t.table[r]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** 1つの対象のカルノー図。グループを囲み、論理式を入力して判定する。 */
function KMap({ target, enc }: { target: Target; enc: Encoded }) {
  const nvars = enc.vars.length;
  const layout = useMemo(() => kmapLayout(nvars), [nvars]);
  const labels = enc.vars.map(varLabel);
  const [selected, setSelected] = useState<number[]>([]);
  const [groups, setGroups] = useState<Term[]>([]);
  const [message, setMessage] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<Judgement | undefined>();
  const [model, setModel] = useState(false);

  const head = (indexes: number[]): string => indexes.map((i) => show(labels[i]!)).join('');
  const addGroup = (): void => {
    const term = groupTerm(selected, nvars);
    if (!term) {
      setMessage('グループにできません。マスの数は 1, 2, 4, 8 … で、長方形（端と端はつながる）に並べます。');
      return;
    }
    if (selected.some((row) => target.table[row] === 0)) {
      setMessage('0 のマスが入っています。グループには 1 と X だけを入れます。');
      return;
    }
    setGroups((prev) => [...prev, term]);
    setSelected([]);
    setMessage('');
  };
  const uncovered = target.table.flatMap((v, row) => (v === 1 && !groups.some((g) => covers(g, row)) ? [row] : []));
  const rowText = (row: number): string => `${enc.vars.map((v) => show(varLabel(v))).join('')}=${bitsText(row, nvars)}`;

  return (
    <div className="kmap">
      <h4>{show(target.label)} のカルノー図</h4>
      <table className="kmap-table">
        <thead>
          <tr>
            <th className="corner">
              {head(layout.rowVars)}
              <span>＼</span>
              {head(layout.colVars)}
            </th>
            {layout.cols.map((c) => (
              <th key={c}>{bitsText(c, layout.colVars.length)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layout.rows.map((rv, r) => (
            <tr key={r}>
              <th>{layout.rowVars.length > 0 ? bitsText(rv, layout.rowVars.length) : ''}</th>
              {layout.cols.map((_, c) => {
                const row = layout.index(r, c);
                const rings = groups
                  .map((g, i) => (covers(g, row) ? `inset 0 0 0 ${3 * (i + 1)}px ${GROUP_COLORS[i % GROUP_COLORS.length]}` : ''))
                  .filter((s) => s !== '');
                // 外側のグループから順に重ねる。
                const shadow = rings.map((_, i, all) => all[all.length - 1 - i]).join(', ');
                return (
                  <td
                    key={c}
                    className={selected.includes(row) ? 'selected' : ''}
                    style={{ boxShadow: shadow || undefined }}
                    onClick={() => {
                      setSelected((prev) => (prev.includes(row) ? prev.filter((x) => x !== row) : [...prev, row]));
                      setMessage('');
                    }}
                  >
                    {tri(target.table[row]!)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="control-row">
        <button onClick={addGroup} disabled={selected.length === 0}>グループにする</button>
        <button onClick={() => { setGroups([]); setSelected([]); setMessage(''); }} disabled={groups.length === 0 && selected.length === 0}>消す</button>
      </div>
      {message && <p className="result ng">{message}</p>}
      {groups.length > 0 && (
        <p className="muted">
          {groups.map((g, i) => (
            <span key={i} style={{ color: GROUP_COLORS[i % GROUP_COLORS.length], marginRight: 10, fontWeight: 600 }}>
              {show(termsLabel([g], labels))}
            </span>
          ))}
          {uncovered.length === 0 ? '1 のマスはすべて囲まれた。' : `まだ囲まれていない 1 が ${uncovered.length} 個ある。`}
        </p>
      )}
      <div className="control-row">
        <label>
          {show(target.label)} ={' '}
          <input
            className="expr-input"
            value={text}
            placeholder="例：Q1'Q0 + Q0"
            onChange={(e) => { setText(e.target.value); setResult(undefined); }}
            onKeyDown={(e) => e.key === 'Enter' && setResult(judge(text, enc.vars, target.table))}
          />
        </label>
        <button className="primary" onClick={() => setResult(judge(text, enc.vars, target.table))}>判定</button>
        <button onClick={() => setModel((v) => !v)}>{model ? '模範解答を隠す' : '模範解答'}</button>
      </div>
      {result?.status === 'error' && <p className="result ng">{result.message}</p>}
      {result?.status === 'wrong' && (
        <p className="result ng">
          合いません：{rowText(result.row)} のとき、{show(target.label)} は {result.expected} になるはず。
        </p>
      )}
      {result?.status === 'correct' && <p className="result ok">正しい式です。{result.note}</p>}
      {result?.status === 'minimal' && <p className="result ok">正解です（最小積和形と同じ大きさ）。</p>}
      {model && (
        <p className="note">
          最小積和形の例：{show(target.label)} = {show(termsLabel(minimize(target.table, nvars), labels))}
        </p>
      )}
    </div>
  );
}
