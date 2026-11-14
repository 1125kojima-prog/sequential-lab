/** 画面で使う場面（入力波形）が、スライドを書き起こしたテスト用の期待値と同じであることを確認する。 */
import { describe, expect, it } from 'vitest';
import { edgeTimes, statesAfterEdges } from '../../src/engine/sample';
import { signalNames, simulate } from '../../src/engine/simulate';
import type { Circuit } from '../../src/engine/types';
import { SCENES, sceneById } from '../../src/problems/scenes';
import { SCENARIOS, SLIDE_16_5, SLIDE_21 } from '../fixtures/scenarios';

/** 場面の id と、同じ入力波形を持つはずの書き起こし（SCENARIOS の source）。 */
const SAME_STIMULUS: [sceneId: string, source: string][] = [
  ['16-3a', '16 p.6'],
  ['16-3b', '16 p.6'],
  ['16-4', '16 p.7'],
  ['17-1', '17 p.2'],
  ['17-3', '17 p.4'],
  ['17-5', '17 p.6'],
  ['18-1', '18 p.3'],
  ['18-2', '18 p.4'],
  ['19-sipo', '19 p.7'],
  ['19-piso', '19 p.8'],
  ['19-ex2', '19 p.10'],
  ['19-ex3', '19 p.12'],
  ['20-ring', '20 p.3'],
  ['20-johnson', '20 p.5〜6'],
];

function wireNames(circuit: Circuit): Set<string> {
  const found = new Set<string>();
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    if (typeof o.wire === 'string') found.add(o.wire);
    Object.values(o).forEach(visit);
  };
  visit(circuit.components);
  return found;
}

describe('場面の入力波形', () => {
  it.each(SAME_STIMULUS)('%s は書き起こし（%s）と同じ刺激列・初期値', (sceneId, source) => {
    const scene = sceneById(sceneId)!;
    const fixture = SCENARIOS.find((s) => s.source === source && s.circuit === scene.circuit);
    expect(fixture).toBeDefined();
    expect(scene.stimulus).toEqual(fixture!.stimulus);
    expect(scene.init).toEqual(fixture!.init);
    expect(scene.edge).toBe(fixture!.edge);
  });

  it('16-5 と 21 も書き起こしと同じ刺激列', () => {
    expect(sceneById('16-5')!.stimulus).toEqual(SLIDE_16_5.stimulus);
    expect(sceneById('16-5s')!.stimulus).toEqual(SLIDE_16_5.stimulus);
    expect(sceneById('21-vending')!.stimulus).toEqual(SLIDE_21.stimulus);
  });

  it.each(['18-p3', '18-d3', '18-rs3', '18-ex2'])('%s：動作表の先頭がスライドの動作表と一致する', (sceneId) => {
    const scene = sceneById(sceneId)!;
    const fixture = SCENARIOS.find((s) => s.circuit === scene.circuit)!;
    const trace = simulate(scene.circuit, scene.stimulus, { mode: 'ideal', init: scene.init });
    const states = statesAfterEdges(trace, fixture.bits, edgeTimes(trace, scene.clock, scene.edge));
    expect(states.slice(0, fixture.afterEdges.length)).toEqual(fixture.afterEdges);
  });
});

describe('場面の定義', () => {
  it('id が重複していない', () => {
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  });

  it.each(SCENES.map((s) => ({ id: s.id, s })))('$id：表示する信号・配線が回路にあり、両方のモードで動く', ({ s }) => {
    const names = new Set(signalNames(s.circuit));
    for (const row of [...s.rows, ...s.stateBits, s.clock]) expect(names.has(row), row).toBe(true);
    const wires = wireNames(s.circuit);
    for (const w of s.wires ?? []) expect(wires.has(w.id), w.id).toBe(true);
    for (const mode of ['ideal', 'delay'] as const) {
      expect(() => simulate(s.circuit, s.stimulus, { mode, delays: s.delays, init: s.init })).not.toThrow();
    }
  });
});
