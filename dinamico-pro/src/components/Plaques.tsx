import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, FolderArchive, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPatch } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { exportPdf, exportPng, exportZip, formatNumber, inputFromPlaque } from "@/lib/render";
import type { Batch, Plaque, PlaquePage } from "@/lib/types";
import PlaqueCanvas from "./PlaqueCanvas";

export const DEST_PRESETS = [
  { label: "Google Avaliações", hint: "https://g.page/r/SEU-ID/review" },
  { label: "WhatsApp", hint: "https://wa.me/5511999999999" },
  { label: "Instagram", hint: "https://instagram.com/seuperfil" },
];

export function DestinationDialog({ plaque, open, onOpenChange }: {
  plaque: Plaque | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (plaque && plaque.id !== lastId) {
    setLastId(plaque.id);
    setUrl(plaque.destination_url);
  }
  const save = useMutation({
    mutationFn: () => apiPatch<Plaque>(`/plaques/${plaque!.id}`, { destination_url: url }),
    onSuccess: (p) => {
      toast.success(`Destino da plaquinha Nº ${formatNumber(p.number)} salvo com sucesso.`);
      qc.invalidateQueries({ queryKey: ["plaques"] });
      qc.invalidateQueries({ queryKey: ["batch-plaques"] });
      qc.invalidateQueries({ queryKey: ["my-stats"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-blue-500/25 bg-[#0B152B] sm:max-w-lg" data-testid="destination-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Editar destino {plaque && <span className="font-mono text-cyan-300">Nº {formatNumber(plaque.number)}</span>}
          </DialogTitle>
          <DialogDescription>
            O QR Code impresso não muda. Apenas o endereço para onde ele leva será atualizado.
          </DialogDescription>
        </DialogHeader>
        {plaque && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="dest-url">URL de destino</Label>
              <Input
                id="dest-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                data-testid="destination-url-input"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {DEST_PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.label}
                    onClick={() => setUrl(p.hint)}
                    className="rounded-full border border-blue-500/25 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-sky-400/60 hover:text-white"
                    data-testid={`destination-preset-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-xs text-slate-400">
              Link permanente do QR: <span className="break-all font-mono text-slate-300" data-testid="destination-permanent-url">{plaque.qr_url}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="destination-cancel-button">Cancelar</Button>
              <Button type="submit" className="metal-btn text-white" disabled={save.isPending} data-testid="destination-save-button">
                {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar destino
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PlaqueCard({ plaque, onEdit }: { plaque: Plaque; onEdit: (p: Plaque) => void }) {
  const [busy, setBusy] = useState(false);
  const n = formatNumber(plaque.number);
  return (
    <div className="glass-card group rounded-2xl p-3 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,229,255,0.18)]" data-testid={`plaque-card-${n}`}>
      <PlaqueCanvas input={inputFromPlaque(plaque)} size={300} testid={`plaque-canvas-${n}`} />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-cyan-200">Nº {n}</span>
        {plaque.disabled ? (
          <span className="text-xs text-amber-300">Desativado</span>
        ) : plaque.destination_url ? (
          <span className="text-xs text-emerald-300">Configurado</span>
        ) : (
          <span className="text-xs text-slate-500">Sem destino</span>
        )}
      </div>
      <p className="mt-1 truncate text-xs text-slate-400" title={plaque.destination_url} data-testid={`plaque-destination-${n}`}>
        {plaque.destination_url || "Defina para onde este QR deve levar"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onEdit(plaque)} data-testid={`plaque-edit-${n}`}>
          <Pencil className="size-3.5" /> Editar
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportPng(plaque);
            } catch (e) {
              toast.error(errorMessage(e, "Falha ao gerar PNG."));
            } finally {
              setBusy(false);
            }
          }}
          data-testid={`plaque-png-${n}`}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} PNG
        </Button>
        <a
          href={plaque.qr_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1 rounded-md bg-secondary px-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
          data-testid={`plaque-test-${n}`}
        >
          <ExternalLink className="size-3.5" /> Testar
        </a>
      </div>
    </div>
  );
}

// Fetches every plaque of the batch only when an export is requested (never at creation time).
export function ExportButtons({ batch, size = "default", primaryPdf = false }: {
  batch: Batch; size?: "default" | "sm" | "lg"; primaryPdf?: boolean;
}) {
  const [job, setJob] = useState<null | { kind: "pdf" | "zip"; done: number; total: number }>(null);
  const run = async (kind: "pdf" | "zip") => {
    setJob({ kind, done: 0, total: batch.quantity });
    try {
      const page = await apiGet<PlaquePage>(`/batches/${batch.id}/plaques?page=1&page_size=500`);
      const progress = (done: number, total: number) => setJob({ kind, done, total });
      if (kind === "pdf") await exportPdf(page.items, batch.name, progress);
      else await exportZip(page.items, batch.name, progress);
      toast.success(kind === "pdf" ? "PDF A4 gerado com sucesso." : "ZIP gerado com sucesso.");
    } catch (e) {
      toast.error(errorMessage(e, "Falha ao gerar o arquivo."));
    } finally {
      setJob(null);
    }
  };
  const label = (k: "pdf" | "zip", text: string) =>
    job?.kind === k ? `Gerando ${job.done}/${job.total}…` : text;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size={size}
        className={primaryPdf ? "metal-btn h-12 px-6 text-base font-semibold tracking-wide text-white" : "metal-btn text-white"}
        disabled={!!job}
        onClick={() => run("pdf")}
        data-testid={`download-pdf-a4-${batch.id}`}
      >
        {job?.kind === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
        {label("pdf", "BAIXAR PDF A4")}
      </Button>
      <Button
        size={size}
        variant="secondary"
        className={primaryPdf ? "h-12 px-5" : undefined}
        disabled={!!job}
        onClick={() => run("zip")}
        data-testid={`download-zip-${batch.id}`}
      >
        {job?.kind === "zip" ? <Loader2 className="size-4 animate-spin" /> : <FolderArchive className="size-4" />}
        {label("zip", "Baixar ZIP (PNG)")}
      </Button>
    </div>
  );
}

export function TestModeBanner() {
  return (
    <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200" data-testid="test-mode-banner">
      <strong>Modo teste:</strong> estes QR Codes usam um domínio que ainda não foi confirmado como produção pelo
      administrador. Não imprima para venda.
    </div>
  );
}
