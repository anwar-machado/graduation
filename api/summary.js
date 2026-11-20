import { handler, json, hasSession, getSummary } from "../lib/core.js";

export const GET = handler(async (request) => {
  if (!(await hasSession(request))) return json(401, { error: "Inicia sessão." });
  return json(200, await getSummary());
});
