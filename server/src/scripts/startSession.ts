/* ══════════════════════════════════════════════════════
   One-time correction: the imported results belong to
   3rd Term 2025/2026, and the school is now in
   1st Term 2026/2027.

   Dry run (changes nothing):
     npm run start-session -- ~/Downloads/WITHGODSCHOOLS.xlsx
   Do it:
     npm run start-session -- ~/Downloads/WITHGODSCHOOLS.xlsx --apply

   The spreadsheet is only read, to know each student's
   class last session.

   1. Work done in the app (questions typed in, exams sat
      on them) moves to 1st Term 2026/2027.
   2. The imported results go to 3rd Term 2025/2026 (back
      there if `move-import` moved them), filed under each
      student's class from the sheet, and that term is
      marked published (no emails).
   3. Students still in their sheet class are promoted one
      class (top class graduates). Students whose class was
      already changed in the app are left as they are.
   4. 2025/2026 is closed; 1st Term 2026/2027 is current.
   ══════════════════════════════════════════════════════ */
import ExcelJS from 'exceljs';
import mongoose, { Types } from 'mongoose';
import { connectDb } from '../config/db.js';
import {
  AcademicSession,
  ExamAttempt,
  Question,
  SchoolClass,
  Student,
  Term,
  TermResult,
} from '../models/index.js';
import { clean } from '../lib/text.js';
import { MAX } from '../lib/grading.js';
import { applyCbtScore } from '../services/cbt.js';
import { ensureNextSession } from '../services/automation.js';

const OLD = '2025/2026';
const NEW = '2026/2027';
const NEW_STARTS = '2026-09-14'; // "next term" in the old sheet

const file = process.argv.find((a) => a.endsWith('.xlsx'));
const apply = process.argv.includes('--apply');
if (!file) {
  console.error('Usage: npm run start-session -- <file.xlsx> [--apply]');
  process.exit(1);
}
const S = (v: unknown) => String(v);

/* ── Each student's class in the old sheet ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.getWorksheet('Students');
if (!ws) throw new Error("No 'Students' sheet in that file");
const head: string[] = [];
ws.getRow(1).eachCell((c, i) => (head[i] = clean(c.value)));
const idCol = head.indexOf('Student ID');
const clsCol = head.indexOf('Class');
const sheetClass = new Map<string, string>(); // studentId -> name
ws.eachRow((row, n) => {
  if (n === 1) return;
  const id = clean(row.getCell(idCol).value).toUpperCase();
  const c = clean(row.getCell(clsCol).value);
  if (id && c) sheetClass.set(id, c.toLowerCase().replace(/\s+/g, ''));
});

await connectDb();
const classes = await SchoolClass.find().sort({ order: 1 }).lean();
const byKey = new Map(
  classes.map((c) => [c.name.toLowerCase().replace(/\s+/g, ''), c]),
);
const active = classes.filter((c) => c.active);
const nextClass = (id: unknown) => {
  const i = active.findIndex((c) => S(c._id) === S(id));
  return i >= 0 ? active[i + 1] ?? null : undefined;
};

/* ── Sessions and terms ── */
async function sessionTerms(name: string) {
  const s =
    (await AcademicSession.findOne({ name })) ??
    (apply ? await AcademicSession.create({ name }) : null);
  if (!s) return { s: null, t: [] as never[] };
  for (const n of [1, 2, 3]) {
    if (apply) {
      await Term.updateOne(
        { session: s._id, number: n },
        { $setOnInsert: { session: s._id, number: n } },
        { upsert: true },
      );
    }
  }
  const t = await Term.find({ session: s._id }).sort({ number: 1 });
  return { s, t };
}
const old = await sessionTerms(OLD);
if (!old.s) throw new Error(`Session ${OLD} not found`);
const oldTerms = old.t;
const t3 = oldTerms.find((t) => t.number === 3)!;
const fresh = await sessionTerms(NEW);
const n1 = fresh.t.find((t) => t.number === 1);
const oldIds = oldTerms.map((t) => t._id);

