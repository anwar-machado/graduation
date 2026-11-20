// Efeito de confete simples em canvas, sem bibliotecas
function launchConfetti() {
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ["#f59e0b", "#fbbf24", "#16a34a", "#3b82f6", "#ec4899", "#a855f7", "#ffffff"];
  const shapes = ["rect", "circle", "cap"];
  const pieces = [];

  // Duas "explosões" vindas dos cantos de baixo + chuva do topo
  for (let i = 0; i < 90; i++) {
    const left = i % 2 === 0;
    pieces.push({
      x: left ? 0 : innerWidth,
      y: innerHeight,
      vx: (left ? 1 : -1) * (4 + Math.random() * 8),
      vy: -(12 + Math.random() * 10),
    });
  }
  for (let i = 0; i < 80; i++) {
    pieces.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: Math.random() * 2 - 1, vy: Math.random() * 3 });
  }
  pieces.forEach((p) => {
    p.size = 6 + Math.random() * 8;
    p.color = colors[(Math.random() * colors.length) | 0];
    p.shape = Math.random() < 0.08 ? "cap" : shapes[(Math.random() * 2) | 0];
    p.rot = Math.random() * Math.PI;
    p.vr = (Math.random() - 0.5) * 0.3;
  });

  const start = performance.now();
  function frame(t) {
    const elapsed = t - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = elapsed > 3000 ? Math.max(0, 1 - (elapsed - 3000) / 1000) : 1;

    for (const p of pieces) {
      p.vy += 0.3;          // gravidade
      p.vx *= 0.99;         // resistência do ar
      p.vy = Math.min(p.vy, 6);
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === "cap") {
        ctx.font = `${p.size * 2.2}px serif`;
        ctx.fillText("🎓", -p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
      }
      ctx.restore();
    }

    if (elapsed < 4000) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  requestAnimationFrame(frame);
}
