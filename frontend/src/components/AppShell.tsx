import { useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon3D, Logo, Wordmark } from "./Brand";
import { homeFor, useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  testid: string;
}

const CUSTOMER_NAV: NavItem[] = [
  { to: "/app", label: "Início", icon: "logo", end: true, testid: "nav-inicio" },
  { to: "/app/gerar", label: "Gerar lote", icon: "gerar", testid: "nav-gerar-lote" },
  { to: "/app/lotes", label: "Meus lotes", icon: "lotes", testid: "nav-meus-lotes" },
  { to: "/app/qrcodes", label: "Meus QR Codes", icon: "qrcodes", testid: "nav-meus-qrcodes" },
  { to: "/app/exportacoes", label: "Exportações", icon: "export", testid: "nav-exportacoes" },
  { to: "/app/configuracoes", label: "Configurações", icon: "config", testid: "nav-configuracoes" },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Painel", icon: "logo", end: true, testid: "nav-admin-painel" },
  { to: "/admin/compradores", label: "Compradores", icon: "compradores", testid: "nav-admin-compradores" },
  { to: "/admin/modelos", label: "Modelos e calibração", icon: "gerar", testid: "nav-admin-modelos" },
  { to: "/admin/configuracoes", label: "Configurações", icon: "config", testid: "nav-admin-configuracoes" },
];

function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1.5">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          onClick={onNavigate}
          data-testid={it.testid}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-[background-color,color,transform] duration-200 hover:translate-x-0.5",
              isActive
                ? "bg-gradient-to-r from-blue-900/70 to-blue-900/10 text-sky-300 ring-1 ring-blue-500/30"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
            )
          }
        >
          <Icon3D name={it.icon} size={36} />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarBody({ user, items, onNavigate }: { user: User; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 px-1">
        <Logo size={40} />
        <Wordmark className="text-lg" />
      </div>
      <Nav items={items} onNavigate={onNavigate} />
      <div className="mt-auto rounded-xl border border-blue-500/15 bg-white/[0.02] p-3">
        <p className="truncate text-sm font-semibold text-white" data-testid="sidebar-user-name">{user.name}</p>
        <p className="truncate text-xs text-slate-400" data-testid="sidebar-user-email">{user.email}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-slate-300 hover:text-white"
          onClick={() => endSession("/login")}
          data-testid="logout-button"
        >
          <LogOut className="size-4" /> Sair
        </Button>
      </div>
    </div>
  );
}

function FullscreenLoader() {
  return (
    <div className="page-bg flex min-h-dvh items-center justify-center" data-testid="app-loading">
      <div className="animate-float"><Logo size={64} /></div>
    </div>
  );
}

export function AppShell({ area }: { area: "customer" | "admin" }) {
  const me = useMe(15000);
  const [open, setOpen] = useState(false);
  if (me.isPending) return <FullscreenLoader />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;
    return <GuardError />;
  }
  const user = me.data;
  if (area === "admin" && user.role !== "admin") return <Navigate to={homeFor(user)} replace />;
  if (area === "customer" && (user.role === "admin" || user.status !== "approved"))
    return <Navigate to={homeFor(user)} replace />;
  const items = area === "admin" ? ADMIN_NAV : CUSTOMER_NAV;

  return (
    <div className="page-bg min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-blue-500/10 bg-[#050C1A]/90 backdrop-blur-xl lg:block">
        <SidebarBody user={user} items={items} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-blue-500/10 bg-[#050C1A]/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} data-testid="mobile-menu-button" aria-label="Abrir menu">
          <Menu className="size-5" />
        </Button>
        <Logo size={30} />
        <Wordmark className="text-base" />
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[280px] border-blue-500/20 bg-[#050C1A] p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody user={user} items={items} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <main className="px-4 py-6 sm:px-8 lg:ml-[260px] lg:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function GuardError() {
  return (
    <div className="page-bg flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" data-testid="guard-error">
      <Logo size={56} />
      <p className="text-slate-300">Não foi possível conectar ao servidor. Verifique sua conexão.</p>
      <Button onClick={() => window.location.reload()} data-testid="guard-retry-button">Tentar novamente</Button>
    </div>
  );
}

export function PageHeader({ overline, title, description, actions }: {
  overline?: string; title: string; description?: string; actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-rise">
      <div>
        {overline && <p className="overline mb-2">{overline}</p>}
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl" data-testid="page-title">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, loading, error, testid, accent }: {
  label: string; value: number | undefined; loading: boolean; error: boolean; testid: string; accent?: boolean;
}) {
  return (
    <div className={cn("glass-card rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5", accent && "ring-1 ring-sky-400/40")} data-testid={testid}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-3 font-mono text-3xl font-medium text-cyan-200" data-testid={`${testid}-value`}>
        {loading ? <span className="inline-block h-8 w-14 animate-pulse rounded bg-white/10" /> : error ? (
          <span className="font-sans text-sm text-amber-300">Métrica indisponível</span>
        ) : (value ?? 0).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
