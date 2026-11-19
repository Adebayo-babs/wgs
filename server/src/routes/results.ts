import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import {
  ExamAttempt,
  Student,
  TermResult,
  getSettings,
} from '../models/index.js';
import {
  formTeacherOf,
  linkedToClass,
  requireStaff,
  teaches,
} from '../middleware/auth.js';
import {
  bad,
  forbidden,
  notFound,
  oid,
  parse,
  q,
} from '../middleware/http.js';
import { MAX } from '../lib/grading.js';
import { termOrCurrent } from '../services/terms.js';
import { buildReport, classBroadsheet } from '../services/results.js';
import { reportPdf, pdfName } from '../services/reportPdf.js';
import { reportLink } from '../services/publish.js';

const r = Router();
r.use(requireStaff);

type Oid = Types.ObjectId;

/* Students who belong on a class sheet for a term: anyone
   with a result recorded in that class, plus (for the
   current term) every active student now in the class. */
async function classRoster(termId: Oid, classId: Oid, isCurrent: boolean) {
  const inResults = await TermResult.find({ term: termId, class: classId })
    .select('student')
    .lean();
  const ids = new Set(inResults.map((x) => String(x.student)));
  const filter: Record<string, unknown> = isCurrent
    ? {
        $or: [
          { _id: { $in: [...ids] } },
          { class: classId, status: 'active' },
        ],
      }
    : { _id: { $in: [...ids] } };
  return Student.find(filter)
    .select('studentId name class hasPassport')
    .sort({ name: 1 })
    .lean();
}

async function getOrNewResult(student: Oid, term: Oid, cls: Oid | null) {
  return (
    (await TermResult.findOne({ student, term })) ??
    new TermResult({ student, term, class: cls })
  );
}

/* ══════ Subject score sheet (subject teachers) ══════ */
r.get('/scores', async (req, res) => {
  const term = await termOrCurrent(q(req, 'term'));
  const classId = oid(q(req, 'class'), 'class');
  const subjectId = oid(q(req, 'subject'), 'subject');
  if (!teaches(req.staff!, String(subjectId), String(classId))) {
    throw forbidden('You are not assigned to that subject and class');
  }
  const roster = await classRoster(term._id, classId, term.isCurrent);
  const results = await TermResult.find({
    term: term._id,
    student: { $in: roster.map((s) => s._id) },
  }).lean();
  const attempts = await ExamAttempt.find({
    term: term._id,
    subject: subjectId,
    status: 'submitted',
    student: { $in: roster.map((s) => s._id) },
  }).lean();
  const resBy = new Map(results.map((x) => [String(x.student), x]));
  const attBy = new Map(attempts.map((x) => [String(x.student), x]));

  res.json({
    locked: !!term.publishedAt,
    rows: roster.map((s) => {
      const line = resBy
        .get(String(s._id))
        ?.scores.find((x) => String(x.subject) === String(subjectId));
      const a = attBy.get(String(s._id));
      return {
        student: s._id,
        studentId: s.studentId,
        name: s.name,
        test1: line?.test1 ?? null,
        test2: line?.test2 ?? null,
        exam: line?.exam ?? null,
        examSource: line?.examSource ?? null,
        cbt: a
          ? {
              score: a.score,
              total: a.total,
              exam: Math.round((a.score / a.total) * MAX.exam),
            }
          : null,
      };
    }),
  });
});

const mark = (max: number) =>
  z.number().min(0).max(max, `Max is ${max}`).nullable();

const scoresBody = z.object({
  term: z.string().optional(),
  class: z.string(),
  subject: z.string(),
  rows: z.array(
    z.object({
      student: z.string(),
      test1: mark(MAX.test1),
      test2: mark(MAX.test2),
      exam: mark(MAX.exam),
      // true = take the exam score from the CBT
      useCbt: z.boolean().default(false),
    }),
  ),
});

r.put('/scores', async (req, res) => {
  const b = parse(scoresBody, req.body);
  const term = await termOrCurrent(b.term);
  if (term.publishedAt && !req.staff!.isAdmin) {
    throw forbidden('Results for this term are published and locked');
  }
  const classId = oid(b.class, 'class');
  const subjectId = oid(b.subject, 'subject');
  if (!teaches(req.staff!, b.subject, b.class)) {
    throw forbidden('You are not assigned to that subject and class');
  }

  for (const row of b.rows) {
    const sid = oid(row.student, 'student');
    const res0 = await getOrNewResult(sid, term._id, classId);
    let line = res0.scores.find((x) => String(x.subject) === b.subject);
    if (!line) {
      res0.scores.push({ subject: subjectId });
      line = res0.scores[res0.scores.length - 1];
    }
    line.test1 = row.test1;
    line.test2 = row.test2;
    if (row.useCbt) {
      const a = await ExamAttempt.findOne({
        student: sid,
        term: term._id,
        subject: subjectId,
        status: 'submitted',
      }).lean();
      line.exam = a ? Math.round((a.score / a.total) * MAX.exam) : null;
      line.examSource = a ? 'cbt' : null;
    } else {
      line.exam = row.exam;
      line.examSource = row.exam == null ? null : 'manual';
    }
    if (line.test1 == null && line.test2 == null && line.exam == null) {
      res0.set(
        'scores',
        res0.scores.filter((x) => String(x.subject) !== b.subject),
      );
    }
    await res0.save();
  }
  res.json({ ok: true, saved: b.rows.length });
});

