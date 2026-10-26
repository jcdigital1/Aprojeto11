import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Pencil, Search } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DestinationDialog } from "@/components/Plaques";
import PlaqueCanvas from "@/components/PlaqueCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { exportPng, formatNumber, inputFromPlaque } from "@/lib/render";
import type { Batch, Plaque, PlaquePage } from "@/lib/types";

const PAGE_SIZE = 20;

export default function QrCodes() {
  const [params, setParams] = useSearchParams();
  const batchId = params.get("lote") ?? "";
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Plaque | null>(null);
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => apiGet<Batch[]>("/batches") });
  const q = useQuery({
    queryKey: ["plaques", search, batchId, page],
    queryFn: () => apiGet<PlaquePage>(`/plaques?q=${encodeURIComponent(search)}&batch_id=${batchId}&page=${page}&page_size=${PAGE_SIZE}`),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const batchLabels: Record<string, string> = { all: "Todos os lotes" };
  batches.data?.forEach((b) => (batchLabels[b.id] = b.name));

  return (
    <>
      <PageHeader overline="Meus QR Codes" title="Destinos dos QR Codes" description="Altere para onde cada QR leva. O código impresso e o número nunca mudam." />
      <form className="glass-card mb-6 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(term); }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por número (ex.: 15) ou destino" className="bg-black/30 pl-9" data-testid="qr-search-input" />
        </div>
        <Select value={batchId || "all"} onValueChange={(v: string) => { setPage(1); setParams(v === "all" ? {} : { lote: v }); }}>
          <SelectTrigger className="w-full bg-black/30 sm:w-56" data-testid="qr-batch-filter">
            <SelectValue>{(v) => batchLabels[v as string] ?? "Lote"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os lotes</SelectItem>
            {batches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" className="metal-btn text-white" data-testid="qr-search-button">Buscar</Button>
      </form>

      {q.isError && <p className="text-red-300" data-testid="qr-list-error">Não foi possível carregar seus QR Codes.</p>}
      {q.data?.items.length === 0 && <div className="glass-card rounded-2xl p-10 text-center text-slate-400" data-testid="qr-list-empty">Nenhuma plaquinha encontrada.</div>}
      <div className="space-y-3" data-testid="qr-list">
        {q.isPending && <div className="h-24 animate-pulse rounded-2xl bg-white/5" />}
        {q.data?.items.map((p) => {
          const n = formatNumber(p.number);
          return (
            <div key={p.id} className="glass-card flex flex-col gap-4 rounded-2xl p-3 sm:flex-row sm:items-center" data-testid={`qr-row-${n}`}>
              <div className="w-full sm:w-24"><PlaqueCanvas input={inputFromPlaque(p)} size={96} /></div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-cyan-200">Nº {n}</p>
                <p className="text-xs text-slate-500">{p.batch_name} · {p.scan_count} leitura(s) registrada(s)</p>
                <p className="mt-1 truncate text-sm text-slate-300" data-testid={`qr-row-destination-${n}`}>
                  {p.disabled ? <span className="text-amber-300">Desativado pelo administrador</span> : p.destination_url || <span className="text-slate-500">Sem destino definido</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="metal-btn text-white" onClick={() => setEditing(p)} data-testid={`qr-row-edit-${n}`}><Pencil className="size-4" /> Editar destino</Button>
                <Button size="sm" variant="secondary" onClick={() => exportPng(p).catch((e) => toast.error(errorMessage(e)))} data-testid={`qr-row-png-${n}`}><Download className="size-4" /> PNG</Button>
                <a href={p.qr_url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md bg-secondary px-2.5 text-xs font-medium hover:bg-accent" data-testid={`qr-row-test-${n}`}><ExternalLink className="size-3.5" /> Testar</a>
              </div>
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="qr-prev-page"><ChevronLeft className="size-4" /></Button>
          <span className="font-mono text-sm text-slate-300">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="qr-next-page"><ChevronRight className="size-4" /></Button>
        </div>
      )}
      <DestinationDialog plaque={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </>
  );
}
