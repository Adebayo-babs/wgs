import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { Toaster } from './components/ui';
import { About, Apply, Contact, Home, SiteLayout } from './pages/site/Site';
import {
  ChangePassword,
  ExamLobby,
  ExamResult,
  StudentLayout,
  StudentLogin,
  StudentPassport,
  StudentReports,
  TakeExam,
} from './pages/student/Student';
import { StaffLayout, StaffLogin } from './pages/staff/shell';
import Questions from './pages/staff/Questions';
import {
  CbtResults,
  ClassSheet,
  Dashboard,
  ReportView,
  Reports,
  ScoreEntry,
} from './pages/staff/Results';
import { Students, Team } from './pages/staff/People';
import { SchoolSetup, Terms } from './pages/staff/Admin';

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="apply" element={<Apply />} />
            <Route path="contact" element={<Contact />} />
          </Route>

          <Route path="student">
            <Route index element={<StudentLogin />} />
            <Route element={<StudentLayout />}>
            <Route path="exams" element={<ExamLobby />} />
            <Route path="exams/:subjectId" element={<TakeExam />} />
            <Route path="exams/:subjectId/result" element={<ExamResult />} />
            <Route path="reports" element={<StudentReports />} />
            <Route path="passport" element={<StudentPassport />} />
            <Route path="password" element={<ChangePassword kind="student" />} />
            </Route>
          </Route>

          <Route path="staff">
            <Route index element={<StaffLogin />} />
            <Route element={<StaffLayout />}>
            <Route path="home" element={<Dashboard />} />
            <Route path="questions" element={<Questions />} />
            <Route path="cbt" element={<CbtResults />} />
            <Route path="scores" element={<ScoreEntry />} />
            <Route path="class-sheet" element={<ClassSheet />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/:studentId" element={<ReportView />} />
            <Route path="students" element={<Students />} />
            <Route path="team" element={<Team />} />
            <Route path="terms" element={<Terms />} />
            <Route path="settings" element={<SchoolSetup />} />
            <Route path="password" element={<ChangePassword kind="staff" />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
