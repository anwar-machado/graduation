// Servidor LOCAL que imita a Vercel, para testar no seu computador: node local-server.js
// Na Vercel este arquivo não é usado (lá as páginas vêm de public/ e as funções de api/).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Carrega o .env ANTES de importar as funções (elas leem as variáveis ao carregar)
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(ROOT, "public");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const securityHeaders = config.headers[0].headers;
const rewrites = Object.fromEntries(config.rewrites.map((r) => [r.source, r.destination]));

// Funções de api/ (mesmos arquivos que rodam na Vercel)
const functions = {};
for (const file of fs.readdirSync(path.join(ROOT, "api"))) {
  if (file.endsWith(".js")) functions[`/api/${file.slice(0, -3)}`] = await import(`./api/${file}`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function staticFile(pathname) {
  // cleanUrls: /login -> login.html, / -> index.html
  let rel = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!path.extname(rel)) rel += ".html";
  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return null; // bloqueia ../
  try {
    return { data: fs.readFileSync(full), type: MIME[path.extname(full)] || "application/octet-stream" };
  } catch {
    return null;
  }
}

async function callFunction(mod, req, res, url) {
  const method = req.method === "HEAD" ? "GET" : req.method;
  const fn = mod[method];
  if (!fn) {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Método não permitido.");
  }

  // Como a Vercel: o IP do visitante vem da conexão real, nunca do que o cliente mandou
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, String(v));
  headers.set("x-real-ip", req.socket.remoteAddress || "");
  headers.set("x-forwarded-for", req.socket.remoteAddress || "");
  headers.delete("x-forwarded-proto");

  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 64 * 1024) {
        res.writeHead(413).end();
        return req.destroy();
      }
      chunks.push(c);
    }
    body = Buffer.concat(chunks);
  }

  const response = await fn(new Request(url, { method: req.method, headers, body }));
  const out = {};
  response.headers.forEach((v, k) => { if (k !== "set-cookie") out[k] = v; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out["set-cookie"] = cookies;
  res.writeHead(response.status, out);
  res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    for (const { key, value } of securityHeaders) res.setHeader(key, value);
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = rewrites[url.pathname] || url.pathname;

    if (functions[pathname]) return await callFunction(functions[pathname], req, res, url);
    if (pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Não encontrado.");
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Método não permitido.");
    }
    if (pathname.endsWith(".html")) {
      // como cleanUrls na Vercel: /login.html -> /login
      res.writeHead(308, { Location: pathname.slice(0, -5) || "/" });
      return res.end();
    }
    const file = staticFile(pathname);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Não encontrado.");
    }
    res.writeHead(200, { "Content-Type": file.type, "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : file.data);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro interno.");
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;

server.listen(PORT, () => {
  const storage = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ? "Upstash Redis" : "memória + votes.json";
  console.log(`🎓 Confirmação: http://localhost:${PORT}/`);
  console.log(`📊 Admin:       http://localhost:${PORT}/admin`);
  console.log(`💾 Dados em:    ${storage}`);
});
