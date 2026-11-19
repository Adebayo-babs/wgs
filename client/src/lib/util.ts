import type { Grade } from './types';

export function gradeOf(t: number): Grade {
  if (t >= 70) return 'A';
  if (t >= 60) return 'B';
  if (t >= 50) return 'C';
  if (t >= 40) return 'D';
  if (t >= 30) return 'E';
  return 'F';
}

export const GRADE_COLOR: Record<Grade, string> = {
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-sky-100 text-sky-800',
  C: 'bg-indigo-100 text-indigo-800',
  D: 'bg-amber-100 text-amber-800',
  E: 'bg-orange-100 text-orange-800',
  F: 'bg-red-100 text-red-800',
};

export function ordinal(n: number) {
  if (!n || n < 1) return '-';
  const s = ['th', 'st', 'nd', 'rd'];
  const x = n % 100;
  return n + (s[(x - 20) % 10] || s[x] || s[0]);
}

export const dash = (v: unknown) =>
  v === null || v === undefined || v === '' ? '-' : String(v);

/* Strip invisible formatting characters (RTL overrides,
   zero-width spaces) that ride along from Word/PDF pastes. */
export const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim();

export function relTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

/* Resize and compress a photo in the browser so passports
   stay small (~300px, under 200KB). */
export function compressImage(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose a JPG or PNG image'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        let q = 0.85;
        let data = c.toDataURL('image/jpeg', q);
        while (data.length > 250_000 && q > 0.3) {
          q -= 0.1;
          data = c.toDataURL('image/jpeg', q);
        }
        resolve(data);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
