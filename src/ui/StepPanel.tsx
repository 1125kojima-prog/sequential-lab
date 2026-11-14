import type { Step } from '../view/steps';

type Props = {
  steps: Step[];
  index: number;
  stateName: string;
  initialState: string;
  onMove: (index: number) => void;
};

export function StepPanel({ steps, index, stateName, initialState, onMove }: Props) {
  const step = index >= 0 ? steps[index] : undefined;
  const last = steps.length - 1;
  return (
    <section className="panel step-panel">
      <div className="step-buttons">
        <button onClick={() => onMove(-1)} disabled={index < 0}>
          ⏮ 最初へ
        </button>
        <button onClick={() => onMove(index - 1)} disabled={index < 0}>
          ◀ 前へ
        </button>
        <button className="primary" onClick={() => onMove(index + 1)} disabled={index >= last}>
          次のエッジへ ▶
        </button>
        <button onClick={() => onMove(last)} disabled={index >= last}>
          最後へ ⏭
        </button>
        <span className="muted">
          {index + 1} / {steps.length}（← → キーでも動く）
        </span>
      </div>

      {!step && (
        <p>
          開始前。初期値は {stateName}=({initialState})。「次のエッジへ」で1つずつ進める。
        </p>
      )}

      {step && (
        <>
          <h3>
            {step.title}
            <span className="muted">（t = {step.t}ns）</span>
          </h3>
          <p className="path">
            {stateName}：{step.path.map((v) => `(${v})`).join(' → ')}
            {step.path.length > 2 && <span className="muted">　途中の値は一瞬だけ現れる</span>}
          </p>
          <p className="timeline">{step.timeline}</p>
          <ol className="events">
            {step.events.map((e, i) => (
              <li key={i}>
                <span className={`badge ${e.kind}`}>{e.dt > 0 ? `+${e.dt}ns` : '0ns'}</span>
                {e.text}
              </li>
            ))}
          </ol>
          {step.notes.map((note, i) => (
            <p key={i} className="note">
              {note}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
