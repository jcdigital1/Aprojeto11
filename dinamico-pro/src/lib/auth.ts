import { useQuery } from "@tanstack/react-query";
import { FirebaseError } from "firebase/app";
import { ApiError, apiGet } from "./api";
import { auth } from "./firebase";
import type { User } from "./types";

async function fetchMe(): Promise<User> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new ApiError(401, { detail: "Sessão não encontrada. Faça login." });
  return apiGet<User>("/auth/me");
}

export function useMe(refetchInterval?: number) {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    refetchInterval,
  });
}

export function homeFor(u: User): string {
  if (u.role === "admin") return "/admin";
  if (u.status === "approved") return "/app";
  return "/aguardando";
}

const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Informe um e-mail válido.",
  "auth/email-already-in-use": "Este e-mail já está cadastrado.",
  "auth/weak-password": "A senha deve ter pelo menos 8 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "Sem conexão com o servidor.",
  "auth/user-disabled": "Esta conta foi desativada.",
  "auth/requires-recent-login": "Por segurança, saia e entre novamente antes de alterar a senha.",
  "auth/expired-action-code": "Link expirado. Solicite um novo.",
  "auth/invalid-action-code": "Link inválido ou já utilizado. Solicite um novo.",
  "auth/operation-not-allowed": "Login por e-mail e senha não está ativado no Firebase.",
};

export function errorMessage(err: unknown, fallback = "Ocorreu um erro. Tente novamente."): string {
  if (err instanceof FirebaseError) return FIREBASE_MESSAGES[err.code] ?? fallback;
  if (err instanceof ApiError) {
    const d = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof d === "string") return d;
    if (err.status >= 500) return "Servidor indisponível no momento. Tente novamente.";
  }
  if (err instanceof TypeError) return "Sem conexão com o servidor.";
  return fallback;
}
