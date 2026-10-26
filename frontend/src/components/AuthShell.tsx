import type { ReactNode } from "react";
import { Logo, Wordmark } from "./Brand";

export default function AuthShell({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="page-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/15 blur-[120px]" />
      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="mb-7 flex flex-col items-center gap-4">
          <div className="animate-float">
            <Logo size={92} />
          </div>
          <h1 className="text-3xl" data-testid="app-title">
            <Wordmark />
          </h1>
          {subtitle && <p className="text-center text-sm text-slate-400">{subtitle}</p>}
        </div>
        <div className="glass-card relative overflow-hidden rounded-2xl p-7 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(37,99,235,0.2)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
          {children}
        </div>
      </div>
    </div>
  );
}
