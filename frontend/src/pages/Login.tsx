import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage, homeFor, useMe } from "@/lib/auth";
import { beginSession } from "@/lib/session";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@/lib/types";

export default function Login() {
  const me = useMe();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useMutation({
    mutationFn: () => apiPost<User>("/auth/login", { email: email.trim(), password }),
    onSuccess: (u) => {
      beginSession();
      queryClient.setQueryData(["me"], u);
      nav(homeFor(u), { replace: true });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (me.data) return <Navigate to={homeFor(me.data)} replace />;

  return (
    <AuthShell>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (!email.trim() || !password) return setError("Preencha e-mail e senha.");
          login.mutate();
        }}
        data-testid="login-form"
      >
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-11 bg-black/30" placeholder="voce@empresa.com.br" data-testid="login-email-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className="h-11 bg-black/30" placeholder="••••••••"
            data-testid="login-password-input" />
        </div>
        {error && <p className="text-sm text-red-300" role="alert" data-testid="login-error">{error}</p>}
        <Button type="submit" className="metal-btn relative h-12 w-full overflow-hidden text-base font-semibold tracking-[0.12em] text-white"
          disabled={login.isPending} data-testid="login-submit-button">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-sheen" />
          {login.isPending && <Loader2 className="size-4 animate-spin" />} ENTRAR
        </Button>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Link to="/cadastro" className="flex-1 rounded-lg border border-blue-500/30 py-2.5 text-center text-xs font-semibold tracking-[0.12em] text-sky-300 transition-colors hover:border-sky-400 hover:bg-sky-400/5" data-testid="goto-register-link">
            CRIAR CONTA
          </Link>
          <Link to="/esqueci-senha" className="flex-1 rounded-lg py-2.5 text-center text-xs font-semibold tracking-[0.12em] text-slate-400 transition-colors hover:text-white" data-testid="goto-forgot-link">
            ESQUECI MINHA SENHA
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
