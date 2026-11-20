# Confirmação de presença — Festa de Formatura

- `/` — página para os convidados confirmarem
- `/admin` — totais atualizados a cada 4 s (pede login em `/login`)

Sem dependências: não precisa de `npm install`.

## Estrutura

```
public/    páginas e arquivos públicos (HTML, CSS, JS, imagem)
api/       funções do servidor (rodam na Vercel)
lib/       regras compartilhadas + acesso ao Redis
private/   página do admin (só entregue para quem está logado)
local-server.js  servidor LOCAL que imita a Vercel (não é usado na Vercel)
```

## Rodar no seu computador

1. Copie `.env.example` para `.env` e preencha.
2. `node local-server.js` → http://localhost:3000

Sem Upstash configurado, os dados ficam em memória + `votes.json` (só para testes).

## Publicar na Vercel

1. **Envie o projeto para o GitHub** (o `.gitignore` já exclui `.env` e `votes.json`).
2. Na Vercel: **Add New → Project →** importe o repositório.
   - Framework Preset: **Other**. Não mude Build/Output (o `vercel.json` já configura).
3. **Banco de dados:** no projeto, aba **Storage → Create Database → Upstash for Redis** (plano Free) → conecte ao projeto.
   Isso cria sozinho as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
4. **Settings → Environment Variables**, adicione:
   - `ADMIN_USER` = `Amor do Ray`
   - `ADMIN_PASSWORD` = a mesma senha do seu `.env` (ou outra, mín. 12 caracteres)
   - `RSVP_DEADLINE` (opcional) = ex.: `2026-12-20T23:59:00-03:00`
5. **Deployments → Redeploy** (variáveis novas só valem depois de um novo deploy).
6. Teste: abra o link, confirme um nome, entre em `/admin`.

Alternativa sem GitHub: `npx vercel` dentro da pasta (o `.vercelignore` impede o envio do `.env`).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ADMIN_USER` | não | Usuário do admin (padrão `Amor do Ray`; não diferencia maiúsculas) |
| `ADMIN_PASSWORD` | **sim** | Senha do admin, mín. 12 caracteres |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | **sim na Vercel** | Criadas pela integração Upstash (também aceita `UPSTASH_REDIS_REST_URL` / `_TOKEN`) |
| `RSVP_DEADLINE` | não | Fecha as confirmações nessa data |

## Quando a festa acabar

1. Se quiser guardar a lista, abra o admin na aba "Todos".
2. Apague o **banco Upstash** (Storage) e o **projeto** na Vercel — o banco contém nomes de pessoas.

## Limites do plano grátis

- Upstash Free: 500 mil comandos/mês. Cada resposta usa ~5; o admin aberto usa ~2 a cada 4 s
  (pausa sozinho quando a aba fica em segundo plano). Não deixe o admin aberto em primeiro plano o dia todo.

## Segurança implementada

- Admin com tela de login, sessão no Redis e cookie `__Host-` `HttpOnly` + `Secure` + `SameSite=Strict`, expira em 12 h; "Sair" invalida a sessão
- Página do admin só é entregue a quem está logado; dados só pela API autenticada
- Usuário/senha comparados em tempo constante; bloqueio de 15 min após 10 erros por IP
- Validação dos nomes no servidor (letras, espaço, hífen, apóstrofo, ponto; 2–60 caracteres)
- Sem SQL (sem SQL injection); comandos do Redis enviados como lista JSON (sem injeção de comandos)
- Lista do admin montada com `textContent` (sem XSS) + CSP rígida sem scripts inline
- Proteção CSRF (exige JSON e checa `Origin`)
- Limites: 30 respostas / 10 min por IP, 2 KB por requisição, máx. 2000 nomes
- Campo-armadilha contra bots
- IPs e tokens guardados só como hash
- Cabeçalhos: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, noindex
- Erros internos não aparecem para o visitante; se o banco cair, nada é aceito sem ser gravado
- Zero dependências externas
