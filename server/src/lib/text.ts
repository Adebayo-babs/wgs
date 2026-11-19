/* Strips invisible Unicode formatting characters (RTL
   overrides, zero-width spaces, BOM) that ride along when
   text is pasted from Word, PDF or CSV and make it render
   mirrored or scrambled. */
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

export function clean(s: unknown): string {
  return String(s ?? '').replace(INVISIBLE, '').trim();
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fisher–Yates shuffle, returns a new array. */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
