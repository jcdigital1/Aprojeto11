// The 8 official plaque templates (normalized calibration measured on the 800×800 originals).
import { db } from "./firebase.js";
import { now } from "./common.js";

const SIZE = 800;
const RAW: Record<string, [string, [number, number, number, number], number]> = {
  "1": ["Wi-Fi Preto", [465, 426, 674, 635], 0.955],
  "2": ["WhatsApp Verde", [476, 436, 663, 623], 0.955],
  "3": ["Avalie no Google (Azul)", [540, 552, 697, 710], 0.955],
  "4": ["Nos Avalie no Google (Preto)", [473, 444, 654, 625], 0.925],
  "5": ["Wi-Fi Azul", [471, 432, 667, 627], 0.955],
  "6": ["Siga no Instagram", [535, 541, 701, 708], 0.955],
  "7": ["Nos Avalie no Google (Azul)", [473, 444, 654, 625], 0.925],
  "8": ["Opinião no Google", [103, 486, 312, 695], 0.925],
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function defaultCalibration([x0, y0, x1, y1]: [number, number, number, number], numberY: number) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return {
    qrX: r5(x0 / SIZE), qrY: r5(y0 / SIZE), qrWidth: r5(w / SIZE), qrHeight: r5(h / SIZE), quietZone: 0,
    cleanupRegion: { x: r5((x0 - 3) / SIZE), y: r5((y0 - 3) / SIZE), w: r5((w + 6) / SIZE), h: r5((h + 6) / SIZE) },
    numberX: 0.955, numberY, numberFontSize: 0.022, numberColor: "#2b2f36", numberAlignment: "right",
  };
}

/** Creates any missing template doc (never overwrites admin calibration). */
export async function seedTemplates(): Promise<void> {
  const ts = now();
  await Promise.all(Object.entries(RAW).map(async ([id, [name, bbox, ny]]) => {
    const ref = db.collection("templates").doc(id);
    try {
      await ref.create({
        id, name, original_url: `/templates/t${id}.jpg`, clean_url: `/templates/clean-${id}.png`,
        version: 1, production_ready: true, calibration: defaultCalibration(bbox, ny), updated_at: ts,
      });
    } catch {
      /* already exists */
    }
  }));
}
