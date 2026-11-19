export type Id = string;
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Named {
  _id: Id;
  name: string;
}

export interface SchoolClass extends Named {
  order: number;
  active: boolean;
}

export interface Subject extends Named {
  active: boolean;
}

export interface TermInfo {
  _id: Id;
  session: Id;
  number: 1 | 2 | 3;
  isCurrent: boolean;
  termEnded: string;
  nextTermBegins: string;
  daysOpened: number | null;
  publishedAt: string | null;
  delivery?: {
    running: boolean;
    sent: number;
    failed: number;
    skipped: number;
    startedAt?: string;
    finishedAt?: string;
  };
}

export interface SessionInfo {
  _id: Id;
  name: string;
  isCurrent: boolean;
  closedAt: string | null;
  terms: TermInfo[];
}

export interface StaffMe {
  id: Id;
  name: string;
  role: 'admin' | 'teacher';
  isAdmin: boolean;
  assignments: { subject: Id; class: Id }[];
  formClasses: Id[];
}

export interface Meta {
  me: StaffMe;
  classes: SchoolClass[];
  subjects: Subject[];
  sessions: SessionInfo[];
  currentTerm: null | {
    id: Id;
    number: number;
    label: string;
    session: string;
    sessionId: Id;
    publishedAt: string | null;
  };
  settings: {
    school: Record<string, string>;
    affectiveTraits: string[];
    psychomotorTraits: string[];
  };
}

export interface SubjectLine {
  subjectId: Id;
  subject: string;
  test1: number | null;
  test2: number | null;
  exam: number | null;
  examSource: 'cbt' | 'manual' | null;
  total: number;
  grade: Grade;
  remark: string;
  position: number;
  classAvg: number;
  weighted: number;
  highest: number;
  lowest: number;
  cumulative?: {
    first: number | null;
    second: number | null;
    third: number | null;
    average: number;
    grade: Grade;
  };
}

export interface Report {
  school: Record<string, string>;
  published: boolean;
  student: {
    id: Id;
    studentId: string;
    regNo: string;
    name: string;
    gender: string;
    age: number | null;
    className: string;
    hasPassport: boolean;
  };
  term: {
    id: Id;
    session: string;
    number: number;
    label: string;
    termEnded: string;
    nextTermBegins: string;
  };
  attendance: {
    opened: number | null;
    present: number | null;
    absent: number | null;
  };
  subjects: SubjectLine[];
  traits: {
    affective: { trait: string; rating: number | null }[];
    psychomotor: { trait: string; rating: number | null }[];
  };
  summary: {
    overallTotal: number;
    average: number;
    position: number;
    classCount: number;
    classAvg: number;
    highestAvg: number;
    lowestAvg: number;
    grade: Grade;
    performance: string;
  };
  cumulative: null | {
    average: number;
    position: number;
    grade: Grade;
    performance: string;
  };
  remarks: {
    adviser: string;
    formMaster: string;
    principal: string;
    generated: { adviser: boolean; formMaster: boolean; principal: boolean };
  };
}

export interface ExamReview {
  subject: string;
  score: number;
  total: number;
  breakdown: {
    question: string;
    given: string;
    givenText: string;
    correct: string;
    correctText: string;
    ok: boolean;
  }[];
}
