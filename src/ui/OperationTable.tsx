import type { OperationRow } from '../view/chart';
import type { Namer } from '../view/label';

type Props = {
  rows: OperationRow[];
  bits: readonly string[];
  clock: string;
  namer: Namer;
  /** いま表示しているステップの時刻。これより後の行は薄く表示する。 */
  currentT: number;
};

const NOTE: Record<OperationRow['kind'], string> = { settled: '', transient: '一瞬', reset: 'CLR' };

export function OperationTable({ rows, bits, clock, namer, currentT }: Props) {
  // いまの行：ステップの時刻までに入った最後の行（一瞬の値の行と、その後の落ち着いた行は一緒に強調する）。
  const lastT = rows.reduce((t, row) => (row.t <= currentT ? Math.max(t, row.t) : t), 0);
  const hasNotes = rows.some((row, i) => row.kind === 'transient' || (row.kind === 'reset' && i > 0));
  return (
    <section className="panel">
      <h3>動作表</h3>
      <p className="muted">
        {namer.text(clock)} の回数ごとの、落ち着いた後の値
        {hasNotes && (
          <>
            <br />
            赤い行は一瞬だけ現れる値。「CLR」は外部 CLR でのリセット（0 から数え直す）
          </>
        )}
      </p>
      <table className="op-table">
        <thead>
          <tr>
            <th>{namer.text(clock)}</th>
            {bits.map((b) => (
              <th key={b}>{namer.text(b)}</th>
            ))}
            {bits.length > 1 && <th>10進</th>}
            {hasNotes && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const time = row.t > currentT ? 'future' : row.t === lastT && Number.isFinite(currentT) ? 'current' : '';
            const previous = rows[i - 1];
            return (
              <tr key={i} className={`${time} ${row.kind}`}>
                <td>{previous?.kind === 'transient' ? '' : row.n}</td>
                {[...row.bits].map((v, k) => (
                  <td key={k}>{v}</td>
                ))}
                {bits.length > 1 && <td>{parseInt(row.bits, 2)}</td>}
                {hasNotes && <td className="note-cell">{i === 0 ? '' : NOTE[row.kind]}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
