import { Types } from 'mongoose';
import {
  ExamAttempt,
  Question,
  SchoolClass,
  Staff,
  Student,
  Subject,
  TermResult,
} from '../models/index.js';
import { notFound } from '../middleware/http.js';

type Oid = Types.ObjectId;
const S = (v: unknown) => String(v);
const key = (subject: unknown, cls: unknown) => `${S(subject)}|${S(cls)}`;

/* Everything about one teacher for one term: the subjects
   and classes they teach, how far each one has got
   (questions set, exams taken, scores entered), and their
   form classes. Used by the admin's staff page and by the
   teacher's own dashboard. A few grouped queries, not one
   per subject, so it stays quick. */
export async function teacherOverview(staffId: Oid, termId: Oid) {
  const staff = await Staff.findById(staffId).lean();
  if (!staff) throw notFound('Staff');

  const [subjects, classes] = await Promise.all([
    Subject.find().lean(),
    SchoolClass.find().lean(),
  ]);
  const subjName = new Map(subjects.map((s) => [S(s._id), s.name]));
  const cls = new Map(classes.map((c) => [S(c._id), c]));

  // Pairs they're assigned, plus any pair they've set
  // questions for without being assigned (shown flagged).
  const assigned = new Set(
    (staff.assignments || []).map((a) => key(a.subject, a.class)),
  );
  const ownPairs = await Question.aggregate<{
    _id: { s: Oid; c: Oid | null };
  }>([
    { $match: { term: termId, teacher: staff._id } },
    { $group: { _id: { s: '$subject', c: '$class' } } },
  ]);
  const pairs = new Map<string, { subject: string; class: string | null }>();
  for (const a of staff.assignments || []) {
    pairs.set(key(a.subject, a.class), {
      subject: S(a.subject),
      class: S(a.class),
    });
  }
  for (const p of ownPairs) {
    const k = key(p._id.s, p._id.c);
    if (!pairs.has(k)) {
      pairs.set(k, {
        subject: S(p._id.s),
        class: p._id.c ? S(p._id.c) : null,
      });
    }
  }
  const formIds = (staff.formClasses || []).map(S);

  // ── Grouped counts ──
  const [qCounts, studentCounts, attemptStats, scoreCounts] =
    await Promise.all([
      Question.aggregate<{
        _id: { s: Oid; c: Oid | null };
        total: number;
        mine: number;
      }>([
        { $match: { term: termId } },
        {
          $group: {
            _id: { s: '$subject', c: '$class' },
            total: { $sum: 1 },
            mine: {
              $sum: { $cond: [{ $eq: ['$teacher', staff._id] }, 1, 0] },
            },
          },
        },
      ]),
      Student.aggregate<{ _id: Oid; n: number }>([
        { $match: { status: 'active' } },
        { $group: { _id: '$class', n: { $sum: 1 } } },
      ]),
      ExamAttempt.aggregate<{
        _id: { s: Oid; c: Oid | null };
        n: number;
        avg: number;
      }>([
        { $match: { term: termId, status: 'submitted', total: { $gt: 0 } } },
        {
          $group: {
            _id: { s: '$subject', c: '$class' },
            n: { $sum: 1 },
            avg: { $avg: { $divide: ['$score', '$total'] } },
          },
        },
      ]),
      TermResult.aggregate<{ _id: { s: Oid; c: Oid | null }; n: number }>([
        { $match: { term: termId } },
        { $unwind: '$scores' },
        {
          $match: {
            $or: [
              { 'scores.test1': { $ne: null } },
              { 'scores.test2': { $ne: null } },
            ],
          },
        },
        {
          $group: {
            _id: { s: '$scores.subject', c: '$class' },
            n: { $sum: 1 },
          },
        },
      ]),
    ]);

  const qMap = new Map(qCounts.map((q) => [key(q._id.s, q._id.c), q]));
  const stuMap = new Map(studentCounts.map((s) => [S(s._id), s.n]));
  const attMap = new Map(attemptStats.map((a) => [key(a._id.s, a._id.c), a]));
  const scoreMap = new Map(scoreCounts.map((x) => [key(x._id.s, x._id.c), x.n]));

  const subjectRows = [...pairs.entries()].map(([k, p]) => {
    const q = qMap.get(k);
    const general = p.class ? qMap.get(key(p.subject, null)) : undefined;
    const att = attMap.get(k);
    const c = p.class ? cls.get(p.class) : undefined;
    return {
      subjectId: p.subject,
      subject: subjName.get(p.subject) ?? 'Unknown subject',
      classId: p.class,
      className: c?.name ?? 'All classes',
      classOrder: c?.order ?? 0,
      assigned: assigned.has(k),
      students: p.class ? stuMap.get(p.class) ?? 0 : null,
      questions: q?.total ?? 0,
      generalQuestions: general?.total ?? 0,
      questionsByThem: q?.mine ?? 0,
      examsTaken: att?.n ?? 0,
      averagePercent: att ? Math.round(att.avg * 100) : null,
      testScoresEntered: p.class ? scoreMap.get(k) ?? 0 : null,
    };
  });
  subjectRows.sort(
    (a, b) =>
      a.classOrder - b.classOrder || a.subject.localeCompare(b.subject),
  );

  // ── Form classes ──
  const formRows = await Promise.all(
    formIds.map(async (id) => {
      const oid = new Types.ObjectId(id);
      const [students, results] = await Promise.all([
        Student.countDocuments({ class: oid, status: 'active' }),
        TermResult.find({ term: termId, class: oid })
          .select('daysPresent traits remarks')
          .lean(),
      ]);
      return {
        classId: id,
        className: cls.get(id)?.name ?? '?',
        students,
        attendanceDone: results.filter((r) => r.daysPresent != null).length,
        traitsDone: results.filter((r) => r.traits?.length).length,
        remarksTyped: results.filter((r) => r.remarks?.formMaster?.trim())
          .length,
      };
    }),
  );

  // Distinct students across every class they're linked to
  const classIds = new Set([
    ...subjectRows.map((r) => r.classId).filter(Boolean),
    ...formIds,
  ] as string[]);
  const totalStudents = [...classIds].reduce(
    (n, id) => n + (stuMap.get(id) ?? 0),
    0,
  );

  return {
    staff: {
      id: S(staff._id),
      name: staff.name,
      username: staff.username,
      role: staff.role,
      active: staff.active,
    },
    totals: {
      students: totalStudents,
      classes: classIds.size,
      subjects: subjectRows.length,
      questionsByThem: await Question.countDocuments({
        term: termId,
        teacher: staff._id,
      }),
      examsTaken: subjectRows.reduce((n, r) => n + r.examsTaken, 0),
      subjectsWithoutQuestions: subjectRows.filter(
        (r) => r.questions + r.generalQuestions === 0,
      ).length,
    },
    subjects: subjectRows,
    formClasses: formRows,
  };
}
