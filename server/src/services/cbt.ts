import { Types } from 'mongoose';
import {
  ExamAttempt,
  Question,
  Student,
  Subject,
  TermResult,
} from '../models/index.js';
import { MAX } from '../lib/grading.js';
import { shuffle } from '../lib/text.js';
import { bad, HttpError, notFound } from '../middleware/http.js';

type Oid = Types.ObjectId;
const LETTERS = ['A', 'B', 'C', 'D'];

/* Shuffle, but keep questions that share a passage next
   to each other (in random order within the group), so
   students read a comprehension once. */
function shuffleKeepingPassages<T extends { passage?: string | null }>(
  qs: T[],
) {
  const groups = new Map<string, T[]>();
  const singles: T[][] = [];
  for (const q of qs) {
    const p = (q.passage ?? '').trim();
    if (!p) {
      singles.push([q]);
      continue;
    }
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(q);
  }
  const blocks = [...groups.values(), ...singles].map((g) => shuffle(g));
  return shuffle(blocks).flat();
}

/** Questions a student can see: their class + general ones. */
function eligibleFilter(term: Oid, cls: Oid | null, subject?: Oid) {
  const f: Record<string, unknown> = {
    term,
    class: cls ? { $in: [cls, null] } : null,
  };
  if (subject) f.subject = subject;
  return f;
}

/** Subjects the student can sit this term + status. */
export async function examLobby(studentOid: Oid, term: Oid) {
  const st = await Student.findById(studentOid).lean();
  if (!st) throw notFound('Student');
  const counts = await Question.aggregate<{ _id: Oid; count: number }>([
    { $match: eligibleFilter(term, st.class ?? null) },
    { $group: { _id: '$subject', count: { $sum: 1 } } },
  ]);
  const subjects = await Subject.find({
    _id: { $in: counts.map((c) => c._id) },
  }).lean();
  const attempts = await ExamAttempt.find({
    student: studentOid,
    term,
  }).lean();
  const att = new Map(attempts.map((a) => [String(a.subject), a]));
  return counts
    .map((c) => {
      const s = subjects.find((x) => String(x._id) === String(c._id));
      const a = att.get(String(c._id));
      return {
        subjectId: String(c._id),
        subject: s?.name ?? 'Unknown',
        count: c.count,
        status: a ? a.status : 'not_started',
        score: a?.status === 'submitted' ? a.score : null,
        total: a?.status === 'submitted' ? a.total : null,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

/* Start (or resume) an exam. Question order and each
   question's option order are shuffled once, then stored,
   so a refresh shows the same paper. */
export async function startExam(studentOid: Oid, term: Oid, subject: Oid) {
  const st = await Student.findById(studentOid).lean();
  if (!st) throw notFound('Student');

  let attempt = await ExamAttempt.findOne({
    student: studentOid,
    term,
    subject,
  });
  if (attempt?.status === 'submitted') {
    throw new HttpError(409, 'You have already taken this exam');
  }

  if (!attempt) {
    const qs = await Question.find(
      eligibleFilter(term, st.class ?? null, subject),
    ).lean();
    if (!qs.length) throw bad('No questions for this subject yet');
    attempt = await ExamAttempt.create({
      student: studentOid,
      term,
      subject,
      class: st.class ?? null,
      total: qs.length,
      items: shuffleKeepingPassages(qs).map((q) => ({
        question: q._id,
        optionOrder: shuffle([0, 1, 2, 3]),
        correct: q.correct,
      })),
    });
  }

  const qs = await Question.find({
    _id: { $in: attempt.items.map((i) => i.question) },
  }).lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const subj = await Subject.findById(subject).lean();

  return {
    attemptId: String(attempt._id),
    subject: subj?.name ?? '',
    questions: attempt.items
      .map((it) => {
        const q = byId.get(String(it.question));
        if (!q) return null;
        return {
          id: String(q._id),
          text: q.text,
          passage: q.passage ?? '',
          options: it.optionOrder.map((o) => q.options[o]),
        };
      })
      .filter(Boolean),
  };
}

/* Grade a submission. `answers` maps question id to the
   DISPLAYED option index (0–3), which is translated back
   through that question's stored option order. */
export async function submitExam(
  studentOid: Oid,
  term: Oid,
  subject: Oid,
  answers: Record<string, number>,
) {
  const attempt = await ExamAttempt.findOne({
    student: studentOid,
    term,
    subject,
  });
  if (!attempt) throw bad('Start the exam first');
  if (attempt.status === 'submitted') {
    throw new HttpError(409, 'You have already taken this exam');
  }

  let score = 0;
  for (const it of attempt.items) {
    const shown = answers[String(it.question)];
    const valid = Number.isInteger(shown) && shown >= 0 && shown <= 3;
    it.answer = valid ? it.optionOrder[shown] : null;
    it.isCorrect = it.answer != null && it.answer === it.correct;
    if (it.isCorrect) score++;
  }
  attempt.score = score;
  attempt.total = attempt.items.length;
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  await attempt.save();

  await applyCbtScore(attempt);
  return reviewAttempt(attempt._id);
}

/** Answer breakdown for a submitted attempt. */
export async function reviewAttempt(attemptId: Oid) {
  const a = await ExamAttempt.findById(attemptId).lean();
  if (!a) throw notFound('Attempt');
  const qs = await Question.find({
    _id: { $in: a.items.map((i) => i.question) },
  }).lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const subj = await Subject.findById(a.subject).lean();
  const letterOf = (order: number[], orig: number | null | undefined) =>
    orig == null ? '' : LETTERS[order.indexOf(orig)];
  return {
    subject: subj?.name ?? '',
    score: a.score,
    total: a.total,
    breakdown: a.items.map((it) => {
      const q = byId.get(String(it.question));
      return {
        question: q?.text ?? '(question deleted)',
        given: letterOf(it.optionOrder, it.answer),
        givenText: it.answer != null ? q?.options[it.answer] ?? '' : '',
        correct: letterOf(it.optionOrder, it.correct),
        correctText: q?.options[it.correct] ?? '',
        ok: it.isCorrect,
      };
    }),
  };
}

/* ══════ CBT → report card ══════
   The CBT score is scaled to the 60-mark exam column and
   written into the student's term result, unless staff
   have typed an exam score by hand for that subject. */
export async function applyCbtScore(a: {
  student: Oid;
  term: Oid;
  subject: Oid;
  class?: Oid | null;
  score: number;
  total: number;
}) {
  const exam = a.total ? Math.round((a.score / a.total) * MAX.exam) : 0;
  const res =
    (await TermResult.findOne({ student: a.student, term: a.term })) ??
    new TermResult({
      student: a.student,
      term: a.term,
      class: a.class ?? null,
    });
  const line = res.scores.find((s) => String(s.subject) === String(a.subject));
  if (line) {
    if (line.examSource === 'manual' && line.exam != null) return;
    line.exam = exam;
    line.examSource = 'cbt';
  } else {
    res.scores.push({ subject: a.subject, exam, examSource: 'cbt' });
  }
  await res.save();
}

/** Undo the CBT score when staff reset an attempt. */
export async function clearCbtScore(student: Oid, term: Oid, subject: Oid) {
  const res = await TermResult.findOne({ student, term });
  if (!res) return;
  const line = res.scores.find((s) => String(s.subject) === String(subject));
  if (!line || line.examSource !== 'cbt') return;
  line.exam = null;
  line.examSource = null;
  if (line.test1 == null && line.test2 == null) {
    res.set(
      'scores',
      res.scores.filter((s) => String(s.subject) !== String(subject)),
    );
  }
  await res.save();
}