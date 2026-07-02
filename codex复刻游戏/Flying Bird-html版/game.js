(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const resetProgressBtn = document.getElementById("resetProgressBtn");
  const resetDialog = document.getElementById("resetDialog");
  const resetConfirm = document.getElementById("resetConfirm");
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_H = 92;
  const GROUND_Y = H - GROUND_H;
  const SAVE_KEY = "zyq_flying_bird_best";

  const State = Object.freeze({ MENU: 0, PLAYING: 1, PAUSED: 2, GAME_OVER: 3 });
  let state = State.MENU;
  let lastTime = 0;
  let pipeTimer = 0;
  let score = 0;
  let bestScore = Number(localStorage.getItem(SAVE_KEY) || 0);
  let shake = 0;

  const bird = {
    x: 136,
    y: 260,
    vy: 0,
    r: 18,
    wing: 0,
  };

  let pipes = [];
  let clouds = [];

  function resetWorld() {
    state = State.PLAYING;
    bird.x = 136;
    bird.y = 260;
    bird.vy = 0;
    bird.wing = 0;
    pipes = [];
    clouds = makeClouds();
    pipeTimer = 1.08;
    score = 0;
    shake = 0;
  }

  function makeClouds() {
    return [
      { x: 44, y: 96, s: 1.0, v: 12 },
      { x: 220, y: 60, s: 0.7, v: 9 },
      { x: 370, y: 136, s: 0.85, v: 11 },
      { x: 110, y: 178, s: 0.55, v: 8 },
    ];
  }
  clouds = makeClouds();

  function difficulty() {
    const pipeSpeed = Math.min(305, 185 + score * 4.2);
    const gap = Math.max(132, 174 - score * 1.1);
    // 管道间隔加大：减少前后洞口高度差太大时几乎无法自然下落的问题。
    const spawn = Math.max(1.18, 1.65 - score * 0.007);
    return { pipeSpeed, gap, spawn };
  }

  function spawnPipe() {
    const { gap, pipeSpeed } = difficulty();
    const margin = 82;
    const minCenter = margin + gap / 2;
    const maxCenter = GROUND_Y - margin - gap / 2;
    const gapCenter = minCenter + Math.random() * (maxCenter - minCenter);
    pipes.push({
      x: W + 30,
      w: 76,
      gapY: gapCenter - gap / 2,
      gapH: gap,
      speed: pipeSpeed,
      scored: false,
    });
  }

  function jump() {
    if (state === State.MENU || state === State.GAME_OVER) {
      resetWorld();
      return;
    }
    if (state === State.PAUSED) return;
    bird.vy = -360;
    bird.wing = 1;
  }

  function gameOver() {
    if (state !== State.PLAYING) return;
    state = State.GAME_OVER;
    shake = 14;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(SAVE_KEY, String(bestScore));
    }
  }

  function update(dt) {
    clouds.forEach(c => {
      c.x -= c.v * dt;
      if (c.x < -120) c.x = W + 120 + Math.random() * 60;
    });

    if (state !== State.PLAYING) return;

    const { spawn } = difficulty();
    bird.vy += 910 * dt;
    bird.y += bird.vy * dt;
    bird.wing = Math.max(0, bird.wing - dt * 4);

    pipeTimer -= dt;
    if (pipeTimer <= 0) {
      spawnPipe();
      pipeTimer = spawn;
    }

    for (const p of pipes) {
      p.speed = difficulty().pipeSpeed;
      p.x -= p.speed * dt;
      if (!p.scored && bird.x > p.x + p.w) {
        p.scored = true;
        score += 1;
      }
    }
    pipes = pipes.filter(p => p.x + p.w > -30);

    if (bird.y + bird.r >= GROUND_Y) {
      bird.y = GROUND_Y - bird.r;
      gameOver();
    }
    if (bird.y - bird.r <= 0) {
      bird.y = bird.r;
      bird.vy = Math.max(0, bird.vy);
    }

    const birdRect = { x: bird.x - bird.r + 3, y: bird.y - bird.r + 3, w: bird.r * 2 - 6, h: bird.r * 2 - 6 };
    for (const p of pipes) {
      const top = { x: p.x, y: 0, w: p.w, h: p.gapY };
      const bottom = { x: p.x, y: p.gapY + p.gapH, w: p.w, h: GROUND_Y - (p.gapY + p.gapH) };
      if (rectHit(birdRect, top) || rectHit(birdRect, bottom)) gameOver();
    }
  }

  function rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    shake = Math.max(0, shake - 0.7);
    ctx.translate(sx, sy);

    drawBackground();
    pipes.forEach(drawPipe);
    drawGround();
    drawBird();
    drawHud();
    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, "#78d5ff");
    g.addColorStop(1, "#c7f0ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const c of clouds) drawCloud(c.x, c.y, c.s);

    ctx.fillStyle = "rgba(255,255,255,.22)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(70 + i * 130, 270 + Math.sin(i) * 15, 44, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCloud(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.beginPath();
    ctx.arc(0, 18, 22, 0, Math.PI * 2);
    ctx.arc(25, 4, 28, 0, Math.PI * 2);
    ctx.arc(58, 19, 22, 0, Math.PI * 2);
    ctx.rect(-2, 18, 64, 28);
    ctx.fill();
    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = "#d9b06a";
    ctx.fillRect(0, GROUND_Y, W, GROUND_H);
    ctx.fillStyle = "#6fc36b";
    ctx.fillRect(0, GROUND_Y, W, 18);
    ctx.strokeStyle = "rgba(70,100,40,.28)";
    ctx.lineWidth = 4;
    for (let x = -20; x < W + 20; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 22);
      ctx.lineTo(x + 18, H);
      ctx.stroke();
    }
  }

  function drawPipe(p) {
    drawPipePart(p.x, 0, p.w, p.gapY, true);
    drawPipePart(p.x, p.gapY + p.gapH, p.w, GROUND_Y - p.gapY - p.gapH, false);
  }

  function drawPipePart(x, y, w, h, top) {
    if (h <= 0) return;
    ctx.fillStyle = "#32b44a";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(x + 10, y + 6, 13, Math.max(0, h - 12));
    ctx.strokeStyle = "#186d2d";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    const lipH = 26;
    const lipY = top ? y + h - lipH : y;
    ctx.fillStyle = "#40ca58";
    ctx.fillRect(x - 7, lipY, w + 14, lipH);
    ctx.strokeStyle = "#186d2d";
    ctx.strokeRect(x - 7, lipY, w + 14, lipH);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    const angle = Math.max(-0.55, Math.min(0.9, bird.vy / 520));
    ctx.rotate(angle);

    ctx.fillStyle = "#ffd84b";
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9a6d00";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#ffef86";
    ctx.beginPath();
    ctx.ellipse(-6, 5 + bird.wing * 8, 11, 7, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8, -7, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(10, -7, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff8e2b";
    ctx.beginPath();
    ctx.moveTo(18, -1);
    ctx.lineTo(34, 4);
    ctx.lineTo(18, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a44d11";
    ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawText(String(score), W / 2, 72, 52, "#fff", "rgba(0,0,0,.35)");

    ctx.textAlign = "left";
    drawText(`Best ${bestScore}`, 18, 26, 18, "#fff", "rgba(0,0,0,.25)");

    if (state === State.MENU) {
      panel("Flying Bird", "空格 / 点击开始", "躲开管道，穿过一组得 1 分");
    } else if (state === State.PAUSED) {
      panel("Paused", "按 P 继续", "");
    } else if (state === State.GAME_OVER) {
      panel("Game Over", `Score: ${score}    Best: ${bestScore}`, "按 R 或点击重新开始");
    }
  }

  function panel(title, sub, tip) {
    ctx.save();
    ctx.fillStyle = "rgba(20,30,45,.72)";
    roundRect(54, 238, W - 108, 206, 18, true, false);
    ctx.textAlign = "center";
    drawText(title, W / 2, 292, 42, "#fff", "rgba(0,0,0,.28)");
    drawText(sub, W / 2, 348, 22, "#e7f7ff", "rgba(0,0,0,.22)");
    if (tip) drawText(tip, W / 2, 390, 17, "#bddff2", "rgba(0,0,0,.18)");
    ctx.restore();
  }

  function drawText(text, x, y, size, fill, stroke) {
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }


  function resetProgress() {
    localStorage.removeItem(SAVE_KEY);
    bestScore = 0;
    score = 0;
    state = State.MENU;
    bird.x = 136;
    bird.y = 260;
    bird.vy = 0;
    bird.wing = 0;
    pipes = [];
    clouds = makeClouds();
    pipeTimer = 0;
    shake = 0;
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      jump();
    } else if (e.code === "KeyR") {
      resetWorld();
    } else if (e.code === "KeyP") {
      if (state === State.PLAYING) state = State.PAUSED;
      else if (state === State.PAUSED) state = State.PLAYING;
    }
  });
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    jump();
  });
  resetProgressBtn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    resetDialog.showModal();
  });
  resetConfirm.addEventListener("click", e => {
    e.preventDefault();
    resetProgress();
    resetDialog.close();
  });

  requestAnimationFrame(loop);
})();
