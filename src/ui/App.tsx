import { LECTURES } from '../problems/lectures';

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>順序回路 学習ラボ</h1>
      <p>フェーズ0（雛形）。シミュレーションと問題はフェーズ1以降で追加する。</p>
      <ul>
        {LECTURES.map((lecture) => (
          <li key={lecture.no}>
            第{lecture.no}回 {lecture.title}
          </li>
        ))}
      </ul>
    </main>
  );
}
