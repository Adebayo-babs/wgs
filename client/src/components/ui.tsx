import { useEffect, useState, type ReactNode } from 'react';
import { apiBlob, type Kind } from '../api/client';

/* ── Toasts ── */
type Toast = { id: number; msg: string; type: 'ok' | 'err' | 'info' };
let push: (t: Omit<Toast, 'id'>) => void = () => {};

export const toast = {
  ok: (msg: string) => push({ msg, type: 'ok' }),
  err: (e: unknown) =>
    push({ msg: e instanceof Error ? e.message : String(e), type: 'err' }),
  info: (msg: string) => push({ msg, type: 'info' }),
};

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setList((l) => [...l, { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4000);
    };
  }, []);
  const color = {
    ok: 'bg-emerald-700',
    err: 'bg-red-700',
    info: 'bg-navy',
  };
  return (
    <div className="no-print fixed right-4 bottom-4 z-[100] flex flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={`${color[t.type]} max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-navy" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function PageHead(p: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold">{p.title}</h2>
        {p.sub && <p className="mt-1 text-sm text-slate-500">{p.sub}</p>}
      </div>
      {p.actions && <div className="flex flex-wrap gap-2">{p.actions}</div>}
    </div>
  );
}

export function Modal(p: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [p]);
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={p.onClose}
    >
      <div
        className={`my-8 w-full ${p.wide ? 'max-w-5xl' : 'max-w-lg'} rounded-xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-lg font-bold">{p.title}</h3>
          <button className="text-2xl text-slate-400 hover:text-slate-700" onClick={p.onClose}>
            ×
          </button>
        </div>
        <div className="p-5">{p.children}</div>
      </div>
    </div>
  );
}

export function Field(p: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{p.label}</span>
      {p.children}
      {p.hint && <span className="mt-1 block text-xs text-slate-400">{p.hint}</span>}
    </label>
  );
}

/** <img> for endpoints that need the auth header. */
export function AuthImage(p: {
  path: string | null;
  as: Kind;
  className?: string;
  fallback?: ReactNode;
  version?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!p.path) {
      setUrl(null);
      return;
    }
    let u: string | null = null;
    let live = true;
    apiBlob(p.path, p.as)
      .then((b) => {
        if (!live) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [p.path, p.as, p.version]);
  if (!url) return <>{p.fallback ?? null}</>;
  return <img src={url} alt="" className={p.className} />;
}
