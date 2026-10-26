// THE single plaque composition engine. Preview, PNG, ZIP and PDF all call drawPlaque().
// Layer order: 1) clean template artwork  2) dynamic QR  3) plaque number.
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { Calibration, Plaque, RenderSnapshot } from "./types";

export const PRINT_SIZE = 1181; // 10 cm @ 300 DPI
const NUMBER_FONT = '"Plus Jakarta Sans Variable", sans-serif';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(url);
        reject(new Error("Não foi possível carregar a arte do modelo."));
      };
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

export function formatNumber(n: number): string {
  return String(n).padStart(6, "0");
}

export interface PlaqueInput {
  cleanUrl: string;
  calibration: Calibration;
  qrText: string;
  number: number;
}

export function inputFromPlaque(p: Plaque): PlaqueInput {
  return fromSnapshot(p.render, p.qr_url, p.number);
}

export function fromSnapshot(r: RenderSnapshot, qrText: string, number: number): PlaqueInput {
  return { cleanUrl: r.clean_url, calibration: r.calibration, qrText, number };
}

function drawQr(ctx: CanvasRenderingContext2D, text: string, c: Calibration, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const bx = c.qrX * size;
  const by = c.qrY * size;
  const bw = c.qrWidth * size;
  const bh = c.qrHeight * size;
  const side = Math.min(bw, bh); // keep the QR square, never stretch
  const ox = bx + (bw - side) / 2;
  const oy = by + (bh - side) / 2;
  const qz = side * c.quietZone;
  const inner = side - qz * 2;
  // Integer module size keeps edges crisp when there is room; fractional for tiny previews.
  const m = inner / n >= 3 ? Math.floor(inner / n) : inner / n;
  const used = m * n;
  const sx = ox + qz + (inner - used) / 2;
  const sy = oy + qz + (inner - used) / 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(ox, oy, side, side);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (data[r * n + col]) {
        const x = Math.round(sx + col * m);
        const y = Math.round(sy + r * m);
        const x2 = Math.round(sx + (col + 1) * m);
        const y2 = Math.round(sy + (r + 1) * m);
        ctx.fillRect(x, y, x2 - x, y2 - y);
      }
    }
  }
}

function drawNumber(ctx: CanvasRenderingContext2D, number: number, c: Calibration, size: number) {
  const px = Math.max(6, c.numberFontSize * size);
  ctx.font = `600 ${px}px ${NUMBER_FONT}`;
  ctx.fillStyle = c.numberColor;
  ctx.textAlign = c.numberAlignment;
  ctx.textBaseline = "bottom";
  ctx.fillText(`Nº ${formatNumber(number)}`, c.numberX * size, c.numberY * size);
}

export async function drawPlaque(canvas: HTMLCanvasElement, input: PlaqueInput, size: number): Promise<void> {
  const [img] = await Promise.all([
    loadImage(input.cleanUrl),
    document.fonts.load(`600 20px ${NUMBER_FONT}`).catch(() => undefined),
  ]);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size, size); // 1. clean artwork
  drawQr(ctx, input.qrText, input.calibration, size); // 2. dynamic QR (once)
  drawNumber(ctx, input.number, input.calibration, size); // 3. plaque number (once)
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem."))), type, quality),
  );
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeName(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "lote";
}

export async function exportPng(p: Plaque) {
  const canvas = document.createElement("canvas");
  await drawPlaque(canvas, inputFromPlaque(p), PRINT_SIZE);
  saveBlob(await toBlob(canvas, "image/png"), `PLACA-${formatNumber(p.number)}.png`);
}

type Progress = (done: number, total: number) => void;
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export async function exportZip(plaques: Plaque[], batchName: string, onProgress?: Progress) {
  const zip = new JSZip();
  const canvas = document.createElement("canvas"); // one reusable canvas keeps memory flat
  for (let i = 0; i < plaques.length; i++) {
    const p = plaques[i];
    await drawPlaque(canvas, inputFromPlaque(p), PRINT_SIZE);
    zip.file(`PLACA-${formatNumber(p.number)}.png`, await toBlob(canvas, "image/png"));
    onProgress?.(i + 1, plaques.length);
    await yieldFrame();
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  saveBlob(blob, `${safeName(batchName)}-PNG.zip`);
}

// A4 210x297 mm, 2x2 grid of 100x100 mm plaques, grid centered: x 5 mm, y 48.5 mm.
export const PDF_LAYOUT = { pageW: 210, pageH: 297, plaque: 100, offsetX: 5, offsetY: 48.5 };

export async function exportPdf(plaques: Plaque[], batchName: string, onProgress?: Progress) {
  const { plaque, offsetX, offsetY } = PDF_LAYOUT;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const canvas = document.createElement("canvas");
  for (let i = 0; i < plaques.length; i++) {
    const pos = i % 4;
    if (i > 0 && pos === 0) pdf.addPage("a4", "portrait");
    await drawPlaque(canvas, inputFromPlaque(plaques[i]), PRINT_SIZE);
    const data = canvas.toDataURL("image/jpeg", 0.95);
    const x = offsetX + (pos % 2) * plaque;
    const y = offsetY + Math.floor(pos / 2) * plaque;
    pdf.addImage(data, "JPEG", x, y, plaque, plaque, undefined, "FAST");
    onProgress?.(i + 1, plaques.length);
    await yieldFrame();
  }
  pdf.save(`${safeName(batchName)}-A4.pdf`);
}
