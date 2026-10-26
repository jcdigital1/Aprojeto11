import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage, homeFor } from "@/lib/auth";
import { beginSession } from "@/lib/session";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const reg = useMutation({
    mutationFn: () => apiPost<User>("/auth/register", { name: f.name.trim(), email: f.email.trim(), password: f.password }),
    onSuccess: (u) => {
      beginSession();
      queryClient.setQueryData(["me"], u);
      nav(homeFor(u), { replace: true });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (f.name.trim().length < 3) return setError("Informe seu nome completo.");
    if (!EMAIL_RE.test(f.email.trim())) return setError("Informe um e-mail válido.");
    if (f.password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (f.password !== f.confirm) return setError("As senhas não coincidem.");
    reg.mutate();
  };
  const field = (id: keyof typeof f, label: string, type: string, auto: string, testid: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} autoComplete={auto} value={f[id]} onChange={set(id)} className="h-11 bg-black/30" data-testid={testid} />
    </div>
  );
  return (
    <AuthShell subtitle="Crie sua conta. O acesso é liberado após aprovação do administrador.">
      <form className="space-y-4" onSubmit={submit} data-testid="register-form">
        {field("name", "Nome completo", "text", "name", "register-name-input")}
        {field("email", "E-mail", "email", "email", "register-email-input")}
        {field("password", "Senha", "password", "new-password", "register-password-input")}
        {field("confirm", "Confirmar senha", "password", "new-password", "register-confirm-input")}
        {error && <p className="text-sm text-red-300" role="alert" data-testid="register-error">{error}</p>}
        <Button type="submit" className="metal-btn h-12 w-full text-base font-semibold tracking-[0.12em] text-white" disabled={reg.isPending} data-testid="register-submit-button">
          {reg.isPending && <Loader2 className="size-4 animate-spin" />} CADASTRAR
        </Button>
        <Link to="/login" className="block py-1 text-center text-xs font-semibold tracking-[0.12em] text-slate-400 transition-colors hover:text-white" data-testid="back-to-login-link">
          VOLTAR AO LOGIN
        </Link>
      </form>
    </AuthShell>
  );
}
