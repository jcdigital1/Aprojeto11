import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Clock, ShieldOff } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Logo, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { homeFor, useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";

export function RootRedirect() {
  const me = useMe();
  if (me.isPending) return <div className="page-bg min-h-dvh" />;
  if (me.data) return <Navigate to={homeFor(me.data)} replace />;
  return <Navigate to="/login" replace />;
}

// Pending / blocked gate. Polls the server so approval unlocks the dashboard without re-login.
export function Pending() {
  const me = useMe(4000);
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;
  if (me.data && (me.data.role === "admin" || me.data.status === "approved")) return <Navigate to={homeFor(me.data)} replace />;
  const blocked = me.data?.status === "blocked";
  return (
    <AuthShell>
      <div className="space-y-5 text-center" data-testid={blocked ? "blocked-screen" : "pending-screen"}>
        <div className={`mx-auto flex size-16 items-center justify-center rounded-2xl ring-1 ${blocked ? "bg-amber-400/10 ring-amber-400/30" : "bg-sky-400/10 ring-sky-400/30"}`}>
          {blocked ? <ShieldOff className="size-8 text-amber-300" /> : <Clock className="size-8 animate-pulse text-sky-300" />}
        </div>
        <h2 className="font-heading text-2xl font-semibold text-white" data-testid="gate-title">
          {blocked ? "Conta bloqueada" : "Aguardando aprovação"}
        </h2>
        <p className="text-sm text-slate-400">
          {blocked
            ? "Seu acesso foi bloqueado pelo administrador. Seus dados continuam salvos. Entre em contato para reativação."
            : "Seu cadastro foi recebido. Assim que o administrador aprovar, seu painel será liberado automaticamente nesta tela."}
        </p>
        {me.data && <p className="font-mono text-xs text-slate-500" data-testid="gate-email">{me.data.email}</p>}
        <Button variant="secondary" className="w-full" onClick={() => endSession("/login")} data-testid="gate-logout-button">Sair</Button>
      </div>
    </AuthShell>
  );
}

const REASONS: Record<string, { title: string; text: string }> = {
  "nao-configurado": { title: "Plaquinha ainda não configurada", text: "O proprietário ainda não definiu o destino deste QR Code." },
  desativado: { title: "QR Code desativado", text: "Este QR Code foi desativado pelo administrador da plataforma." },
  "nao-encontrado": { title: "QR Code não encontrado", text: "Este código não corresponde a nenhuma plaquinha ativa." },
};

export function Unavailable() {
  const [params] = useSearchParams();
  const r = REASONS[params.get("motivo") ?? ""] ?? REASONS["nao-encontrado"];
  const n = params.get("n");
  return (
    <div className="page-bg flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center" data-testid="qr-unavailable-page">
      <Logo size={64} />
      <Wordmark className="text-xl" />
      <h1 className="font-heading text-2xl font-semibold text-white" data-testid="qr-unavailable-title">{r.title}</h1>
      <p className="max-w-sm text-slate-400">{r.text}</p>
      {n && <p className="font-mono text-sm text-cyan-300">Nº {n.padStart(6, "0")}</p>}
    </div>
  );
}

// Fallback for /r/:code links: forward to the server-side redirect.
export function ForwardRedirect() {
  const { code } = useParams();
  if (code) window.location.replace(`/api/r/${encodeURIComponent(code)}`);
  return <div className="page-bg min-h-dvh" />;
}
