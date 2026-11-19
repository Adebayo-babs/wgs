import { Schema, model, type InferSchemaType } from 'mongoose';

/* ── Classes ── `order` drives promotion: a student moves
   to the class with the next-highest order. The class with
   the highest order graduates. */
const classSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    order: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type SchoolClassDoc = InferSchemaType<typeof classSchema>;
export const SchoolClass = model('SchoolClass', classSchema);

/* ── Subjects ── one catalogue for the whole school, so
   names stay consistent ("Basic Science", not three
   spellings of it). */
const subjectSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Subject = model('Subject', subjectSchema);

/* ── Academic sessions and terms ── */
const sessionSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // 2025/2026
    isCurrent: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export const AcademicSession = model('AcademicSession', sessionSchema);

const deliverySchema = new Schema(
  {
    running: { type: Boolean, default: false },
    startedAt: Date,
    finishedAt: Date,
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { _id: false },
);

const termSchema = new Schema(
  {
    session: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession',
      required: true,
    },
    number: { type: Number, enum: [1, 2, 3], required: true },
    isCurrent: { type: Boolean, default: false },
    termEnded: { type: String, default: '' },
    nextTermBegins: { type: String, default: '' },
    daysOpened: { type: Number, default: null },
    publishedAt: { type: Date, default: null },
    delivery: { type: deliverySchema, default: () => ({}) },
  },
  { timestamps: true },
);
termSchema.index({ session: 1, number: 1 }, { unique: true });
export const Term = model('Term', termSchema);

export const TERM_LABEL: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
};
