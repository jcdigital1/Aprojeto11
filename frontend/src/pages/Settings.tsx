import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errorMessage, useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";
import type { MessageOut } from "@/lib/types";

export function AccountCard() {
  const me = useMe();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/change-password", { current_password: cur, new_password: pw }),
    onSuccess: (r) => { toast.success(r.message); setCur(""); setPw(""); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="glass-card rounded-2xl p-6" data-testid="account-info">
        <p className="overline mb-4">Conta</p>
        <dl className="space-y-3 text-sm">
          <div><dt className="text-slate-500">Nome</dt><dd className="text-white" data-testid="account-name">{me.data?.name}</dd></div>
          <div><dt className="text-slate-500">E-mail</dt><dd className="text-white" data-testid="account-email">{me.data?.email}</dd></div>
          <div><dt className="text-slate-500">Cadastro</dt><dd className="text-white">{me.data && new Date(me.data.created_at).toLocaleDateString("pt-BR")}</dd></div>
        </dl>
        <Button variant="secondary" className="mt-6" onClick={() => endSession("/login")} data-testid="settings-logout-button">Sair da conta</Button>
      </div>
      <form className="glass-card space-y-4 rounded-2xl p-6" onSubmit={(e) => {
        e.preventDefault();
        if (pw.length < 8) return toast.error("A nova senha deve ter pelo menos 8 caracteres.");
        m.mutate();
      }}>
        <p className="overline">Alterar senha</p>
        <div className="space-y-2"><Label htmlFor="cur">Senha atual</Label>
          <Input id="cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="bg-black/30" data-testid="current-password-input" /></div>
        <div className="space-y-2"><Label htmlFor="new">Nova senha</Label>
          <Input id="new" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="bg-black/30" data-testid="new-password-input" /></div>
        <Button type="submit" className="metal-btn text-white" disabled={m.isPending} data-testid="change-password-button">
          {m.isPending && <Loader2 className="size-4 animate-spin" />} Salvar nova senha
        </Button>
      </form>
    </div>
  );
}

export default function Settings() {
  return (
    <>
      <PageHeader overline="Configurações" title="Sua conta" />
      <AccountCard />
    </>
  );
}
