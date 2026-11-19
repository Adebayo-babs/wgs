/* Thin fetch wrapper. Staff and student sessions are kept
   apart, so one browser can hold either (or both). */
export type Kind = 'staff' | 'student';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const KEY: Record<Kind, string> = {
  staff: 'wgs_staff_session',
  student: 'wgs_student_session',
};

export interface Session<U = Record<string, unknown>> {
  token: string;
  user: U;
}

export function getSession<U>(kind: Kind): Session<U> | null {
  try {
    const raw = localStorage.getItem(KEY[kind]);
    return raw ? (JSON.parse(raw) as Session<U>) : null;
  } catch {
    return null;
  }
}

export function setSession(kind: Kind, s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY[kind], JSON.stringify(s));
    else localStorage.removeItem(KEY[kind]);
  } catch {
    /* storage unavailable — session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Opts = {
  method?: string;
  body?: unknown;
  as?: Kind; // which session's token to send
};

async function raw(path: string, opts: Opts = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const s = opts.as ? getSession(opts.as) : null;
  if (s) headers.Authorization = `Bearer ${s.token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }
  if (res.status === 401 && opts.as) {
    setSession(opts.as, null);
    window.dispatchEvent(new Event('wgs-logout'));
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: Opts = {}) {
  const res = await raw(path, opts);
  return (await res.json()) as T;
}

/** Fetch a file (PDF, image) with auth and return a Blob. */
export async function apiBlob(path: string, as?: Kind) {
  const res = await raw(path, { as });
  return res.blob();
}

export async function downloadFile(path: string, filename: string, as: Kind) {
  const blob = await apiBlob(path, as);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const staffApi = <T = unknown>(path: string, o: Omit<Opts, 'as'> = {}) =>
  api<T>(path, { ...o, as: 'staff' });

export const studentApi = <T = unknown>(
  path: string,
  o: Omit<Opts, 'as'> = {},
) => api<T>(path, { ...o, as: 'student' });
