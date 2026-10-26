import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Batch, Template } from "@/lib/types";

const QUANTITIES = [10, 30, 50, 100];

export default function Generate() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => apiGet<Template[]>("/templates") });
  const [templateId, setTemplateId] = useState("");
  const [qty, setQty] = useState(10);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const idem = useRef(crypto.randomUUID()); // same key for retries/double clicks of one intent

  const gen = useMutation({
    mutationFn: () => apiPost<Batch>("/batches", { template_id: templateId, quantity: qty, name: name.trim() || null, idempotency_key: idem.current }),
    onSuccess: (b) => {
      idem.current = crypto.randomUUID();
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      toast.success(`Lote criado: Nº ${String(b.number_start).padStart(6, "0")} a ${String(b.number_end).padStart(6, "0")}.`);
      nav(`/app/lotes/${b.id}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <>
      <PageHeader overline="Gerar lote" title="Novo lote de plaquinhas" description="Cada plaquinha recebe um número único e um QR Code dinâmico permanente." />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section>
          <p className="overline mb-3">1. Escolher modelo</p>
          {templates.isError && <p className="text-sm text-red-300" data-testid="templates-error">Não foi possível carregar os modelos.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="template-picker">
            {templates.isPending && Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/5" />)}
            {templates.data?.map((t) => {
              const sel = t.id === templateId;
              return (
                <button key={t.id} type="button" disabled={!t.production_ready} onClick={() => setTemplateId(t.id)}
                  data-testid={`template-option-${t.id}`}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border bg-[#0A1224] p-1.5 text-left transition-[transform,border-color,box-shadow] duration-200",
                    sel ? "border-sky-400 shadow-[0_0_24px_rgba(0,229,255,0.35)]" : "border-blue-500/20 hover:-translate-y-0.5 hover:border-sky-400/50",
                    !t.production_ready && "cursor-not-allowed opacity-40",
                  )}>
                  <img src={t.original_url} alt={t.name} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                  <p className="truncate px-1 pt-1.5 text-xs text-slate-300">{t.name}</p>
                  {!t.production_ready && <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-amber-300">Em calibração</span>}
                  {sel && <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-sky-400 text-[#030A16]"><Check className="size-4" /></span>}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="glass-card h-fit rounded-2xl p-6 lg:sticky lg:top-8">
          <form className="space-y-5" onSubmit={(e) => {
            e.preventDefault(); setError("");
            if (!templateId) return setError("Escolha um modelo.");
            if (!Number.isInteger(qty) || qty < 1 || qty > 200) return setError("Quantidade deve ser entre 1 e 200.");
            gen.mutate();
          }}>
            <div>
              <p className="overline mb-3">2. Quantidade</p>
              <div className="grid grid-cols-4 gap-2">
                {QUANTITIES.map((q) => (
                  <button key={q} type="button" onClick={() => setQty(q)} data-testid={`quantity-option-${q}`}
                    className={cn("rounded-lg border py-2.5 font-mono text-sm transition-colors duration-150",
                      qty === q ? "border-sky-400 bg-sky-400/10 text-sky-200" : "border-blue-500/20 text-slate-300 hover:border-sky-400/50")}>
                    {q}
                  </button>
                ))}
              </div>
              <Input type="number" min={1} max={200} value={qty} onChange={(e) => setQty(Number(e.target.value))}
                className="mt-2 bg-black/30 font-mono" data-testid="quantity-input" aria-label="Quantidade personalizada" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-name">Nome do lote <span className="text-slate-500">(opcional)</span></Label>
              <Input id="batch-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Restaurante Centro" className="bg-black/30" data-testid="batch-name-input" />
            </div>
            {error && <p className="text-sm text-red-300" data-testid="generate-error">{error}</p>}
            <Button type="submit" className="metal-btn h-12 w-full text-base font-semibold tracking-[0.12em] text-white" disabled={gen.isPending} data-testid="generate-batch-button">
              {gen.isPending ? <><Loader2 className="size-4 animate-spin" /> Reservando números…</> : "GERAR LOTE"}
            </Button>
            <p className="text-xs text-slate-500">Nenhum PDF é gerado agora: os arquivos são criados apenas quando você clicar em baixar.</p>
          </form>
        </aside>
      </div>
    </>
  );
}
