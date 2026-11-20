import { Schema, model } from 'mongoose';

export const DEFAULT_AFFECTIVE = [
  'Punctuality', 'Mental Alertness', 'Behaviour', 'Reliability',
  'Attentiveness', 'Respect', 'Neatness', 'Politeness', 'Honesty',
  'Relationship With Staff', 'Relationship With Students',
  'Self Control', 'Spirit of Teamwork', 'Initiatives',
  'Organizational Ability', 'Attitude to School',
];

export const DEFAULT_PSYCHOMOTOR = [
  'Handwriting', 'Reading', 'Verbal Fluency Diction', 'Musical Skills',
  'Creative Arts', 'Physical Education', 'General Reasoning',
];

/* Remark bank for auto-generated remarks, keyed by the
   grade of the student's average. Several variants per
   grade so a class doesn't get 30 identical comments; each
   student always gets the same variant (stable by ID). */
export const DEFAULT_REMARKS = {
  formMaster: {
    A: [
      'An excellent result. Keep up the good work.',
      'Outstanding performance this term. Well done.',
      'A brilliant term. You are a pride to the class.',
    ],
    B: [
      'A very good result. You can reach the top with more effort.',
      'Very good performance. Keep pushing higher.',
    ],
    C: [
      'A good result, but there is room for improvement.',
      'Good effort. Work harder to do even better next term.',
    ],
    D: [
      'A fair result. You need to put in more effort.',
      'You passed, but you can do much better. Study harder.',
    ],
    E: [
      'A poor result. You must sit up and study harder.',
      'This result is below expectation. More effort is needed.',
    ],
    F: [
      'A very poor result. Please see me for guidance.',
      'You need serious improvement. Parents should see the class teacher.',
    ],
  },
  principal: {
    A: ['Excellent result. Keep it up.', 'Superb performance. Well done.'],
    B: ['Very good result. Aim higher.', 'Very good. Keep it up.'],
    C: ['Good result. You can do better.', 'Good. Strive for excellence.'],
    D: ['Fair result. Put in more effort.', 'More effort is required.'],
    E: ['Poor result. Work much harder.', 'Below average. Sit up.'],
    F: [
      'Very poor result. Parents should see the principal.',
      'Unsatisfactory. Serious improvement is needed.',
    ],
  },
  adviser: {
    A: ['Maintain your excellent study habits.'],
    B: ['Focus on your weaker subjects to reach the top.'],
    C: ['Create a regular study timetable and stick to it.'],
    D: ['Spend more time on your books and ask questions in class.'],
    E: ['You need extra lessons and closer supervision at home.'],
    F: ['Urgent academic support is needed. Please see the school.'],
  },
};

const settingsSchema = new Schema(
  {
    key: { type: String, default: 'school', unique: true },
    school: {
      name: { type: String, default: 'WITH GOD SCHOOLS (NUR., PRY. & SEC.)' },
      shortName: { type: String, default: 'WITH GOD Schools' },
      motto: { type: String, default: 'God Is Our Strength' },
      address: { type: String, default: '9, Olowora Street, Igando, Lagos.' },
      phone: { type: String, default: '08189860086' },
      email: { type: String, default: '' },
    },
    affectiveTraits: { type: [String], default: DEFAULT_AFFECTIVE },
    psychomotorTraits: { type: [String], default: DEFAULT_PSYCHOMOTOR },
    remarks: { type: Schema.Types.Mixed, default: DEFAULT_REMARKS },
    // Promotion: students whose cumulative average is below
    // this are suggested to repeat. 0 = promote everyone.
    repeatBelow: { type: Number, default: 0 },
    emailReportsOnPublish: { type: Boolean, default: true },
    // Open each term on its start date, publishing the
    // outgoing term and promoting students at session end.
    autoAdvance: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false },
);
export const Settings = model('Settings', settingsSchema);

export async function getSettings() {
  const s = await Settings.findOne({ key: 'school' });
  if (s) return s;
  return Settings.create({ key: 'school' });
}

/* What the automation did and when, shown on the Terms
   page so the admin can see it. */
const automationLogSchema = new Schema(
  {
    action: { type: String, required: true },
    detail: { type: String, default: '' },
    ok: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const AutomationLog = model('AutomationLog', automationLogSchema);
