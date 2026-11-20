import { Types } from 'mongoose';
import { Question, Staff, Student } from '../models/index.js';
import { bad, notFound } from '../middleware/http.js';
import { questionImpact, removeQuestions } from './questionDelete.js';

type Oid = Types.ObjectId;
const S = (v: unknown) => String(v);

/** What deleting this staff member would remove. */
export async function staffImpact(id: Oid) {
  const qids = await Question.find({ teacher: id }).distinct('_id');
  return questionImpact(qids);
}

/* Delete a staff member and everything they set up: their
   questions (every term) go, and students' exams and
   report-card CBT scores are cleaned up to match — see
   removeQuestions(). */
export async function deleteStaff(id: Oid, actingAdmin: Oid) {
  if (S(id) === S(actingAdmin)) {
    throw bad('You cannot delete your own account');
  }
  const staff = await Staff.findById(id);
  if (!staff) throw notFound('Staff');
  if (staff.role === 'admin') {
    const others = await Staff.countDocuments({
      _id: { $ne: id },
      role: 'admin',
      active: true,
    });
    if (!others) throw bad('There must be at least one active admin');
  }

  const qids = await Question.find({ teacher: id }).distinct('_id');
  const result = await removeQuestions(qids);

  await Student.updateMany({ registeredBy: id }, { registeredBy: null });
  await Staff.deleteOne({ _id: id });
  return result;
}
