// Entrega a página do admin só para quem está logado (/admin é redirecionado para cá)
import fs from "node:fs";
import { handler, hasSession, redirect } from "../lib/core.js";

const page = fs.readFileSync(new URL("../private/admin.html", import.meta.url));

export const GET = handler(async (request) => {
  if (!(await hasSession(request))) return redirect("/login");
  return new Response(page, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
});
