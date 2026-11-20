import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ExamAttempt, Question, Staff } from '../models/index.js';
import { requireStaff, teaches, type StaffCtx } from '../middleware/auth.js';
import { bad, forbidden, notFound, oid, parse, q } from '../middleware/http.js';
import { clean } from '../lib/text.js';
import { currentTerm, termOrCurrent } from '../services/terms.js';
import {
  questionImpact,
  removeQuestions,
} from '../services/questionDelete.js';

const r = Router();
r.use(requireStaff);

const LETTER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

const item = z.object({
  text: z.string().transform(clean).pipe(z.string().min(1, 'Question is empty')),
  passage: z
    .string()
    .max(20000, 'Passage is too long')
    .transform(clean)
    .optional(),
  options: z
    .array(z.string().transform(clean).pipe(z.string().min(1, 'Empty option')))
    .length(4, 'Four options are required'),
  correct: z.union([
    z.number().int().min(0).max(3),
    z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v in LETTER, 'Correct answer must be A, B, C or D')
      .transform((v) => LETTER[v]),
  ]),
});

const target = z.object({
  subject: z.string().min(1, 'Choose a subject'),
  class: z.string().nullable(), // null = every class
  // Admin only: credit the questions to this teacher
  // instead of the admin (when typing them in for someone).
  owner: z.string().optional(),
});

/** Who the new questions belong to. */
async function ownerFor(s: StaffCtx, owner?: string) {
  if (!owner || !s.isAdmin || owner === String(s.id)) return s.id;
  const t = await Staff.findById(oid(owner, 'teacher')).lean();
  if (!t) throw bad('That teacher was not found');
  return t._id;
}

function assertTeaches(s: StaffCtx, subject: string, cls: string | null) {
  if (!teaches(s, subject, cls)) {
    throw forbidden('You are not assigned to that subject and class');
  }
}

/* Teachers see questions for their own subject + class
   pairs (shared with any co-teacher); admin sees all. */
r.get('/', async (req, res) => {
  const s = req.staff!;
  const term = await termOrCurrent(q(req, 'term'));
  const filter: Record<string, unknown> = { term: term._id };
  const subject = q(req, 'subject');
  const cls = q(req, 'class');
  if (subject) filter.subject = oid(subject, 'subject');
  if (cls) filter.class = cls === 'general' ? null : oid(cls, 'class');
  if (!s.isAdmin) {
    filter.$or = [
      { teacher: s.id },
      ...s.assignments.map((a) => ({
        subject: new Types.ObjectId(a.subject),
        class: { $in: [new Types.ObjectId(a.class), null] },
      })),
    ];
  }
  const list = await Question.find(filter)
    .populate('subject', 'name')
    .populate('class', 'name')
    .populate('teacher', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json(list);
});

r.post('/', async (req, res) => {
  const t = parse(target, req.body);
  const b = parse(item, req.body);
  assertTeaches(req.staff!, t.subject, t.class);
  const term = await currentTerm();
  const created = await Question.create({
    ...b,
    term: term._id,
    subject: oid(t.subject, 'subject'),
    class: t.class ? oid(t.class, 'class') : null,
    teacher: await ownerFor(req.staff!, t.owner),
  });
  res.status(201).json(created);
});

r.post('/bulk', async (req, res) => {
  const t = parse(target, req.body);
  const items = parse(
    z.object({ items: z.array(item).min(1).max(500) }),
    req.body,
  ).items;
  assertTeaches(req.staff!, t.subject, t.class);
  const term = await currentTerm();
  const teacher = await ownerFor(req.staff!, t.owner);
  await Question.insertMany(
    items.map((b) => ({
      ...b,
      term: term._id,
      subject: oid(t.subject),
      class: t.class ? oid(t.class) : null,
      teacher,
    })),
  );
  res.status(201).json({ added: items.length });
});

async function loadOwned(req: { params: { id?: string }; staff?: StaffCtx }) {
  const doc = await Question.findById(oid(req.params.id));
  if (!doc) throw notFound('Question');
  const s = req.staff!;
  const own = String(doc.teacher) === String(s.id);
  if (!own && !teaches(s, String(doc.subject), doc.class && String(doc.class))) {
    throw forbidden('That question is not yours');
  }
  return doc;
}

r.patch('/:id', async (req, res) => {
  const doc = await loadOwned(req);
  const b = parse(item.partial(), req.body);
  doc.set(b);
  await doc.save();
  res.json(doc);
});

// Deleting a question also takes it out of any exam a
// student already sat, and re-scores that exam.
r.delete('/:id', async (req, res) => {
  const doc = await loadOwned(req);
  res.json(await removeQuestions([doc._id]));
});

/* Delete every question for one subject + class in the
   current term. `dryRun: true` only reports what would go,
   for the confirmation box. */
r.post('/delete-many', async (req, res) => {
  const b = parse(
    target.extend({ dryRun: z.boolean().default(false) }),
    req.body,
  );
  assertTeaches(req.staff!, b.subject, b.class);
  const term = await currentTerm();
  const qids = await Question.find({
    term: term._id,
    subject: oid(b.subject, 'subject'),
    class: b.class ? oid(b.class, 'class') : null,
  }).distinct('_id');
  if (!qids.length) throw bad('There are no questions to delete');
  res.json(
    b.dryRun ? await questionImpact(qids) : await removeQuestions(qids),
  );
});

/* Admin: credit every question for one subject + class in
   the current term to a teacher (e.g. questions the admin
   typed in for them). */
r.post('/reassign', async (req, res) => {
  if (!req.staff!.isAdmin) throw forbidden('Admin only');
  const b = parse(target.extend({ owner: z.string().min(1) }), req.body);
  const teacher = await ownerFor(req.staff!, b.owner);
  const term = await currentTerm();
  const r0 = await Question.updateMany(
    {
      term: term._id,
      subject: oid(b.subject, 'subject'),
      class: b.class ? oid(b.class, 'class') : null,
    },
    { teacher },
  );
  res.json({ updated: r0.modifiedCount });
});

/* Copy a subject's questions from an earlier term into the
   current term, so teachers can reuse a question bank. */
r.post('/copy', async (req, res) => {
  const b = parse(
    target.extend({ fromTerm: z.string().min(1) }),
    req.body,
  );
  assertTeaches(req.staff!, b.subject, b.class);
  const term = await currentTerm();
  const from = oid(b.fromTerm, 'term');
  if (String(from) === String(term._id)) throw bad('Pick an earlier term');
  const src = await Question.find({
    term: from,
    subject: oid(b.subject),
    class: b.class ? oid(b.class) : null,
  }).lean();
  if (!src.length) throw bad('No questions found in that term');
  await Question.insertMany(
    src.map((x) => ({
      term: term._id,
      subject: x.subject,
      class: x.class,
      teacher: req.staff!.id,
      text: x.text,
      passage: x.passage ?? '',
      options: x.options,
      correct: x.correct,
    })),
  );
  res.status(201).json({ added: src.length });
});

/** How many students have started this subject's exam. */
r.get('/attempt-count', async (req, res) => {
  const term = await currentTerm();
  const subject = q(req, 'subject');
  if (!subject) throw bad('subject is required');
  const n = await ExamAttempt.countDocuments({
    term: term._id,
    subject: oid(subject),
  });
  res.json({ count: n });
});

export default r;
