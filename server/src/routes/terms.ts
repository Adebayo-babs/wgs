import { Router } from 'express';
import { z } from 'zod';
import {
  AcademicSession,
  Student,
  Term,
  TermResult,
} from '../models/index.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { bad, notFound, oid, parse } from '../middleware/http.js';
import { listSessions } from '../services/terms.js';
import { deliverReports, publishTerm } from '../services/publish.js';
import {
  closeSession,
  promotionPreview,
  type Decision,
} from '../services/promotion.js';
import { smtpConfigured } from '../config/env.js';

/* Sessions, terms, publishing and promotion — admin only. */
const r = Router();
r.use(requireStaff, requireAdmin);

r.get('/sessions', async (_req, res) => {
  res.json({ sessions: await listSessions(), smtpConfigured });
});

r.post('/sessions', async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Use the form 2026/2027'),
    }),
    req.body,
  );
  const s = await AcademicSession.create({ name: b.name });
  for (const n of [1, 2, 3]) await Term.create({ session: s._id, number: n });
  if (!(await Term.exists({ isCurrent: true }))) {
    await Term.updateOne({ session: s._id, number: 1 }, { isCurrent: true });
    s.isCurrent = true;
    await s.save();
  }
  res.status(201).json(s);
});

const termBody = z.object({
  termEnded: z.string().optional(),
  nextTermBegins: z.string().optional(),
  daysOpened: z.number().int().min(0).nullable().optional(),
});

r.patch('/terms/:id', async (req, res) => {
  const b = parse(termBody, req.body);
  const t = await Term.findByIdAndUpdate(oid(req.params.id), b, { new: true });
  if (!t) throw notFound('Term');
  res.json(t);
});

/** Make a term the current one (where CBT and entry go). */
r.post('/terms/:id/activate', async (req, res) => {
  const t = await Term.findById(oid(req.params.id));
  if (!t) throw notFound('Term');
  await Term.updateMany({}, { isCurrent: false });
  t.isCurrent = true;
  await t.save();
  await AcademicSession.updateMany({}, { isCurrent: false });
  await AcademicSession.updateOne({ _id: t.session }, { isCurrent: true });
  res.json({ ok: true });
});

/* Publish: computes nothing extra (reports are always
   computed live), but releases them to students, locks
   score entry for teachers and emails parents. */
r.post('/terms/:id/publish', async (req, res) => {
  const t = await publishTerm(oid(req.params.id));
  res.json({ ok: true, publishedAt: t.publishedAt });
});

r.post('/terms/:id/unpublish', async (req, res) => {
  const t = await Term.findById(oid(req.params.id));
  if (!t) throw notFound('Term');
  t.publishedAt = null;
  await t.save();
  res.json({ ok: true });
});

r.post('/terms/:id/deliver', async (req, res) => {
  const b = parse(
    z.object({ onlyFailed: z.boolean().default(true) }),
    req.body ?? {},
  );
  const t = await Term.findById(oid(req.params.id));
  if (!t) throw notFound('Term');
  if (!t.publishedAt) throw bad('Publish the term first');
  if (t.delivery?.running) throw bad('Delivery is already running');
  void deliverReports(t._id, b.onlyFailed).catch((e) =>
    console.error('Report delivery failed', e),
  );
  res.json({ ok: true });
});

r.get('/terms/:id/delivery', async (req, res) => {
  const t = await Term.findById(oid(req.params.id)).lean();
  if (!t) throw notFound('Term');
  const results = await TermResult.find({
    term: t._id,
    'scores.0': { $exists: true },
  })
    .populate('class', 'name')
    .lean();
  const students = await Student.find({
    _id: { $in: results.map((x) => x.student) },
  })
    .select('studentId name parent')
    .lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));
  res.json({
    summary: t.delivery,
    rows: results.map((x) => {
      const s = byId.get(String(x.student));
      return {
        student: x.student,
        studentId: s?.studentId,
        name: s?.name,
        className: (x.class as unknown as { name?: string })?.name ?? '',
        email: s?.parent?.email ?? '',
        phone: s?.parent?.phone ?? '',
        status: x.delivery?.status ?? null,
        error: x.delivery?.error ?? '',
        at: x.delivery?.at ?? null,
      };
    }),
  });
});

/* ── End of session ── */
r.get('/sessions/:id/promotion', async (req, res) => {
  res.json(await promotionPreview(req.params.id));
});

r.post('/sessions/:id/close', async (req, res) => {
  const b = parse(
    z.object({
      decisions: z
        .record(
          z.string(),
          z.enum(['promote', 'repeat', 'graduate', 'withdraw']),
        )
        .default({}),
    }),
    req.body,
  );
  res.json(
    await closeSession(
      req.params.id,
      b.decisions as Record<string, Decision>,
    ),
  );
});

export default r;
