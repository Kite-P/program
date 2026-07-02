(() => {
  "use strict";

  const ROWS = 18;
  const COLS = 18;
  const POINTS = ROWS * COLS;
  const DIRS = ["n", "u", "d", "l", "r"];
  const DELTA = { u: [-1, 0], d: [1, 0], l: [0, -1], r: [0, 1] };
  const OPP = { u: "d", d: "u", l: "r", r: "l", n: "n" };
  const ALPHABET = "0123456789ABCDEFGHIJKLMNO";
  const SAVE_UNLOCK = "zyq_arrow_unlocked";
  const SAVE_DONE = "zyq_arrow_done";
  const SAVE_CHEAT = "zyq_arrow_cheat"; // 兼容清理旧版本存档；新版作弊模式不保存。

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const ui = {
    menu: document.getElementById("menu"),
    gamePanel: document.getElementById("gamePanel"),
    modeText: document.getElementById("modeText"),
    timerText: document.getElementById("timerText"),
    heartText: document.getElementById("heartText"),
    seedOutput: document.getElementById("seedOutput"),
    message: document.getElementById("message"),
    levelDialog: document.getElementById("levelDialog"),
    levelsGrid: document.getElementById("levelsGrid"),
    seedDialog: document.getElementById("seedDialog"),
    seedInput: document.getElementById("seedInput"),
    seedError: document.getElementById("seedError"),
    adminDialog: document.getElementById("adminDialog"),
    adminInput: document.getElementById("adminInput"),
    adminError: document.getElementById("adminError"),
    adminBtn: document.getElementById("adminBtn"),
    adminConfirm: document.getElementById("adminConfirm"),
    resetProgressBtn: document.getElementById("resetProgressBtn"),
    resetDialog: document.getElementById("resetDialog"),
    resetConfirm: document.getElementById("resetConfirm"),
    helpDialog: document.getElementById("helpDialog"),
    backBtn: document.getElementById("backBtn"),
    restartBtn: document.getElementById("restartBtn"),
    gridBtn: document.getElementById("gridBtn"),
    hintBtn: document.getElementById("hintBtn"),
    eraseBtn: document.getElementById("eraseBtn"),
    levelModeBtn: document.getElementById("levelModeBtn"),
    randomBtn: document.getElementById("randomBtn"),
    seedBtn: document.getElementById("seedBtn"),
    helpBtn: document.getElementById("helpBtn"),
    playSeedConfirm: document.getElementById("playSeedConfirm"),
    statusActions: document.getElementById("statusActions"),
    nextLevelBtn: document.getElementById("nextLevelBtn"),
    randomRetryBtn: document.getElementById("randomRetryBtn"),
    randomNewBtn: document.getElementById("randomNewBtn"),
    menuMessage: document.getElementById("menuMessage"),
  };

  let unlocked = Math.max(1, Number(localStorage.getItem(SAVE_UNLOCK) || 1));
  let done = safeJson(localStorage.getItem(SAVE_DONE), {});
  let cheat = false;
  localStorage.removeItem(SAVE_CHEAT);

  let game = null;
  let lastTime = 0;
  let zoom = 1;
  let highlightedArrowId = null;
  let flashTimer = 0;
  let animation = null;

  function safeJson(text, fallback) {
    try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
  }
  function saveProgress() {
    localStorage.setItem(SAVE_UNLOCK, String(unlocked));
    localStorage.setItem(SAVE_DONE, JSON.stringify(done));
  }
  function idx(r, c) { return r * COLS + c; }
  function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
  function codeOf(headSide, tailSide) { return DIRS.indexOf(headSide) * 5 + DIRS.indexOf(tailSide); }
  function dirsOf(v) { return [DIRS[Math.floor(v / 5)], DIRS[v % 5]]; }
  function dirBetween(a, b) {
    const dr = b.r - a.r;
    const dc = b.c - a.c;
    if (dr === -1 && dc === 0) return "u";
    if (dr === 1 && dc === 0) return "d";
    if (dr === 0 && dc === -1) return "l";
    if (dr === 0 && dc === 1) return "r";
    return null;
  }
  function seedKey(time, i) { return (time + i * 7 + 13) % 25; }
  function checksum(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h % (36 ** 4)).toString(36).toUpperCase().padStart(4, "0");
  }
  function groupSeed(raw) {
    return raw.match(/.{1,4}/g).join("-");
  }
  function normalizeSeed(seed) {
    return String(seed || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  }
  function encodeSeed(grid, timeLimit) {
    const time = Math.max(300, Math.min(900, Math.round(timeLimit)));
    const timePart = time.toString(36).toUpperCase().padStart(3, "0");
    let body = "";
    for (let i = 0; i < POINTS; i++) {
      body += ALPHABET[(grid[i] + seedKey(time, i)) % 25];
    }
    const check = checksum(timePart + body);
    return groupSeed(timePart + body + check);
  }
  function decodeSeed(seed) {
    const clean = normalizeSeed(seed);
    const expected = 3 + POINTS + 4;
    if (clean.length !== expected) throw new Error(`Seed 长度错误，应为 ${expected} 个有效字符。`);
    const timePart = clean.slice(0, 3);
    let time = parseInt(timePart, 36);
    // 兼容第三版误生成的内置 seed：前三位被写成了十进制秒数，例如 386、555、900。
    if ((!Number.isFinite(time) || time < 300 || time > 900) && /^\d{3}$/.test(timePart)) {
      time = Number(timePart);
    }
    if (!Number.isFinite(time) || time < 300 || time > 900) throw new Error("Seed 中的时间限制不合法。有效范围是 5 到 15 分钟。");
    const body = clean.slice(3, 3 + POINTS);
    const check = clean.slice(3 + POINTS);
    if (check !== checksum(timePart + body)) throw new Error("Seed 校验失败，可能是复制不完整或被改过。 ");
    const grid = [];
    for (let i = 0; i < POINTS; i++) {
      const enc = ALPHABET.indexOf(body[i]);
      if (enc < 0) throw new Error("Seed 中含有非法字符。 ");
      grid.push((enc - seedKey(time, i) + 25) % 25);
    }
    validateGridValues(grid);
    const parsed = parseArrows(grid);
    const solved = solveGrid(grid);
    if (!solved.ok) throw new Error("这个 Seed 可以解码，但关卡无解，可能已被篡改。 ");
    return { grid, time, arrows: parsed.arrows, occupancy: parsed.occupancy };
  }
  function validateGridValues(grid) {
    if (!Array.isArray(grid) || grid.length !== POINTS) throw new Error("格点数据长度不正确。 ");
    for (let i = 0; i < grid.length; i++) {
      const [h, t] = dirsOf(grid[i]);
      if (h === "n" && t === "n") continue;
      if (h === "n" && t !== "n") continue;
      if (h !== "n" && t === "n") continue;
      if (h !== "n" && t !== "n" && h !== t) continue;
      throw new Error("Seed 中存在非法格点状态。 ");
    }
  }

  function parseArrows(grid) {
    const arrows = [];
    const occupancy = new Map();
    const tails = [];
    let nonEmpty = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[idx(r, c)];
        const [h, t] = dirsOf(v);
        if (h === "n" && t === "n") continue;
        nonEmpty++;
        if (h !== "n" && t === "n") tails.push({ r, c });
      }
    }
    let arrowId = 0;
    for (const tail of tails) {
      const path = [];
      const local = new Set();
      let cur = { ...tail };
      for (let safety = 0; safety < POINTS + 2; safety++) {
        const id = idx(cur.r, cur.c);
        if (local.has(id)) throw new Error("箭头路径成环。 ");
        local.add(id);
        path.push({ ...cur });
        const [headSide, tailSide] = dirsOf(grid[id]);
        if (path.length === 1) {
          if (tailSide !== "n" || headSide === "n") throw new Error("箭头尾部数据错误。 ");
        } else {
          const prev = path[path.length - 2];
          const expectedTail = dirBetween(cur, prev);
          if (tailSide !== expectedTail) throw new Error("箭头路径断裂。 ");
        }
        if (headSide === "n") break;
        const d = DELTA[headSide];
        const nxt = { r: cur.r + d[0], c: cur.c + d[1] };
        if (!inBounds(nxt.r, nxt.c)) throw new Error("箭头路径越界。 ");
        cur = nxt;
      }
      const head = path[path.length - 1];
      const [hh, ht] = dirsOf(grid[idx(head.r, head.c)]);
      if (hh !== "n" || ht === "n") throw new Error("箭头头部数据错误。 ");
      const moveDir = OPP[ht];
      const arrow = { id: arrowId++, path, head, moveDir };
      for (const p of path) {
        const key = idx(p.r, p.c);
        if (occupancy.has(key)) throw new Error("两个箭头发生重叠。 ");
        occupancy.set(key, arrow.id);
      }
      arrows.push(arrow);
    }
    if (occupancy.size !== nonEmpty) throw new Error("存在无法归属到箭头的孤立格点。 ");
    for (const arrow of arrows) {
      const d = DELTA[arrow.moveDir];
      let r = arrow.head.r + d[0];
      let c = arrow.head.c + d[1];
      while (inBounds(r, c)) {
        if (occupancy.get(idx(r, c)) === arrow.id) {
          throw new Error("箭头头部前方被自己的身体挡住，属于非法关卡。 ");
        }
        r += d[0];
        c += d[1];
      }
    }
    return { arrows, occupancy };
  }

  function canMove(arrow, occupancy) {
    const d = DELTA[arrow.moveDir];
    let r = arrow.head.r + d[0];
    let c = arrow.head.c + d[1];
    while (inBounds(r, c)) {
      const occ = occupancy.get(idx(r, c));
      // 正常生成的箭头不会出现“头部正前方撞到自己身体”的情况。
      // 这里仍然把任何占用都视为阻挡，避免 seed 或随机关卡出现自堵死箭头。
      if (occ !== undefined) return false;
      r += d[0];
      c += d[1];
    }
    return true;
  }
  function solveGrid(grid) {
    const copy = grid.slice();
    const steps = [];
    for (let loop = 0; loop < 600; loop++) {
      let parsed;
      try { parsed = parseArrows(copy); } catch { return { ok: false, steps }; }
      if (parsed.arrows.length === 0) return { ok: true, steps };
      const movable = parsed.arrows.filter(a => canMove(a, parsed.occupancy));
      if (!movable.length) return { ok: false, steps };
      movable.sort((a, b) => a.path.length - b.path.length);
      const chosen = movable[0];
      steps.push(chosen.path.map(p => [p.r, p.c]));
      for (const p of chosen.path) copy[idx(p.r, p.c)] = 0;
    }
    return { ok: false, steps };
  }

  function removeArrowFromGrid(arrow) {
    for (const p of arrow.path) game.grid[idx(p.r, p.c)] = 0;
    rebuildCurrentArrows();
  }
  function rebuildCurrentArrows() {
    const parsed = parseArrows(game.grid);
    game.arrows = parsed.arrows;
    game.occupancy = parsed.occupancy;
  }
  function findArrowById(id) {
    return game?.arrows.find(a => a.id === id) || null;
  }

  function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function randInt(rng, n) { return Math.floor(rng() * n); }
  function occupiedSet(grid) {
    const set = new Set();
    for (let i = 0; i < grid.length; i++) if (grid[i] !== 0) set.add(i);
    return set;
  }
  function placePath(grid, path) {
    for (let i = 0; i < path.length; i++) {
      let h = "n", t = "n";
      if (i < path.length - 1) h = dirBetween(path[i], path[i + 1]);
      if (i > 0) t = dirBetween(path[i], path[i - 1]);
      if (!h || !t) return false;
      grid[idx(path[i].r, path[i].c)] = codeOf(h, t);
    }
    return true;
  }
  function makePathFromHead(rng, grid, len, boundaryBias) {
    const occupied = occupiedSet(grid);
    const sides = ["top", "bottom", "left", "right"];
    for (let attempt = 0; attempt < 120; attempt++) {
      let head, backDir;
      if (boundaryBias) {
        const side = sides[randInt(rng, 4)];
        if (side === "top") { head = { r: 0, c: randInt(rng, COLS) }; backDir = "d"; }
        if (side === "bottom") { head = { r: ROWS - 1, c: randInt(rng, COLS) }; backDir = "u"; }
        if (side === "left") { head = { r: randInt(rng, ROWS), c: 0 }; backDir = "r"; }
        if (side === "right") { head = { r: randInt(rng, ROWS), c: COLS - 1 }; backDir = "l"; }
      } else {
        head = { r: randInt(rng, ROWS), c: randInt(rng, COLS) };
        backDir = ["u", "d", "l", "r"][randInt(rng, 4)];
      }
      if (occupied.has(idx(head.r, head.c))) continue;
      const headToTail = [head];
      const used = new Set([idx(head.r, head.c)]);
      let cur = head;
      for (let step = 1; step < len; step++) {
        let choices;
        if (step === 1) choices = [backDir];
        else {
          const prev = headToTail[headToTail.length - 2];
          const towardPrev = dirBetween(cur, prev);
          choices = ["u", "d", "l", "r"].filter(d => d !== towardPrev);
          for (let i = choices.length - 1; i > 0; i--) {
            const j = randInt(rng, i + 1);
            [choices[i], choices[j]] = [choices[j], choices[i]];
          }
        }
        let moved = false;
        for (const d of choices) {
          const dd = DELTA[d];
          const nxt = { r: cur.r + dd[0], c: cur.c + dd[1] };
          const id = idx(nxt.r, nxt.c);
          if (!inBounds(nxt.r, nxt.c) || occupied.has(id) || used.has(id)) continue;
          cur = nxt;
          headToTail.push(cur);
          used.add(id);
          moved = true;
          break;
        }
        if (!moved) break;
      }
      if (headToTail.length >= 2) return headToTail.reverse();
    }
    return null;
  }
  function chunkPath(rowPair, chunk, leftward) {
    const r = rowPair * 2;
    const c0 = chunk * 6;
    const c1 = Math.min(COLS - 1, c0 + 5);
    const path = [];
    if (leftward) {
      for (let c = c0; c <= c1; c++) path.push({ r: r + 1, c });
      path.push({ r, c: c1 });
      for (let c = c1 - 1; c >= c0; c--) path.push({ r, c });
    } else {
      for (let c = c1; c >= c0; c--) path.push({ r: r + 1, c });
      path.push({ r, c: c0 });
      for (let c = c0 + 1; c <= c1; c++) path.push({ r, c });
    }
    return path;
  }
  function rayClearForNewArrow(grid, head, moveDir) {
    const d = DELTA[moveDir];
    let r = head.r + d[0], c = head.c + d[1];
    while (inBounds(r, c)) {
      if (grid[idx(r, c)] !== 0) return false;
      r += d[0]; c += d[1];
    }
    return true;
  }
  function randomWeightedChoice(rng, items) {
    let total = 0;
    for (const item of items) total += item.weight;
    let x = rng() * total;
    for (const item of items) {
      x -= item.weight;
      if (x <= 0) return item.value;
    }
    return items[items.length - 1].value;
  }
  function makeCurvedPathFromHead(rng, grid, minLen, maxLen, boundaryChance) {
    const dirs = ["u", "d", "l", "r"];
    for (let attempt = 0; attempt < 260; attempt++) {
      const moveDir = dirs[randInt(rng, 4)];
      let head;
      if (rng() < boundaryChance) {
        if (moveDir === "u") head = { r: 0, c: randInt(rng, COLS) };
        if (moveDir === "d") head = { r: ROWS - 1, c: randInt(rng, COLS) };
        if (moveDir === "l") head = { r: randInt(rng, ROWS), c: 0 };
        if (moveDir === "r") head = { r: randInt(rng, ROWS), c: COLS - 1 };
      } else {
        head = { r: randInt(rng, ROWS), c: randInt(rng, COLS) };
      }
      if (grid[idx(head.r, head.c)] !== 0) continue;
      if (!rayClearForNewArrow(grid, head, moveDir)) continue;
      const back = OPP[moveDir];
      const bd = DELTA[back];
      let cur = { r: head.r + bd[0], c: head.c + bd[1] };
      if (!inBounds(cur.r, cur.c) || grid[idx(cur.r, cur.c)] !== 0) continue;
      const headToTail = [head, cur];
      const used = new Set([idx(head.r, head.c), idx(cur.r, cur.c)]);
      let lastDir = back;
      const targetLen = minLen + randInt(rng, Math.max(1, maxLen - minLen + 1));
      for (let step = 2; step < targetLen; step++) {
        const prev = headToTail[headToTail.length - 2];
        const forbid = dirBetween(cur, prev);
        const choices = [];
        for (const d of dirs) {
          if (d === forbid) continue;
          const dd = DELTA[d];
          const nr = cur.r + dd[0], nc = cur.c + dd[1];
          const key = idx(nr, nc);
          if (!inBounds(nr, nc) || grid[key] !== 0 || used.has(key)) continue;
          const centerBonus = Math.min(nr, ROWS - 1 - nr) + Math.min(nc, COLS - 1 - nc);
          choices.push({ value: d, weight: 1 + (d !== lastDir ? 0.75 : 0) + centerBonus * 0.025 });
        }
        if (!choices.length) break;
        const chosen = randomWeightedChoice(rng, choices);
        const cd = DELTA[chosen];
        cur = { r: cur.r + cd[0], c: cur.c + cd[1] };
        headToTail.push(cur);
        used.add(idx(cur.r, cur.c));
        lastDir = chosen;
      }
      if (headToTail.length >= minLen) return headToTail.reverse();
    }
    return null;
  }
  function countOccupiedGrid(grid) {
    let total = 0;
    for (const v of grid) if (v !== 0) total++;
    return total;
  }
  function shuffleArray(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function boundaryCandidates() {
    const out = [];
    for (let c = 0; c < COLS; c++) {
      out.push({ head: { r: 0, c }, moveDir: "u", inDir: "d" });
      out.push({ head: { r: ROWS - 1, c }, moveDir: "d", inDir: "u" });
    }
    for (let r = 1; r < ROWS - 1; r++) {
      out.push({ head: { r, c: 0 }, moveDir: "l", inDir: "r" });
      out.push({ head: { r, c: COLS - 1 }, moveDir: "r", inDir: "l" });
    }
    return out;
  }
  function splitWormIntoSegments(rng, headToTail, difficulty) {
    // 第九版：以第四版的混乱蛇形生成方式为基础，
    // 但把长蛇按小段拆成多条箭头，让大量箭头头部落在棋盘内部。
    // 这些内部头部会被前段或其他箭头阻挡，从而形成真正的解谜顺序。
    const segments = [];
    let start = 0;
    const minChunk = difficulty >= 3 ? 3 : difficulty === 2 ? 4 : 5;
    const maxChunk = difficulty >= 3 ? 6 : difficulty === 2 ? 9 : 12;
    while (start < headToTail.length - 1) {
      const remaining = headToTail.length - start;
      let len;
      if (remaining <= maxChunk + 1) len = remaining;
      else len = minChunk + randInt(rng, maxChunk - minChunk + 1);
      if (remaining - len === 1) len += 1;
      const seg = headToTail.slice(start, Math.min(headToTail.length, start + len));
      if (seg.length >= 2) segments.push(seg);
      start += len;
    }
    return segments;
  }
  function growBoundaryWormGrid(seed, difficulty) {
    // 第九版：回到第四版的随机混乱蛇形外观，并提高密度。
    // 生成长短不一、互相穿插的蛇形路径后，再切成多段箭头，
    // 让大量头部位于棋盘内部，同时保留校验器过滤自我阻挡。
    for (let restart = 0; restart < 600; restart++) {
      const rng = makeRng((seed + restart * 2654435761) >>> 0);
      let target, wormsWanted;
      if (difficulty <= 1) {
        target = Math.round(POINTS * 0.30);
        wormsWanted = 10 + randInt(rng, 4);
      } else if (difficulty === 2) {
        target = Math.round(POINTS * 0.60);
        wormsWanted = 17 + randInt(rng, 6);
      } else {
        target = Math.round(POINTS * 0.97);
        wormsWanted = 34 + randInt(rng, 10);
      }

      const used = new Set();
      const worms = [];
      const starts = shuffleArray(rng, boundaryCandidates());
      for (const ca of starts) {
        if (worms.length >= wormsWanted) break;
        const h = ca.head;
        const d = DELTA[ca.inDir];
        const next = { r: h.r + d[0], c: h.c + d[1] };
        if (used.has(idx(h.r, h.c)) || !inBounds(next.r, next.c) || used.has(idx(next.r, next.c))) continue;
        const worm = { headToTail: [h, next], lastDir: ca.inDir };
        used.add(idx(h.r, h.c));
        used.add(idx(next.r, next.c));
        worms.push(worm);
      }
      if (worms.length < 4) continue;

      const dirs = ["u", "d", "l", "r"];
      const active = worms.slice();
      let guard = 0;
      while (used.size < target && active.length && guard++ < 5000) {
        const wi = randInt(rng, active.length);
        const worm = active[wi];
        const cur = worm.headToTail[worm.headToTail.length - 1];
        const prev = worm.headToTail[worm.headToTail.length - 2];
        const backward = dirBetween(cur, prev);
        const choices = [];
        for (const d of dirs) {
          if (d === backward) continue;
          const dd = DELTA[d];
          const nr = cur.r + dd[0];
          const nc = cur.c + dd[1];
          const key = idx(nr, nc);
          if (!inBounds(nr, nc) || used.has(key)) continue;

          let freeNeighbors = 0;
          for (const nd of dirs) {
            const ndv = DELTA[nd];
            const ar = nr + ndv[0];
            const ac = nc + ndv[1];
            if (inBounds(ar, ac) && !used.has(idx(ar, ac))) freeNeighbors++;
          }
          const edgePenalty = (nr === 0 || nr === ROWS - 1 || nc === 0 || nc === COLS - 1) ? 0.25 : 1;
          choices.push({
            value: d,
            weight: (1 + (d !== worm.lastDir ? 2.5 : 0) + freeNeighbors * 0.45) * edgePenalty,
          });
        }
        if (!choices.length) {
          active.splice(wi, 1);
          continue;
        }
        const chosen = randomWeightedChoice(rng, choices);
        const cd = DELTA[chosen];
        const next = { r: cur.r + cd[0], c: cur.c + cd[1] };
        worm.headToTail.push(next);
        worm.lastDir = chosen;
        used.add(idx(next.r, next.c));
      }

      const grid = new Array(POINTS).fill(0);
      let failed = false;
      for (const worm of worms) {
        if (worm.headToTail.length < 2) continue;
        const pieces = splitWormIntoSegments(rng, worm.headToTail.slice(), difficulty);
        for (const piece of pieces) {
          if (!placePath(grid, piece.slice().reverse())) { failed = true; break; }
        }
        if (failed) break;
      }
      if (failed) continue;

      try {
        const parsed = parseArrows(grid);
        const solved = solveGrid(grid);
        if (!solved.ok) continue;
        const occ = parsed.occupancy.size;
        if (difficulty <= 1 && (occ < 90 || occ > 110)) continue;
        if (difficulty === 2 && (occ < 185 || occ > 210)) continue;
        if (difficulty >= 3 && occ < Math.floor(POINTS * 0.95)) continue;
        const internalHeads = parsed.arrows.filter(a => a.head.r > 0 && a.head.r < ROWS - 1 && a.head.c > 0 && a.head.c < COLS - 1).length;
        const initiallyBlocked = parsed.arrows.filter(a => !canMove(a, parsed.occupancy)).length;
        if (difficulty >= 3 && (internalHeads < 16 || initiallyBlocked < 16)) continue;
        if (difficulty === 2 && (internalHeads < 8 || initiallyBlocked < 6)) continue;
        return grid;
      } catch {
        continue;
      }
    }
    throw new Error("关卡生成失败，请重试。 ");
  }
  function generateGrid(seed, difficulty) {
    return growBoundaryWormGrid(seed, difficulty);
  }

  function countTurns(arrows) {
    let total = 0;
    for (const a of arrows) {
      for (let i = 1; i < a.path.length - 1; i++) {
        const d1 = dirBetween(a.path[i], a.path[i - 1]);
        const d2 = dirBetween(a.path[i], a.path[i + 1]);
        if (d1 && d2 && OPP[d1] !== d2) total++;
      }
    }
    return total;
  }
  function generateRandomSeed() {
    const base = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    for (let attempt = 0; attempt < 500; attempt++) {
      const difficulty = 3 + randInt(makeRng(base + attempt * 41), 98);
      const grid = generateGrid(base + attempt * 9973, difficulty);
      let parsed;
      try { parsed = parseArrows(grid); } catch { continue; }
      if (parsed.occupancy.size < Math.floor(POINTS * 0.95)) continue;
      const solved = solveGrid(grid);
      if (!solved.ok) continue;
      const turns = countTurns(parsed.arrows);
      const time = Math.max(300, Math.min(900, Math.round(360 + parsed.arrows.length * 8 + turns * 4 + parsed.occupancy.size * 0.75)));
      return encodeSeed(grid, time);
    }
    throw new Error("随机关卡生成失败，请再试一次。 ");
  }


  function startFromSeed(seed, mode, levelIndex = null) {
    const decoded = decodeSeed(seed);
    game = {
      grid: decoded.grid.slice(),
      originalSeed: groupSeed(normalizeSeed(seed)),
      mode,
      levelIndex,
      arrows: decoded.arrows,
      occupancy: decoded.occupancy,
      timeLimit: decoded.time,
      timeLeft: cheat ? Infinity : decoded.time,
      started: false,
      hearts: 3,
      status: "playing",
      gridOn: true,
      eraseMode: false,
      hints: skillCount("hint", mode, levelIndex),
      erases: skillCount("erase", mode, levelIndex),
    };
    highlightedArrowId = null;
    flashTimer = 0;
    animation = null;
    zoom = 1;
    document.body.classList.remove("menu-screen");
    document.body.classList.add("game-screen");
    ui.menu.classList.add("hidden");
    ui.gamePanel.classList.remove("hidden");
    ui.seedOutput.value = game.originalSeed;
    showMessage("点击第一个箭头后开始计时。找出头部前方没有阻挡的箭头。 ");
    updateUi();
  }
  function skillCount(skill, mode, levelIndex) {
    if (cheat) return Infinity;
    if (mode === "level") {
      const lv = Number(levelIndex) + 1;
      if (skill === "hint") return lv >= 2 ? 2 : 0;
      if (skill === "erase") return lv >= 3 ? 2 : 0;
    }
    return 2;
  }
  function updateUi() {
    if (!game) return;
    const label = game.mode === "level" ? `关卡 ${game.levelIndex + 1}` : game.mode === "random" ? "随机关卡" : "Seed 关卡";
    ui.modeText.textContent = cheat ? `${label} · Cheat Mode` : label;
    ui.heartText.textContent = game.hearts > 0 ? "♥ ".repeat(game.hearts).trim() : "GAME OVER";
    ui.gridBtn.textContent = `网格：${game.gridOn ? "开" : "关"}`;
    ui.gridBtn.classList.toggle("active", game.gridOn);
    ui.hintBtn.textContent = `提示：${game.hints === Infinity ? "∞" : game.hints}`;
    ui.eraseBtn.textContent = `擦除：${game.erases === Infinity ? "∞" : game.erases}`;
    ui.eraseBtn.classList.toggle("active", !!game.eraseMode);
    ui.hintBtn.disabled = game.hints === 0 || game.status !== "playing";
    ui.eraseBtn.disabled = game.erases === 0 || game.status !== "playing";
    if (cheat) {
      ui.timerText.textContent = "不限时";
      ui.timerText.classList.remove("danger");
      ui.timerText.style.fontSize = "26px";
      ui.timerText.style.transform = "none";
    } else {
      drawTimerText();
    }
    updateStatusActions();
  }
  function updateStatusActions() {
    if (!ui.statusActions || !game) return;
    const canNext = game.status === "win" && game.mode === "level" && game.levelIndex !== null && game.levelIndex < 99;
    const canRandomAgain = game.status === "win" && game.mode === "random";
    ui.nextLevelBtn.classList.toggle("hidden", !canNext);
    ui.randomRetryBtn.classList.toggle("hidden", !canRandomAgain);
    ui.randomNewBtn.classList.toggle("hidden", !canRandomAgain);
    ui.statusActions.classList.toggle("hidden", !(canNext || canRandomAgain));
  }
  function drawTimerText() {
    if (!game.started && game.status === "playing") {
      const t0 = Math.max(0, game.timeLimit);
      const m0 = Math.floor(t0 / 60);
      const s0 = Math.floor(t0 % 60);
      ui.timerText.textContent = `${String(m0).padStart(2, "0")}:${String(s0).padStart(2, "0")}`;
      ui.timerText.classList.remove("danger");
      ui.timerText.style.fontSize = "26px";
      ui.timerText.style.transform = "none";
      return;
    }
    const t = Math.max(0, game.timeLeft);
    if (t > 10) {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      ui.timerText.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      ui.timerText.classList.remove("danger");
      ui.timerText.style.fontSize = "26px";
      ui.timerText.style.transform = "none";
    } else {
      ui.timerText.textContent = t.toFixed(2);
      ui.timerText.classList.add("danger");
      const grow = 1 + (10 - t) / 10 * 1.55;
      ui.timerText.style.fontSize = `${26 * grow}px`;
      ui.timerText.style.transform = `scale(${1 + (10 - t) / 10 * 0.3})`;
    }
  }
  function showMessage(text) {
    ui.message.textContent = text;
  }

  function boardMetrics() {
    const size = 520;
    const baseX = (canvas.width - size) / 2;
    const baseY = 60;
    const step = size / (COLS - 1);
    const centerX = baseX + size / 2;
    const centerY = baseY + size / 2;
    return { size, baseX, baseY, step, centerX, centerY };
  }
  function pointPos(r, c) {
    const m = boardMetrics();
    const x0 = m.baseX + c * m.step;
    const y0 = m.baseY + r * m.step;
    return {
      x: m.centerX + (x0 - m.centerX) * zoom,
      y: m.centerY + (y0 - m.centerY) * zoom,
    };
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f7f9fb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!game) {
      requestAnimationFrame(loop);
      return;
    }
    drawBoard();
    drawArrows();
    drawStatusOverlay();
    requestAnimationFrame(loop);
  }
  function drawBoard() {
    const m = boardMetrics();
    ctx.save();
    ctx.lineWidth = 1;
    if (game.gridOn) {
      ctx.strokeStyle = "rgba(120,132,145,.16)";
      for (let r = 0; r < ROWS; r++) {
        const a = pointPos(r, 0), b = pointPos(r, COLS - 1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let c = 0; c < COLS; c++) {
        const a = pointPos(0, c), b = pointPos(ROWS - 1, c);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(80,88,96,.22)";
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = pointPos(r, c);
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.8, 2.4 * zoom), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = "rgba(40,45,50,.14)";
      ctx.lineWidth = 2;
      const tl = pointPos(0,0), br = pointPos(ROWS-1,COLS-1);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    ctx.restore();
  }
  function drawArrows() {
    for (const arrow of game.arrows) {
      const isAnimated = animation && animation.arrowId === arrow.id;
      if (isAnimated && animation.type === "exit") {
        drawExitingArrow(arrow, animation.t);
        continue;
      }
      let ox = 0, oy = 0;
      if (isAnimated && animation.type === "bump") {
        const d = DELTA[arrow.moveDir];
        const pulse = Math.sin(animation.t * Math.PI * 3) * 8 * (1 - animation.t);
        oy = d[0] * pulse;
        ox = d[1] * pulse;
      }
      drawSingleArrow(arrow, { ox, oy });
    }
  }
  function drawSingleArrow(arrow, opts = {}) {
    drawPathShape(arrow.path, arrow.moveDir, arrow.id, opts);
  }
  function drawPathShape(path, moveDir, arrowId, opts = {}) {
    const { alpha = 1, ox = 0, oy = 0 } = opts;
    const highlighted = arrowId === highlightedArrowId && flashTimer > 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (highlighted) {
      ctx.strokeStyle = "rgba(255,190,0,.9)";
      ctx.lineWidth = Math.max(20, 24 * zoom);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      strokePath(path, ox, oy);
    }
    ctx.strokeStyle = "#2a2d30";
    ctx.lineWidth = Math.max(7.5, 9.2 * zoom);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    strokePath(path, ox, oy);
    drawArrowHeadAtPath(path, moveDir, ox, oy, highlighted);
    ctx.restore();
  }
  function strokePath(path, ox, oy) {
    if (path.length < 2) return;
    ctx.beginPath();
    const first = pointPos(path[0].r, path[0].c);
    ctx.moveTo(first.x + ox, first.y + oy);
    for (let i = 1; i < path.length; i++) {
      const p = pointPos(path[i].r, path[i].c);
      ctx.lineTo(p.x + ox, p.y + oy);
    }
    ctx.stroke();
  }
  function drawArrowHeadAtPath(path, moveDir, ox, oy, highlighted) {
    if (path.length < 1) return;
    const p = pointPos(path[path.length - 1].r, path[path.length - 1].c);
    let d = DELTA[moveDir];
    if (path.length >= 2) {
      const a = path[path.length - 2];
      const b = path[path.length - 1];
      const dr = b.r - a.r;
      const dc = b.c - a.c;
      if (Math.abs(dr) + Math.abs(dc) > 0.001) d = [dr, dc];
    }
    const len = Math.hypot(d[0], d[1]) || 1;
    const nd = [d[0] / len, d[1] / len];
    const angle = Math.atan2(nd[0], nd[1]);
    const size = Math.max(8.5, 10.5 * zoom);
    const tipX = p.x + ox + nd[1] * size * 0.58;
    const tipY = p.y + oy + nd[0] * size * 0.58;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    if (highlighted) {
      ctx.fillStyle = "#ffc400";
      ctx.beginPath(); ctx.moveTo(size * 1.0, 0); ctx.lineTo(-size * .44, -size * .62); ctx.lineTo(-size * .44, size * .62); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#2a2d30";
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * .42, -size * .58);
    ctx.lineTo(-size * .42, size * .58);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function buildExitRoute(arrow) {
    const route = arrow.path.map(p => ({ r: p.r, c: p.c }));
    const d = DELTA[arrow.moveDir];
    let cur = { ...arrow.head };
    const extra = Math.max(ROWS, COLS) + arrow.path.length + 4;
    for (let i = 0; i < extra; i++) {
      cur = { r: cur.r + d[0], c: cur.c + d[1] };
      route.push(cur);
    }
    return route;
  }
  function sampleRoute(route, s) {
    if (s <= 0) return { ...route[0] };
    const i = Math.floor(s);
    const f = s - i;
    if (i >= route.length - 1) return { ...route[route.length - 1] };
    const a = route[i];
    const b = route[i + 1];
    return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f };
  }
  function drawExitingArrow(arrow, t) {
    const route = buildExitRoute(arrow);
    const visibleCount = arrow.path.length;
    const maxShift = Math.max(1, route.length - visibleCount);
    const eased = 1 - Math.pow(1 - Math.min(1, t), 2.35);
    const shift = eased * maxShift;
    const dynamicPath = [];
    for (let i = 0; i < visibleCount; i++) dynamicPath.push(sampleRoute(route, shift + i));
    const alpha = t < 0.86 ? 1 : Math.max(0, 1 - (t - 0.86) / 0.14);
    drawPathShape(dynamicPath, arrow.moveDir, arrow.id, { alpha });
  }
  function drawStatusOverlay() {
    if (!game || game.status === "playing") return;
    ctx.save();
    ctx.fillStyle = "rgba(247,249,251,.78)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = game.status === "win" ? "#216e45" : "#bf2e2e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 68px system-ui, sans-serif";
    ctx.fillText(game.status === "win" ? "CLEAR!" : "GAME OVER", canvas.width / 2, canvas.height / 2 - 35);
    ctx.fillStyle = "#22272d";
    ctx.font = "800 24px system-ui, sans-serif";
    let sub = "按重开再试一次，或返回主菜单。";
    if (game.status === "win" && game.mode === "level" && game.levelIndex < 99) sub = "可以直接进入下一关，或返回主菜单。";
    if (game.status === "win" && game.mode === "random") sub = "可以用同一个 Seed 再来一次，或重新随机。";
    ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 35);
    ctx.restore();
  }
  function loop(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
  }
  function update(dt) {
    if (!game) return;
    if (flashTimer > 0) flashTimer -= dt;
    if (animation) {
      animation.t += dt / animation.duration;
      if (animation.t >= 1) {
        const finished = animation;
        animation = null;
        if (finished.type === "exit") {
          const a = findArrowById(finished.arrowId);
          if (a) removeArrowFromGrid(a);
          afterMoveCheck();
        }
      }
    }
    if (game.status === "playing" && !cheat && game.started) {
      game.timeLeft -= dt;
      if (game.timeLeft <= 0) {
        game.timeLeft = 0;
        game.status = "lose";
        showMessage("时间到。 ");
      }
      drawTimerText();
    }
  }

  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) / rect.width * canvas.width,
      y: (evt.clientY - rect.top) / rect.height * canvas.height,
    };
  }
  function distPointSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    return Math.hypot(px - x, py - y);
  }
  function hitTestArrow(pos) {
    let best = null;
    let bestDist = Infinity;
    for (const arrow of game.arrows) {
      const path = arrow.path;
      for (let i = 0; i < path.length - 1; i++) {
        const a = pointPos(path[i].r, path[i].c);
        const b = pointPos(path[i + 1].r, path[i + 1].c);
        const d = distPointSegment(pos.x, pos.y, a.x, a.y, b.x, b.y);
        if (d < bestDist) { bestDist = d; best = arrow; }
      }
    }
    return bestDist < Math.max(17, 18 * zoom) ? best : null;
  }
  function handleArrowClick(arrow) {
    if (!game || game.status !== "playing" || animation) return;
    if (!cheat && !game.started) game.started = true;
    highlightedArrowId = null;
    if (game.eraseMode) {
      removeArrowFromGrid(arrow);
      if (game.erases !== Infinity) game.erases--;
      game.eraseMode = false;
      showMessage("已擦除一条箭头。 ");
      afterMoveCheck();
      updateUi();
      return;
    }
    if (canMove(arrow, game.occupancy)) {
      animation = { type: "exit", arrowId: arrow.id, t: 0, duration: Math.min(0.95, 0.42 + arrow.path.length * 0.018) };
      showMessage("成功移除。 ");
    } else {
      game.hearts--;
      animation = { type: "bump", arrowId: arrow.id, t: 0, duration: 0.28 };
      showMessage("前方被挡住了，扣 1 颗心。 ");
      if (game.hearts <= 0) {
        game.status = "lose";
        showMessage("Game Over");
      }
    }
    updateUi();
  }
  function afterMoveCheck() {
    rebuildCurrentArrows();
    if (game.arrows.length === 0) {
      game.status = "win";
      showMessage("通关成功！");
      if (game.mode === "level" && game.levelIndex !== null && !cheat) {
        done[String(game.levelIndex + 1)] = true;
        if (game.levelIndex + 1 >= unlocked) unlocked = Math.min(100, game.levelIndex + 2);
        saveProgress();
      }
    }
    updateUi();
  }

  function useHint() {
    if (!game || game.status !== "playing" || game.hints === 0) return;
    const movable = game.arrows.filter(a => canMove(a, game.occupancy));
    if (!movable.length) {
      showMessage("当前局面没有可移动箭头，可能需要擦除或重开。 ");
      return;
    }
    movable.sort((a, b) => a.path.length - b.path.length);
    highlightedArrowId = movable[0].id;
    flashTimer = 3.2;
    if (game.hints !== Infinity) game.hints--;
    showMessage("黄色高亮的是当前可以移除的一条箭头。 ");
    updateUi();
  }
  function toggleErase() {
    if (!game || game.status !== "playing" || game.erases === 0) return;
    game.eraseMode = !game.eraseMode;
    highlightedArrowId = null;
    showMessage(game.eraseMode ? "擦除模式：点击任意箭头直接删除。 " : "已取消擦除模式。 ");
    updateUi();
  }

  function openLevelDialog() {
    ui.levelsGrid.innerHTML = "";
    const maxUnlocked = cheat ? 100 : unlocked;
    for (let i = 0; i < 100; i++) {
      const btn = document.createElement("button");
      btn.textContent = String(i + 1);
      const locked = i + 1 > maxUnlocked;
      btn.className = locked ? "locked" : done[String(i + 1)] ? "done" : "";
      btn.disabled = locked;
      btn.addEventListener("click", () => {
        ui.levelDialog.close();
        try { startFromSeed(window.BUILT_IN_LEVELS[i], "level", i); }
        catch (err) { alert(err.message); }
      });
      ui.levelsGrid.appendChild(btn);
    }
    ui.levelDialog.showModal();
  }
  function returnMenu() {
    game = null;
    document.body.classList.remove("game-screen");
    document.body.classList.add("menu-screen");
    ui.gamePanel.classList.add("hidden");
    ui.menu.classList.remove("hidden");
    updateAdminUi();
  }
  function restart() {
    if (!game) return;
    startFromSeed(game.originalSeed, game.mode, game.levelIndex);
  }
  function updateAdminUi() {
    if (cheat) ui.adminBtn.classList.add("hidden");
    else ui.adminBtn.classList.remove("hidden");
  }
  function enableCheatMode() {
    if (cheat) return;
    cheat = true;
    if (game) {
      game.timeLeft = Infinity;
      game.hints = Infinity;
      game.erases = Infinity;
      game.eraseMode = false;
    }
    ui.adminDialog.close();
    updateAdminUi();
    updateUi();
    const cheatMessage = "作弊模式已开启：全部关卡解锁、无时间限制、提示和擦除无限。本次开启不会写入本地存档。";
    if (game) showMessage(cheatMessage);
    else if (ui.menuMessage) {
      ui.menuMessage.textContent = cheatMessage;
      setTimeout(() => { if (ui.menuMessage) ui.menuMessage.textContent = ""; }, 3500);
    }
  }
  function resetAllProgress() {
    localStorage.removeItem(SAVE_UNLOCK);
    localStorage.removeItem(SAVE_DONE);
    localStorage.removeItem(SAVE_CHEAT);
    unlocked = 1;
    done = {};
    cheat = false;
    game = null;
    highlightedArrowId = null;
    flashTimer = 0;
    animation = null;
    document.body.classList.remove("game-screen");
    document.body.classList.add("menu-screen");
    ui.gamePanel.classList.add("hidden");
    ui.menu.classList.remove("hidden");
    updateAdminUi();
    if (ui.menuMessage) ui.menuMessage.textContent = "";
  }

  canvas.addEventListener("pointerdown", evt => {
    if (!game || game.status !== "playing") return;
    evt.preventDefault();
    const pos = canvasPoint(evt);
    const arrow = hitTestArrow(pos);
    if (arrow) handleArrowClick(arrow);
  });
  canvas.addEventListener("wheel", evt => {
    if (!game) return;
    evt.preventDefault();
    const delta = evt.deltaY < 0 ? 0.1 : -0.1;
    zoom = Math.max(0.65, Math.min(1.55, zoom + delta));
  }, { passive: false });

  ui.levelModeBtn.addEventListener("click", openLevelDialog);
  ui.randomBtn.addEventListener("click", () => {
    try {
      showMessage("正在生成随机关卡……");
      const seed = generateRandomSeed();
      startFromSeed(seed, "random", null);
    } catch (err) {
      alert(err.message);
    }
  });
  ui.seedBtn.addEventListener("click", () => {
    ui.seedError.textContent = "";
    ui.seedInput.value = "";
    ui.seedDialog.showModal();
  });
  ui.playSeedConfirm.addEventListener("click", evt => {
    evt.preventDefault();
    try {
      startFromSeed(ui.seedInput.value, "seed", null);
      ui.seedDialog.close();
    } catch (err) {
      ui.seedError.textContent = err.message;
    }
  });
  ui.helpBtn.addEventListener("click", () => ui.helpDialog.showModal());
  ui.adminBtn.addEventListener("click", () => {
    ui.adminInput.value = "";
    ui.adminError.textContent = "";
    ui.adminDialog.showModal();
    setTimeout(() => ui.adminInput.focus(), 50);
  });
  ui.adminInput.addEventListener("input", () => {
    if (ui.adminInput.value.trim() === "admin") enableCheatMode();
  });
  ui.adminConfirm.addEventListener("click", evt => {
    evt.preventDefault();
    if (ui.adminInput.value.trim() === "admin") enableCheatMode();
    else ui.adminError.textContent = "口令错误。 ";
  });
  ui.resetProgressBtn.addEventListener("click", evt => {
    evt.preventDefault();
    ui.resetDialog.showModal();
  });
  ui.resetConfirm.addEventListener("click", evt => {
    evt.preventDefault();
    resetAllProgress();
    ui.resetDialog.close();
  });
  ui.backBtn.addEventListener("click", returnMenu);
  ui.restartBtn.addEventListener("click", restart);
  ui.gridBtn.addEventListener("click", () => { if (game) { game.gridOn = !game.gridOn; updateUi(); } });
  ui.hintBtn.addEventListener("click", useHint);
  ui.eraseBtn.addEventListener("click", toggleErase);
  ui.nextLevelBtn.addEventListener("click", () => {
    if (!game || game.mode !== "level" || game.levelIndex === null || game.levelIndex >= 99) return;
    const next = game.levelIndex + 1;
    try { startFromSeed(window.BUILT_IN_LEVELS[next], "level", next); }
    catch (err) { alert(err.message); }
  });
  ui.randomRetryBtn.addEventListener("click", () => {
    if (!game || game.mode !== "random") return;
    startFromSeed(game.originalSeed, "random", null);
  });
  ui.randomNewBtn.addEventListener("click", () => {
    try {
      const seed = generateRandomSeed();
      startFromSeed(seed, "random", null);
    } catch (err) {
      alert(err.message);
    }
  });
  window.addEventListener("keydown", evt => {
    if (evt.key === "Escape") {
      if (ui.seedDialog.open) ui.seedDialog.close();
      if (ui.adminDialog.open) ui.adminDialog.close();
      if (game?.eraseMode) { game.eraseMode = false; updateUi(); }
    }
    if (evt.key.toLowerCase() === "r" && game) restart();
    if (evt.key.toLowerCase() === "h" && game) useHint();
  });

  updateAdminUi();
  requestAnimationFrame(loop);
})();
