import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { PageHeader, StatCard } from "@/components/AppShell";
import { Icon3D } from "@/components/Brand";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { MyStats } from "@/lib/types";

const TILES = [
  { to: "/app/gerar", icon: "gerar", title: "Gerar lote", text: "Escolha um modelo e gere plaquinhas numeradas.", testid: "tile-gerar" },
  { to: "/app/lotes", icon: "lotes", title: "Meus lotes", text: "Veja, edite e exporte seus lotes salvos.", testid: "tile-lotes" },
  { to: "/app/qrcodes", icon: "qrcodes", title: "Meus QR Codes", text: "Altere o destino sem reimprimir.", testid: "tile-qrcodes" },
  { to: "/app/exportacoes", icon: "export", title: "Exportações", text: "PDF A4, ZIP e PNG sob demanda.", testid: "tile-exportacoes" },
];

export default function Dashboard() {
  const me = useMe();
  const stats = useQuery({ queryKey: ["my-stats"], queryFn: () => apiGet<MyStats>("/me/stats") });
  const s = { loading: stats.isPending, error: stats.isError };
  return (
    <>
      <PageHeader overline="Painel" title={`Olá, ${me.data?.name.split(" ")[0] ?? ""}`} description="Gerencie suas plaquinhas NFC e QR Codes dinâmicos." />
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Lotes" value={stats.data?.batches} {...s} testid="stat-my-batches" />
        <StatCard label="Plaquinhas" value={stats.data?.plaques} {...s} testid="stat-my-plaques" />
        <StatCard label="Com destino" value={stats.data?.configured} {...s} testid="stat-my-configured" />
        <StatCard label="Leituras registradas" value={stats.data?.scans} {...s} testid="stat-my-scans" accent />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {TILES.map((t, i) => (
          <Link key={t.to} to={t.to} data-testid={t.testid} style={{ animationDelay: `${i * 60}ms` }}
            className="glass-card group flex items-center gap-5 rounded-2xl p-5 transition-[transform,box-shadow] duration-200 animate-rise hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(37,99,235,0.3)]">
            <Icon3D name={t.icon} size={72} className="rounded-2xl transition-transform duration-300 group-hover:scale-105" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg font-semibold text-white">{t.title}</p>
              <p className="text-sm text-slate-400">{t.text}</p>
            </div>
            <ArrowUpRight className="size-5 text-slate-500 transition-colors group-hover:text-sky-300" />
          </Link>
        ))}
      </div>
    </>
  );
}
