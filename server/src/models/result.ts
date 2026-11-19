import { Schema, model } from 'mongoose';

/* One record per student per term. This is what the report
   card is built from. History is kept for every term, so
   third-term cumulative results and past reports work. */
const scoreSchema = new Schema(
  {
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    test1: { type: Number, default: null },
    test2: { type: Number, default: null },
    exam: { type: Number, default: null },
    // 'cbt'    = filled from the student's CBT exam
    // 'manual' = typed by staff; CBT will not overwrite it
    examSource: {
      type: String,
      enum: ['cbt', 'manual', null],
      default: null,
    },
  },
  { _id: false },
);

const traitSchema = new Schema(
  {
    category: {
      type: String,
      enum: ['Affective', 'Psychomotor'],
      required: true,
    },
    trait: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, default: null },
  },
  { _id: false },
);

const termResultSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    term: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    // Class the student was in for this term (kept even
    // after promotion moves them on)
    class: { type: Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
    scores: { type: [scoreSchema], default: [] },
    traits: { type: [traitSchema], default: [] },
    daysPresent: { type: Number, default: null },
    daysAbsent: { type: Number, default: null },
    // Typed remarks override the generated ones. Leave a
    // remark blank and the report card writes one.
    remarks: {
      adviser: { type: String, default: '' },
      formMaster: { type: String, default: '' },
      principal: { type: String, default: '' },
    },
    delivery: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'skipped', null],
        default: null,
      },
      at: { type: Date, default: null },
      error: { type: String, default: '' },
    },
  },
  { timestamps: true },
);
termResultSchema.index({ student: 1, term: 1 }, { unique: true });
termResultSchema.index({ term: 1, class: 1 });
export const TermResult = model('TermResult', termResultSchema);
