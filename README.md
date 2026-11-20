# Confirmação de presença — Festa de Formatura

- `/` — página para os convidados confirmarem
- `/admin` — totais em tempo real (pede login em `/login`, com usuário e senha do `.env`)

Não precisa de `npm install`: só Node.js 18+.

## Rodar

1. Copie `.env.example` para `.env` e preencha `ADMIN_PASSWORD` (o `.env` nunca deve ser publicado nem enviado ao Git).
2. Rode:

```bash
node server.js
```

O servidor lê o `.env` sozinho. Variáveis definidas direto no ambiente (ex.: no painel da hospedagem) têm prioridade sobre o `.env`.

## Variáveis de ambiente (`.env`)

| Variável         | Obrigatória | Para quê |
|------------------|-------------|----------|
| `ADMIN_USER`     | não         | Usuário do admin (padrão: `Amor do Ray`). Não diferencia maiúsculas/minúsculas. |
| `ADMIN_PASSWORD` | sim         | Senha do `/admin` (mín. 12 caracteres). Sem ela, uma senha temporária é gerada a cada início e aparece no log. |
| `TRUST_PROXY`    | em hospedagem | `1` quando roda atrás de Render/Railway/Nginx (pega o IP real do visitante e liga o HSTS). **Não use rodando direto na internet.** |
| `RSVP_DEADLINE`  | não         | Fecha as confirmações nessa data, ex.: `2026-12-20T23:59:00-03:00` |
| `DATA_DIR`       | não         | Pasta onde fica o `votes.json` (use um disco persistente na hospedagem) |
| `PORT`           | não         | Porta (padrão 3000; a hospedagem costuma definir sozinha) |

## Publicar (ex.: Render ou Railway)

1. Suba esta pasta **sem o `.env` e sem o `votes.json`** (o `.gitignore` já exclui os dois).
2. Comando de início: `node server.js`
3. No painel de variáveis de ambiente da hospedagem, defina `ADMIN_PASSWORD` e `TRUST_PROXY=1`.
4. Crie um disco persistente e aponte `DATA_DIR` para ele. Sem isso, as respostas somem quando o serviço reinicia.
5. Use sempre o endereço **https://**.

## Quando a festa acabar

1. Baixe o `votes.json` se quiser guardar a lista.
2. Apague o serviço **e o disco** na hospedagem (contém nomes de pessoas).

## Segurança implementada

- Admin com tela de login e sessão em cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` em HTTPS), expira em 12 h, botão Sair invalida a sessão
- Comparação de usuário/senha em tempo constante, bloqueio de 15 min após 10 tentativas erradas por IP
- Validação dos nomes no servidor (só letras, espaços, hífen, apóstrofo, ponto; 2–60 caracteres)
- Sem banco SQL (não há SQL injection); dados em `Map` (sem prototype pollution)
- Admin monta a lista com `textContent` (sem XSS) + CSP rígida sem scripts inline
- Proteção CSRF (exige JSON e checa `Origin`)
- Limite de 30 respostas / 10 min por IP, limite de 2 KB por requisição, máx. 2000 nomes, máx. 20 conexões ao vivo
- Campo-armadilha contra bots
- Só serve arquivos de uma lista fechada (sem path traversal; `votes.json` e `server.js` nunca são servidos)
- Cabeçalhos: CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS (atrás de HTTPS), noindex
- Tempo limite contra conexões lentas (slowloris), gravação atômica do arquivo com permissão 600
- Erros internos não são mostrados ao visitante; logs de senhas erradas, bots e limites atingidos
- Zero dependências externas (nada de pacote vulnerável)
