import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LECTURES } from '../../src/problems/lectures';

const lecturesDir = resolve(process.cwd(), 'docs', 'lectures');

describe('授業回の一覧', () => {
  it('第16〜22回が順に並んでいる', () => {
    expect(LECTURES.map((lecture) => lecture.no)).toEqual([16, 17, 18, 19, 20, 21, 22]);
  });

  // PDFはリポジトリに入れないので、手元に置いてあるときだけ確認する。
  it.skipIf(!existsSync(lecturesDir))('各回のPDFが docs/lectures にある', () => {
    for (const lecture of LECTURES) {
      const path = resolve(lecturesDir, lecture.pdf);
      expect(existsSync(path), path).toBe(true);
    }
  });
});
