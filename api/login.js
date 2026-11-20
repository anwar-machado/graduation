import {
  handler, json, log, checkJsonPost, readJson, clientIp,
  isBlocked, hitLimit, checkCredentials, createSession, LOGIN_LIMIT,
} from "../lib/core.js";

export const POST = handler(async (request) => {
  const bad = checkJsonPost(request);
  if (bad) return bad;

  const ip = clientIp(request);
  if (await isBlocked("login", ip, LOGIN_LIMIT)) {
    return json(429, { error: "Muitas tentativas. Tente de novo em 15 minutos." });
  }

  const { body, error } = await readJson(request);
  if (error) return error;

  if (!checkCredentials(String(body.user || ""), String(body.pass || ""))) {
    await hitLimit("login", ip, LOGIN_LIMIT);
    log("Login de admin falhou");
    return json(401, { error: "Usuário ou senha incorretos." });
  }

  log("Login de admin");
  return json(200, { ok: true }, { "Set-Cookie": await createSession(request) });
});
