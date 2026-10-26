# DINÂMICO PRO — Spec

SaaS multiusuário (pt-BR) para gerar plaquinhas NFC 10×10 cm com QR Codes dinâmicos permanentes e destino editável.

## Stack (desvio declarado)
FastAPI + MongoDB (backend do template) no lugar de Firebase. Login e-mail/senha, cookie de sessão httpOnly (JWT, invalidado por `session_version`).

## Papéis
- admin: único, `ADMIN_EMAIL` em backend/.env (jeannmkt2@gmail.com). Vira admin no servidor ao se cadastrar se ainda não existir admin. Conta já criada.
- customer: começa `pending`; só `approved` acessa o painel. Admin aprova / bloqueia / reativa.
- Isolamento: todas as consultas de lotes/plaquinhas filtram por `owner_id` no servidor (admin não lê/edita dados de clientes, só desativa QR).

## Dados (Mongo)
users, batches, plaques (code permanente, number global sequencial, qr_url fixo, destination_url editável, render snapshot), templates (8 modelos, calibração normalizada, version, production_ready), counters (numeração atômica), settings (public_base_url, production_confirmed), scans, password_resets.

## Fluxos
- /login, /cadastro, /esqueci-senha (gera pedido; admin gera link em Configurações), /redefinir-senha, /aguardando.
- Cliente: /app (painel), /app/gerar (modelo + quantidade, idempotente), /app/lotes, /app/lotes/:id (BAIXAR PDF A4 2×2 100 mm, ZIP, PNG 1181 px — tudo gerado sob demanda no navegador com o mesmo motor `src/lib/render.ts`), /app/qrcodes (editar destino), /app/configuracoes.
- Admin: /admin (estatísticas reais, ao vivo), /admin/compradores, /admin/modelos (calibração arrastável + aprovar produção + enviar base limpa), /admin/configuracoes (domínio, links de redefinição, desativar QR).
- Redirect público: GET /api/r/{code} → 302 destino; sem destino/desativado → /q/indisponivel. Registra leitura.
- Domínio: enquanto `production_confirmed=false`, lotes ficam marcados como "modo teste" (não imprimir para venda).
