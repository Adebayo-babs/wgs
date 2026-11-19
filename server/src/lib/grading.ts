/* Single grading scale — matches the printed report card. */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export function gradeOf(score: number): Grade {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  if (score >= 30) return 'E';
  return 'F';
}

export const GRADE_REMARK: Record<Grade, string> = {
  A: 'Excellent',
  B: 'Very good',
  C: 'Good',
  D: 'Pass',
  E: 'Poor',
  F: 'Fail',
};

export const MAX = { test1: 20, test2: 20, exam: 60 } as const;

export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const avg = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

export function median(a: number[]) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Competition ranking: 1, 2, 2, 4. Higher is better. */
export function rankOf(value: number, all: number[]) {
  return all.filter((v) => v > value + 1e-9).length + 1;
}

export function ordinal(n: number) {
  if (!n || n < 1) return '-';
  const s = ['th', 'st', 'nd', 'rd'];
  const x = n % 100;
  return n + (s[(x - 20) % 10] || s[x] || s[0]);
}
