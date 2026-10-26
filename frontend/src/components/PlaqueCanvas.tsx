import { useEffect, useRef, useState } from "react";
import { drawPlaque, type PlaqueInput } from "@/lib/render";
import { cn } from "@/lib/utils";

// Screen preview — renders through the same engine as the exports, at display resolution.
export default function PlaqueCanvas({ input, size = 320, className, testid }: {
  input: PlaqueInput; size?: number; className?: string; testid?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const key = JSON.stringify(input);

  useEffect(() => {
    let alive = true;
    const canvas = ref.current;
    if (!canvas) return;
    const px = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    drawPlaque(canvas, input, px)
      .then(() => alive && setState("ok"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size]);

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-xl bg-[#080E1E]", className)}>
      <canvas ref={ref} className="h-full w-full" data-testid={testid} />
      {state === "loading" && <div className="absolute inset-0 animate-pulse bg-white/5" />}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-amber-300">
          Não foi possível renderizar a plaquinha.
        </div>
      )}
    </div>
  );
}
