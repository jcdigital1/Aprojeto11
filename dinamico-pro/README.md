# DINÂMICO PRO — Vercel + Firebase

Versão independente do DINÂMICO PRO: **frontend React (Vite) + funções serverless na Vercel + Firebase Authentication + Cloud Firestore**.
Não depende de nenhum servidor, banco ou URL do Emergent.

```
dinamico-pro/
├─ api/index.ts            → única função serverless (todas as rotas /api/*)
├─ server/                 → lógica do servidor (Firebase Admin SDK, regras de acesso, lotes, QR, admin)
├─ src/                    → aplicativo React (telas, motor de renderização, PDF/ZIP/PNG)
├─ public/templates/       → as 8 artes oficiais + bases limpas
├─ firestore.rules         → regras de segurança (cada cliente só lê os próprios dados)
├─ firestore.indexes.json  → índices compostos necessários
├─ vercel.json             → build, rewrites (/api, /r/:code, SPA)
├─ scripts/export_mongo.py → exporta os dados antigos (rodar no Emergent)
└─ scripts/import-to-firebase.ts → importa para Firebase (Auth + Firestore)
```

## Como funciona

| Item | Onde fica |
|---|---|
| Login / cadastro / recuperação de senha | Firebase Authentication (e-mail e senha; e-mail de nova senha enviado pelo Firebase) |
| Perfis, aprovação, bloqueio, lotes, plaquinhas, leituras, configurações | Cloud Firestore |
| Aprovar/bloquear, numerar lotes (transação atômica), editar destino, redirecionar QR | Função da Vercel com Firebase Admin SDK — o papel (admin/cliente) e o status são verificados **no servidor** |
| PDF A4 / ZIP / PNG | Gerados no navegador, sob demanda |
| Redirecionamento do QR | `https://SEU-DOMINIO/api/r/CODIGO` (também aceita `/r/CODIGO`) |

Funciona no **plano gratuito (Spark)** do Firebase — não usa Cloud Functions nem Storage.

## Passo a passo

### 1. Firebase (projeto `teste-c625b`)
1. **Authentication → Método de login → E-mail/senha → Ativar.**
2. **Authentication → Configurações → Domínios autorizados → Adicionar** o domínio da Vercel (`seu-projeto.vercel.app`) e o seu domínio próprio.
3. **Firestore Database → Criar banco de dados** (modo produção, região `southamerica-east1` recomendada).
4. **⚙ Configurações do projeto → Geral → Seus apps → `</>` (Web)** → registre o app e copie `apiKey` e `appId`.
5. **⚙ Configurações do projeto → Contas de serviço → Gerar nova chave privada** → baixa um arquivo `.json`. Guarde com segurança, **nunca** suba no GitHub.
6. Publicar regras e índices (no seu computador, dentro desta pasta):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project teste-c625b
   ```
7. (Opcional) **Authentication → Modelos → Redefinição de senha → idioma Português** e "Personalizar URL de ação" para `https://SEU-DOMINIO/redefinir-senha`.

### 2. GitHub
Use o botão **"Save to GitHub"** do Emergent (ou copie esta pasta para um repositório). O projeto Vercel deve apontar para a pasta `dinamico-pro`.
Arquivos sensíveis (`migration/`, `.env*`, chaves) já estão no `.gitignore`.

### 3. Vercel
1. **Add New → Project → Import** o repositório.
2. **Root Directory: `dinamico-pro`** (Framework: Vite — já definido no `vercel.json`).
3. **Settings → Environment Variables** (Production e Preview) — veja `.env.example`:

| Variável | Valor | Tipo |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | apiKey do app Web | pública |
| `VITE_FIREBASE_AUTH_DOMAIN` | `teste-c625b.firebaseapp.com` | pública |
| `VITE_FIREBASE_PROJECT_ID` | `teste-c625b` | pública |
| `VITE_FIREBASE_APP_ID` | appId do app Web | pública |
| `FIREBASE_SERVICE_ACCOUNT` | conteúdo inteiro do JSON da conta de serviço | **secreta** |
| `ADMIN_EMAIL` | `jeannmkt2@gmail.com` | servidor |
| `PUBLIC_BASE_URL` | `https://seu-dominio.com.br` (ou `https://seu-projeto.vercel.app`) | servidor |

4. **Deploy.** Depois: **Settings → Domains** → adicione seu domínio próprio e configure o DNS indicado pela Vercel.
5. No app, entre como admin → **Configurações → Domínio dos QR Codes** → salve o domínio definitivo e marque "produção".

### 4. Migração dos dados existentes
```bash
# no Emergent (onde está o MongoDB antigo)
cd /app/backend && python ../dinamico-pro/scripts/export_mongo.py      # gera migration/export.json

# com FIREBASE_SERVICE_ACCOUNT e VITE_FIREBASE_API_KEY definidos
cd /app/dinamico-pro
yarn import:firebase                                   # simulação: mostra o que será importado
yarn import:firebase --apply --send-reset-emails --new-base-url=https://SEU-DOMINIO
```
- Usuários são criados no Firebase com o **mesmo ID**, sem senha; cada um recebe o e-mail do Firebase para **criar uma nova senha** (inclusive o admin).
- Lotes, plaquinhas (mesmo código e número), destinos, leituras, calibrações e histórico são copiados; a numeração continua após o maior número.
- `--new-base-url` troca o domínio apenas dos QR Codes em **modo teste** (o código permanente continua o mesmo). Nada é apagado no sistema antigo.

## Desenvolvimento local (com emuladores, sem tocar no Firebase real)
```bash
yarn install
yarn emulators                       # requer Java 21+
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_PROJECT_ID=demo-dinamico ADMIN_EMAIL=jeannmkt2@gmail.com PUBLIC_BASE_URL=http://localhost:5173 yarn dev:api
yarn dev --mode emulator             # usa .env.emulator.local
```