console.log(`\n${apply ? 'APPLYING CHANGES' : 'Dry run — nothing changes'}\n`);

/* ══ 1. Work done in the app → 1st Term 2026/2027 ══ */
const newQ = await Question.find({
  term: { $in: oldIds },
  legacyId: null,
}).select('_id');
const newQIds = new Set(newQ.map((q) => S(q._id)));
const oldAttempts = await ExamAttempt.find({ term: { $in: oldIds } });
const newAttempts = oldAttempts.filter(
  (a) =>
    a.items.length && a.items.every((i) => newQIds.has(S(i.question))),
);
console.log(
  `1. Typed in the app → 1st Term ${NEW}: ` +
    `${newQ.length} question(s), ${newAttempts.length} exam(s) sat on them`,
);

/* ══ 2. Imported results → 3rd Term 2025/2026 ══ */
const legacyElsewhere = await Question.countDocuments({
  term: { $in: oldIds.filter((id) => S(id) !== S(t3._id)) },
  legacyId: { $ne: null },
});
const resultsElsewhere = await TermResult.countDocuments({
  term: { $in: oldIds.filter((id) => S(id) !== S(t3._id)) },
});
console.log(
  `2. Imported results → 3rd Term ${OLD}: ` +
    (legacyElsewhere || resultsElsewhere
      ? `moving back ${legacyElsewhere} question(s) and ` +
        `${resultsElsewhere} result(s) from another term`
      : 'already there'),
);

/* ══ 3. Promotion ══ */
const students = await Student.find({ status: 'active' })
  .select('studentId name class')
  .lean();
type Plan = { id: unknown; name: string; from: string; to: string };
const promote: Plan[] = [];
const keep: Plan[] = [];
const notInSheet: Plan[] = [];
const cname = (id: unknown) =>
  classes.find((c) => S(c._id) === S(id))?.name ?? 'no class';
for (const st of students) {
  const sheet = sheetClass.get(st.studentId);
  const now = classes.find((c) => S(c._id) === S(st.class));
  const row = { id: st._id, name: st.name, from: cname(st.class), to: '' };
  if (!sheet) {
    notInSheet.push({ ...row, to: row.from });
  } else if (!now) {
    keep.push({ ...row, to: 'no class — set it in the app' });
  } else if (now.name.toLowerCase().replace(/\s+/g, '') !== sheet) {
    keep.push({ ...row, to: `${row.from} (already moved)` });
  } else {
    const nx = nextClass(now._id);
    promote.push({ ...row, to: nx ? nx.name : 'Graduated' });
  }
}
console.log(
  `3. Promotion: ${promote.length} promoted, ` +
    `${keep.length} already moved (left as they are), ` +
    `${notInSheet.length} added in the app (left as they are)`,
);
const byFrom = new Map<string, Map<string, number>>();
for (const p of promote) {
  const m = byFrom.get(p.from) ?? new Map<string, number>();
  m.set(p.to, (m.get(p.to) ?? 0) + 1);
  byFrom.set(p.from, m);
}
for (const c of classes) {
  const m = byFrom.get(c.name);
  if (m) for (const [to, n] of m) console.log(`     ${c.name} → ${to}: ${n}`);
}
if (keep.length) {
  console.log('   Already moved / left alone:');
  for (const k of keep) console.log(`     ${k.name}: ${k.to}`);
}
console.log(
  `4. ${OLD} closed; 1st Term ${NEW} current, starting ${NEW_STARTS}`,
);

if (!apply) {
  console.log('\nDry run only. Add --apply to make these changes.');
  await mongoose.disconnect();
  process.exit(0);
}

/* ─────────── apply ─────────── */
if (!n1) throw new Error('Could not create the new session');

