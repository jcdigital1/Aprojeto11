import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, ShieldCheck, ShieldOff, Upload } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import PlaqueCanvas from "@/components/PlaqueCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import { drawPlaque, PRINT_SIZE, saveBlob } from "@/lib/render";
import { cn } from "@/lib/utils";
import type { Calibration, Template } from "@/lib/types";

// Firestore documents are limited to 1 MB: normalize the upload to ≤1200 px and compress if needed.
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = c.toDataURL("image/png");
  return png.length < 1_150_000 ? png : c.toDataURL("image/jpeg", 0.92);
}

const SAMPLE_QR = "https://dinamicopro.exemplo/api/r/AbCdEfGh1234";

function NumField({ label, value, onChange, step = 0.001, testid }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; testid: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Input type="number" step={step} value={Number(value.toFixed(4))} onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 bg-black/30 font-mono text-xs" data-testid={testid} />
    </div>
  );
}

function Editor({ tpl }: { tpl: Template }) {
  const qc = useQueryClient();
  const [cal, setCal] = useState<Calibration>(tpl.calibration);
  const [showOriginal, setShowOriginal] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Calibration>) => setCal((c) => ({ ...c, ...patch }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["templates"] });

  const save = useMutation({
    mutationFn: () => apiPut<Template>(`/admin/templates/${tpl.id}/calibration`, cal),
    onSuccess: (t) => { toast.success(`Calibração salva (versão ${t.version}).`); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const prod = useMutation({
    mutationFn: (ready: boolean) => apiPost<Template>(`/admin/templates/${tpl.id}/production`, { production_ready: ready }),
    onSuccess: (t) => { toast.success(t.production_ready ? "Modelo aprovado para produção." : "Modelo retirado de produção."); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const upload = useMutation({
    mutationFn: async (f: File) => apiPost<Template>(`/admin/templates/${tpl.id}/clean-image`, { data_url: await toDataUrl(f) }),
    onSuccess: () => { toast.success("Base limpa enviada. Revise e aprove o modelo novamente."); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Drag the QR box directly on the artwork.
  const drag = (e: React.PointerEvent) => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, ox = cal.qrX, oy = cal.qrY;
    const move = (ev: PointerEvent) => set({
      qrX: Math.min(1 - cal.qrWidth, Math.max(0, ox + (ev.clientX - sx) / rect.width)),
      qrY: Math.min(1 - cal.qrHeight, Math.max(0, oy + (ev.clientY - sy) / rect.height)),
    });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const downloadTest = async () => {
    const c = document.createElement("canvas");
    await drawPlaque(c, { cleanUrl: tpl.clean_url, calibration: cal, qrText: SAMPLE_QR, number: 1 }, PRINT_SIZE);
    c.toBlob((b) => b && saveBlob(b, `TESTE-MODELO-${tpl.id}.png`), "image/png");
  };
  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div ref={boxRef} className="relative mx-auto aspect-square w-full max-w-[560px] select-none overflow-hidden rounded-2xl ring-1 ring-blue-500/30" data-testid="calibration-canvas">
          {showOriginal ? (
            <img src={tpl.original_url} alt="Arte original" className="h-full w-full" />
          ) : (
            <PlaqueCanvas input={{ cleanUrl: tpl.clean_url, calibration: cal, qrText: SAMPLE_QR, number: 1 }} size={560} className="rounded-none" testid="calibration-preview" />
          )}
          <div onPointerDown={drag} title="Arraste para mover a área do QR"
            className="absolute cursor-move border-2 border-dashed border-cyan-300/90 bg-cyan-300/5 shadow-[0_0_20px_rgba(0,229,255,0.35)]"
            style={{ left: pct(cal.qrX), top: pct(cal.qrY), width: pct(cal.qrWidth), height: pct(cal.qrHeight) }}
            data-testid="calibration-qr-box" />
          <div className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-400 ring-2 ring-white/70"
            style={{ left: pct(cal.numberX), top: pct(cal.numberY) }} />
        </div>
        <div className="mx-auto mt-3 flex max-w-[560px] flex-wrap justify-center gap-2">
          <Button size="sm" variant={showOriginal ? "default" : "secondary"} onClick={() => setShowOriginal(!showOriginal)} data-testid="calibration-toggle-original">
            {showOriginal ? "Ver prévia gerada" : "Comparar com a arte original"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => downloadTest().catch((e) => toast.error(errorMessage(e)))} data-testid="calibration-download-test"><Download className="size-4" /> PNG de teste (1181 px)</Button>
        </div>
      </div>
      <div className="glass-card space-y-5 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <p className="font-heading font-semibold text-white">{tpl.name}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px]", tpl.production_ready ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300")} data-testid="calibration-status">
            {tpl.production_ready ? "Em produção" : "Em calibração"} · v{tpl.version}
          </span>
        </div>
        <div>
          <p className="overline mb-2">Área do QR (0–1)</p>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="qrX" value={cal.qrX} onChange={(v) => set({ qrX: v })} testid="cal-qr-x" />
            <NumField label="qrY" value={cal.qrY} onChange={(v) => set({ qrY: v })} testid="cal-qr-y" />
            <NumField label="qrWidth" value={cal.qrWidth} onChange={(v) => set({ qrWidth: v })} testid="cal-qr-width" />
            <NumField label="qrHeight" value={cal.qrHeight} onChange={(v) => set({ qrHeight: v })} testid="cal-qr-height" />
            <NumField label="quietZone" value={cal.quietZone} onChange={(v) => set({ quietZone: v })} testid="cal-quiet-zone" />
          </div>
        </div>
        <div>
          <p className="overline mb-2">Numeração</p>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="numberX" value={cal.numberX} onChange={(v) => set({ numberX: v })} testid="cal-number-x" />
            <NumField label="numberY" value={cal.numberY} onChange={(v) => set({ numberY: v })} testid="cal-number-y" />
            <NumField label="numberFontSize" value={cal.numberFontSize} onChange={(v) => set({ numberFontSize: v })} testid="cal-number-size" />
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">numberColor</Label>
              <Input type="color" value={cal.numberColor} onChange={(e) => set({ numberColor: e.target.value })} className="h-8 bg-black/30 p-1" data-testid="cal-number-color" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} type="button" onClick={() => set({ numberAlignment: a })} data-testid={`cal-align-${a}`}
                className={cn("rounded-md border py-1 text-xs transition-colors", cal.numberAlignment === a ? "border-sky-400 text-sky-200" : "border-blue-500/20 text-slate-400")}>
                {{ left: "Esquerda", center: "Centro", right: "Direita" }[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 border-t border-blue-500/10 pt-4">
          <Button className="metal-btn w-full text-white" disabled={save.isPending} onClick={() => save.mutate()} data-testid="calibration-save-button">
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar calibração
          </Button>
          {tpl.production_ready ? (
            <Button variant="secondary" className="w-full" disabled={prod.isPending} onClick={() => prod.mutate(false)} data-testid="calibration-revoke-button"><ShieldOff className="size-4" /> Retirar de produção</Button>
          ) : (
            <Button variant="secondary" className="w-full" disabled={prod.isPending} onClick={() => prod.mutate(true)} data-testid="calibration-approve-button"><ShieldCheck className="size-4" /> Aprovar para produção</Button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="calibration-upload-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
          <Button variant="ghost" className="w-full" disabled={upload.isPending} onClick={() => fileRef.current?.click()} data-testid="calibration-upload-button">
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Enviar base limpa
          </Button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Alterações valem apenas para lotes novos. Lotes já emitidos mantêm a calibração, a numeração e o QR originais.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminTemplates() {
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => apiGet<Template[]>("/templates") });
  const [sel, setSel] = useState("1");
  const tpl = templates.data?.find((t) => t.id === sel);
  return (
    <>
      <PageHeader overline="Modelos" title="Calibração dos modelos" description="Ajuste a área exata do QR e a posição da numeração de cada modelo. A prévia usa o mesmo motor da exportação." />
      {templates.isError && <p className="text-red-300">Erro ao carregar modelos.</p>}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2" data-testid="calibration-template-list">
        {templates.data?.map((t) => (
          <button key={t.id} type="button" onClick={() => setSel(t.id)} data-testid={`calibration-template-${t.id}`}
            className={cn("relative shrink-0 overflow-hidden rounded-xl border-2 transition-[border-color,transform] duration-200 hover:-translate-y-0.5",
              sel === t.id ? "border-sky-400" : "border-transparent")}>
            <img src={t.original_url} alt={t.name} className="size-20 object-cover" />
            <span className={cn("absolute bottom-1 right-1 size-2.5 rounded-full", t.production_ready ? "bg-emerald-400" : "bg-amber-400")} />
          </button>
        ))}
      </div>
      {tpl && <Editor key={`${tpl.id}-${tpl.version}`} tpl={tpl} />}
    </>
  );
}
