import { Router } from 'express';
import { z } from 'zod';
import {
  SchoolClass,
  Student,
  Term,
  TermResult,
  TERM_LABEL,
} from '../models/index.js';
import { requireStudent } from '../middleware/auth.js';
import { forbidden, notFound, oid, parse } from '../middleware/http.js';
import { currentTerm } from '../services/terms.js';
import {
  examLobby,
  reviewAttempt,
  startExam,
  submitExam,
} from '../services/cbt.js';
import { ExamAttempt } from '../models/index.js';
import { buildReport } from '../services/results.js';
import { reportPdf, pdfName } from '../services/reportPdf.js';
import { savePassport, sendPassport } from '../lib/passport.js';

/* Everything a signed-in student can do. The student is
   always taken from the login token, never from the
   request, so nobody can act for another student. */
const r = Router();
r.use(requireStudent);

r.get('/profile', async (req, res) => {
  const st = await Student.findById(req.studentOid).lean();
  if (!st) throw notFound('Student');
  const cls = st.class ? await SchoolClass.findById(st.class).lean() : null;
  const term = await currentTerm();
  res.json({
    id: st._id,
    studentId: st.studentId,
    name: st.name,
    className: cls?.name ?? '',
    gender: st.gender,
    hasPassport: st.hasPassport,
    term: {
      id: term._id,
      label: `${TERM_LABEL[term.number]} Term`,
      session: (term.session as unknown as { name: string }).name,
    },
  });
});

/* ── Exams ── */
r.get('/exams', async (req, res) => {
  const term = await currentTerm();
  res.json(await examLobby(req.studentOid!, term._id));
});

r.post('/exams/:subjectId/start', async (req, res) => {
  const term = await currentTerm();
  const subject = oid(req.params.subjectId, 'subject');
  res.json(await startExam(req.studentOid!, term._id, subject));
});

const submitBody = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(3)),
});

r.post('/exams/:subjectId/submit', async (req, res) => {
  const term = await currentTerm();
  const subject = oid(req.params.subjectId, 'subject');
  const b = parse(submitBody, req.body);
  res.json(
    await submitExam(req.studentOid!, term._id, subject, b.answers),
  );
});

r.get('/exams/:subjectId/review', async (req, res) => {
  const term = await currentTerm();
  const a = await ExamAttempt.findOne({
    student: req.studentOid,
    term: term._id,
    subject: oid(req.params.subjectId, 'subject'),
    status: 'submitted',
  }).lean();
  if (!a) throw notFound('Result');
  res.json(await reviewAttempt(a._id));
});

/* ── Report cards: published terms only ── */
r.get('/reports', async (req, res) => {
  const results = await TermResult.find({ student: req.studentOid })
    .select('term')
    .lean();
  const terms = await Term.find({
    _id: { $in: results.map((x) => x.term) },
    publishedAt: { $ne: null },
  })
    .populate('session', 'name')
    .lean();
  res.json(
    terms
      .map((t) => ({
        id: t._id,
        number: t.number,
        session: (t.session as unknown as { name: string }).name,
        label: `${TERM_LABEL[t.number]} Term`,
      }))
      .sort((a, b) =>
        a.session === b.session
          ? b.number - a.number
          : b.session.localeCompare(a.session),
      ),
  );
});

async function publishedReport(studentOid: unknown, termId: string) {
  const report = await buildReport(
    studentOid as string,
    oid(termId, 'term'),
  );
  if (!report.published) throw forbidden('This report is not out yet');
  return report;
}

r.get('/reports/:termId', async (req, res) => {
  res.json(await publishedReport(req.studentOid, req.params.termId));
});

r.get('/reports/:termId/pdf', async (req, res) => {
  const report = await publishedReport(req.studentOid, req.params.termId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${pdfName(report)}"`,
  );
  res.send(await reportPdf(report));
});

/* ── Passport ── */
r.get('/passport', async (req, res) => {
  await sendPassport(req.studentOid!, res);
});

r.put('/passport', async (req, res) => {
  const b = parse(z.object({ image: z.string() }), req.body);
  await savePassport(req.studentOid!, b.image);
  res.json({ ok: true });
});

export default r;
