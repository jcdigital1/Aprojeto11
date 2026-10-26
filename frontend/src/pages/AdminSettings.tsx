import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { AccountCard } from "@/pages/Settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { formatNumber } from "@/lib/render";
import type { AdminPlaque, PasswordResetRequest, ResetLink, Settings } from "@/lib/types";

function DomainCard() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiGet<Settings>("/admin/settings") });
  const [form, setForm] = useState<{ url: string; prod: boolean } | null>(null);
  const cur = form ?? (s.data ? { url: s.data.public_base_url, prod: s.data.production_confirmed } : null);
  const save = useMutation({
    mutationFn: () => apiPut<Settings>("/admin/settings", { public_base_url: cur!.url, production_confirmed: cur!.prod }),
    onSuccess: () => { toast.success("Domínio salvo com sucesso."); setForm(null); qc.invalidateQueries({ queryKey: ["admin-settings"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="glass-card space-y-4 rounded-2xl p-6" data-testid="domain-card">
      <p className="overline">Domínio dos QR Codes</p>
      <p className="text-sm text-slate-400">
        Os QR Codes codificam <span className="font-mono text-slate-300">DOMÍNIO/api/r/CÓDIGO</span>. O link é gravado em cada plaquinha no momento da emissão e nunca muda.
        Só confirme como produção um domínio estável e definitivo.
      </p>
      {s.isError && <p className="text-red-300">Erro ao carregar configurações.</p>}
      {cur && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-2">
            <Label htmlFor="base">Domínio público</Label>
            <Input id="base" value={cur.url} onChange={(e) => setForm({ ...cur, url: e.target.value })} className="bg-black/30 font-mono" data-testid="domain-url-input" />
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <Checkbox checked={cur.prod} onCheckedChange={(v) => setForm({ ...cur, prod: !!v })} data-testid="domain-production-checkbox" />
            Confirmo que este é o domínio definitivo de produção (lotes novos deixam o modo teste).
          </label>
          <Button type="submit" className="metal-btn text-white" disabled={save.isPending} data-testid="domain-save-button">
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar domínio
          </Button>
        </form>
      )}
    </div>
  );
}

function ResetRequests() {
  const r = useQuery({ queryKey: ["admin-resets"], queryFn: () => apiGet<PasswordResetRequest[]>("/admin/password-resets"), refetchInterval: 10000 });
  const [links, setLinks] = useState<Record<string, string>>({});
  const gen = useMutation({
    mutationFn: (id: string) => apiPost<ResetLink>(`/admin/password-resets/${id}/link`),
    onSuccess: (l, id) => { setLinks((s) => ({ ...s, [id]: l.link })); toast.success("Link gerado (válido por 2 horas)."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="glass-card space-y-4 rounded-2xl p-6" data-testid="reset-requests-card">
      <p className="overline">Pedidos de redefinição de senha</p>
      {r.isError && <p className="text-red-300">Erro ao carregar pedidos.</p>}
      {r.data?.length === 0 && <p className="text-sm text-slate-400" data-testid="reset-requests-empty">Nenhum pedido em aberto.</p>}
      {r.data?.map((p) => (
        <div key={p.id} className="space-y-2 rounded-xl border border-blue-500/15 p-3" data-testid={`reset-request-${p.email}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><p className="truncate text-sm text-white">{p.name}</p><p className="truncate text-xs text-slate-400">{p.email}</p></div>
            <Button size="sm" variant="secondary" disabled={gen.isPending} onClick={() => gen.mutate(p.id)} data-testid={`reset-generate-${p.email}`}><Link2 className="size-4" /> Gerar link</Button>
          </div>
          {links[p.id] && (
            <div className="flex items-center gap-2">
              <Input readOnly value={links[p.id]} className="h-8 bg-black/30 font-mono text-xs" data-testid={`reset-link-${p.email}`} />
              <Button size="icon-sm" variant="secondary" aria-label="Copiar" onClick={() => navigator.clipboard.writeText(links[p.id]).then(() => toast.success("Link copiado."))} data-testid={`reset-copy-${p.email}`}><Copy className="size-4" /></Button>
            </div>
          )}
        </div>
      ))}
      <p className="text-xs text-slate-500">Envie o link ao comprador pelo canal de sua preferência. Nenhum e-mail é enviado automaticamente.</p>
    </div>
  );
}

function PlaqueControl() {
  const qc = useQueryClient();
  const [num, setNum] = useState("");
  const [query, setQuery] = useState(0);
  const r = useQuery({ queryKey: ["admin-plaque", query], queryFn: () => apiGet<AdminPlaque[]>(`/admin/plaques?number=${query}`), enabled: query > 0 });
  const toggle = useMutation({
    mutationFn: (id: string) => apiPost<AdminPlaque>(`/admin/plaques/${id}/toggle`),
    onSuccess: (p) => { toast.success(p.disabled ? "QR Code desativado." : "QR Code reativado."); qc.invalidateQueries({ queryKey: ["admin-plaque"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="glass-card space-y-4 rounded-2xl p-6" data-testid="plaque-control-card">
      <p className="overline">Desativar / reativar QR Code</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseInt(num, 10); if (n > 0) setQuery(n); }}>
        <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Número da plaquinha" className="bg-black/30 font-mono" data-testid="admin-plaque-search-input" />
        <Button type="submit" variant="secondary" data-testid="admin-plaque-search-button"><Search className="size-4" /></Button>
      </form>
      {r.isError && <p className="text-red-300">Erro na busca.</p>}
      {r.data?.length === 0 && <p className="text-sm text-slate-400">Nenhuma plaquinha com esse número.</p>}
      {r.data?.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/15 p-3" data-testid={`admin-plaque-${p.number}`}>
          <div className="min-w-0 text-sm">
            <p className="font-mono text-cyan-200">Nº {formatNumber(p.number)}</p>
            <p className="truncate text-xs text-slate-400">{p.owner_email} · {p.batch_name} · {p.scan_count} leitura(s)</p>
          </div>
          <Button size="sm" variant={p.disabled ? "default" : "destructive"} disabled={toggle.isPending} onClick={() => toggle.mutate(p.id)} data-testid={`admin-plaque-toggle-${p.number}`}>
            {p.disabled ? "Reativar" : "Desativar"}
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function AdminSettings() {
  return (
    <>
      <PageHeader overline="Configurações" title="Configurações da plataforma" />
      <div className="grid gap-6 lg:grid-cols-2">
        <DomainCard />
        <ResetRequests />
        <PlaqueControl />
      </div>
      <div className="mt-6"><AccountCard /></div>
    </>
  );
}
