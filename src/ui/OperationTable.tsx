import type { OperationRow } from '../view/chart';
import type { Namer } from '../view/label';

type Props = {
  rows: OperationRow[];
  bits: readonly string[];
  clock: string;
  namer: Namer;
  /** いま表示しているステップまでに入ったクロックの回数。 */
  current: number;
};

export function OperationTable({ rows, bits, clock, namer, current }: Props) {
  return (
    <section className="panel">
      <h3>動作表</h3>
      <p className="muted">{namer.text(clock)} の回数ごとの、落ち着いた後の値</p>
      <table className="op-table">
        <thead>
          <tr>
            <th>{namer.text(clock)}</th>
            {bits.map((b) => (
              <th key={b}>{namer.text(b)}</th>
            ))}
            {bits.length > 1 && <th>10進</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.n} className={row.n === current ? 'current' : row.n > current ? 'future' : ''}>
              <td>{row.n}</td>
              {[...row.bits].map((v, i) => (
                <td key={i}>{v}</td>
              ))}
              {bits.length > 1 && <td>{parseInt(row.bits, 2)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
