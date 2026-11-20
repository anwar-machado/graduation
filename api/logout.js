import { handler, json, checkJsonPost, destroySession } from "../lib/core.js";

export const POST = handler(async (request) => {
  const bad = checkJsonPost(request);
  if (bad) return bad;
  return json(200, { ok: true }, { "Set-Cookie": await destroySession(request) });
});
