/** 解いた問題の記録（localStorage）。読み書きできないときは、記録なしとして動く。 */
const KEY = 'sequential-lab:solved';

export function loadSolved(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveSolved(solved: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...solved]));
  } catch {
    // 保存できなくても、そのまま使えるようにする。
  }
}
