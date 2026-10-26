import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";
import type { User } from "./types";

export function useMe(refetchInterval?: number) {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<User>("/auth/me"),
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    refetchInterval,
  });
}

export function homeFor(u: User): string {
  if (u.role === "admin") return "/admin";
  if (u.status === "approved") return "/app";
  return "/aguardando";
}

export function errorMessage(err: unknown, fallback = "Ocorreu um erro. Tente novamente."): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const first = d[0] as { loc?: string[]; msg?: string } | undefined;
      const field = first?.loc?.[first.loc.length - 1];
      if (field === "email") return "Informe um e-mail válido.";
      if (field === "password" || field === "new_password") return "A senha deve ter pelo menos 8 caracteres.";
      if (field === "name") return "Informe seu nome completo.";
      return "Dados inválidos. Verifique os campos.";
    }
    if (err.status >= 500) return "Servidor indisponível no momento. Tente novamente.";
  }
  if (err instanceof TypeError) return "Sem conexão com o servidor.";
  return fallback;
}
