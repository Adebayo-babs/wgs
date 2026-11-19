# WITH GOD Schools — School Management System

React + Node.js + MongoDB rebuild of the old Google Apps Script LMS.

```
client/   React 19 + Vite + TypeScript + Tailwind  → Vercel
server/   Express 5 + Mongoose + TypeScript        → Render
```

## What it does

**Students** sign in with their ID and password, sit CBT exams one subject at a
time, see their answers after submitting, view and download report cards once
a term is published, and upload a passport photo.

**Teachers** are assigned subject + class pairs and, optionally, form classes.
Subject teachers set questions (one at a time, CSV upload, or pasted text),
see CBT results and enter Test 1 / Test 2. Form teachers enter attendance,
affective/psychomotor ratings and remarks for their class.

**Admin** creates every account (no self-signup), manages classes, subjects,
terms and settings, publishes results and closes the session.

### The automated parts

| What | How |
|---|---|
| CBT → report card | On submit, the score is scaled to 60 and written to the Exam column. A score typed by a teacher is never overwritten. Resetting an attempt removes the CBT score again. |
| Shuffling | Question order and option order are shuffled per student when they start. The order is saved, so a refresh shows the same paper. |
| Positions & stats | Subject position, class average, median ("weighted"), highest, lowest, overall average and class position are calculated live from the scores. Ties share a position (1, 2, 2, 4). |
| Remarks | Blank remarks are filled from a remark bank by grade (editable in School setup). Typed remarks always win. Each student always gets the same variant, but classmates get different ones. |
| Cumulative 3rd term | Third-term reports add 1st Term, 2nd Term and Cumulative Average columns plus a cumulative position. |
| Parent delivery | Publishing a term emails every parent their child's PDF report plus a signed link (valid 120 days). Delivery status is tracked per student, with a retry. Each report card also has a "Send on WhatsApp" button. |
| Promotion | "End session" lists every student with a suggested action (promote / repeat / graduate). The admin confirms, students move up, and the next session opens on 1st Term. |
| Locking | Publishing locks score entry for teachers. The admin can still edit, or unpublish. |

## Local setup

Needs Node 20+ and a MongoDB (local, or a free Atlas M0 cluster).

```bash
npm install
cp server/.env.example server/.env      # fill in MONGODB_URI, JWT_SECRET, ADMIN_*
npm run create-admin -w server          # the one admin account
npm run migrate -- /path/to/WITH_GOD_SCHOOLS.xlsx --fresh
npm run dev:server                      # http://localhost:4000
npm run dev:client                      # http://localhost:5173
```

## Moving the old data across

1. In the Google Sheet: **File → Download → Microsoft Excel (.xlsx)**.
2. Run `npm run migrate -- ./WITH_GOD_SCHOOLS.xlsx --fresh`.

It prints a summary, every teacher's new username, and anything it could not
place. Against the current sheet it imports 131 students (120 with photos),
2,098 questions, 1,452 CBT attempts and 126 term results, all into
**2025/2026 3rd Term**.

- **Passwords carry over.** Students keep their password. Teachers sign in with
  the printed username, and their password is their old PIN. Old hashes are
  checked once and replaced with bcrypt on first login.
- **One admin.** The three old Admin logins (Ademiju, Mrs. Adenike Ademiju,
  Ade) are not imported. The admin comes from `npm run create-admin`.
- **Teacher assignments** are worked out from the questions each teacher set,
  so most teachers can start straight away. Bello, Ben and Ubah P.C. have
  none yet. Nobody is a form teacher yet; set that in Staff.
- **"Bayo"** owns 14 questions but had no account. He's added as an inactive
  teacher so the questions keep an owner.
- **Subjects are not merged** where students have scores under both
  spellings: "Basic science"/"Basic Science" (14 students),
  "Quantitative"/"Quantitative Reasoning" (9) and "Work Number"/"Number Work"
  (13) each have different scores. Rename them in School setup once you know
  what they are. Only "Health Habit" and "Civic-Education" were merged.
- **Skipped:** one test question with class "Medium", 51 answer rows for
  students or questions that no longer exist, and one score row for an
  unknown student. Student WGS234567 has no class.
- **Primary 6** is in the class list (the website's class guide mentions it),
  so Primary 5 promotes into it. Turn it off in School setup if the school
  goes straight to JSS 1.

## Deploying (free tiers)

**Database: MongoDB Atlas M0.** Create a cluster, add a database user, allow
access from anywhere (`0.0.0.0/0`, since Render's IPs change), and copy the
connection string.

**API: Render.** `render.yaml` is included, so use "New → Blueprint" on
the repo. Then set these in the dashboard:

- `MONGODB_URI`, `JWT_SECRET` (long random string)
- `CLIENT_URL` = your Vercel URL (comma-separate several)
- `API_URL` = the Render URL (used in parent report links)
- `SMTP_*` and `MAIL_FROM` for email. Gmail works with an App Password
  (about 500 emails/day). Brevo's free tier allows 300/day.

Then run `npm run create-admin -w server` and the migration once, from your
own machine with the Atlas `MONGODB_URI` in `server/.env`.

Free Render services sleep after 15 minutes of inactivity, so the first
request after that takes up to a minute. Open the site a minute before a CBT
session starts.

**Client: Vercel.** Import the repo, set the root directory to `client`, and
set `VITE_API_URL` to the Render URL. `vercel.json` handles page refreshes on
deep links.

## Project layout

```
server/src/
  models/        Mongoose schemas (academic, people, exam, result, settings)
  services/
    results.ts   positions, class stats, cumulative, auto remarks
    cbt.ts       shuffled exams, grading, CBT → report card
    reportPdf.tsx  PDF report card (@react-pdf/renderer)
    publish.ts   publishing, parent emails, signed report links
    promotion.ts end-of-session promotion
  routes/        REST endpoints (auth, student, staff, questions, ...)
  scripts/       migrate.ts, createAdmin.ts

client/src/
  pages/site/    public website
  pages/student/ student portal
  pages/staff/   staff portal (shell, Questions, Results, People, Admin)
  components/    ReportCard, shared UI
```
