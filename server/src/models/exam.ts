import { Schema, model } from 'mongoose';

/* ── Questions ── belong to a term, so each term's exam is
   its own set. `class: null` means general (every class).
   `correct` is the index (0–3) into `options`. */
const questionSchema = new Schema(
  {
    term: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    class: { type: Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
    teacher: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    text: { type: String, required: true },
    options: {
      type: [String],
      validate: (v: string[]) => v.length === 4,
    },
    correct: { type: Number, min: 0, max: 3, required: true },
    legacyId: { type: String, default: null, index: true },
  },
  { timestamps: true },
);
questionSchema.index({ term: 1, subject: 1, class: 1 });
export const Question = model('Question', questionSchema);

/* ── Exam attempts ── one per student, term and subject.
   When a student starts, the question order and each
   question's option order are shuffled and stored here,
   so the server can map displayed choices back to the
   original options when grading. */
const itemSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    optionOrder: [Number], // optionOrder[displayIdx] = originalIdx
    answer: { type: Number, default: null }, // original index
    correct: { type: Number, required: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false },
);

const attemptSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    term: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    class: { type: Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
    items: { type: [itemSchema], default: [] },
    status: {
      type: String,
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
    },
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
attemptSchema.index({ student: 1, term: 1, subject: 1 }, { unique: true });
attemptSchema.index({ term: 1, subject: 1, class: 1 });
export const ExamAttempt = model('ExamAttempt', attemptSchema);
