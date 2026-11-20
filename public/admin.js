"use strict";

const $ = (id) => document.getElementById(id);
let data = { yes: 0, no: 0, list: [] };
let filter = "yes";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function setNum(el, statEl, value) {
  if (el.textContent !== String(value)) {
    el.textContent = value;
    statEl.classList.remove("bump");
    void statEl.offsetWidth; // reinicia a animação
    statEl.classList.add("bump");
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent: nunca interpreta HTML
  return node;
}

function render() {
  setNum($("yes"), $("statYes"), data.yes);
  setNum($("no"), $("statNo"), data.no);

  const items = data.list.filter((v) => filter === "all" || (filter === "yes" ? v.going : !v.going));
  const list = $("list");
  list.replaceChildren();

  if (!items.length) {
    list.append(el("li", "empty", "Ainda não há ninguém aqui."));
    return;
  }
  for (const v of items) {
    const li = el("li");
    li.append(
      el("span", `avatar ${v.going ? "yes" : "no"}`, initials(v.name)),
      el("span", "name", v.name),
      el("span", "when", new Date(v.updatedAt).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }))
    );
    list.append(li);
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    filter = tab.dataset.filter;
    render();
  });
});

// Atualização automática: consulta os totais a cada 4 segundos (pausa quando a aba está escondida)
const POLL_MS = 4000;
let timer = null;
let stopped = false;

async function refresh() {
  clearTimeout(timer);
  if (stopped) return;
  try {
    const res = await fetch("/api/summary", { cache: "no-store" });
    if (res.status === 401) return location.replace("/login"); // sessão expirou
    if (!res.ok) throw new Error();
    data = await res.json();
    render();
    $("live").classList.add("on");
    $("liveText").textContent = "Em direto";
  } catch {
    $("live").classList.remove("on");
    $("liveText").textContent = "A ligar novamente...";
  }
  if (!document.hidden) timer = setTimeout(refresh, POLL_MS);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(timer);
  else refresh();
});

$("btnLogout").addEventListener("click", async () => {
  stopped = true;
  clearTimeout(timer);
  try {
    await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } finally {
    location.replace("/login");
  }
});

refresh();
