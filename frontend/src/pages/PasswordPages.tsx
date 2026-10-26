import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import type { MessageOut } from "@/lib/types";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/forgot", { email: email.trim() }),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthShell subtitle="Recuperação de senha">
      {m.isSuccess ? (
        <div className="space-y-5 text-center" data-testid="forgot-success">
          <p className="text-slate-300">{m.data.message}</p>
          <Link to="/login" className="block text-xs font-semibold tracking-[0.12em] text-sky-300 hover:text-white" data-testid="back-to-login-link">VOLTAR AO LOGIN</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(""); m.mutate(); }} data-testid="forgot-form">
          <p className="text-sm text-slate-400">Informe o e-mail da sua conta. O administrador gera um link seguro de redefinição para você.</p>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-black/30" data-testid="forgot-email-input" />
          </div>
          {error && <p className="text-sm text-red-300" data-testid="forgot-error">{error}</p>}
          <Button type="submit" className="metal-btn h-12 w-full font-semibold tracking-[0.1em] text-white" disabled={m.isPending} data-testid="forgot-submit-button">
            {m.isPending && <Loader2 className="size-4 animate-spin" />} SOLICITAR REDEFINIÇÃO
          </Button>
          <Link to="/login" className="block text-center text-xs font-semibold tracking-[0.12em] text-slate-400 hover:text-white" data-testid="back-to-login-link">VOLTAR AO LOGIN</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/reset", { token, password: pw }),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthShell subtitle="Defina sua nova senha">
      {m.isSuccess ? (
        <div className="space-y-5 text-center" data-testid="reset-success">
          <p className="text-slate-300">{m.data.message}</p>
          <Link to="/login" className="metal-btn block rounded-lg py-3 text-sm font-semibold tracking-[0.12em] text-white" data-testid="reset-goto-login">ENTRAR</Link>
        </div>
      ) : (
        <form className="space-y-4" data-testid="reset-form" onSubmit={(e) => {
          e.preventDefault(); setError("");
          if (!token) return setError("Link inválido.");
          if (pw.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
          if (pw !== confirm) return setError("As senhas não coincidem.");
          m.mutate();
        }}>
          <div className="space-y-2"><Label htmlFor="pw">Nova senha</Label>
            <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11 bg-black/30" data-testid="reset-password-input" /></div>
          <div className="space-y-2"><Label htmlFor="cf">Confirmar senha</Label>
            <Input id="cf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 bg-black/30" data-testid="reset-confirm-input" /></div>
          {error && <p className="text-sm text-red-300" data-testid="reset-error">{error}</p>}
          <Button type="submit" className="metal-btn h-12 w-full font-semibold tracking-[0.1em] text-white" disabled={m.isPending} data-testid="reset-submit-button">
            {m.isPending && <Loader2 className="size-4 animate-spin" />} REDEFINIR SENHA
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
