'use strict';
/* Regalo ASCII — Canvas 2D
 * Cada letra se dibuja UNA vez en un mini-canvas (glyph cache) y luego se reutiliza
 * con drawImage, así se mueven miles de letras sin trabar el celular.
 * Mensaje y frase se cambian con ?m=...&f=... en la URL (o con el botón "Mi mensaje").
 */
(() => {
  // ---------- Configuración (editable) ----------
  const DEF_M = 'Te quiero';
  const DEF_F = 'Un regalito para ti, con todo mi cariño';
  const qs = new URLSearchParams(location.search);
  const MSG = ((qs.get('m') || DEF_M).trim().slice(0, 40)) || DEF_M;       // dentro del corazón
  const PHRASE = ((qs.get('f') || DEF_F).trim().slice(0, 90)) || DEF_F;    // frase final
  const FONT = '"Courier New",ui-monospace,Menlo,Consolas,monospace';
  const ROW = 1.8; // alto de una fila / ancho de una columna (en "unidades cuadradas")

  // ---------- Utilidades ----------
  const rnd = Math.random;
  const pick = a => a[(rnd() * a.length) | 0];
  const q = (v, s) => Math.round(v / s) * s;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* sin vibración */ } };
  const CONF_CH = '@#%&*+=~^$?!<>/\\|xoO0123789'.split('');
  const CONF_COL = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ffffff', '#ff9f1c', '#f72585'];
  const rch = () => pick(CONF_CH);
  const rcol = () => pick(CONF_COL);

  function wrapText(str, max) {
    const out = []; let line = '';
    for (let w of str.split(/\s+/)) {
      while (w.length > max) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, max)); w = w.slice(max); }
      if (!line) line = w;
      else if ((line + ' ' + w).length <= max) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
    return out;
  }

  // ---------- Canvas y layout ----------
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  let dpr = 1, W = 0, H = 0, cw = 8, chh = 14, fs = 13, ox = 0, oy = 0;
  let stars = [], phraseLines = [], phraseS = 1.2, phraseTotal = 0;
  const cache = new Map();

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cw = Math.min(W * 0.94 / 64, (H * 0.80) / 80);
    chh = cw * ROW; fs = cw / 0.6;
    ox = W / 2; oy = H * 0.46 - 6 * cw;
    cache.clear();
    // estrellas
    stars = [];
    for (let i = 0; i < 130; i++) {
      stars.push({
        x: rnd() * W, y: rnd() * H, ch: pick(['.', '·', '*', '+', '.']),
        col: pick(['#9fb4ff', '#ffffff', '#ffd9a0', '#ff9ec4', '#9ff0d0']),
        s: rnd() < 0.8 ? 0.6 : 0.9, ph: rnd() * 6.28, sp: 0.8 + rnd() * 2
      });
    }
    // frase final
    const avail = (W * 0.92) / cw;
    let s = 1.2;
    let lines = wrapText(PHRASE, Math.max(1, Math.floor(avail / s)));
    if (lines.length === 1) s = Math.round(Math.min(1.5, avail / Math.max(lines[0].length, 1)) * 10) / 10;
    phraseS = Math.max(0.5, s); phraseLines = lines;
    phraseTotal = lines.reduce((a, l) => a + l.length, 0);
  }

  // glyph cache: cada (letra, color, escala) se dibuja una sola vez
  function glyph(ch, col, s) {
    const k = ch + '|' + col + '|' + s;
    let g = cache.get(k);
    if (!g) {
      const gw = Math.max(2, Math.ceil(cw * s * dpr)), gh = Math.max(2, Math.ceil(chh * s * dpr));
      g = document.createElement('canvas'); g.width = gw; g.height = gh;
      const x = g.getContext('2d');
      x.font = '700 ' + (fs * s * dpr) + 'px ' + FONT;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col;
      x.fillText(ch, gw / 2, gh * 0.52);
      cache.set(k, g);
    }
    return g;
  }
  function put(ch, col, s, xp, yp, a) {
    if (a <= 0) return;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(glyph(ch, col, s), xp - cw * s / 2, yp - chh * s / 2, cw * s, chh * s);
    if (a < 1) ctx.globalAlpha = 1;
  }
  function drawLines(lines, cx, cy, s, col, a, limit) {
    let n = 0; const lh = chh * s;
    lines.forEach((ln, L) => {
      const y = cy + (L - (lines.length - 1) / 2) * lh;
      const x0 = cx - ln.length * cw * s / 2;
      for (let k = 0; k < ln.length; k++) {
        if (n++ >= limit) return;
        const ch = ln[k]; if (ch === ' ') continue;
        put(ch, col, s, x0 + cw * s * (k + 0.5), y, a);
      }
    });
  }

  // ---------- Geometría ----------
  const inEll = (x, y, cx, cy, rx, ry) => Math.hypot((x - cx) / rx, (y - cy) / ry);
  function segDist(x, y, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    let t = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy);
    t = clamp(t, 0, 1);
    return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
  }
  function heartD(x, y) {
    const X = x / 11.5, Y = -(y - 14) / 11.5, a = X * X + Y * Y - 1;
    return a * a * a - X * X * Y * Y * Y; // <= 0 => dentro
  }

  // ---------- Caja ----------
  function buildBox() {
    const cells = [];
    for (let j = -14; j <= 12; j++) {
      const y = j * ROW;
      for (let i = -20; i <= 20; i++) {
        const x = i, r = hash(i + 50, j + 50);
        let c = null;
        // moño
        for (const sx of [-1, 1]) {
          const d = Math.hypot((x - sx * 6.8) / 6.5, (y + 17.5) / 4.6);
          if (d <= 1 && d >= 0.45) c = { ch: 'O@8&0'[(r * 5) | 0], col: '#ffffff', group: 'lid', bow: true };
        }
        if (!c && (x / 3.2) ** 2 + ((y + 15.2) / 2.6) ** 2 <= 1) c = { ch: '@', col: '#ffe4ee', group: 'lid', bow: true };
        // tapa
        if (!c && x >= -17 && x <= 17 && y >= -13 && y <= -5) {
          if (Math.abs(x) <= 2.5) c = { ch: '|H#'[(r * 3) | 0], col: '#ffffff', group: 'lid' };
          else if (y < -12 || y > -6.5 || Math.abs(x) >= 16) c = { ch: '=', col: 'hsl(333,85%,78%)', group: 'lid' };
          else c = { ch: '#%=@&'[(r * 5) | 0], col: 'hsl(333,80%,' + q(68 + r * 6, 3) + '%)', group: 'lid' };
        }
        // cuerpo
        if (!c && x >= -15 && x <= 15 && y > -5 && y <= 19) {
          if (Math.abs(x) <= 2.5) c = { ch: '|H#'[(r * 3) | 0], col: '#ffffff', group: 'body' };
          else {
            const l = q(clamp(58 - (y + 5) * 0.4 + r * 6, 40, 66), 3);
            const edge = Math.abs(x) > 14 || y > 17;
            c = { ch: edge ? '#' : '#%=@&'[(r * 5) | 0], col: 'hsl(333,78%,' + l + '%)', group: 'body' };
          }
        }
        if (c) { c.x = x; c.y = y; cells.push(c); }
      }
    }
    return cells;
  }

  // ---------- Osito ----------
  function blue(d, x, y, r) {
    if (d > 0.82) return { ch: '#%H@'[(r * 4) | 0], col: 'hsl(214,80%,' + q(70 + r * 8, 4) + '%)' };
    const l = clamp(q(36 + (1 - d) * 14 - (x + y) * 0.12 + r * 10, 4), 30, 66);
    return { ch: '=-:+*-='[(r * 7) | 0], col: 'hsl(218,72%,' + l + '%)' };
  }
  function bearCell(x, y, i, j, rect) {
    const r = hash(i, j);
    let d;
    for (const sx of [-7, 7]) if (inEll(x, y, sx, -16.5, 2.4, 2.6) <= 1) return { ch: '@', col: '#ffffff', tag: 'eye' };
    if (inEll(x, y, 0, -10.5, 2.8, 2.0) <= 1) return { ch: '@', col: '#ff8fb1', tag: 'nose' };
    if (inEll(x, y, 0, -8.5, 8.5, 5.5) <= 1) return { ch: 'o:.;'[(r * 4) | 0], col: 'hsl(210,60%,' + q(74 + r * 12, 4) + '%)' };
    d = segDist(x, y, 14, 2, 26, -9) / 4.6;
    if (d <= 1) { const b = blue(d, x, y, r); b.tag = 'armR'; return b; }
    d = segDist(x, y, -14, 2, -9, 15) / 4.6;
    if (d <= 1) return blue(d, x, y, r);
    if (heartD(x, y) <= 0) {
      if (x > rect.x0 && x < rect.x1 && y > rect.y0 && y < rect.y1) return null;
      return { ch: '%&@#$8xX'[(r * 8) | 0], col: 'hsl(' + (348 + ((r * 10) | 0)) + ',82%,' + q(42 + r * 24, 6) + '%)' };
    }
    d = inEll(x, y, 0, -14, 17, 14);
    if (d <= 1) return blue(d, x, y, r);
    for (const sx of [-1, 1]) {
      d = inEll(x, y, sx * 15, -26, 6.5, 6.5);
      if (d <= 1) {
        if (inEll(x, y, sx * 15, -26, 3.4, 3.4) <= 1) return { ch: ':.o'[(r * 3) | 0], col: 'hsl(340,70%,' + q(70 + r * 8, 4) + '%)' };
        return blue(d, x, y, r);
      }
    }
    d = inEll(x, y, 0, 10, 16, 18);
    if (d <= 1) return blue(d, x, y, r);
    for (const sx of [-1, 1]) {
      if (inEll(x, y, sx * 10, 30, 4, 3) <= 1) return { ch: 'o:'[(r * 2) | 0], col: 'hsl(340,70%,76%)' };
      d = inEll(x, y, sx * 10, 29, 8, 5.5);
      if (d <= 1) return blue(d, x, y, r);
    }
    return null;
  }
  function layoutMsg() {
    let best = null;
    for (const s of [2.0, 1.7, 1.4, 1.2, 1.0, 0.8]) {
      const lines = wrapText(MSG, Math.max(1, Math.floor(21 / s)));
      best = { s, lines };
      if (lines.length * s * ROW <= 13.5) break;
    }
    const { s, lines } = best, cells = [], cy0 = 10.5;
    let maxLen = 1;
    lines.forEach((ln, L) => {
      maxLen = Math.max(maxLen, ln.length);
      const y = cy0 + (L - (lines.length - 1) / 2) * s * ROW;
      for (let k = 0; k < ln.length; k++) {
        if (ln[k] === ' ') continue;
        cells.push({ x: -(ln.length * s) / 2 + s * (k + 0.5), y, ch: ln[k], col: '#ffffff', s, tag: 'text' });
      }
    });
    const hh = lines.length * s * ROW / 2;
    return { cells, rect: { x0: -maxLen * s / 2 - 1.5, x1: maxLen * s / 2 + 1.5, y0: cy0 - hh - 1, y1: cy0 + hh + 1 } };
  }
  function buildBear() {
    const { cells: tc, rect } = layoutMsg();
    const cells = [];
    for (let j = -20; j <= 20; j++) {
      const y = j * ROW;
      for (let i = -33; i <= 33; i++) {
        const c = bearCell(i, y, i, j, rect);
        if (c) { c.x = i; c.y = y; cells.push(c); }
      }
    }
    return cells.concat(tc);
  }

  // ---------- Partículas ----------
  let boxCells = [], bearCells = [], P = [], boxN = 0;
  function makePool() {
    boxCells = buildBox(); bearCells = buildBear();
    boxN = boxCells.length;
    const nt = bearCells.length, N = Math.max(boxN, nt) + 80;
    const order = bearCells.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k--) { const m = (rnd() * (k + 1)) | 0; [order[k], order[m]] = [order[m], order[k]]; }
    P = [];
    for (let i = 0; i < N; i++) {
      const p = { x: 0, y: 0, vx: 0, vy: 0, ch: ' ', col: '#fff', s: 1, a: 1, vis: false, group: '', bow: false,
        hx: 0, hy: 0, has: false, tx: 0, ty: 0, tch: ' ', tcol: '#fff', ts: 1, ttag: '', near: false, delay: 0, ft: 0 };
      if (i < boxN) {
        const c = boxCells[i];
        p.x = p.hx = c.x; p.y = p.hy = c.y; p.ch = c.ch; p.col = c.col; p.group = c.group; p.bow = !!c.bow; p.vis = true;
      }
      if (i < nt) {
        const t = bearCells[order[i]];
        p.has = true; p.tx = t.x; p.ty = t.y; p.tch = t.ch; p.tcol = t.col; p.ts = t.s || 1; p.ttag = t.tag || '';
      }
      P.push(p);
    }
  }

  // ---------- Estado ----------
  let t = 0, phase = 'idle', pt = 0, nudge = 0, waveAmt = 0, phraseChars = 0, gatherMax = 0.5, bowA = 1;
  let drag = null, ribbons = [], br = 0, wa = 0, ex = 0, ey = 0;
  let lid = { x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, fly: false, launched: false };
  const setPhase = n => { phase = n; pt = 0; };

  function reset() {
    makePool();
    lid = { x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, fly: false, launched: false };
    ribbons = []; bowA = 1; phraseChars = 0; waveAmt = 0; nudge = 0; drag = null;
    setPhase('idle');
  }

  function eff(p) {
    let x = p.tx, y = p.ty;
    if (p.ttag === 'armR') {
      const rx = x - 14, ry = y - 2, c = Math.cos(wa), s = Math.sin(wa);
      x = 14 + rx * c - ry * s; y = 2 + rx * s + ry * c;
    }
    y += br * 0.7 * ((34 - y) / 66);
    ex = x; ey = y;
  }
  function setFinal(p) { p.ch = p.tch; p.col = p.tcol; p.s = p.ts; }
  function drift(p, dt) {
    const f = Math.exp(-1.6 * dt);
    p.vx *= f; p.vy = p.vy * f + 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.ft -= dt;
    if (p.ft < 0) { p.ft = 0.07 + rnd() * 0.1; p.ch = rch(); p.col = rcol(); p.s = 1; }
  }

  // ---------- Fases ----------
  function untie() {
    if (phase !== 'idle') return;
    setPhase('untie'); spawnRibbons(); vib(35);
  }
  function spawnRibbons() {
    ribbons = [];
    for (const d of [-1, 1]) {
      const segs = [];
      for (let k = 0; k < 18; k++) segs.push({ x: d * 1.5, y: -15 });
      ribbons.push({ d, segs, vx: d * 50, vy: -75, age: 0, cracked: false });
    }
  }
  function updRibbons(dt) {
    for (const r of ribbons) {
      r.age += dt;
      if (!r.cracked && r.age > 0.35) { r.cracked = true; r.vx = -r.d * 30; r.vy = -20; } // chasquido
      r.vy += 70 * dt;
      const h = r.segs[0];
      h.x += (r.vx + r.d * 40 * Math.cos(r.age * 14)) * dt; h.y += r.vy * dt;
      const f = Math.min(1, 14 * dt);
      for (let k = 1; k < r.segs.length; k++) {
        r.segs[k].x += (r.segs[k - 1].x - r.segs[k].x) * f;
        r.segs[k].y += (r.segs[k - 1].y - r.segs[k].y) * f;
      }
    }
    ribbons = ribbons.filter(r => r.age < 1.5);
  }
  function drawRibbons() {
    for (const r of ribbons) {
      const a = 1 - clamp((r.age - 0.9) / 0.5, 0, 1);
      for (let k = 0; k < r.segs.length; k++) {
        const s = r.segs[k], n = r.segs[Math.min(k + 1, r.segs.length - 1)], pv = r.segs[Math.max(k - 1, 0)];
        const dx = pv.x - n.x, dy = pv.y - n.y;
        let ch;
        if (Math.abs(dy) > 2 * Math.abs(dx)) ch = '|';
        else if (Math.abs(dx) > 2 * Math.abs(dy)) ch = '=';
        else ch = dx * dy > 0 ? '\\' : '/';
        put(ch, k % 2 ? '#ffffff' : 'hsl(333,78%,72%)', 1, ox + s.x * cw, oy + s.y * cw, a);
      }
    }
  }

  function updBox(dt) {
    const fy = Math.sin(t * 1.7) * 0.8;
    const wig = 0.12 + nudge * 0.7;
    const amp = phase === 'shake' ? 0.2 + pt * 1.6 : 0;
    if (phase === 'untie' && pt >= 0.25 && !lid.launched) {
      lid.launched = lid.fly = true; lid.vx = (rnd() - 0.5) * 20; lid.vy = -100; lid.w = (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 3);
    }
    if (lid.fly) { lid.vy += 45 * dt; lid.x += lid.vx * dt; lid.y += lid.vy * dt; lid.a += lid.w * dt; }
    if (phase !== 'idle') bowA = Math.max(0, bowA - dt * 4);
    const ca = Math.cos(lid.a), sa = Math.sin(lid.a);
    for (let i = 0; i < boxN; i++) {
      const p = P[i];
      let x = p.hx, y = p.hy + fy;
      const flown = lid.fly && p.group === 'lid';
      if (flown) { const lx = p.hx, ly = p.hy + 9; x = lid.x + lx * ca - ly * sa; y = -9 + fy + lid.y + lx * sa + ly * ca; }
      else if (p.bow) x += Math.sin(t * 9 + p.hy * 0.7) * (phase === 'untie' ? 0.6 : wig);
      if (amp && !flown) { x += (rnd() - 0.5) * 2 * amp; y += (rnd() - 0.5) * 2 * amp; }
      p.x = x; p.y = y;
      if (p.bow) p.a = bowA;
    }
    if (phase === 'untie' && pt > 1.5) { setPhase('shake'); vib([15, 25, 15, 25, 20, 25, 25, 25, 30]); }
    else if (phase === 'shake' && pt > 1.0) explode();
  }

  function explode() {
    P.forEach((p, i) => {
      if (i >= boxN || p.group === 'lid') { p.x = (rnd() - 0.5) * 16; p.y = -2 + (rnd() - 0.5) * 14; }
      p.vis = true; p.a = 1; p.s = 1; p.near = false; p.bow = false;
      const an = rnd() * 6.283, sp = 20 + rnd() * 65;
      p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp - 18;
      p.ch = rch(); p.col = rcol(); p.ft = rnd() * 0.1;
    });
    vib([70, 30, 120]);
    setPhase('explode');
  }
  function startGather(maxDelay) {
    gatherMax = maxDelay;
    for (const p of P) { p.delay = rnd() * maxDelay; p.near = false; }
    setPhase('gather');
  }
  function updExplode(dt) {
    for (const p of P) if (p.vis) drift(p, dt);
    if (pt > 0.9) startGather(0.5);
  }
  function updGather(dt) {
    const K = 30, C = 9.5;
    for (const p of P) {
      if (!p.vis) continue;
      if (p.has) {
        if (pt >= p.delay) {
          eff(p);
          p.vx += ((ex - p.x) * K - p.vx * C) * dt; p.vy += ((ey - p.y) * K - p.vy * C) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (!p.near) {
            if (Math.hypot(ex - p.x, ey - p.y) < 2.5) { p.near = true; setFinal(p); }
            else { p.ft -= dt; if (p.ft < 0) { p.ft = 0.07 + rnd() * 0.1; p.ch = rch(); p.col = rcol(); } }
          }
        } else drift(p, dt);
      } else {
        p.a -= dt * 1.6; if (p.a <= 0) p.vis = false;
        drift(p, dt);
      }
    }
    if (pt > gatherMax + 1.7) { for (const p of P) if (p.has) setFinal(p); setPhase('bear'); }
  }
  function updBear(dt) {
    const f = Math.min(1, 18 * dt);
    const blink = (t % 3.6) > 3.45;
    for (const p of P) {
      if (!p.vis || !p.has) continue;
      eff(p);
      p.x += (ex - p.x) * f; p.y += (ey - p.y) * f;
      if (p.ttag === 'eye') p.ch = blink ? '-' : p.tch;
    }
    if (pt > 0.5) phraseChars = Math.min(phraseTotal, phraseChars + dt * 16);
  }
  function scatter(u) {
    for (const p of P) {
      if (!p.vis || !p.has) continue;
      const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy) + 0.1, sp = 25 + rnd() * 45;
      p.vx = dx / d * sp + (rnd() - 0.5) * 20; p.vy = dy / d * sp + (rnd() - 0.5) * 20 - 10;
      p.near = false; p.ch = rch(); p.col = rcol(); p.s = 1; p.ft = rnd() * 0.1;
    }
    vib(30);
    setPhase('scatter');
  }
  function updScatter(dt) {
    for (const p of P) if (p.vis) drift(p, dt);
    if (pt > 0.7) startGather(0.3);
  }

  function update(dt) {
    t += dt; pt += dt; nudge = Math.max(0, nudge - dt * 2.5);
    br = Math.sin(t * 2.2);
    const wTarget = (phase === 'bear' && (pt < 5 || ((pt - 5) % 7) < 2.2)) ? 1 : 0;
    waveAmt += (wTarget - waveAmt) * Math.min(1, 4 * dt);
    wa = Math.sin(t * 8) * 0.45 * waveAmt;
    switch (phase) {
      case 'idle': case 'untie': case 'shake': updBox(dt); break;
      case 'explode': updExplode(dt); break;
      case 'gather': updGather(dt); break;
      case 'bear': updBear(dt); break;
      case 'scatter': updScatter(dt); break;
    }
    if (ribbons.length) updRibbons(dt);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) put(s.ch, s.col, s.s, s.x, s.y, 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)));
    const top = -chh * 3;
    for (const p of P) {
      if (!p.vis || p.a <= 0) continue;
      const yp = oy + p.y * cw;
      if (yp < top || yp > H + chh) continue;
      put(p.ch, p.col, p.s, ox + p.x * cw, yp, p.a);
    }
    if (ribbons.length) drawRibbons();
    if (phase === 'idle') {
      const a = 0.45 + 0.4 * Math.sin(t * 3);
      drawLines(['toca el moño'], ox, oy + 29 * cw, 1.3, '#9aa4c7', a, 99);
    }
    if (phraseChars > 0) drawLines(phraseLines, ox, oy + 43 * cw, phraseS, '#ffd9e6', 1, Math.floor(phraseChars));
  }

  // ---------- Entrada ----------
  const toSu = e => ({ x: (e.clientX - ox) / cw, y: (e.clientY - oy) / cw });
  cv.addEventListener('pointerdown', e => {
    const u = toSu(e);
    if (phase === 'idle') {
      if (Math.hypot(u.x, u.y + 16) < 26) drag = { x: e.clientX, y: e.clientY };
      else { nudge = 1; vib(10); }
    } else if (phase === 'bear') {
      if (Math.abs(u.x) < 32 && u.y > -34 && u.y < 36) scatter(u);
    }
  });
  cv.addEventListener('pointermove', e => {
    if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 14) { drag = null; untie(); }
  });
  const endDrag = () => { if (drag) { drag = null; untie(); } };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', () => { drag = null; });

  // ---------- Botones ----------
  const toastEl = document.getElementById('toast');
  let toastTm = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTm); toastTm = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  document.getElementById('btnReplay').addEventListener('click', reset);
  // ---------- Bucle ----------
  window.addEventListener('resize', layout);
  layout();
  reset();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();