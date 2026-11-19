import { Router } from 'express';
import { z } from 'zod';
import { ExamAttempt, Question, Staff } from '../models/index.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { bad, notFound, oid, parse } from '../middleware/http.js';
import { hashPassword } from '../lib/password.js';
import { currentTermOrNull } from '../services/terms.js';
import { deleteStaff, staffImpact } from '../services/staffDelete.js';

/* Staff accounts — admin only. There is no self-signup. */
const r = Router();
r.use(requireStaff, requireAdmin);

const assignment = z.object({ subject: z.string(), class: z.string() });

const staffBody = z.object({
  name: z.string().trim().min(2),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, '3–30 letters, numbers, . _ or -'),
  password: z.string().min(6, 'At least 6 characters'),
  role: z.enum(['admin', 'teacher']).default('teacher'),
  assignments: z.array(assignment).default([]),
  formClasses: z.array(z.string()).default([]),
});

r.get('/', async (_req, res) => {
  const staff = await Staff.find()
    .sort({ active: -1, name: 1 })
    .populate('assignments.subject', 'name')
    .populate('assignments.class', 'name')
    .populate('formClasses', 'name')
    .lean();
  const term = await currentTermOrNull();
  const qCounts = term
    ? await Question.aggregate<{ _id: unknown; n: number }>([
        { $match: { term: term._id } },
        { $group: { _id: '$teacher', n: { $sum: 1 } } },
      ])
    : [];
  const qMap = new Map(qCounts.map((c) => [String(c._id), c.n]));

  // Submissions per (subject, class) this term, credited to
  // every teacher assigned to that pair.
  const subs = term
    ? await ExamAttempt.aggregate<{
        _id: { s: unknown; c: unknown };
        n: number;
      }>([
        { $match: { term: term._id, status: 'submitted' } },
        { $group: { _id: { s: '$subject', c: '$class' }, n: { $sum: 1 } } },
      ])
    : [];
  const subMap = new Map(
    subs.map((x) => [`${x._id.s}|${x._id.c}`, x.n]),
  );

  res.json(
    staff.map((s) => ({
      ...s,
      questionCount: qMap.get(String(s._id)) ?? 0,
      submissionCount: (s.assignments || []).reduce((n, a) => {
        const sid = (a.subject as unknown as { _id: unknown })?._id;
        const cid = (a.class as unknown as { _id: unknown })?._id;
        return n + (subMap.get(`${sid}|${cid}`) ?? 0);
      }, 0),
    })),
  );
});

r.post('/', async (req, res) => {
  const b = parse(staffBody, req.body);
  const s = await Staff.create({
    ...b,
    passwordHash: await hashPassword(b.password),
  });
  res.status(201).json({ id: s._id });
});

r.patch('/:id', async (req, res) => {
  const b = parse(
    staffBody.omit({ password: true }).partial().extend({
      active: z.boolean().optional(),
    }),
    req.body,
  );
  const id = oid(req.params.id);
  const s = await Staff.findById(id);
  if (!s) throw notFound('Staff');
  const losingAdmin =
    s.role === 'admin' &&
    ((b.role && b.role !== 'admin') || b.active === false);
  if (losingAdmin) {
    const admins = await Staff.countDocuments({
      role: 'admin',
      active: true,
    });
    if (admins <= 1) throw bad('There must be at least one active admin');
  }
  s.set(b);
  await s.save();
  res.json({ ok: true });
});

/** What a delete would remove — shown before confirming. */
r.get('/:id/impact', async (req, res) => {
  res.json(await staffImpact(oid(req.params.id)));
});

r.delete('/:id', async (req, res) => {
  res.json(await deleteStaff(oid(req.params.id), req.staff!.id));
});

r.post('/:id/password', async (req, res) => {
  const b = parse(z.object({ password: z.string().min(6) }), req.body);
  const s = await Staff.findById(oid(req.params.id));
  if (!s) throw notFound('Staff');
  s.passwordHash = await hashPassword(b.password);
  s.set('legacyHash', null);
  await s.save();
  res.json({ ok: true });
});

export default r;