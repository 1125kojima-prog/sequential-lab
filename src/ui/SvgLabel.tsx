import { Fragment } from 'react';
import type { Label } from '../view/label';

type Props = {
  label: Label;
  x: number;
  y: number;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  bold?: boolean;
  fill?: string;
};

/** SVG 用の信号名。添字は baseline-shift、否定は上線で描く。 */
export function SvgLabel({ label, x, y, size = 13, anchor = 'start', bold = false, fill }: Props) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={bold ? 700 : 400} fill={fill}>
      {label.map((part, i) => (
        <Fragment key={i}>
          <tspan textDecoration={part.bar ? 'overline' : undefined}>{part.base}</tspan>
          {part.sub !== undefined && (
            <tspan baselineShift="sub" fontSize={size * 0.72}>
              {part.sub}
            </tspan>
          )}
        </Fragment>
      ))}
    </text>
  );
}
