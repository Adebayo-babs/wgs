/* ══════════════════════════════════════════════════════
   One-time import from the old Google Sheet.

   1. In Google Sheets: File → Download → Microsoft Excel
   2. npm run migrate -- ./WITH_GOD_SCHOOLS.xlsx --fresh

   --fresh wipes the school data collections first, so the
   import can be re-run safely. The admin account (made by
   `npm run create-admin`) is kept.

   Everything lands in the 2025/2026 3rd Term, which is
   made the current term.
   ══════════════════════════════════════════════════════ */
import ExcelJS from 'exceljs';
import mongoose, { Types } from 'mongoose';
import { connectDb } from '../config/db.js';
import {
  AcademicSession,
  ExamAttempt,
  Passport,
  Question,
  SchoolClass,
  Staff,
  Student,
  Subject,
  Term,
  TermResult,
  getSettings,
} from '../models/index.js';
import { clean } from '../lib/text.js';

const file = process.argv.find((a) => a.endsWith('.xlsx'));
const fresh = process.argv.includes('--fresh');
if (!file) {
  console.error('Usage: npm run migrate -- <file.xlsx> [--fresh]');
  process.exit(1);
}

const SESSION = '2025/2026';
const TERM_NO = 3;

/* Class ladder — `order` drives promotion. Primary 6 is
   listed on the website's class guide; switch it off in
   Admin → Classes if the school doesn't run it. */
const CLASSES = [
  'Nursery 1', 'Nursery 2', 'KG 1', 'KG 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5',
  'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3', 'SSS 1', 'SSS 2', 'SSS 3',
];

/* Only clear typos are merged. Pairs like "Basic science"
   / "Basic Science" are NOT merged: 14 students have
   different scores under each, so they're really two
   subjects on the report card. Rename them in the app. */
const SUBJECT_MERGE: Record<string, string> = {
  'Health Habit': 'Health Habits',
  'Civic-Education': 'Civic Education',
};

const log = {
  warnings: [] as string[],
  warn(msg: string) {
    this.warnings.push(msg);
  },
};

/* ── Sheet reading ── */
type Row = Record<string, unknown>;

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return (v as { result: unknown }).result ?? null;
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText
        .map((t) => t.text)
        .join('');
    }
    if ('text' in v) return (v as { text: string }).text;
  }
  return v;
}

function readSheet(wb: ExcelJS.Workbook, name: string): Row[] {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    log.warn(`Sheet '${name}' not found — skipped`);
    return [];
  }
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => {
    headers[i] = String(cellValue(c.value) ?? '').trim();
  });
  const out: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj: Row = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = cellValue(row.getCell(i).value);
      if (v !== null && v !== '') any = true;
      obj[h] = v;
    });
    if (any) out.push(obj);
  });
  return out;
}

const str = (v: unknown) => clean(v instanceof Date ? v.toISOString() : v);
const numOrNull = (v: unknown) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