/* ══════ Class sheet (form teachers): attendance,
   traits and remarks for every student in the class ══════ */
r.get('/class', async (req, res) => {
  const term = await termOrCurrent(q(req, 'term'));
  const classId = oid(q(req, 'class'), 'class');
  if (!formTeacherOf(req.staff!, String(classId))) {
    throw forbidden('Only the form teacher or admin can open this');
  }
  const roster = await classRoster(term._id, classId, term.isCurrent);
  const results = await TermResult.find({
    term: term._id,
    student: { $in: roster.map((s) => s._id) },
  }).lean();
  const resBy = new Map(results.map((x) => [String(x.student), x]));
  const settings = await getSettings();
  res.json({
    locked: !!term.publishedAt,
    daysOpened: term.daysOpened,
    affectiveTraits: settings.affectiveTraits,
    psychomotorTraits: settings.psychomotorTraits,
    rows: roster.map((s) => {
      const x = resBy.get(String(s._id));
      return {
        student: s._id,
        studentId: s.studentId,
        name: s.name,
        daysPresent: x?.daysPresent ?? null,
        daysAbsent: x?.daysAbsent ?? null,
        traits: x?.traits ?? [],
        remarks: x?.remarks ?? { adviser: '', formMaster: '', principal: '' },
        subjects: x?.scores.length ?? 0,
      };
    }),
  });
});

const classRow = z.object({
  student: z.string(),
  daysPresent: z.number().int().min(0).nullable().optional(),
  daysAbsent: z.number().int().min(0).nullable().optional(),
  traits: z
    .array(
      z.object({
        category: z.enum(['Affective', 'Psychomotor']),
        trait: z.string(),
        rating: z.number().int().min(1).max(5).nullable(),
      }),
    )
    .optional(),
  remarks: z
    .object({
      adviser: z.string(),
      formMaster: z.string(),
      principal: z.string(),
    })
    .partial()
    .optional(),
});

r.put('/class', async (req, res) => {
  const b = parse(
    z.object({
      term: z.string().optional(),
      class: z.string(),
      rows: z.array(classRow),
    }),
    req.body,
  );
  const term = await termOrCurrent(b.term);
  if (term.publishedAt && !req.staff!.isAdmin) {
    throw forbidden('Results for this term are published and locked');
  }
  const classId = oid(b.class, 'class');
  if (!formTeacherOf(req.staff!, b.class)) {
    throw forbidden('Only the form teacher or admin can change this');
  }
  // Only the admin writes the principal's remark
  for (const row of b.rows) {
    const doc = await getOrNewResult(oid(row.student), term._id, classId);
    if (row.daysPresent !== undefined) doc.daysPresent = row.daysPresent;
    if (row.daysAbsent !== undefined) doc.daysAbsent = row.daysAbsent;
    if (row.traits) {
      doc.set(
        'traits',
        row.traits.filter((t) => t.rating != null),
      );
    }
    if (row.remarks) {
      type R = { adviser?: string; formMaster?: string; principal?: string };
      const cur: R = doc.toObject().remarks ?? {};
      const next = { ...cur, ...row.remarks };
      if (!req.staff!.isAdmin) next.principal = cur.principal ?? '';
      doc.set('remarks', next);
    }
    await doc.save();
  }
  res.json({ ok: true });
});

/* ══════ Report cards ══════ */
async function allowedReport(
  staff: Express.Request['staff'],
  studentId: string,
  termId?: string,
) {
  const term = await termOrCurrent(termId);
  const st = await Student.findById(oid(studentId, 'student')).lean();
  if (!st) throw notFound('Student');
  const result = await TermResult.findOne({
    student: st._id,
    term: term._id,
  }).lean();
  const cls = result?.class ?? st.class;
  if (!linkedToClass(staff!, String(cls))) throw forbidden();
  return buildReport(st._id, term._id);
}

r.get('/report/:studentId', async (req, res) => {
  res.json(
    await allowedReport(req.staff, req.params.studentId, q(req, 'term')),
  );
});

r.get('/report/:studentId/pdf', async (req, res) => {
  const report = await allowedReport(
    req.staff,
    req.params.studentId,
    q(req, 'term'),
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${pdfName(report)}"`,
  );
  res.send(await reportPdf(report));
});

/** Shareable parent link (for WhatsApp), published terms. */
r.get('/report/:studentId/share', async (req, res) => {
  const report = await allowedReport(
    req.staff,
    req.params.studentId,
    q(req, 'term'),
  );
  if (!report.published) {
    throw bad('Publish this term before sharing reports');
  }
  const st = await Student.findById(report.student.id).lean();
  res.json({
    url: reportLink(report.student.id, report.term.id),
    phone: st?.parent?.phone ?? '',
    name: report.student.name,
    term: `${report.term.label} Term ${report.term.session}`,
  });
});

r.get('/broadsheet', async (req, res) => {
  const term = await termOrCurrent(q(req, 'term'));
  const classId = q(req, 'class');
  if (!classId) throw bad('class is required');
  if (!linkedToClass(req.staff!, classId)) throw forbidden();
  res.json(await classBroadsheet(term._id, oid(classId)));
});

export default r;
