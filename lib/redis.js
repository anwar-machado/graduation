// Acesso ao Redis.
// - Na Vercel: Upstash Redis pela API REST (sem bibliotecas).
// - No seu computador (sem Upstash configurado): imitação em memória,
//   salvando as respostas em votes.json para não perder ao reiniciar.
import fs from "node:fs";
import path from "node:path";

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/**
 * Executa um ou mais comandos de uma vez (pipeline) e devolve os resultados em ordem.
 * Ex.: const [a, b] = await redis(["GET", "x"], ["INCR", "y"]);
 */
export const redis = REST_URL && REST_TOKEN ? upstash : process.env.VERCEL ? notConfigured : memory;

// Na Vercel não existe disco permanente: sem Redis os dados se perderiam, então recusa tudo
async function notConfigured() {
  throw new Error("Upstash Redis não configurado: crie em Storage → Upstash for Redis e faça Redeploy.");
}

async function upstash(...commands) {
  const res = await fetch(`${REST_URL.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Upstash respondeu ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(`Upstash: ${r.error}`);
    return r.result;
  });
}

// ---------------------------------------------------------------------------
// Imitação local (só os comandos usados pelo app)
// ---------------------------------------------------------------------------
const DATA_FILE = path.join(process.env.DATA_DIR || process.cwd(), "votes.json");
const store = new Map(); // chave -> { value, exp }
const hashes = new Map(); // chave -> Map(campo -> valor)

if (redis === memory) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const votes = new Map();
    for (const [k, v] of Object.entries(saved)) votes.set(k, JSON.stringify(v));
    hashes.set("votes", votes);
  } catch (err) {
    if (err.code !== "ENOENT") throw err; // não sobrescreve um arquivo corrompido
  }
}

function persistVotes() {
  const obj = {};
  for (const [k, v] of hashes.get("votes") || []) obj[k] = JSON.parse(v);
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function live(key) {
  const e = store.get(key);
  if (e && e.exp && e.exp < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e;
}

async function memory(...commands) {
  return commands.map(([cmd, key, ...args]) => {
    cmd = cmd.toUpperCase();
    const h = hashes.get(key);
    switch (cmd) {
      case "GET": return live(key)?.value ?? null;
      case "SET": {
        const exIdx = args.findIndex((a) => String(a).toUpperCase() === "EX");
        const exp = exIdx >= 0 ? Date.now() + Number(args[exIdx + 1]) * 1000 : 0;
        store.set(key, { value: String(args[0]), exp });
        return "OK";
      }
      case "DEL": return store.delete(key) || hashes.delete(key) ? 1 : 0;
      case "INCR": {
        const e = live(key);
        const value = String(Number(e?.value || 0) + 1);
        store.set(key, { value, exp: e?.exp || 0 });
        return Number(value);
      }
      case "EXPIRE": {
        const e = live(key);
        if (!e) return 0;
        if (String(args[1] || "").toUpperCase() === "NX" && e.exp) return 0;
        e.exp = Date.now() + Number(args[0]) * 1000;
        return 1;
      }
      case "HSET": {
        const map = h || new Map();
        hashes.set(key, map);
        const isNew = !map.has(args[0]);
        map.set(args[0], String(args[1]));
        if (key === "votes") persistVotes();
        return isNew ? 1 : 0;
      }
      case "HEXISTS": return h?.has(args[0]) ? 1 : 0;
      case "HLEN": return h?.size || 0;
      case "HGETALL": return h ? [...h].flat() : [];
      default: throw new Error(`Comando não suportado na imitação local: ${cmd}`);
    }
  });
}
