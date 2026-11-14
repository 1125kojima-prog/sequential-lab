import type { AsyncPin, Conn, FFType, FlipFlop, Gate, GateOp, Trigger } from './types';

/** ゲートを作る。出力の信号名は id。 */
export function gate(id: string, op: GateOp, ...inputs: Conn[]): Gate {
  return { kind: 'gate', id, op, inputs };
}

type FFProps = Omit<FlipFlop, 'kind' | 'id' | 'type' | 'q' | 'trigger'> & { trigger: Trigger };

/** FFを作る。出力の信号名は q と `n${q}`。 */
export function ff(type: FFType, id: string, q: string, props: FFProps): FlipFlop {
  return { kind: 'ff', id, type, q, ...props };
}

/** 正論理の CLR／PR。 */
export function activeHigh(conn: Conn): AsyncPin {
  return { conn, active: 'high' };
}

/** 負論理の CLR／PR。 */
export function activeLow(conn: Conn): AsyncPin {
  return { conn, active: 'low' };
}

/** 遅延を設定できる配線。 */
export function wire(from: string, wireId: string): Conn {
  return { from, wire: wireId };
}
