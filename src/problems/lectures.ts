export type Lecture = {
  no: number;
  title: string;
  pdf: string;
};

export const LECTURES: readonly Lecture[] = [
  { no: 16, title: '非同期式カウンタ', pdf: '16.pdf' },
  { no: 17, title: '非同期式カウンタの問題点と分周', pdf: '17.pdf' },
  { no: 18, title: '同期式カウンタ', pdf: '18.pdf' },
  { no: 19, title: 'レジスタとシフトレジスタ', pdf: '19.pdf' },
  { no: 20, title: 'リングカウンタ・ジョンソンカウンタ', pdf: '20.pdf' },
  { no: 21, title: '順序回路の設計例：自動販売機', pdf: '21.pdf' },
  { no: 22, title: 'ミーリー型・ムーア型、計算機', pdf: '22.pdf' },
];
