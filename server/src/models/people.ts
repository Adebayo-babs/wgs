import { Schema, model, Types } from 'mongoose';

/* ── Staff ── Admin creates every account. Teachers are
   assigned subject + class pairs (what they set questions
   and enter scores for) and optionally form classes (where
   they enter traits, attendance and remarks). */
const assignmentSchema = new Schema(
  {
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    class: { type: Schema.Types.ObjectId, ref: 'SchoolClass', required: true },
  },
  { _id: false },
);

const staffSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, default: null },
    legacyHash: { type: String, default: null, select: false },
    role: { type: String, enum: ['admin', 'teacher'], default: 'teacher' },
    assignments: { type: [assignmentSchema], default: [] },
    formClasses: [{ type: Schema.Types.ObjectId, ref: 'SchoolClass' }],
    active: { type: Boolean, default: true },
    legacyName: { type: String, default: null }, // name in the old sheet
  },
  { timestamps: true },
);
export const Staff = model('Staff', staffSchema);

/* ── Students ── */
const studentSchema = new Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    regNo: { type: String, default: '' },
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['M', 'F', ''], default: '' },
    age: { type: Number, default: null },
    class: { type: Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
    status: {
      type: String,
      enum: ['active', 'graduated', 'withdrawn'],
      default: 'active',
    },
    passwordHash: { type: String, default: null, select: false },
    legacyHash: { type: String, default: null, select: false },
    parent: {
      name: { type: String, default: '' },
      email: { type: String, default: '', lowercase: true, trim: true },
      phone: { type: String, default: '' },
    },
    hasPassport: { type: Boolean, default: false },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  { timestamps: true },
);
studentSchema.index({ class: 1, status: 1 });
export const Student = model('Student', studentSchema);

/* Passport photos live in their own collection so student
   lists never drag image bytes along. Photos are resized
   on the client to ~300px, so each is a few dozen KB. */
const passportSchema = new Schema(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
    },
    data: { type: Buffer, required: true },
    contentType: { type: String, default: 'image/jpeg' },
  },
  { timestamps: true },
);
export const Passport = model('Passport', passportSchema);

export type Id = Types.ObjectId | string;