function mostCommon(values: string[]) {
  const c = new Map<string, number>();
  for (const v of values.filter(Boolean)) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function slugUser(name: string, taken: Set<string>) {
  const base =
    name
      .toLowerCase()
      .replace(/\b(mr|mrs|miss|ms|dr)\b\.?/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'teacher';
  let u = base.slice(0, 24);
  let i = 2;
  while (taken.has(u)) u = `${base.slice(0, 22)}${i++}`;
  taken.add(u);
  return u;
}

/* ══════════════════════ Run ══════════════════════ */
await connectDb();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet = {
  questions: readSheet(wb, 'Questions'),
  answers: readSheet(wb, 'Answers'),
  students: readSheet(wb, 'Students'),
  subjects: readSheet(wb, 'Subjects'),
  traits: readSheet(wb, 'Traits'),
  teachers: readSheet(wb, 'Teachers'),
};
console.log(
  'Read:',
  Object.entries(sheet)
    .map(([k, v]) => `${k} ${v.length}`)
    .join(', '),
);

if (fresh) {
  await Promise.all([
    AcademicSession.deleteMany({}),
    Term.deleteMany({}),
    SchoolClass.deleteMany({}),
    Subject.deleteMany({}),
    Student.deleteMany({}),
    Passport.deleteMany({}),
    Question.deleteMany({}),
    ExamAttempt.deleteMany({}),
    TermResult.deleteMany({}),
    Staff.deleteMany({ role: { $ne: 'admin' } }),
  ]);
  console.log('Cleared existing school data (admin kept).');
} else if (await Student.exists({})) {
  console.error('Database already has students. Re-run with --fresh.');
  process.exit(1);
}

/* ── Session & term ── */
const session = await AcademicSession.create({
  name: SESSION,
  isCurrent: true,
});
const terms = await Term.insertMany(
  [1, 2, 3].map((n) => ({ session: session._id, number: n })),
);
const term = terms.find((t) => t.number === TERM_NO)!;
term.isCurrent = true;
term.termEnded = mostCommon(sheet.students.map((s) => str(s['Term Ended'])));
term.nextTermBegins = mostCommon(
  sheet.students.map((s) => str(s['Next Term'])),
);
term.daysOpened = numOrNull(
  mostCommon(sheet.students.map((s) => str(s['Days Opened']))),
);
await term.save();

/* ── Classes ── */
const classDocs = await SchoolClass.insertMany(
  CLASSES.map((name, i) => ({ name, order: (i + 1) * 10 })),
);
const classByKey = new Map(
  classDocs.map((c) => [c.name.toLowerCase().replace(/\s+/g, ''), c]),
);
function classOf(v: unknown, where: string): Types.ObjectId | null {
  const s = str(v);
  if (!s) return null;
  const c = classByKey.get(s.toLowerCase().replace(/\s+/g, ''));
  if (!c) log.warn(`Unknown class "${s}" (${where})`);
  return c?._id ?? null;
}

/* ── Subjects ── */
const subjectNames = new Set<string>();
const subjName = (v: unknown) => {
  const s = str(v);
  return SUBJECT_MERGE[s] ?? s;
};
for (const r of [...sheet.questions, ...sheet.subjects]) {
  const n = subjName(r['Subject']);
  if (n) subjectNames.add(n);
}
const subjectDocs = await Subject.insertMany(
  [...subjectNames].sort().map((name) => ({ name })),
);
const subjectId = new Map(subjectDocs.map((s) => [s.name, s._id]));

/* ── Staff ── Admin-role rows are not carried over (the
   one real admin comes from `npm run create-admin`). Every
   teacher keeps their PIN as their password until they
   change it. */
const taken = new Set(
  (await Staff.find().select('username').lean()).map((s) => s.username),
);
const staffByName = new Map<string, Types.ObjectId>();
const credentials: string[] = [];
for (const t of sheet.teachers) {
  const name = str(t['Teacher Name']).replace(/\s+/g, ' ');
  const role = str(t['Role']).toLowerCase();
  if (!name) continue;
  if (role === 'admin') {
    log.warn(`Old admin account "${name}" not imported`);
    continue;
  }
  const username = slugUser(name, taken);
  const doc = await Staff.create({
    name,
    username,
    role: 'teacher',
    legacyHash: str(t['PIN']) || null,
    legacyName: str(t['Teacher Name']),
  });
  staffByName.set(str(t['Teacher Name']).toLowerCase(), doc._id);
  credentials.push(`  ${name.padEnd(28)} username: ${username}`);
}

// Question owners with no staff account get an inactive
// placeholder, so ownership isn't lost.
for (const q of sheet.questions) {
  const owner = str(q['Teacher']);
  if (!owner || staffByName.has(owner.toLowerCase())) continue;
  const doc = await Staff.create({
    name: owner,
    username: slugUser(owner, taken),
    active: false,
    legacyName: owner,
  });
  staffByName.set(owner.toLowerCase(), doc._id);
  log.warn(`No account for question owner "${owner}" — added inactive`);
}

/* ── Questions ── */
const LETTER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
const qByLegacy = new Map<
  string,
  { _id: Types.ObjectId; subject: Types.ObjectId; class: Types.ObjectId | null; correct: number }
>();
const assignmentPairs = new Map<string, Set<string>>(); // staff -> s|c
let skippedQ = 0;
const qDocs = [];
for (const q of sheet.questions) {
  const legacyId = str(q['Question ID']);
  const text = str(q['Question']);
  const subj = subjectId.get(subjName(q['Subject']));
  const correct = LETTER[str(q['Correct Answer']).toUpperCase()];
  const rawClass = str(q['Class']);
  const cls = classOf(rawClass, `question ${legacyId}`);
  if (!text || !subj || correct === undefined || (rawClass && !cls)) {
    skippedQ++;
    log.warn(`Question ${legacyId} skipped (missing data or bad class)`);
    continue;
  }
  const owner = staffByName.get(str(q['Teacher']).toLowerCase()) ?? null;
  const ts = q['TImestamp'] ?? q['Timestamp'];
  const _id = new Types.ObjectId();
  qDocs.push({
    _id,
    term: term._id,
    subject: subj,
    class: cls,
    teacher: owner,
    text,
    options: ['Option A', 'Option B', 'Option C', 'Option D'].map((k) =>
      str(q[k]),
    ),
    correct,
    legacyId,
    createdAt: ts ? new Date(String(ts)) : new Date(),
  });
  qByLegacy.set(legacyId, { _id, subject: subj, class: cls, correct });
  if (owner && cls) {
    const k = String(owner);
    if (!assignmentPairs.has(k)) assignmentPairs.set(k, new Set());
    assignmentPairs.get(k)!.add(`${subj}|${cls}`);
  }
}
await Question.insertMany(qDocs);
console.log(`Questions saved (${qDocs.length})`);

// Derive each teacher's subject + class assignments from
// the questions they set. Admin can adjust afterwards.
for (const [staff, pairs] of assignmentPairs) {
  await Staff.updateOne(
    { _id: staff },
    {
      assignments: [...pairs].map((p) => {
        const [subject, cls] = p.split('|');
        return { subject, class: cls };
      }),
    },
  );
}

/* ── Students ── built in memory, then written in
   batches so the import is quick even over a slow link. */
const studentOid = new Map<string, Types.ObjectId>();
const studentClass = new Map<string, Types.ObjectId | null>();
const studentDocs: Record<string, unknown>[] = [];
const passportDocs: Record<string, unknown>[] = [];
for (const s of sheet.students) {
  const sid = str(s['Student ID']).toUpperCase();
  if (!sid) continue;
  if (studentOid.has(sid)) {
    log.warn(`Duplicate student ID ${sid} — second row skipped`);
    continue;
  }
  const cls = classOf(s['Class'], `student ${sid}`);
  if (!cls) log.warn(`Student ${sid} has no class — set it in the app`);
  if (!s['Password']) {
    log.warn(`Student ${sid} has no password — set one in the app`);
  }
  const ageMatch = String(s['Age'] ?? '').match(/\d+/);
  const g = str(s['Gender']);
  const _id = new Types.ObjectId();
  const pass = str(s['Passport']);
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(pass);
  if (m) {
    passportDocs.push({
      student: _id,
      data: Buffer.from(m[2], 'base64'),
      contentType: m[1],
    });
  }
  studentDocs.push({
    _id,
    studentId: sid,
    name: str(s['Name']) || sid,
    regNo: str(s['Reg No']),
    gender: g === 'M' || g === 'F' ? g : '',
    age: ageMatch ? +ageMatch[0] : null,
    class: cls,
    legacyHash: str(s['Password']) || null,
    hasPassport: !!m,
  });
  studentOid.set(sid, _id);
  studentClass.set(sid, cls);
}
await Student.insertMany(studentDocs);
console.log(`Students saved (${studentDocs.length})`);
for (let i = 0; i < passportDocs.length; i += 20) {
  await Passport.insertMany(passportDocs.slice(i, i + 20));
}
console.log(`Passports saved (${passportDocs.length})`);

/* ── Term results: scores, traits, attendance, remarks ── */
type ScoreLine = {
  subject: Types.ObjectId;
  test1: number | null;
  test2: number | null;
  exam: number | null;
  examSource: 'cbt' | 'manual' | null;
};
type ResultDraft = {
  student: Types.ObjectId;
  term: Types.ObjectId;
  class: Types.ObjectId | null;
  scores: ScoreLine[];
  traits: { category: string; trait: string; rating: number }[];
  daysPresent: number | null;
  daysAbsent: number | null;
  remarks: { adviser: string; formMaster: string; principal: string };
};
const results = new Map<string, ResultDraft>();
function resultFor(sid: string) {
  let r = results.get(sid);
  if (!r) {
    r = {
      student: studentOid.get(sid)!,
      term: term._id,
      class: studentClass.get(sid) ?? null,
      scores: [],
      traits: [],
      daysPresent: null,
      daysAbsent: null,
      remarks: { adviser: '', formMaster: '', principal: '' },
    };
    results.set(sid, r);
  }
  return r;
}

let orphanScores = 0;
for (const row of sheet.subjects) {
  const sid = str(row['Student ID']).toUpperCase();
  if (!studentOid.has(sid)) {
    orphanScores++;
    continue;
  }
  const subj = subjectId.get(subjName(row['Subject']));
  if (!subj) continue;
  const r = resultFor(sid);
  if (r.scores.some((x) => String(x.subject) === String(subj))) {
    log.warn(`${sid}: duplicate ${subjName(row['Subject'])} — kept first`);
    continue;
  }
  const exam = numOrNull(row['Exam']);
  r.scores.push({
    subject: subj,
    test1: numOrNull(row['Test1']),
    test2: numOrNull(row['Test2']),
    exam,
    examSource: exam == null ? null : 'manual',
  });
}

for (const row of sheet.traits) {
  const sid = str(row['Student ID']).toUpperCase();
  if (!studentOid.has(sid)) continue;
  const cat = str(row['Category']);
  const rating = numOrNull(row['Rating']);
  if (!['Affective', 'Psychomotor'].includes(cat) || rating == null) continue;
  const r = resultFor(sid);
  const trait = str(row['Trait']);
  if (r.traits.some((t) => t.category === cat && t.trait === trait)) continue;
  r.traits.push({
    category: cat,
    trait,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
  });
}

for (const s of sheet.students) {
  const sid = str(s['Student ID']).toUpperCase();
  if (!studentOid.has(sid)) continue;
  const present = numOrNull(s['Days Present']);
  const absent = numOrNull(s['Days Absent']);
  const remarks = {
    adviser: str(s['Adviser Report']),
    formMaster: str(s['Form Master Report']),
    principal: str(s['Principal Report']),
  };
  const anything =
    present != null || absent != null || Object.values(remarks).some(Boolean);
  if (!anything && !results.has(sid)) continue;
  const r = resultFor(sid);
  r.daysPresent = present;
  r.daysAbsent = absent;
  r.remarks = remarks;
}

/* ── CBT answers → exam attempts ── Old exams weren't
   shuffled, so option order is A–D. Where a student
   answered the same question twice (old retakes), the
   latest answer wins. Scores then flow into the report
   card wherever staff hadn't typed an exam score (the
   same rule the app uses). */
type Ans = { letter: string; at: number };
const answers = new Map<string, Map<string, Ans>>(); // sid -> qid -> ans
let orphanAnswers = 0;
for (const a of sheet.answers) {
  const sid = str(a['Student ID']).toUpperCase();
  const qid = str(a['Question ID']);
  if (!studentOid.has(sid) || !qByLegacy.has(qid)) {
    orphanAnswers++;
    continue;
  }
  const at = new Date(String(a['Timestamp'] ?? 0)).getTime() || 0;
  const m = answers.get(sid) ?? new Map<string, Ans>();
  answers.set(sid, m);
  const prev = m.get(qid);
  if (!prev || at >= prev.at) {
    m.set(qid, { letter: str(a['Student Answer']).toUpperCase(), at });
  }
}

const attemptDocs: Record<string, unknown>[] = [];
for (const [sid, byQ] of answers) {
  const bySubject = new Map<string, [string, Ans][]>();
  for (const [qid, ans] of byQ) {
    const s = String(qByLegacy.get(qid)!.subject);
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s)!.push([qid, ans]);
  }
  for (const [subj, list] of bySubject) {
    const items = list.map(([qid, ans]) => {
      const q = qByLegacy.get(qid)!;
      const answer = LETTER[ans.letter] ?? null;
      return {
        question: q._id,
        optionOrder: [0, 1, 2, 3],
        answer,
        correct: q.correct,
        isCorrect: answer != null && answer === q.correct,
      };
    });
    const score = items.filter((i) => i.isCorrect).length;
    const last = new Date(Math.max(...list.map(([, a]) => a.at)) || Date.now());
    const subjOid = new Types.ObjectId(subj);
    attemptDocs.push({
      student: studentOid.get(sid),
      term: term._id,
      subject: subjOid,
      class: studentClass.get(sid) ?? null,
      items,
      status: 'submitted',
      score,
      total: items.length,
      startedAt: last,
      submittedAt: last,
    });

    // CBT → report card, unless a manual exam score exists
    const exam = items.length
      ? Math.round((score / items.length) * 60)
      : 0;
    const r = resultFor(sid);
    const line = r.scores.find((x) => String(x.subject) === subj);
    if (!line) {
      r.scores.push({
        subject: subjOid,
        test1: null,
        test2: null,
        exam,
        examSource: 'cbt',
      });
    } else if (!(line.examSource === 'manual' && line.exam != null)) {
      line.exam = exam;
      line.examSource = 'cbt';
    }
  }
}

const resultDocs = [...results.values()];
for (let i = 0; i < resultDocs.length; i += 100) {
  await TermResult.insertMany(resultDocs.slice(i, i + 100));
}
console.log(`Term results saved (${resultDocs.length})`);
for (let i = 0; i < attemptDocs.length; i += 200) {
  await ExamAttempt.insertMany(attemptDocs.slice(i, i + 200));
  console.log(
    `CBT attempts saved ${Math.min(i + 200, attemptDocs.length)}` +
      `/${attemptDocs.length}`,
  );
}
const attemptCount = attemptDocs.length;

await getSettings(); // create default settings

/* ── Report ── */
console.log('\n══════ Import finished ══════');
console.log(`Session ${SESSION}, 3rd term set as current`);
console.log(`Classes:   ${classDocs.length}`);
console.log(`Subjects:  ${subjectDocs.length}`);
console.log(`Questions: ${qDocs.length} (skipped ${skippedQ})`);
console.log(`Students:  ${studentOid.size}`);
console.log(`Results:   ${results.size}`);
console.log(`Attempts:  ${attemptCount}`);
console.log(`Answer rows skipped (unknown student/question): ${orphanAnswers}`);
console.log(`Score rows skipped (unknown student): ${orphanScores}`);
console.log('\nTeacher logins (password = their old PIN):');
console.log(credentials.join('\n'));
if (log.warnings.length) {
  console.log(`\nWarnings (${log.warnings.length}):`);
  for (const w of log.warnings) console.log('  - ' + w);
}
await mongoose.disconnect();