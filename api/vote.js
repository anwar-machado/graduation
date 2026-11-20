import {
  handler, json, log, checkJsonPost, readJson, clientIp, hitLimit,
  cleanName, saveVote, DEADLINE, VOTE_LIMIT,
} from "../lib/core.js";

export const POST = handler(async (request) => {
  const bad = checkJsonPost(request);
  if (bad) return bad;

  if (DEADLINE && Date.now() > DEADLINE.getTime()) {
    return json(403, { error: "As confirmações foram encerradas." });
  }

  const ip = clientIp(request);
  if (await hitLimit("vote", ip, VOTE_LIMIT)) {
    log("Limite de respostas atingido");
    return json(429, { error: "Demasiadas respostas seguidas. Aguarda alguns minutos." });
  }

  const { body, error } = await readJson(request);
  if (error) return error;

  // Campo-armadilha preenchido = robô. Finge sucesso e não grava nada.
  if (body.website) {
    log("Bot descartado");
    return json(200, { ok: true });
  }

  const name = cleanName(body.name);
  if (!name) return json(400, { error: "Nome inválido. Usa apenas letras, espaços, hífen ou apóstrofo." });
  if (typeof body.going !== "boolean") return json(400, { error: "Resposta inválida." });

  if (!(await saveVote(name, body.going))) {
    return json(503, { error: "Limite de respostas atingido. Fala com o organizador." });
  }
  log(`Resposta registada (${body.going ? "vai" : "não vai"})`);
  return json(200, { ok: true });
});
