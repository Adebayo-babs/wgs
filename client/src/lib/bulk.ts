import { clean } from './util';

export interface DraftQuestion {
  text: string;
  passage?: string; // comprehension passage / section instruction
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

/* Pasted questions in the usual exam formats, e.g.
     1. Question text?
     A. one  B. two  C. three  D. four
     Answer: B
   Options can be written A.  A)  A:  (A)  [A]  (a)  [a],
   on one line or several. The answer line can be
   "Answer: B", "Ans: B", "Answer - (B)" and so on.

   Any other text — a comprehension passage, "SECTION B",
   "Choose the word nearest in meaning…" — is kept and
   attached to the questions that follow it, until the
   next block of such text. */

// Option marker for one letter: [A] (A) (a) or A. A) A:
const marker = (l: string) =>
  `(?:[\\[(][${l}${l.toLowerCase()}][\\])]|${l}[.):])`;

const OPTIONS = new RegExp(
  `(?:^|\\s)${marker('A')}\\s*([\\s\\S]*?)` +
    `\\s+${marker('B')}\\s*([\\s\\S]*?)` +
    `\\s+${marker('C')}\\s*([\\s\\S]*?)` +
    `\\s+${marker('D')}\\s*([\\s\\S]*)$`,
);
const ANSWER = /\b(?:answer|ans)\b\s*[:.\-=]?\s*[[(]?([A-Da-d])\b[\])]?/i;

/** Trim each line and drop runs of blank lines. */
function tidy(t: string) {
  return t
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fromPaste(text: string): ParseResult {
  const valid: DraftQuestion[] = [];
  const errors: string[] = [];
  const src = clean(text).replace(/\r/g, '');

  // Split wherever a line starts with a question number
  const starts = [...src.matchAll(/^\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[.):-]\s*/gim)];
  if (!starts.length) {
    errors.push(
      'No numbered questions found. Start each question with a number, ' +
        'e.g. "1." or "1)".',
    );
    return { valid, errors };
  }

  // Text before question 1 (title, passage, instructions)
  let passage = tidy(src.slice(0, starts[0].index));

  starts.forEach((m, i) => {
    const num = m[1];
    const from = (m.index ?? 0) + m[0].length;
    const to = starts[i + 1]?.index ?? src.length;
    let block = src.slice(from, to).trim();

    // Pull out the answer line. Anything after it is a new
    // passage or instruction for the questions that follow.
    const ans = ANSWER.exec(block);
    let after = '';
    if (ans) {
      after = tidy(block.slice(ans.index + ans[0].length));
      block = block.slice(0, ans.index).trim();
    }
    const thisPassage = passage;
    if (after) passage = after;

    const opt = OPTIONS.exec(block);
    if (!opt) {
      errors.push(`Question ${num}: couldn't find four options A–D`);
      return;
    }
    const question = block.slice(0, opt.index).trim();
    const options = opt.slice(1, 5).map((o) => o.replace(/\s+/g, ' ').trim());
    if (!question) {
      errors.push(`Question ${num}: the question text is empty`);
    } else if (options.some((o) => !o)) {
      errors.push(`Question ${num}: one of the options is empty`);
    } else if (!ans) {
      errors.push(`Question ${num}: no "Answer: X" line`);
    } else {
      valid.push({
        text: question.replace(/[ \t]+/g, ' '),
        options,
        correct: ans[1].toUpperCase(),
        passage: thisPassage || undefined,
      });
    }
  });
  return { valid, errors };
}

export const CSV_TEMPLATE =
  'Question,Option A,Option B,Option C,Option D,Correct Answer\r\n' +
  '"What is 2 + 2?",3,4,5,6,B\r\n' +
  '"What is the capital of Nigeria?",Abuja,Lagos,Kano,Ibadan,A\r\n';