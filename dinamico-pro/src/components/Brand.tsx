import { cn } from "@/lib/utils";

export function Logo({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} data-testid="brand-logo">
      <div className="absolute inset-0 rounded-[28%] bg-blue-500/40 blur-xl animate-glow" />
      <img
        src="/brand/logo.jpg"
        alt="DINÂMICO PRO"
        className="relative h-full w-full rounded-[24%] object-cover ring-1 ring-blue-400/30 shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading font-bold tracking-tight text-white", className)}>
      DINÂMICO <span className="bg-gradient-to-r from-sky-300 to-blue-500 bg-clip-text text-transparent">PRO</span>
    </span>
  );
}

export function Icon3D({ name, size = 44, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("icon-tile inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl", className)}
      style={{ width: size, height: size }}
    >
      <img src={`/brand/${name}.jpg`} alt="" className="h-full w-full object-cover" />
    </span>
  );
}
