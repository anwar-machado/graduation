"use strict";

const $ = (id) => document.getElementById(id);
const nameInput = $("name");

// Mesmas regras do servidor (o servidor é quem decide de verdade)
const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;

// Forma "ondulada" do selo (estilo selo de verificado)
(function buildBadge() {
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const r = 44 + 4 * Math.cos(a * 10);
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  $("badgeShape").setAttribute("d", "M" + pts.join("L") + "Z");
})();

// A contagem é por nome: o mesmo nome atualiza a resposta, e um mesmo
// celular pode responder por várias pessoas (uma de cada vez).

function openSheet(going, name) {
  const first = name.split(/\s+/)[0];
  const badge = $("badge");
  badge.classList.toggle("sad", !going);
  $("badgeIcon").setAttribute("d", going ? "M33 51 L45 63 L68 39" : "M36 50 L64 50");
  $("sheetTitle").textContent = going ? "Presença confirmada!" : "Que pena!";
  $("sheetText").textContent = going
    ? `Oba, ${first}! Sua presença foi registrada. Te esperamos na festa! 🎓`
    : `Obrigado por avisar, ${first}. Se mudar de ideia, é só voltar aqui.`;

  $("overlay").classList.add("open");
  $("overlay").setAttribute("aria-hidden", "false");
  if (going) setTimeout(launchConfetti, 350);
  setTimeout(() => $("btnDone").focus(), 400);
}

function closeSheet() {
  $("overlay").classList.remove("open");
  $("overlay").setAttribute("aria-hidden", "true");
}

function invalid(message) {
  nameInput.classList.remove("shake");
  void nameInput.offsetWidth; // reinicia a animação
  nameInput.classList.add("shake");
  nameInput.focus();
  $("status").textContent = message;
}

async function vote(going) {
  const name = nameInput.value.replace(/\s+/g, " ").trim();
  if (!name) return invalid("Digite seu nome para continuar");
  if (name.length < 2 || !NAME_RE.test(name)) {
    return invalid("Use só letras, espaços, hífen ou apóstrofo no nome");
  }

  $("btnYes").disabled = $("btnNo").disabled = true;
  $("status").textContent = "Enviando...";
  try {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, going, website: $("website").value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      $("status").textContent = data.error || "Não foi possível enviar. Tente novamente.";
      return;
    }

    $("status").textContent = "Vai responder por mais alguém? É só digitar outro nome.";
    nameInput.value = "";
    openSheet(going, name);
  } catch {
    $("status").textContent = "Sem conexão. Verifique a internet e tente novamente.";
  } finally {
    $("btnYes").disabled = $("btnNo").disabled = false;
  }
}

$("btnYes").addEventListener("click", () => vote(true));
$("btnNo").addEventListener("click", () => vote(false));
nameInput.addEventListener("input", () => nameInput.classList.remove("shake"));
$("btnDone").addEventListener("click", closeSheet);
$("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
