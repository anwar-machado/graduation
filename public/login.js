"use strict";

const $ = (id) => document.getElementById(id);

// Já está logado? Vai direto para o admin.
fetch("/api/summary", { cache: "no-store" })
  .then((res) => { if (res.ok) location.replace("/admin"); })
  .catch(() => {});

function fail(message, field) {
  $("status").textContent = message;
  const input = $(field);
  input.classList.remove("shake");
  void input.offsetWidth; // reinicia a animação
  input.classList.add("shake");
  input.focus();
}

$("showPass").addEventListener("click", () => {
  const pass = $("pass");
  const show = pass.type === "password";
  pass.type = show ? "text" : "password";
  $("showPass").textContent = show ? "Ocultar" : "Mostrar";
  $("showPass").setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
});

["user", "pass"].forEach((id) => $(id).addEventListener("input", () => $(id).classList.remove("shake")));

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = $("user").value.trim();
  const pass = $("pass").value;
  if (!user) return fail("Digite o usuário", "user");
  if (!pass) return fail("Digite a senha", "pass");

  $("btnLogin").disabled = true;
  $("status").textContent = "Entrando...";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pass }),
    });
    if (res.ok) {
      location.replace("/admin");
      return;
    }
    const data = await res.json().catch(() => ({}));
    $("pass").value = "";
    fail(data.error || "Não foi possível entrar.", "pass");
  } catch {
    $("status").textContent = "Sem conexão. Tente novamente.";
  } finally {
    $("btnLogin").disabled = false;
  }
});
