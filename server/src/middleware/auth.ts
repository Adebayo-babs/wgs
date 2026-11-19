import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Staff } from '../models/index.js';
import { HttpError, forbidden } from './http.js';

export type TokenPayload =
  | { kind: 'staff'; sub: string }
  | { kind: 'student'; sub: string };

export interface StaffCtx {
  id: Types.ObjectId;
  name: string;
  role: 'admin' | 'teacher';
  isAdmin: boolean;
  assignments: { subject: string; class: string }[];
  formClasses: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: StaffCtx;
      studentOid?: Types.ObjectId;
    }
  }
}

export function signToken(p: TokenPayload) {
  return jwt.sign(p, env.JWT_SECRET, { expiresIn: '7d' });
}

function readToken(req: Request): TokenPayload {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please sign in');
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw new HttpError(401, 'Your session has expired. Sign in again');
  }
}

export async function requireStaff(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const p = readToken(req);
  if (p.kind !== 'staff') throw forbidden('Staff only');
  const s = await Staff.findById(p.sub).lean();
  if (!s || !s.active) throw new HttpError(401, 'Account not active');
  req.staff = {
    id: s._id,
    name: s.name,
    role: s.role as 'admin' | 'teacher',
    isAdmin: s.role === 'admin',
    assignments: (s.assignments || []).map((a) => ({
      subject: String(a.subject),
      class: String(a.class),
    })),
    formClasses: (s.formClasses || []).map(String),
  };
  next();
}

export function requireAdmin(req: Request, _r: Response, n: NextFunction) {
  if (!req.staff?.isAdmin) throw forbidden('Admin only');
  n();
}

export function requireStudent(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const p = readToken(req);
  if (p.kind !== 'student') throw forbidden('Students only');
  req.studentOid = new Types.ObjectId(p.sub);
  next();
}

/* ── Permission helpers ── */

/** Can this staff member work on subject X in class Y? */
export function teaches(
  s: StaffCtx,
  subject: string,
  cls: string | null | undefined,
) {
  if (s.isAdmin) return true;
  return s.assignments.some(
    (a) => a.subject === String(subject) && (!cls || a.class === String(cls)),
  );
}

/** Is this staff member the form teacher of class Y? */
export function formTeacherOf(s: StaffCtx, cls: string | null | undefined) {
  if (s.isAdmin) return true;
  return !!cls && s.formClasses.includes(String(cls));
}

/** Any link at all to class Y (subject or form teacher). */
export function linkedToClass(s: StaffCtx, cls: string | null | undefined) {
  if (s.isAdmin) return true;
  if (!cls) return false;
  return (
    formTeacherOf(s, cls) || s.assignments.some((a) => a.class === String(cls))
  );
}
