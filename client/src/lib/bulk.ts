import { clean } from './util';

export interface DraftQuestion {
  text: string;
  options: string[];
  correct: string; // A–D
}

export interface ParseResult {
  valid: DraftQuestion[];
  errors: string[];
}

/* Small RFC 4180 CSV parser: quoted fields, embedded
   commas and escaped ("") quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/* Excel's plain "CSV" export is Windows-1252, not UTF-8.
   Try UTF-8 first and fall back if it produces junk. */
export function decodeCsv(buf: ArrayBuffer) {
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) {
    try {
      const alt = new TextDecoder('windows-1252').decode(buf);
      if (!alt.includes('�')) text = alt;
    } catch {
      /* keep UTF-8 attempt */
    }
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function fromCsv(text: string): ParseResult {
  let rows = parseCsv(clean(text));
  if (rows.length && /^question$/i.test(rows[0][0]?.trim() ?? '')) {
    rows = rows.slice(1);
  }
  const valid: DraftQuestion[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const [q, a, b, c, d, ans] = r.map((x) => clean(x));
    if (!q || !a || !b || !c || !d) {
      errors.push(`Row ${i + 1}: missing question text or an option`);
      return;
    }
    const correct = (ans || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(correct)) {
      errors.push(`Row ${i + 1}: answer must be A, B, C or D (got "${ans ?? ''}")`);
      return;
    }
    valid.push({ text: q, options: [a, b, c, d], correct });
  });
  return { valid, errors };
}

/* Pasted questions in the usual exam format:
     1. Question text?
     A. one  B. two  C. three  D. four
     Answer: B                                         */
export function fromPaste(text: string): ParseResult {
  const re =
    /(\d+)[.)]\s*([\s\S]*?)\s*A[.)]\s*([\s\S]*?)\s*B[.)]\s*([\s\S]*?)\s*C[.)]\s*([\s\S]*?)\s*D[.)]\s*([\s\S]*?)\s*Answer\s*:\s*([A-D])\b/gi;
  const valid: DraftQuestion[] = [];
  const errors: string[] = [];
  let m: RegExpExecArray | null;
  let count = 0;
  const src = clean(text);
  while ((m = re.exec(src))) {
    count++;
    const [, num, q, a, b, c, d, ans] = m.map((x) => x?.trim() ?? '');
    if (!q || !a || !b || !c || !d) {
      errors.push(`Question ${num}: missing text or an option`);
    } else {
      valid.push({ text: q, options: [a, b, c, d], correct: ans.toUpperCase() });
    }
  }
  if (!count) {
    errors.push(
      'No questions found. Number each question, give A–D options, and end with "Answer: X".',
    );
  }
  return { valid, errors };
}

export const CSV_TEMPLATE =
  'Question,Option A,Option B,Option C,Option D,Correct Answer\r\n' +
  '"What is 2 + 2?",3,4,5,6,B\r\n' +
  '"What is the capital of Nigeria?",Abuja,Lagos,Kano,Ibadan,A\r\n';
