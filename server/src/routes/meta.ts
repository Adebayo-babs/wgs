import { Router } from 'express';
import { z } from 'zod';
import {
  Question,
  SchoolClass,
  Student,
  Subject,
  TermResult,
  TERM_LABEL,
  getSettings,
} from '../models/index.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import {
  bad,
  forbidden,
  notFound,
  oid,
  parse,
  q,
} from '../middleware/http.js';
import {
  currentTermOrNull,
  listSessions,
  termOrCurrent,
} from '../services/terms.js';
import { teacherOverview } from '../services/teacherOverview.js';
import { clean } from '../lib/text.js';

const r = Router();
r.use(requireStaff);

/** Everything the staff portal needs on load. */
r.get('/meta', async (req, res) => {
  const [classes, subjects, settings, term, sessions] = await Promise.all([
    SchoolClass.find().sort({ order: 1 }).lean(),
    Subject.find().sort({ name: 1 }).lean(),
    getSettings(),
    currentTermOrNull(),
    listSessions(),
  ]);
  res.json({
    me: req.staff,
    classes,
    subjects,
    sessions,
    currentTerm: term
      ? {
          id: term._id,
          number: term.number,
          label: `${TERM_LABEL[term.number]} Term`,
          session: (term.session as unknown as { name: string }).name,
          sessionId: (term.session as unknown as { _id: string })._id,
          publishedAt: term.publishedAt,
        }
      : null,
    settings: {
      school: settings.school,
      affectiveTraits: settings.affectiveTraits,
      psychomotorTraits: settings.psychomotorTraits,
    },
  });
});

/* ── Teacher overview ── /overview/me for a teacher's own
   dashboard; any staff id for the admin. */
r.get('/overview/:id', async (req, res) => {
  const me = req.staff!;
  const id = req.params.id === 'me' ? me.id : oid(req.params.id);
  if (!me.isAdmin && String(id) !== String(me.id)) throw forbidden();
  const term = await termOrCurrent(q(req, 'term'));
  res.json(await teacherOverview(id, term._id));
});

/* ── Classes (admin) ── */
const classBody = z.object({
  name: z.string().trim().min(1),
  order: z.number(),
  active: z.boolean().optional(),
});

r.post('/classes', requireAdmin, async (req, res) => {
  const b = parse(classBody, req.body);
  res.status(201).json(await SchoolClass.create(b));
});

r.patch('/classes/:id', requireAdmin, async (req, res) => {
  const b = parse(classBody.partial(), req.body);
  const c = await SchoolClass.findByIdAndUpdate(oid(req.params.id), b, {
    new: true,
  });
  if (!c) throw notFound('Class');
  res.json(c);
});

r.delete('/classes/:id', requireAdmin, async (req, res) => {
  const id = oid(req.params.id);
  const used =
    (await Student.exists({ class: id })) ||
    (await TermResult.exists({ class: id })) ||
    (await Question.exists({ class: id }));
  if (used) throw bad('Class is in use. Mark it inactive instead.');
  await SchoolClass.deleteOne({ _id: id });
  res.json({ ok: true });
});

/* ── Subjects (admin) ── */
const subjectBody = z.object({
  name: z.string().trim().min(1),
  active: z.boolean().optional(),
});

r.post('/subjects', requireAdmin, async (req, res) => {
  const b = parse(subjectBody, req.body);
  res.status(201).json(await Subject.create({ ...b, name: clean(b.name) }));
});

r.patch('/subjects/:id', requireAdmin, async (req, res) => {
  const b = parse(subjectBody.partial(), req.body);
  if (b.name) b.name = clean(b.name);
  const s = await Subject.findByIdAndUpdate(oid(req.params.id), b, {
    new: true,
  });
  if (!s) throw notFound('Subject');
  res.json(s);
});

r.delete('/subjects/:id', requireAdmin, async (req, res) => {
  const id = oid(req.params.id);
  const used =
    (await Question.exists({ subject: id })) ||
    (await TermResult.exists({ 'scores.subject': id }));
  if (used) throw bad('Subject is in use. Mark it inactive instead.');
  await Subject.deleteOne({ _id: id });
  res.json({ ok: true });
});

/* ── Settings (admin) ── */
r.get('/settings', requireAdmin, async (_req, res) => {
  res.json(await getSettings());
});

const remarkBank = z.record(z.string(), z.array(z.string()));
const settingsBody = z.object({
  school: z
    .object({
      name: z.string(),
      shortName: z.string(),
      motto: z.string(),
      address: z.string(),
      phone: z.string(),
      email: z.string(),
    })
    .partial()
    .optional(),
  affectiveTraits: z.array(z.string().trim().min(1)).optional(),
  psychomotorTraits: z.array(z.string().trim().min(1)).optional(),
  remarks: z
    .object({
      formMaster: remarkBank,
      principal: remarkBank,
      adviser: remarkBank,
    })
    .optional(),
  repeatBelow: z.number().min(0).max(100).optional(),
  emailReportsOnPublish: z.boolean().optional(),
});

r.put('/settings', requireAdmin, async (req, res) => {
  const b = parse(settingsBody, req.body);
  const s = await getSettings();
  if (b.school) s.set('school', { ...s.toObject().school, ...b.school });
  if (b.affectiveTraits) s.affectiveTraits = b.affectiveTraits;
  if (b.psychomotorTraits) s.psychomotorTraits = b.psychomotorTraits;
  if (b.remarks) s.set('remarks', b.remarks);
  if (b.repeatBelow != null) s.repeatBelow = b.repeatBelow;
  if (b.emailReportsOnPublish != null) {
    s.emailReportsOnPublish = b.emailReportsOnPublish;
  }
  await s.save();
  res.json(s);
});

export default r;
