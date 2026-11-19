import { Types } from 'mongoose';
import {
  ExamAttempt,
  Question,
  Staff,
  Student,
  TermResult,
} from '../models/index.js';
import { MAX } from '../lib/grading.js';
import { bad, notFound } from '../middleware/http.js';

type Oid = Types.ObjectId;
const S = (v: unknown) => String(v);

/** What deleting this staff member would remove. */
export async function staffImpact(id: Oid) {
  const qids = await Question.find({ teacher: id }).distinct('_id');
  const attempts = qids.length
    ? await ExamAttempt.find({ 'items.question': { $in: qids } })
        .select('items.question')
        .lean()
    : [];
  const set = new Set(qids.map(S));
  let emptied = 0;
  for (const a of attempts) {
    if (a.items.every((i) => set.has(S(i.question)))) emptied++;
  }
  return {
    questions: qids.length,
    attemptsChanged: attempts.length - emptied,
    attemptsRemoved: emptied,
  };
}

/* Delete a staff member and everything they set up.
   - Their questions are deleted (every term).
   - Those questions are taken out of students' CBT
     attempts and the attempts are re-scored. An attempt
     left with no questions is deleted.
   - The CBT exam score on report cards follows: updated
     to the new score, or cleared if the attempt is gone.
     Exam scores typed by hand are left alone.
   Everything is computed in memory and written in bulk,
   so it stays quick over a slow connection. */
export async function deleteStaff(id: Oid, actingAdmin: Oid) {
  if (S(id) === S(actingAdmin)) {
    throw bad('You cannot delete your own account');
  }
  const staff = await Staff.findById(id);
  if (!staff) throw notFound('Staff');
  if (staff.role === 'admin') {
    const others = await Staff.countDocuments({
      _id: { $ne: id },
      role: 'admin',
      active: true,
    });
    if (!others) throw bad('There must be at least one active admin');
  }

  const qids = await Question.find({ teacher: id }).distinct('_id');
  const gone = new Set(qids.map(S));
  const attempts = qids.length
    ? await ExamAttempt.find({ 'items.question': { $in: qids } }).lean()
    : [];

  // New CBT exam score per (student, term, subject);
  // null = attempt removed, so clear the CBT score.
  const cbt = new Map<string, number | null>();
  const attemptOps: Parameters<typeof ExamAttempt.bulkWrite>[0] = [];
  let removed = 0;

  for (const a of attempts) {
    const items = a.items.filter((i) => !gone.has(S(i.question)));
    const key = `${a.student}|${a.term}|${a.subject}`;
    if (!items.length) {
      removed++;
      attemptOps.push({ deleteOne: { filter: { _id: a._id } } });
      cbt.set(key, null);
      continue;
    }
    const score = items.filter((i) => i.isCorrect).length;
    attemptOps.push({
      updateOne: {
        filter: { _id: a._id },
        update: { $set: { items, score, total: items.length } },
      },
    });
    if (a.status === 'submitted') {
      cbt.set(key, Math.round((score / items.length) * MAX.exam));
    }
  }

  if (attemptOps.length) await ExamAttempt.bulkWrite(attemptOps);

  // Bring report-card exam scores in line
  const pairs = [...cbt.keys()].map((k) => k.split('|'));
  const results = pairs.length
    ? await TermResult.find({
        $or: pairs.map(([student, term]) => ({ student, term })),
      }).lean()
    : [];
  type Line = {
    subject: unknown;
    test1?: number | null;
    test2?: number | null;
    exam?: number | null;
    examSource?: string | null;
  };
  const byKey = new Map(
    results.map((r) => [
      `${r.student}|${r.term}`,
      {
        id: r._id,
        scores: r.scores as unknown as Line[],
        changed: false,
      },
    ]),
  );

  for (const [student, term, subject] of pairs) {
    const hit = byKey.get(`${student}|${term}`);
    if (!hit) continue;
    const exam = cbt.get(`${student}|${term}|${subject}`);
    const next: Line[] = [];
    for (const l of hit.scores) {
      if (S(l.subject) !== subject || l.examSource !== 'cbt') {
        next.push(l);
      } else if (exam != null) {
        next.push({ ...l, exam });
        hit.changed = true;
      } else {
        hit.changed = true;
        if (l.test1 != null || l.test2 != null) {
          next.push({ ...l, exam: null, examSource: null });
        }
      }
    }
    hit.scores = next;
  }

  const resultOps: Parameters<typeof TermResult.bulkWrite>[0] = [];
  for (const { id, scores, changed } of byKey.values()) {
    if (!changed) continue;
    resultOps.push({
      updateOne: {
        filter: { _id: id },
        update: { $set: { scores } },
      },
    });
  }
  if (resultOps.length) await TermResult.bulkWrite(resultOps);

  await Question.deleteMany({ teacher: id });
  await Student.updateMany({ registeredBy: id }, { registeredBy: null });
  await Staff.deleteOne({ _id: id });

  return {
    questions: qids.length,
    attemptsChanged: attempts.length - removed,
    attemptsRemoved: removed,
  };
}
