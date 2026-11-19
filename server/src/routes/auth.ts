import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Staff, Student, SchoolClass } from '../models/index.js';
import { checkPassword, hashPassword } from '../lib/password.js';
import {
  requireStaff,
  requireStudent,
  signToken,
} from '../middleware/auth.js';
import { HttpError, bad, parse } from '../middleware/http.js';

const r = Router();

// 10 tries per 10 minutes per IP on login endpoints
const loginLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes.' },
});

const staffLogin = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

r.post('/staff/login', loginLimit, async (req, res) => {
  const b = parse(staffLogin, req.body);
  const s = await Staff.findOne({
    username: b.username.toLowerCase(),
  }).select('+legacyHash');
  const check = s ? await checkPassword(s, b.password) : 'fail';
  if (!s || check === 'fail' || !s.active) {
    throw new HttpError(401, 'Wrong username or password');
  }
  if (check === 'ok-upgrade') {
    s.passwordHash = await hashPassword(b.password);
    s.legacyHash = null;
    await s.save();
  }
  res.json({
    token: signToken({ kind: 'staff', sub: String(s._id) }),
    user: { id: s._id, name: s.name, username: s.username, role: s.role },
  });
});

const studentLogin = z.object({
  studentId: z.string().trim().min(1),
  password: z.string().min(1),
});

r.post('/student/login', loginLimit, async (req, res) => {
  const b = parse(studentLogin, req.body);
  const st = await Student.findOne({
    studentId: b.studentId.toUpperCase(),
  }).select('+passwordHash +legacyHash');
  const check = st ? await checkPassword(st, b.password) : 'fail';
  if (!st || check === 'fail') {
    throw new HttpError(401, 'Wrong student ID or password');
  }
  if (st.status !== 'active') {
    throw new HttpError(403, 'This student account is no longer active');
  }
  if (check === 'ok-upgrade') {
    st.passwordHash = await hashPassword(b.password);
    st.legacyHash = null;
    await st.save();
  }
  const cls = st.class ? await SchoolClass.findById(st.class).lean() : null;
  res.json({
    token: signToken({ kind: 'student', sub: String(st._id) }),
    user: {
      id: st._id,
      studentId: st.studentId,
      name: st.name,
      className: cls?.name ?? '',
    },
  });
});

r.get('/staff/me', requireStaff, async (req, res) => {
  const s = await Staff.findById(req.staff!.id)
    .populate('assignments.subject', 'name')
    .populate('assignments.class', 'name')
    .populate('formClasses', 'name')
    .lean();
  res.json(s);
});

const changePw = z.object({
  current: z.string().min(1),
  next: z.string().min(6, 'New password must be at least 6 characters'),
});

r.post('/staff/password', requireStaff, async (req, res) => {
  const b = parse(changePw, req.body);
  const s = await Staff.findById(req.staff!.id).select('+legacyHash');
  if (!s || (await checkPassword(s, b.current)) === 'fail') {
    throw bad('Current password is wrong');
  }
  s.passwordHash = await hashPassword(b.next);
  s.legacyHash = null;
  await s.save();
  res.json({ ok: true });
});

r.post('/student/password', requireStudent, async (req, res) => {
  const b = parse(changePw, req.body);
  const st = await Student.findById(req.studentOid).select(
    '+passwordHash +legacyHash',
  );
  if (!st || (await checkPassword(st, b.current)) === 'fail') {
    throw bad('Current password is wrong');
  }
  st.passwordHash = await hashPassword(b.next);
  st.legacyHash = null;
  await st.save();
  res.json({ ok: true });
});

export default r;
