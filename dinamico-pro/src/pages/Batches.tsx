import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Pencil } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DestinationDialog, ExportButtons, PlaqueCard, TestModeBanner } from "@/components/Plaques";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { formatNumber } from "@/lib/render";
import type { Batch, Plaque, PlaquePage } from "@/lib/types";

const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function BatchRow({ b, showView = true }: { b: Batch; showView?: boolean }) {
  return (
    <div className="glass-card flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center" data-testid={`batch-row-${b.id}`}>
      <img src={`/templates/t${b.template_id}.jpg`} alt="" className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-blue-500/20" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-lg font-semibold text-white" data-testid="batch-row-name">{b.name}</p>
        <p className="text-sm text-slate-400">{b.template_name} · {fmtDate(b.created_at)}</p>
        <p className="mt-1 font-mono text-sm text-cyan-200" data-testid="batch-row-range">
          {b.quantity} plaquinhas · Nº {formatNumber(b.number_start)} – {formatNumber(b.number_end)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {showView && (
          <>
            <Link to={`/app/lotes/${b.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid={`batch-view-${b.id}`}><Eye className="size-4" /> Ver</Link>
            <Link to={`/app/qrcodes?lote=${b.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid={`batch-edit-destinations-${b.id}`}><Pencil className="size-4" /> Editar destinos</Link>
          </>
        )}
        <ExportButtons batch={b} size="sm" />
      </div>
    </div>
  );
}

export function BatchesList({ title, overline, showView = true }: { title: string; overline: string; showView?: boolean }) {
  const q = useQuery({ queryKey: ["batches"], queryFn: () => apiGet<Batch[]>("/batches") });
  return (
    <>
      <PageHeader overline={overline} title={title}
        actions={<Link to="/app/gerar" className={buttonVariants({ className: "metal-btn text-white" })} data-testid="new-batch-link">Gerar lote</Link>} />
      {q.isError && <p className="text-red-300" data-testid="batches-error">Não foi possível carregar seus lotes.</p>}
      {q.isPending && <div className="h-28 animate-pulse rounded-2xl bg-white/5" />}
      {q.data?.length === 0 && (
        <div className="glass-card rounded-2xl p-10 text-center text-slate-400" data-testid="batches-empty">Você ainda não gerou nenhum lote.</div>
      )}
      <div className="space-y-3">{q.data?.map((b) => <BatchRow key={b.id} b={b} showView={showView} />)}</div>
    </>
  );
}

export function Batches() {
  return <BatchesList overline="Meus lotes" title="Lotes salvos" />;
}

export function Exports() {
  return <BatchesList overline="Exportações" title="Baixar arquivos de impressão" showView={false} />;
}

const PAGE_SIZE = 24;

export function BatchDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Plaque | null>(null);
  const batch = useQuery({ queryKey: ["batch", id], queryFn: () => apiGet<Batch>(`/batches/${id}`) });
  const plaques = useQuery({
    queryKey: ["batch-plaques", id, page],
    queryFn: () => apiGet<PlaquePage>(`/batches/${id}/plaques?page=${page}&page_size=${PAGE_SIZE}`),
  });
  const pages = plaques.data ? Math.max(1, Math.ceil(plaques.data.total / PAGE_SIZE)) : 1;
  const b = batch.data;

  return (
    <>
      <Link to="/app/lotes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="back-to-batches"><ChevronLeft className="size-4" /> Meus lotes</Link>
      {batch.isError && <p className="text-red-300" data-testid="batch-error">Lote não encontrado.</p>}
      {b && (
        <>
          <PageHeader overline={params.get("novo") ? "Lote gerado" : "Lote"} title={b.name}
            description={`${b.template_name} · ${b.quantity} plaquinhas · Nº ${formatNumber(b.number_start)} a ${formatNumber(b.number_end)}`} />
          {b.test_mode && <TestModeBanner />}
          <div className="glass-card mb-8 flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="batch-export-bar">
            <div>
              <p className="font-heading text-lg font-semibold text-white">Lote completo para impressão</p>
              <p className="text-sm text-slate-400">A4 com 4 plaquinhas de 10 × 10 cm por página · {Math.ceil(b.quantity / 4)} página(s)</p>
            </div>
            <ExportButtons batch={b} primaryPdf />
          </div>
        </>
      )}
      {plaques.isError && <p className="text-red-300">Não foi possível carregar as plaquinhas.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="plaque-grid">
        {plaques.isPending && Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-white/5" />)}
        {plaques.data?.items.map((p) => <PlaqueCard key={p.id} plaque={p} onEdit={setEditing} />)}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="plaques-prev-page"><ChevronLeft className="size-4" /></Button>
          <span className="font-mono text-sm text-slate-300" data-testid="plaques-page-indicator">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="plaques-next-page"><ChevronRight className="size-4" /></Button>
        </div>
      )}
      <DestinationDialog plaque={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </>
  );
}
