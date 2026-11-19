import { Router, type Request } from 'express';
import { z } from 'zod';
import { ExamAttempt, Student } from '../models/index.js';
import {
  formTeacherOf,
  linkedToClass,
  requireStaff,
} from '../middleware/auth.js';
import {
  bad,
  forbidden,
  notFound,
  oid,
  parse,
  q,
} from '../middleware/http.js';
import { hashPassword } from '../lib/password.js';
import { escapeRegex } from '../lib/text.js';
import { savePassport, sendPassport } from '../lib/passport.js';
import { currentTermOrNull } from '../services/terms.js';

const r = Router();
r.use(requireStaff);

const parent = z
  .object({
    name: z.string().trim().default(''),
    email: z.union([z.literal(''), z.string().trim().email()]).default(''),
    phone: z.string().trim().default(''),
  })
  .partial();

const studentBody = z.object({
  studentId: z.string().trim().min(2).toUpperCase(),
  name: z.string().trim().min(2),
  class: z.string().min(1, 'Choose a class'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  gender: z.enum(['M', 'F', '']).default(''),
  age: z.number().int().min(1).max(30).nullable().optional(),
  regNo: z.string().trim().default(''),
  parent: parent.optional(),
});

/* List students. Teachers see the classes they're linked
   to; admin sees everyone. */
r.get('/', async (req, res) => {
  const s = req.staff!;
  const filter: Record<string, unknown> = {
    status: q(req, 'status') ?? 'active',
  };
  const cls = q(req, 'class');
  if (cls) {
    if (!linkedToClass(s, cls)) throw forbidden();
    filter.class = oid(cls, 'class');
  } else if (!s.isAdmin) {
    const mine = new Set([
      ...s.formClasses,
      ...s.assignments.map((a) => a.class),
    ]);
    filter.class = { $in: [...mine].map((c) => oid(c)) };
  }
  const search = q(req, 'search');
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: re }, { studentId: re }];
  }
  const list = await Student.find(filter)
    .populate('class', 'name')
    .sort({ name: 1 })
    .lean();

  const term = await currentTermOrNull();
  const done = term
    ? await ExamAttempt.aggregate<{ _id: unknown; n: number }>([
        {
          $match: {
            term: term._id,
            status: 'submitted',
            student: { $in: list.map((x) => x._id) },
          },
        },
        { $group: { _id: '$student', n: { $sum: 1 } } },
      ])
    : [];
  const doneMap = new Map(done.map((d) => [String(d._id), d.n]));
  res.json(
    list.map((x) => ({
      ...x,
      examsTaken: doneMap.get(String(x._id)) ?? 0,
    })),
  );
});

r.post('/', async (req, res) => {
  const b = parse(studentBody, req.body);
  if (!linkedToClass(req.staff!, b.class)) {
    throw forbidden('You can only add students to your own classes');
  }
  const st = await Student.create({
    ...b,
    class: oid(b.class, 'class'),
    passwordHash: await hashPassword(b.password),
    registeredBy: req.staff!.id,
  });
  res.status(201).json({ id: st._id });
});

async function loadForEdit(req: Request) {
  const st = await Student.findById(oid(req.params.id as string));
  if (!st) throw notFound('Student');
  if (!formTeacherOf(req.staff!, String(st.class))) {
    throw forbidden('Only the admin or form teacher can change this');
  }
  return st;
}

r.get('/:id', async (req, res) => {
  const st = await Student.findById(oid(req.params.id))
    .populate('class', 'name')
    .lean();
  if (!st) throw notFound('Student');
  const cls = (st.class as unknown as { _id: unknown } | null)?._id;
  if (!linkedToClass(req.staff!, String(cls))) throw forbidden();
  res.json(st);
});

r.patch('/:id', async (req, res) => {
  const st = await loadForEdit(req);
  const b = parse(
    studentBody
      .omit({ password: true })
      .partial()
      .extend({
        status: z.enum(['active', 'graduated', 'withdrawn']).optional(),
      }),
    req.body,
  );
  if (b.class && !formTeacherOf(req.staff!, b.class)) {
    throw forbidden('You cannot move a student to that class');
  }
  if (b.parent) b.parent = { ...st.toObject().parent, ...b.parent };
  st.set({ ...b, ...(b.class ? { class: oid(b.class) } : {}) });
  await st.save();
  res.json({ ok: true });
});

r.post('/:id/password', async (req, res) => {
  const st = await loadForEdit(req);
  const b = parse(z.object({ password: z.string().min(4) }), req.body);
  st.set('passwordHash', await hashPassword(b.password));
  st.set('legacyHash', null);
  await st.save();
  res.json({ ok: true });
});

r.get('/:id/passport', async (req, res) => {
  await sendPassport(oid(req.params.id), res);
});

r.put('/:id/passport', async (req, res) => {
  const st = await Student.findById(oid(req.params.id)).lean();
  if (!st) throw notFound('Student');
  if (!linkedToClass(req.staff!, String(st.class))) throw forbidden();
  const b = parse(z.object({ image: z.string() }), req.body);
  if (!b.image) throw bad('No image');
  await savePassport(st._id, b.image);
  res.json({ ok: true });
});

export default r;
