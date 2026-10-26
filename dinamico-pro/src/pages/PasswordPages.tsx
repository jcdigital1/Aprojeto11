import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { confirmPasswordReset, sendPasswordResetEmail } from "firebase/auth";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase";
import { errorMessage } from "@/lib/auth";
import { FirebaseError } from "firebase/app";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      try {
        await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login` });
      } catch (e) {
        // Never reveal whether an e-mail exists.
        if (!(e instanceof FirebaseError && e.code === "auth/user-not-found")) throw e;
      }
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthShell subtitle="Recuperação de senha">
      {m.isSuccess ? (
        <div className="space-y-5 text-center" data-testid="forgot-success">
          <p className="text-slate-300">Se o e-mail estiver cadastrado, você receberá em instantes um link para criar uma nova senha. Verifique também a caixa de spam.</p>
          <Link to="/login" className="block text-xs font-semibold tracking-[0.12em] text-sky-300 hover:text-white" data-testid="back-to-login-link">VOLTAR AO LOGIN</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault(); setError("");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Informe um e-mail válido.");
          m.mutate();
        }} data-testid="forgot-form">
          <p className="text-sm text-slate-400">Informe o e-mail da sua conta. Enviaremos um link seguro para você criar uma nova senha.</p>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-black/30" data-testid="forgot-email-input" />
          </div>
          {error && <p className="text-sm text-red-300" data-testid="forgot-error">{error}</p>}
          <Button type="submit" className="metal-btn h-12 w-full font-semibold tracking-[0.1em] text-white" disabled={m.isPending} data-testid="forgot-submit-button">
            {m.isPending && <Loader2 className="size-4 animate-spin" />} ENVIAR LINK
          </Button>
          <Link to="/login" className="block text-center text-xs font-semibold tracking-[0.12em] text-slate-400 hover:text-white" data-testid="back-to-login-link">VOLTAR AO LOGIN</Link>
        </form>
      )}
    </AuthShell>
  );
}

// Optional custom action page: set Firebase → Authentication → Templates → "Customizar URL de ação"
// to https://SEU-DOMINIO/redefinir-senha. Without it, Firebase's own hosted page is used.
export function ResetPassword() {
  const [params] = useSearchParams();
  const code = params.get("oobCode") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => confirmPasswordReset(auth, code, pw),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthShell subtitle="Defina sua nova senha">
      {m.isSuccess ? (
        <div className="space-y-5 text-center" data-testid="reset-success">
          <p className="text-slate-300">Senha redefinida com sucesso. Faça login com a nova senha.</p>
          <Link to="/login" className="metal-btn block rounded-lg py-3 text-sm font-semibold tracking-[0.12em] text-white" data-testid="reset-goto-login">ENTRAR</Link>
        </div>
      ) : (
        <form className="space-y-4" data-testid="reset-form" onSubmit={(e) => {
          e.preventDefault(); setError("");
          if (!code) return setError("Link inválido. Solicite um novo.");
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