// 1a. New questions and their exams → 1st Term 2026/2027
await Question.updateMany(
  { _id: { $in: [...newQIds] } },
  { term: n1._id },
);
// Take their CBT scores off last session's results
for (const a of newAttempts) {
  const res = await TermResult.findOne({ student: a.student, term: a.term });
  if (!res) continue;
  const line = res.scores.find((l) => S(l.subject) === S(a.subject));
  if (line?.examSource === 'cbt') {
    const prev = await ExamAttempt.findOne({
      _id: { $ne: a._id },
      student: a.student,
      subject: a.subject,
      term: { $in: oldIds },
      status: 'submitted',
    }).lean();
    if (prev?.total) {
      line.exam = Math.round((prev.score / prev.total) * MAX.exam);
    } else if (line.test1 == null && line.test2 == null) {
      res.set(
        'scores',
        res.scores.filter((l) => S(l.subject) !== S(a.subject)),
      );
    } else {
      line.exam = null;
      line.examSource = null;
    }
  }
  const empty =
    !res.scores.length &&
    !res.traits.length &&
    res.daysPresent == null &&
    !res.remarks?.formMaster &&
    !res.remarks?.adviser &&
    !res.remarks?.principal;
  if (empty) await res.deleteOne();
  else await res.save();
}

// 2. Imported data → 3rd Term 2025/2026
for (const t of oldTerms) {
  if (S(t._id) === S(t3._id)) continue;
  await Question.updateMany(
    { term: t._id, legacyId: { $ne: null } },
    { term: t3._id },
  );
  await ExamAttempt.updateMany(
    { term: t._id, _id: { $nin: newAttempts.map((a) => a._id) } },
    { term: t3._id },
  );
  await TermResult.updateMany({ term: t._id }, { term: t3._id });
  if (t.termEnded || t.nextTermBegins || t.daysOpened != null) {
    t3.termEnded ||= t.termEnded;
    t3.nextTermBegins ||= t.nextTermBegins;
    t3.daysOpened ??= t.daysOpened;
  }
  t.set({
    termEnded: '',
    nextTermBegins: '',
    daysOpened: null,
    publishedAt: null,
    isCurrent: false,
  });
  await t.save();
}
// File last term's results under each student's sheet class
const all = await Student.find().select('studentId').lean();
for (const st of all) {
  const key = sheetClass.get(st.studentId);
  const cls = key ? byKey.get(key) : undefined;
  if (!cls) continue;
  await TermResult.updateOne(
    { student: st._id, term: t3._id },
    { class: cls._id },
  );
  await ExamAttempt.updateMany(
    { student: st._id, term: t3._id },
    { class: cls._id },
  );
}
t3.publishedAt ??= new Date();
t3.isCurrent = false;
await t3.save();

// 3. Promotion
for (const p of promote) {
  const st = await Student.findById(p.id);
  if (!st) continue;
  const nx = nextClass(st.class);
  if (nx) st.class = nx._id;
  else st.status = 'graduated';
  await st.save();
}

// 4. Sessions and current term
await AcademicSession.updateMany({}, { isCurrent: false });
await AcademicSession.updateOne(
  { _id: old.s._id },
  { closedAt: old.s.closedAt ?? new Date() },
);
await AcademicSession.updateOne({ _id: fresh.s!._id }, { isCurrent: true });
await Term.updateMany({}, { isCurrent: false });
n1.isCurrent = true;
n1.startsOn ??= new Date(`${NEW_STARTS}T00:00:00+01:00`);
await n1.save();

// 1b. Exams sat this session: re-file under 1st Term with
// the student's (new) class, and put their CBT score on
// this term's report card.
for (const a of newAttempts) {
  const st = await Student.findById(a.student).lean();
  a.term = n1._id;
  a.class = (st?.class as Types.ObjectId) ?? null;
  await a.save();
  if (a.status === 'submitted') await applyCbtScore(a);
}

await ensureNextSession();
console.log(`\nDone. Current term: 1st Term ${NEW}.`);
await mongoose.disconnect();
