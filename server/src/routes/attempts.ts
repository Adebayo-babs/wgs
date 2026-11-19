import { Router } from 'express';
import { Types } from 'mongoose';
import { ExamAttempt } from '../models/index.js';
import { requireStaff, teaches } from '../middleware/auth.js';
import { forbidden, notFound, oid, q } from '../middleware/http.js';
import { clearCbtScore, reviewAttempt } from '../services/cbt.js';
import { termOrCurrent } from '../services/terms.js';
import { MAX } from '../lib/grading.js';

/* CBT results for staff. Teachers see their own subject +
   class pairs; admin sees everything. */
const r = Router();
r.use(requireStaff);

r.get('/', async (req, res) => {
  const s = req.staff!;
  const term = await termOrCurrent(q(req, 'term'));
  const filter: Record<string, unknown> = { term: term._id };
  const subject = q(req, 'subject');
  const cls = q(req, 'class');
  if (subject) filter.subject = oid(subject, 'subject');
  if (cls) filter.class = oid(cls, 'class');
  if (!s.isAdmin) {
    filter.$or = s.assignments.map((a) => ({
      subject: new Types.ObjectId(a.subject),
      class: new Types.ObjectId(a.class),
    }));
    if (!s.assignments.length) {
      res.json([]);
      return;
    }
  }
  const list = await ExamAttempt.find(filter)
    .select('-items')
    .populate('student', 'studentId name')
    .populate('subject', 'name')
    .populate('class', 'name')
    .sort({ submittedAt: -1, startedAt: -1 })
    .lean();
  res.json(
    list.map((a) => ({
      ...a,
      percent: a.total ? Math.round((a.score / a.total) * 100) : 0,
      examScore: a.total ? Math.round((a.score / a.total) * MAX.exam) : 0,
    })),
  );
});

async function loadAllowed(id: string, staff: Express.Request['staff']) {
  const a = await ExamAttempt.findById(oid(id));
  if (!a) throw notFound('Attempt');
  if (!teaches(staff!, String(a.subject), a.class && String(a.class))) {
    throw forbidden();
  }
  return a;
}

r.get('/:id', async (req, res) => {
  const a = await loadAllowed(req.params.id, req.staff);
  res.json(await reviewAttempt(a._id));
});

/* Reset lets the student retake that subject. Any CBT
   score it put on the report card is removed too. */
r.delete('/:id', async (req, res) => {
  const a = await loadAllowed(req.params.id, req.staff);
  await clearCbtScore(a.student, a.term, a.subject);
  await a.deleteOne();
  res.json({ ok: true });
});

export default r;
