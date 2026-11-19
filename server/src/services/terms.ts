import { Types } from 'mongoose';
import { AcademicSession, Term, TERM_LABEL } from '../models/index.js';
import { HttpError, notFound } from '../middleware/http.js';

export async function currentTerm() {
  const t = await Term.findOne({ isCurrent: true }).populate('session');
  if (!t) {
    throw new HttpError(409, 'No current term is set. Ask the admin.');
  }
  return t;
}

export async function currentTermOrNull() {
  return Term.findOne({ isCurrent: true }).populate('session');
}

/** Resolve ?term=<id>, falling back to the current term. */
export async function termOrCurrent(id?: string) {
  if (!id) return currentTerm();
  if (!Types.ObjectId.isValid(id)) throw notFound('Term');
  const t = await Term.findById(id).populate('session');
  if (!t) throw notFound('Term');
  return t;
}

export function termName(t: { number: number; session: unknown }) {
  const s = t.session as { name?: string } | null;
  return `${s?.name ?? ''} ${TERM_LABEL[t.number]} Term`.trim();
}

/** All sessions with their terms, newest first. */
export async function listSessions() {
  const sessions = await AcademicSession.find().sort({ name: -1 }).lean();
  const terms = await Term.find().sort({ number: 1 }).lean();
  return sessions.map((s) => ({
    ...s,
    terms: terms.filter((t) => String(t.session) === String(s._id)),
  }));
}
