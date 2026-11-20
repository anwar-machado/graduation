// Regras e utilidades compartilhadas pelas funções em /api
import crypto from "node:crypto";
import { redis } from "./redis.js";

// ---------------------------------------------------------------------------
// Configuração (variáveis de ambiente)
// ---------------------------------------------------------------------------
const ADMIN_USER = (process.env.ADMIN_USER || "Amor do Ray").trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const DEADLINE = process.env.RSVP_DEADLINE ? new Date(process.env.RSVP_DEADLINE) : null;

const MAX_VOTES = 2000; // limite total de nomes
const MAX_BODY = 2 * 1024; // 2 KB por requisição
const SESSION_TTL_SEC = 12 * 60 * 60; // login dura 12 horas
export const VOTE_LIMIT = { max: 30, windowSec: 10 * 60 }; // 30 respostas / 10 min por IP
export const LOGIN_LIMIT = { max: 10, windowSec: 15 * 60 }; // 10 erros / 15 min por IP

export function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest();

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------
export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function redirect(location) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

/** Envolve a função: qualquer erro vira 500 genérico (sem vazar detalhes ao visitante). */
export function handler(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      log(`Erro interno: ${err.stack || err}`);
      return json(500, { error: "Erro interno. Tente novamente." });
    }
  };
}

// ---------------------------------------------------------------------------
// Requisição
// ---------------------------------------------------------------------------
export function clientIp(request) {
  // Na Vercel estes cabeçalhos são definidos pela própria plataforma (não dá para forjar).
  // No servidor local, o server.js também os sobrescreve com o IP real da conexão.
  return (
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "desconhecido"
  );
}

function isHttps(request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

/** Exige JSON e bloqueia envios vindos de outros sites (CSRF). Retorna uma resposta de erro ou null. */
export function checkJsonPost(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) {
    return json(415, { error: "Formato inválido." });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* origem inválida */ }
    if (host !== request.headers.get("host")) return json(403, { error: "Origem não permitida." });
  }
  return null;
}

/** Lê o corpo JSON com limite de tamanho. Retorna { body } ou { error: Response }. */
export async function readJson(request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) {
    return { error: json(413, { error: "Requisição grande demais." }) };
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { error: json(413, { error: "Requisição grande demais." }) };
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: json(400, { error: "Requisição inválida." }) };
  }
  return { body };
}

// ---------------------------------------------------------------------------
// Limite de tentativas por IP (guardado no Redis, vale entre todas as instâncias)
// ---------------------------------------------------------------------------
const rlKey = (kind, ip) => `rl:${kind}:${sha256(ip).toString("hex").slice(0, 32)}`;

export async function isBlocked(kind, ip, { max }) {
  const [count] = await redis(["GET", rlKey(kind, ip)]);
  return Number(count || 0) >= max;
}

/** Conta uma tentativa. Retorna true se passou do limite. */
export async function hitLimit(kind, ip, { max, windowSec }) {
  const key = rlKey(kind, ip);
  const [count] = await redis(["INCR", key], ["EXPIRE", key, windowSec, "NX"]);
  return Number(count) > max;
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------
// "Ana Souza", "ana  souza" e "Âna Souza" contam como a mesma pessoa
export function nameKey(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Só letras (qualquer idioma), acentos, espaço, hífen, apóstrofo e ponto
const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;

export function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return null;
  if (!NAME_RE.test(name)) return null;
  if ((name.match(/\p{L}/gu) || []).length < 2) return null;
  return name;
}

// ---------------------------------------------------------------------------
// Respostas (hash "votes" no Redis: campo = nome normalizado)
// ---------------------------------------------------------------------------
export async function saveVote(name, going) {
  const key = nameKey(name);
  const [exists, total] = await redis(["HEXISTS", "votes", key], ["HLEN", "votes"]);
  if (!Number(exists) && Number(total) >= MAX_VOTES) return false;
  await redis(["HSET", "votes", key, JSON.stringify({ name, going, updatedAt: Date.now() })]);
  return true;
}

export async function getSummary() {
  const [flat] = await redis(["HGETALL", "votes"]);
  const list = [];
  for (let i = 1; i < (flat || []).length; i += 2) {
    try {
      const v = JSON.parse(flat[i]);
      if (typeof v.name === "string" && typeof v.going === "boolean") {
        list.push({ name: v.name, going: v.going, updatedAt: Number(v.updatedAt) || 0 });
      }
    } catch { /* ignora registro inválido */ }
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  const yes = list.filter((v) => v.going).length;
  return { yes, no: list.length - yes, list };
}

// ---------------------------------------------------------------------------
// Login do admin (sessão guardada no Redis; cookie só tem um token aleatório)
// ---------------------------------------------------------------------------
// Usuário não diferencia maiúsculas/minúsculas nem espaços extras (celular costuma capitalizar)
const userKey = (u) => String(u).normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export function checkCredentials(user, pass) {
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD não definida ou com menos de 12 caracteres.");
  }
  // Comparação em tempo constante (evita ataque de temporização)
  const okUser = crypto.timingSafeEqual(sha256(userKey(user)), sha256(userKey(ADMIN_USER)));
  const okPass = crypto.timingSafeEqual(sha256(pass), sha256(ADMIN_PASSWORD));
  return okUser && okPass;
}

// Em HTTPS usa o prefixo __Host- (o navegador garante Secure, Path=/ e sem Domain)
const cookieName = (request) => (isHttps(request) ? "__Host-sid" : "sid");

function cookie(request, value, maxAge) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` +
    (isHttps(request) ? "; Secure" : "");
}

function readToken(request) {
  const name = cookieName(request);
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      const token = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    }
  }
  return null;
}

// Guarda só o hash do token: quem ler o banco não consegue montar um cookie válido
const sessionKey = (token) => `sess:${sha256(token).toString("hex")}`;

/** Cria a sessão e devolve o cabeçalho Set-Cookie. */
export async function createSession(request) {
  const token = crypto.randomBytes(32).toString("base64url");
  await redis(["SET", sessionKey(token), "1", "EX", SESSION_TTL_SEC]);
  return cookie(request, token, SESSION_TTL_SEC);
}

export async function hasSession(request) {
  const token = readToken(request);
  if (!token) return false;
  const [value] = await redis(["GET", sessionKey(token)]);
  return value === "1";
}

/** Apaga a sessão e devolve o cabeçalho Set-Cookie que limpa o cookie. */
export async function destroySession(request) {
  const token = readToken(request);
  if (token) await redis(["DEL", sessionKey(token)]);
  return cookie(request, "", 0);
}
