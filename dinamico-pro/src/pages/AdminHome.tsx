import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Check, RotateCcw } from "lucide-react";
import { PageHeader, StatCard } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/auth";
import type { AdminStats, User, UserStatus } from "@/lib/types";

const LIVE = 4000; // near-real-time polling

const STATUS_LABEL: Record<UserStatus, string> = { pending: "Pendente", approved: "Aprovado", blocked: "Bloqueado" };
const STATUS_CLASS: Record<UserStatus, string> = {
  pending: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  approved: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  blocked: "border-amber-400/40 bg-amber-400/10 text-amber-200",
};

function useUserAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "block" | "reactivate" }) =>
      apiPost<User>(`/admin/users/${id}/${action}`),
    onSuccess: (u, v) => {
      const msg = { approve: "aprovado", block: "bloqueado", reactivate: "reativado" }[v.action];
      toast.success(`${u.name} ${msg} com sucesso.`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function UsersTable({ users, emptyText }: { users: User[] | undefined; emptyText: string }) {
  const act = useUserAction();
  const busy = (id: string) => act.isPending && act.variables?.id === id;
  if (users && users.length === 0) return <p className="p-8 text-center text-slate-400" data-testid="users-empty">{emptyText}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-blue-500/10">
          <TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Cadastro</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users?.map((u) => (
          <TableRow key={u.id} className="border-blue-500/10" data-testid={`user-row-${u.email}`}>
            <TableCell className="font-medium text-white">{u.name}</TableCell>
            <TableCell className="text-slate-300">{u.email}</TableCell>
            <TableCell className="text-slate-400">{new Date(u.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
            <TableCell><Badge variant="outline" className={STATUS_CLASS[u.status]} data-testid={`user-status-${u.email}`}>{STATUS_LABEL[u.status]}</Badge></TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {u.status === "pending" && (
                  <Button size="sm" className="metal-btn text-white" disabled={busy(u.id)} onClick={() => act.mutate({ id: u.id, action: "approve" })} data-testid={`approve-${u.email}`}><Check className="size-4" /> Aprovar</Button>
                )}
                {u.status !== "blocked" && (
                  <Button size="sm" variant="secondary" disabled={busy(u.id)} onClick={() => act.mutate({ id: u.id, action: "block" })} data-testid={`block-${u.email}`}><Ban className="size-4" /> Bloquear</Button>
                )}
                {u.status === "blocked" && (
                  <Button size="sm" className="metal-btn text-white" disabled={busy(u.id)} onClick={() => act.mutate({ id: u.id, action: "reactivate" })} data-testid={`reactivate-${u.email}`}><RotateCcw className="size-4" /> Reativar</Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AdminHome() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => apiGet<AdminStats>("/admin/stats"), refetchInterval: LIVE });
  const pending = useQuery({ queryKey: ["admin-users", "pending"], queryFn: () => apiGet<User[]>("/admin/users?status=pending"), refetchInterval: LIVE });
  const s = { loading: stats.isPending, error: stats.isError };
  return (
    <>
      <PageHeader overline="Administração" title="Painel do administrador" description="Todos os números vêm de registros reais do banco de dados e atualizam automaticamente." />
      <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cadastros pendentes" value={stats.data?.pending} {...s} testid="stat-pending" accent />
        <StatCard label="Compradores aprovados" value={stats.data?.approved} {...s} testid="stat-approved" />
        <StatCard label="Compradores bloqueados" value={stats.data?.blocked} {...s} testid="stat-blocked" />
        <StatCard label="Total de lotes" value={stats.data?.batches} {...s} testid="stat-batches" />
        <StatCard label="Total de plaquinhas" value={stats.data?.plaques} {...s} testid="stat-plaques" />
        <StatCard label="QR Codes emitidos" value={stats.data?.qr_issued} {...s} testid="stat-qr-issued" />
        <StatCard label="Leituras registradas" value={stats.data?.scans} {...s} testid="stat-scans" />
      </div>
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-blue-500/10 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold text-white">Cadastros pendentes</h2>
          <span className="flex items-center gap-2 text-xs text-slate-400"><span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Ao vivo</span>
        </div>
        {pending.isError ? <p className="p-6 text-red-300">Erro ao carregar cadastros.</p> : <UsersTable users={pending.data} emptyText="Nenhum cadastro aguardando aprovação." />}
      </div>
    </>
  );
}

export function AdminBuyers() {
  const [tab, setTab] = useState<string>("pending");
  const users = useQuery({
    queryKey: ["admin-users", tab],
    queryFn: () => apiGet<User[]>(`/admin/users${tab === "all" ? "" : `?status=${tab}`}`),
    refetchInterval: LIVE,
  });
  return (
    <>
      <PageHeader overline="Compradores" title="Gerenciar compradores" description="Aprovar, bloquear ou reativar. Bloquear não apaga dados e os QR Codes impressos continuam funcionando." />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="buyers-tab-pending">Pendentes</TabsTrigger>
          <TabsTrigger value="approved" data-testid="buyers-tab-approved">Aprovados</TabsTrigger>
          <TabsTrigger value="blocked" data-testid="buyers-tab-blocked">Bloqueados</TabsTrigger>
          <TabsTrigger value="all" data-testid="buyers-tab-all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="glass-card overflow-hidden rounded-2xl">
        {users.isError ? <p className="p-6 text-red-300">Erro ao carregar compradores.</p> : <UsersTable users={users.data} emptyText="Nenhum comprador nesta categoria." />}
      </div>
    </>
  );
}
