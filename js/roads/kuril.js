// Road: Kuril Bishwa Road — the looping Kuril Flyover at dusk, a railway level crossing and a foot-overbridge.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;
  const TAU = Math.PI * 2;
  const KB = 0.5523;                                  // cubic-bezier quarter-ellipse constant
  const SUN = { x: 892, y: 160, r: 21 };
  const LP = { cx: 600, cy: 158, rx: 150, ry: 34 };   // the loop ring
  const PIER_BOT = 268;                               // pillars vanish behind the rail embankment here
  const RAIL = 270;                                   // top of the rails
  const OB = { x0: 340, x1: 580, top: 206, deck: 222, bot: 230 }; // foot-overbridge
  const GATE = { x: 880, y: 262, len: 70, xc: 917 };  // level-crossing boom pivot + crossing centre
  const COACH = 100, LOCO = 92, GAP = 4;
  const BB = { x: 332, y: 110, w: 84, h: 38 };        // real-estate billboard

  // ---------- deck geometry: chains of cubic segments [x0,y0, c1x,c1y, c2x,c2y, x1,y1] ----------
  // A deck's fascia is its curve shifted straight down by th; the soffit (underside) sits below that.
  const { cx, cy, rx, ry } = LP;
  const kx = KB * rx, ky = KB * ry;
  const DECKS = {
    high: { segs: [[-40, 124, 120, 96, 290, 72, 470, 70], [470, 70, 650, 68, 850, 88, 1040, 122]], th: 7, so: 4, pal: 'far', rs: 0.75 },
    back: { segs: [[cx + rx, cy, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], [cx, cy + ry, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy]], th: 9, so: 4, pal: 'mid', rs: 0.85 },
    left: { segs: [[-40, 238, 200, 232, 400, 214, cx - rx, cy]], th: 11, so: 6, pal: 'near', rs: 1 },
    front: { segs: [[cx - rx, cy, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], [cx, cy - ry, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy]], th: 11, so: 6, pal: 'near', rs: 1 },
    right: { segs: [[cx + rx, cy, 800, 214, 900, 226, 1040, 232]], th: 11, so: 6, pal: 'near', rs: 1 },
  };
  const PAL = {
    far: { face: '#c29ca2', lit: '#f3c9b0', edge: '#977889', soffit: '#86688a', joint: 'rgba(90,60,96,0.3)', pier: '#b6949e', shade: '#94768f', plit: '#f0c3a8', cap: '#a8889a', kerb: '#d6b3ab', post: '#8a6d88', rail: '#f2cdb6', lamp: 'rgba(255,226,170,0.9)' },
    mid: { face: '#a58792', lit: '#eab99f', edge: '#765c74', soffit: '#5c4969', joint: 'rgba(70,46,80,0.34)', pier: '#a2848f', shade: '#7c6480', plit: '#eeb99a', cap: '#937686', kerb: '#c4a39f', post: '#6e5670', rail: '#efc3a8', lamp: 'rgba(255,224,160,0.95)' },
    near: { face: '#b4958b', lit: '#ffd3a6', edge: '#5a4757', soffit: '#3d3150', joint: 'rgba(58,38,60,0.38)', pier: '#a88d87', shade: '#6d5b6c', plit: '#f3bb8f', cap: '#8f7678', kerb: '#d2b5a5', post: '#56475a', rail: '#fbd6b5', lamp: 'rgba(255,230,168,1)' },
  };
  const PILLARS = { high: [184, 425, 700, 836], back: [540, 668], front: [506, 694], left: [96, 262], right: [838] };

  // Fixed-position gradients used every frame, built once per context.
  let gCtx = null, gMap = null;
  function grad(ctx, key, make) {
    if (gCtx !== ctx) { gCtx = ctx; gMap = {}; }
    return gMap[key] || (gMap[key] = make());
  }

  function sample(segs) {
    const xs = [], ys = [], cum = [];
    let len = 0;
    segs.forEach((g, si) => {
      for (let i = si ? 1 : 0; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        const x = a * g[0] + b * g[2] + c * g[4] + d * g[6], y = a * g[1] + b * g[3] + c * g[5] + d * g[7];
        if (xs.length) len += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]);
        xs.push(x); ys.push(y); cum.push(len);
      }
    });
    return { xs, ys, cum, len };
  }
  for (const k in DECKS) DECKS[k].tab = sample(DECKS[k].segs);

  function pointAt(tab, d, out) {
    const { xs, ys, cum } = tab;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
    out.x = xs[i - 1] + (xs[i] - xs[i - 1]) * f;
    out.y = ys[i - 1] + (ys[i] - ys[i - 1]) * f;
    out.dx = (xs[i] - xs[i - 1]) / seg;
    out.dy = (ys[i] - ys[i - 1]) / seg;
    return out;
  }
  function yAtX(tab, x) { // decks whose x runs one way
    const { xs, ys } = tab;
    for (let i = 1; i < xs.length; i++) {
      const a = xs[i - 1], b = xs[i];
      if ((x - a) * (x - b) <= 0) return ys[i - 1] + (ys[i] - ys[i - 1]) * (b === a ? 0 : (x - a) / (b - a));
    }
    return ys[0];
  }
  function curve(ctx, segs, dy) {
    ctx.moveTo(segs[0][0], segs[0][1] + dy);
    for (const g of segs) ctx.bezierCurveTo(g[2], g[3] + dy, g[4], g[5] + dy, g[6], g[7] + dy);
  }
  function band(ctx, segs, dy0, dy1) {
    ctx.beginPath();
    curve(ctx, segs, dy0);
    const last = segs[segs.length - 1];
    ctx.lineTo(last[6], last[7] + dy1);
    for (let i = segs.length - 1; i >= 0; i--) {
      const g = segs[i];
      ctx.bezierCurveTo(g[4], g[5] + dy1, g[2], g[3] + dy1, g[0], g[1] + dy1);
    }
    ctx.closePath();
  }
  function stroke(ctx, segs, dy, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); curve(ctx, segs, dy); ctx.stroke();
  }

  // ---------- flyover pieces ----------
  function deckBody(ctx, d) {
    const p = PAL[d.pal];
    ctx.lineCap = 'butt';
    ctx.fillStyle = p.soffit; band(ctx, d.segs, d.th - 1, d.th + d.so); ctx.fill();
    ctx.fillStyle = p.face; band(ctx, d.segs, 0, d.th); ctx.fill();
    stroke(ctx, d.segs, d.th * 0.74, 'rgba(40,20,52,0.16)', d.th * 0.5);   // soft falloff towards the drip edge
    stroke(ctx, d.segs, 0.9, p.lit, 1.4);                                   // sunlit top lip
    stroke(ctx, d.segs, d.th - 0.6, p.edge, 1);
    stroke(ctx, d.segs, d.th + d.so - 0.6, 'rgba(255,170,130,0.32)', 1);     // bounce light on the girder
    ctx.setLineDash([0.9, 46]);
    stroke(ctx, d.segs, d.th / 2, p.joint, d.th - 2);                      // expansion joints
    ctx.setLineDash([]);
  }
  function pillar(ctx, x, top, w, p) {
    const h = PIER_BOT - top;
    if (h <= 0) return;
    ctx.fillStyle = p.pier; ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = p.shade; ctx.fillRect(x - w / 2, top, w * 0.4, h);
    ctx.fillStyle = p.plit; ctx.fillRect(x + w / 2 - w * 0.22, top, w * 0.22, h);
    ctx.fillStyle = 'rgba(34,18,44,0.32)'; ctx.fillRect(x - w / 2, top, w, Math.min(h, 16));
    ctx.fillStyle = p.cap;
    ctx.beginPath();
    ctx.moveTo(x - w * 1.5, top - 2); ctx.lineTo(x + w * 1.5, top - 2);
    ctx.lineTo(x + w * 0.5, top + 6); ctx.lineTo(x - w * 0.5, top + 6);
    ctx.closePath(); ctx.fill();
  }
  function deckPillars(ctx, key) {
    const d = DECKS[key], p = PAL[d.pal];
    const w = d.pal === 'far' ? 7 : d.pal === 'mid' ? 10 : 15;
    for (const x of PILLARS[key]) pillar(ctx, x, yAtX(d.tab, x) + d.th + d.so - 1, w, p);
  }
  function jointPier(ctx, x) {
    const p = PAL.near, top = cy + 12;
    pillar(ctx, x, top + 8, 19, p);
    ctx.fillStyle = p.cap; ctx.fillRect(x - 21, top - 2, 42, 11);
    ctx.fillStyle = p.plit; ctx.fillRect(x + 16, top - 2, 5, 11);
    ctx.fillStyle = 'rgba(34,18,44,0.35)'; ctx.fillRect(x - 21, top + 7, 42, 2);
  }
  // Kerb, see-through railing and deck lamps — drawn after the cars so the cars sit behind them.
  function railing(ctx, d, lamps) {
    const p = PAL[d.pal], k = d.rs;
    ctx.lineCap = 'butt';
    ctx.fillStyle = p.kerb; band(ctx, d.segs, -2 * k, 0.6); ctx.fill();
    ctx.setLineDash([1.1, 3.6 * k]);
    stroke(ctx, d.segs, -3.9 * k, p.post, 3.6 * k);
    ctx.setLineDash([]);
    stroke(ctx, d.segs, -5.9 * k, p.rail, 1.1);
    if (!lamps) return;
    const P = 96 * k;
    ctx.lineDashOffset = -20;
    ctx.setLineDash([0.9, P - 0.9]);
    stroke(ctx, d.segs, -9 * k, p.post, 12 * k);                         // lamp poles
    ctx.lineCap = 'round';
    ctx.setLineDash([0.01, P - 0.01]);
    stroke(ctx, d.segs, -15 * k, 'rgba(255,196,130,0.3)', 9 * k);        // glow
    stroke(ctx, d.segs, -15 * k, p.lamp, 2.6 * k);                       // lamp head
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineCap = 'butt';
  }

  // Upright lamps on the near decks, placed where the deck is gentle enough to read.
  const LAMP_AT = { left: [70, 215, 352], front: [528, 600, 672], right: [868, 972] };
  function deckLamps(ctx, list) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = PAL.near.post; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const l of list) { ctx.moveTo(l.x, l.y - 1); ctx.lineTo(l.x, l.y - 14); ctx.lineTo(l.x + 2.5, l.y - 15.5); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,196,130,0.3)';
    ctx.beginPath();
    for (const l of list) { ctx.moveTo(l.x + 7, l.y - 15); ctx.arc(l.x + 2.5, l.y - 15, 4.5, 0, TAU); }
    ctx.fill();
    ctx.fillStyle = PAL.near.lamp;
    ctx.beginPath();
    for (const l of list) { ctx.moveTo(l.x + 4, l.y - 15); ctx.arc(l.x + 2.5, l.y - 15, 1.5, 0, TAU); }
    ctx.fill();
  }

  const POSTERS = [[cx - rx - 3, 181, '#f4efe4', '#c1121f'], [506, 174, '#ffe066', '#2b9348'], [838, 223, '#f1f1f1', '#1d4ed8']];
  // Green direction board on the loop's parapet.
  function dirSign(ctx) {
    const x = cx, y = cy - ry - 25;
    ctx.fillStyle = '#3a3440'; ctx.fillRect(x - 24, y + 13, 1.6, 12); ctx.fillRect(x + 22.4, y + 13, 1.6, 12);
    ctx.fillStyle = 'rgba(30,16,40,0.3)'; TH.rr(ctx, x - 33, y + 1.5, 68, 14, 2); ctx.fill();   // shadow falls down-left
    ctx.fillStyle = '#0d6a3e'; TH.rr(ctx, x - 34, y, 68, 14, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8; TH.rr(ctx, x - 32.5, y + 1.5, 65, 11, 1.5); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 7.5px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('বিমানবন্দর', x - 7, y + 7.5, 42);
    ctx.beginPath(); ctx.moveTo(x + 22, y + 4); ctx.lineTo(x + 29, y + 7); ctx.lineTo(x + 22, y + 10); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + 18, y + 6.2, 5, 1.6);
  }

  // ---------- traffic on the ramps ----------
  const CAR_COLS = ['#ece7e1', '#b9bec6', '#30303a', '#8e2b34', '#d9a13b', '#3d5a80', '#f4f1ea'];
  const BUS_COLS = [['#c0392b', '#f1c40f'], ['#1f6fb2', '#f0f0f0'], ['#2e8b57', '#f4d03f'], ['#e67e22', '#fff3de'], ['#7d3c98', '#f0f0f0'], ['#d6336c', '#ffe066']];
  const PT = { x: 0, y: 0, dx: 1, dy: 0 };
  function locate(s, c) {
    const r = s.routes[c.r];
    let d = c.d;
    c.vis = false;
    for (const [key, dir] of r.parts) {
      const deck = DECKS[key], len = deck.tab.len;
      if (d > len) { d -= len; continue; }
      pointAt(deck.tab, dir > 0 ? d : len - d, PT);
      const tx = PT.dx * dir, ty = PT.dy * dir;
      c.face = tx >= 0 ? 1 : -1;
      let a = Math.atan2(ty * c.face, tx * c.face);
      c.fs = 1;
      if (Math.abs(a) > 0.42) { c.fs = Math.max(0.3, Math.cos(a) / Math.cos(0.42)); a = Math.sign(a) * 0.42; } // turning away: foreshorten
      c.x = PT.x; c.y = PT.y; c.ang = a;
      c.layer = deck.pal === 'near' ? 1 : 0;
      c.far = deck.pal === 'far';
      c.vis = c.x > -30 && c.x < W + 30;
      return;
    }
  }
  function drawCar(ctx, c, lift) {
    const k = c.far ? 0.72 : 1;
    let L, H;
    if (c.type === 'bus') { L = 21; H = 8.8; } else if (c.type === 'cng') { L = 9; H = 6.6; } else { L = 12; H = 5.6; }
    L *= k * c.fs; H *= k;
    ctx.save();
    ctx.translate(c.x, c.y - lift);
    ctx.rotate(c.ang);
    const hx = -L / 2;
    ctx.fillStyle = c.col;
    if (c.type === 'car') {
      ctx.fillRect(hx, -H * 0.56 - 0.5, L, H * 0.56);
      ctx.fillStyle = '#6f7690'; ctx.fillRect(-L * 0.28, -H - 0.5, L * 0.54, H * 0.46);
    } else if (c.type === 'bus') {
      ctx.fillRect(hx, -H - 0.5, L, H);
      ctx.fillStyle = '#ffe3a1'; ctx.fillRect(hx + 1, -H + 0.6, L - 2, H * 0.36);  // lit saloon windows
      ctx.fillStyle = c.col2; ctx.fillRect(hx, -H * 0.36, L, 1);
    } else {
      ctx.fillRect(hx, -H * 0.7 - 0.5, L, H * 0.7);
      ctx.fillStyle = '#1d2a22'; ctx.fillRect(hx + L * 0.12, -H - 0.5, L * 0.8, H * 0.34); // CNG canopy
    }
    ctx.fillStyle = '#fff4c4'; ctx.fillRect(c.face > 0 ? -hx - 1.4 : hx, -2.6, 1.4, 1.4);
    ctx.fillStyle = '#ff4747'; ctx.fillRect(c.face > 0 ? hx : -hx - 1.4, -2.6, 1.4, 1.4);
    ctx.restore();
  }
  function drawCars(ctx, s, layer) {
    for (const c of s.cars) if (c.vis && c.layer === layer) drawCar(ctx, c, s.routes[c.r].lift);
  }

  // ---------- train ----------
  const SKINS = ['#8d5a3b', '#a8694a', '#6e4630', '#b97c56'];
  const SHIRTS = ['#e63946', '#f1f1f1', '#2a9d8f', '#f4a261', '#457b9d', '#ffd166', '#9b5de5'];
  const pick = (a) => a[(Math.random() * a.length) | 0];
  function spawnTrain(tr) {
    const n = 5 + ((Math.random() * 3) | 0);
    tr.units = [{ loco: true }];
    for (let i = 0; i < n; i++) {
      const riders = [];
      if (Math.random() < 0.45) {
        const m = 1 + ((Math.random() * 4) | 0);
        for (let j = 0; j < m; j++) riders.push({ dx: 10 + Math.random() * (COACH - 20), shirt: pick(SHIRTS), skin: pick(SKINS) });
      }
      tr.units.push({ loco: false, riders, dim: Math.random() < 0.18 });
    }
    tr.on = true;
    tr.dir = Math.random() < 0.5 ? 1 : -1;
    tr.len = LOCO + n * (COACH + GAP);
    tr.x = tr.dir > 0 ? -30 : W + 30;
    tr.v = 210 + Math.random() * 50;
    tr.next = 12 + Math.random() * 6;
  }
  function wheels(ctx, xs) {
    ctx.fillStyle = '#1b1a1f';
    ctx.beginPath();
    for (const x of xs) { ctx.moveTo(x + 3.3, RAIL - 3.3); ctx.arc(x, RAIL - 3.3, 3.3, 0, TAU); }
    ctx.fill();
  }
  const WIN_DASH = [5.5, 3.6, 5.5, 3.6, 5.5, 3.6, 5.5, 3.6, 5.5, 3.6, 5.5, 3.6, 5.5, 3.6, 5.5, 34.8];
  // Every coach is identical, so each detail is one dashed stroke along the whole rake (period COACH + GAP).
  function drawCoaches(ctx, tr, xl, xr) {
    const dl = (off, y, w, col, dash) => {
      ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(xl + off, y); ctx.lineTo(xr, y); ctx.stroke();
    };
    ctx.lineCap = 'butt';
    dl(8, 263.5, 3, '#26262b', [COACH - 16, GAP + 16]);            // underframe
    dl(8, 263.8, 3.5, '#3a3a40', [22, 40, 22, 20]);                // bogie frames
    dl(1, 242, 6, '#687a70', [COACH - 2, GAP + 2]);                // roof
    dl(4, 239.7, 1.6, '#7d8c80', [COACH - 8, GAP + 8]);            // roof crown
    dl(6, 239.6, 0.9, 'rgba(255,205,150,0.7)', [COACH - 12, GAP + 12]);
    dl(0, 253, 20, '#2e7a4b', [COACH, GAP]);                       // body
    dl(0, 245.6, 1.2, '#f2c230', [COACH, GAP]);                    // yellow lines
    dl(0, 257.5, 3, '#f2c230', [COACH, GAP]);
    dl(3, 254.5, 15, '#23603b', [5, COACH - 16, 5, GAP + 6]);      // doors
    dl(15.4, 250.5, 5.4, '#ffe39c', WIN_DASH);                     // lit windows
    dl(0, 261.5, 3, 'rgba(20,10,20,0.28)', [COACH, GAP]);
    dl(COACH - 1.6, 253, 20, 'rgba(255,196,140,0.5)', [1.6, COACH + GAP - 1.6]); // sunlit ends
    dl(COACH, 253.5, 11, '#2a2a2e', [GAP, COACH]);                 // gangways
    ctx.lineCap = 'round';
    dl(13, RAIL - 3.3, 6.6, '#1b1a1f', [0, 12, 0, 50, 0, 12, 0, 30]); // wheels (round-capped dots)
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    // per-coach extras: a few dark saloons and people riding on the roof
    for (let k = 1; k < tr.units.length; k++) {
      const u = tr.units[k];
      const x0 = tr.dir > 0 ? xr - COACH - (k - 1) * (COACH + GAP) : xl + (k - 1) * (COACH + GAP);
      if (x0 > W || x0 + COACH < 0) continue;
      if (u.dim) { ctx.fillStyle = '#3c4a48'; ctx.fillRect(x0 + 15.4, 247.8, 69.2, 5.4); }
      if (!u.riders.length) continue;
      for (const r of u.riders) { ctx.fillStyle = r.shirt; ctx.fillRect(x0 + r.dx - 1.6, 234.6, 3.2, 4.6); }
      ctx.fillStyle = '#6e4630';
      ctx.beginPath();
      for (const r of u.riders) { ctx.moveTo(x0 + r.dx + 1.7, 233); ctx.arc(x0 + r.dx, 233, 1.7, 0, TAU); }
      ctx.fill();
    }
  }
  function drawLoco(ctx, x0, dir) {
    const L = LOCO;
    ctx.save();
    ctx.translate(x0 + L / 2, 0);
    ctx.scale(dir, 1);                                                             // nose faces +x
    const h = -L / 2;
    ctx.fillStyle = '#26262b'; ctx.fillRect(h + 6, 261, L - 12, 4);
    wheels(ctx, [h + 14, h + 24, h + 34, L / 2 - 34, L / 2 - 24, L / 2 - 14]);
    ctx.fillStyle = '#1e5a3c'; TH.rr(ctx, h + 2, 245, L - 22, 17, 3); ctx.fill();  // long hood
    ctx.fillStyle = '#1a4d34'; ctx.fillRect(h + 8, 241, 30, 5);                  // radiator roof
    ctx.fillStyle = '#16402b'; TH.rr(ctx, L / 2 - 30, 238, 20, 24, 3); ctx.fill(); // cab
    ctx.fillStyle = '#f4c542';
    ctx.beginPath(); ctx.moveTo(L / 2 - 12, 246); ctx.lineTo(L / 2 - 3, 248); ctx.lineTo(L / 2, 262); ctx.lineTo(L / 2 - 12, 262); ctx.closePath(); ctx.fill(); // nose
    ctx.fillStyle = '#c0392b'; ctx.fillRect(h + 2, 256, L - 3, 2.6);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(h + 2, 252, L - 14, 1.4);
    ctx.fillStyle = '#ffe7a6'; ctx.fillRect(L / 2 - 27, 241, 7, 5); ctx.fillRect(L / 2 - 18, 241, 5, 5); // lit cab windows
    ctx.fillStyle = 'rgba(255,200,150,0.55)'; ctx.fillRect(h + 4, 245.3, L - 26, 1);
    ctx.fillStyle = '#2b2b30'; ctx.fillRect(h + 20, 238, 4, 4);                  // exhaust stack
    TH.circle(ctx, L / 2 - 3, 250, 1.8, '#fffbe6');                              // headlight
    ctx.fillStyle = grad(ctx, 'beam', () => {                                     // local coords, so reusable
      const g = ctx.createLinearGradient(L / 2, 0, L / 2 + 120, 0);
      g.addColorStop(0, 'rgba(255,240,190,0.42)'); g.addColorStop(1, 'rgba(255,240,190,0)');
      return g;
    });
    ctx.beginPath(); ctx.moveTo(L / 2 - 2, 248.5); ctx.lineTo(L / 2 + 120, 240); ctx.lineTo(L / 2 + 120, 262); ctx.lineTo(L / 2 - 2, 251.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawTrain(ctx, tr) {
    if (!tr.on) return;
    const n = tr.units.length - 1, rake = n * (COACH + GAP) - GAP;
    const lx = tr.dir > 0 ? tr.x - LOCO : tr.x;         // loco left edge (tr.x is the leading edge)
    const xl = tr.dir > 0 ? lx - GAP - rake : lx + LOCO + GAP, xr = xl + rake;
    if (xr > -10 && xl < W + 10) {
      drawCoaches(ctx, tr, xl, xr);
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(tr.dir > 0 ? xr : xl - GAP, 248, GAP, 11);
    }
    if (lx < W + 130 && lx + LOCO > -130) drawLoco(ctx, lx, tr.dir);
  }

  // ---------- level crossing (the parts on our side of the track) ----------
  function drawGate(ctx, s, t) {
    const e = s.gate * s.gate * (3 - 2 * s.gate);
    const a = -1.45 * (1 - e);
    ctx.fillStyle = '#3b3b42'; ctx.fillRect(GATE.x - 2, 252, 4, 38);
    ctx.fillStyle = 'rgba(255,190,140,0.6)'; ctx.fillRect(GATE.x + 1, 252, 1, 38);
    ctx.save();
    ctx.translate(GATE.x, GATE.y);
    ctx.rotate(a);
    ctx.fillStyle = '#2b2b30'; ctx.fillRect(-12, -2.5, 9, 5);                   // counterweight
    ctx.fillStyle = '#f5f1ea'; ctx.fillRect(0, -1.6, GATE.len, 3.2);
    ctx.lineCap = 'butt';
    ctx.setLineDash([6, 6]); ctx.strokeStyle = '#d42a2a'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(GATE.len, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // warning lamps flash while the gate is closing or shut
    const on = s.gateWant || s.gate > 0.02;
    const ph = Math.floor(t * 2.6) % 2;
    ctx.fillStyle = '#1c1c20'; TH.rr(ctx, GATE.x - 13, 250, 26, 9, 4); ctx.fill();
    for (let i = 0; i < 2; i++) {
      const lx = GATE.x - 7 + i * 14, lit = on && ph === i;
      if (lit) TH.circle(ctx, lx, 254.5, 7, 'rgba(255,60,50,0.3)');
      TH.circle(ctx, lx, 254.5, 2.8, lit ? '#ff4b3e' : '#5a1f1f');
    }
    ctx.fillStyle = '#1c1c20'; ctx.fillRect(GATE.x - 16, 239, 46, 11);                // sign sits clear of the bus-stop post
    ctx.fillStyle = '#f6c945'; ctx.fillRect(GATE.x - 15, 240, 44, 9);
    ctx.fillStyle = '#1b1b1b'; ctx.font = `bold 6.8px ${TH.FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('সাবধান রেলগেট', GATE.x + 7, 244.8, 41);
  }

  // ---------- foot-overbridge ----------
  function flight(ctx, xa, ya, xb, yb) {
    const col = '#3a5559';
    TH.line(ctx, [xa, ya + 3, xb, yb], col, 4);                   // stringer
    ctx.lineCap = 'butt';
    ctx.setLineDash([2.2, 2.4]);
    TH.line(ctx, [xa, ya + 0.5, xb, yb - 2.5], '#7f9591', 2.4);   // treads
    ctx.setLineDash([]);
    TH.line(ctx, [xa, ya - 11, xb, yb - 13], '#2c4245', 1.3);     // handrail
    ctx.strokeStyle = '#2c4245'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
      const f = i / 5, x = xa + (xb - xa) * f, y = ya + (yb - ya) * f;
      ctx.moveTo(x, y - 1); ctx.lineTo(x, y - 12);
    }
    ctx.stroke();
  }
  function drawOverbridge(ctx, s) {
    const { x0, x1, top, deck, bot } = OB;
    // stairs down to the far footpath at both ends
    flight(ctx, x0, deck, x0 - 62, 298);
    flight(ctx, x1, deck, x1 + 62, 298);
    // steel piers
    for (const x of [x0 + 5, x1 - 5]) {
      ctx.fillStyle = '#34494d'; ctx.fillRect(x - 3, bot, 6, 300 - bot);
      ctx.fillStyle = 'rgba(255,180,130,0.55)'; ctx.fillRect(x + 1.5, bot, 1.5, 300 - bot);
    }
    // mesh on the far side, walkers, then the near truss
    ctx.fillStyle = 'rgba(52,78,82,0.28)'; ctx.fillRect(x0, top, x1 - x0, deck - top);
    for (const w of s.walkers) {
      const fade = Math.min(1, (w.x - x0) / 12, (x1 - w.x) / 12);
      if (fade <= 0) continue;
      const bob = Math.abs(Math.sin(w.ph * 9)) * 0.6;
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#2d2a35'; ctx.fillRect(w.x - 1, deck - 3.6, 2, 3.6);
      ctx.fillStyle = w.shirt; ctx.fillRect(w.x - 1.4, deck - 8.4 - bob, 2.8, 5);
      TH.circle(ctx, w.x, deck - 10 - bob, 1.6, '#7a4d33');
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#3f5c60'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let x = x0, i = 0; x <= x1 + 0.1; x += 16, i++) {
      ctx.moveTo(x, top); ctx.lineTo(x, deck);
      if (x + 16 <= x1 + 0.1) { ctx.moveTo(x, i % 2 ? top : deck); ctx.lineTo(x + 16, i % 2 ? deck : top); }
    }
    ctx.stroke();
    ctx.fillStyle = '#34494d'; ctx.fillRect(x0 - 2, top - 1.5, x1 - x0 + 4, 3);       // top chord / handrail
    ctx.fillStyle = '#f0b284'; ctx.fillRect(x0 - 2, top - 1.5, x1 - x0 + 4, 0.9);
    ctx.fillStyle = '#4d6669'; ctx.fillRect(x0 - 4, deck, x1 - x0 + 8, bot - deck);   // deck fascia
    ctx.fillStyle = '#e8ad80'; ctx.fillRect(x0 - 4, deck, x1 - x0 + 8, 1.2);
    ctx.fillStyle = '#243538'; ctx.fillRect(x0 - 2, bot, x1 - x0 + 4, 2);
    // name board
    const bx = 460;
    ctx.fillStyle = 'rgba(20,20,30,0.35)'; TH.rr(ctx, bx - 60, 202, 122, 25, 3); ctx.fill();
    ctx.fillStyle = '#0d6a3e'; TH.rr(ctx, bx - 61, 200, 122, 25, 3); ctx.fill();
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1; TH.rr(ctx, bx - 58.5, 202.5, 117, 20, 2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 12px ${TH.FONT}`; ctx.fillText('কুড়িল বিশ্বরোড', bx, 210, 108);
    ctx.fillStyle = '#cfeedd'; ctx.font = `bold 6px ${TH.FONT}`; ctx.fillText('KURIL BISHWA ROAD', bx, 219, 100);
  }

  // ---------- static far layer (cached) ----------
  function paintFar(c, s) {
    // sky
    let g = c.createLinearGradient(0, 0, 0, 300);
    [[0, '#2c2956'], [0.24, '#5f437a'], [0.47, '#b25b7e'], [0.68, '#ea8466'], [0.85, '#f8ae6c'], [1, '#ffd49a']].forEach(([o, col]) => g.addColorStop(o, col));
    c.fillStyle = g; c.fillRect(0, 0, W, 300);
    g = c.createRadialGradient(SUN.x, SUN.y, 4, SUN.x, SUN.y, 330);
    g.addColorStop(0, 'rgba(255,234,172,0.95)'); g.addColorStop(0.1, 'rgba(255,206,140,0.6)');
    g.addColorStop(0.42, 'rgba(250,160,120,0.2)'); g.addColorStop(1, 'rgba(240,130,110,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, 300);
    // faint cloud banks, then thin cloudlets lit from below by the low sun
    for (const b of s.banks) {
      g = c.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
      g.addColorStop(0, 'rgba(110,70,120,0)'); g.addColorStop(0.62, 'rgba(226,128,146,0.2)'); g.addColorStop(1, 'rgba(255,170,150,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(b.x, b.y, b.w, b.h, 0, 0, TAU); c.fill();
    }
    const puff = (x, y, w, h, col, a) => {             // soft elliptical blob
      c.save(); c.translate(x, y); c.scale(w, h);
      const pg = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      pg.addColorStop(0, `rgba(${col},${a.toFixed(2)})`); pg.addColorStop(0.55, `rgba(${col},${(a * 0.6).toFixed(2)})`); pg.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = pg; c.fillRect(-1, -1, 2, 2); c.restore();
    };
    for (const cl of s.clouds) {
      const warm = Math.max(0, 1 - Math.abs(cl.x - SUN.x) / 750);
      for (const [dx, dy, f] of cl.puffs) puff(cl.x + dx * cl.w, cl.y + dy * cl.h, cl.w * f * 1.3, cl.h * f * 1.6, '96,58,108', 0.42);
      puff(cl.x + cl.w * 0.08, cl.y + cl.h * 0.55, cl.w * 0.85, cl.h * 0.6, `255,${(170 + warm * 56) | 0},${(140 + warm * 22) | 0}`, 0.45 + warm * 0.45);
      c.fillStyle = `rgba(255,236,200,${(0.1 + warm * 0.3).toFixed(2)})`;
      c.fillRect(cl.x - cl.w * 0.4, cl.y + cl.h * 0.72, cl.w * 0.8, 0.7);
    }
    // low sun with haze bands across it
    g = c.createRadialGradient(SUN.x - 5, SUN.y - 6, 1, SUN.x, SUN.y, SUN.r);
    g.addColorStop(0, '#fffdf2'); g.addColorStop(0.6, '#ffe8b2'); g.addColorStop(1, '#ffc27e');
    TH.circle(c, SUN.x, SUN.y, SUN.r, g);
    c.fillStyle = 'rgba(238,142,122,0.38)';
    for (const [dx, dy, w, h] of [[-10, 8, 74, 2.4], [14, 15, 56, 1.8], [-4, -3, 38, 1.1]]) { c.beginPath(); c.ellipse(SUN.x + dx, SUN.y + dy, w, h, 0, 0, TAU); c.fill(); }
    // far skyline: two hazy layers, a mobile tower and a mosque framed inside the loop
    c.fillStyle = 'rgba(168,110,140,0.5)';
    for (const b of s.sky1) c.fillRect(b.x, b.top, b.w, PIER_BOT - b.top);
    c.strokeStyle = 'rgba(120,80,110,0.8)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(958, 150); c.lineTo(952, 214); c.moveTo(958, 150); c.lineTo(964, 214);
    for (let y = 160; y < 214; y += 9) { c.moveTo(952 + (y - 150) * 0.02, y); c.lineTo(964 - (y - 150) * 0.02, y + 9); }
    c.stroke();
    const mc = '#86597e';
    c.fillStyle = mc;
    c.fillRect(cx - 42, 176, 84, 20);
    c.beginPath(); c.ellipse(cx, 177, 17, 16, 0, Math.PI, TAU); c.fill();
    c.fillRect(cx - 3, 154, 6, 8); c.fillRect(cx - 1, 150, 2, 6);
    for (const mx of [cx - 44, cx + 39]) {
      c.fillRect(mx, 150, 5, 46); c.fillRect(mx - 1, 164, 7, 2); c.fillRect(mx - 1, 178, 7, 2);
      c.beginPath(); c.moveTo(mx - 0.5, 150); c.lineTo(mx + 2.5, 141); c.lineTo(mx + 5.5, 150); c.fill();
    }
    c.fillStyle = 'rgba(255,196,150,0.45)'; c.beginPath(); c.ellipse(cx + 5, 172, 9, 10, 0, -1.2, 0.2); c.lineTo(cx + 5, 172); c.fill();
    for (const b of s.sky2) {
      const h = PIER_BOT - b.top;
      c.fillStyle = '#946683'; c.fillRect(b.x, b.top, b.w, h);
      c.fillStyle = 'rgba(255,188,150,0.38)'; c.fillRect(b.x + b.w - 3, b.top, 3, h);
      c.fillStyle = 'rgba(60,30,64,0.2)'; c.fillRect(b.x, b.top, 3, h);
      if (b.tank) { c.fillStyle = '#7b5271'; c.fillRect(b.x + 5, b.top - 5, 9, 5); c.fillRect(b.x + 7, b.top - 8, 2, 3); }
      c.fillStyle = '#ffd88e'; for (const [wx, wy] of b.wins) c.fillRect(b.x + wx, b.top + wy, 3, 2.4);
    }
    g = c.createLinearGradient(0, 130, 0, 270);
    g.addColorStop(0, 'rgba(255,196,150,0)'); g.addColorStop(1, 'rgba(255,190,150,0.5)');
    c.fillStyle = g; c.fillRect(0, 130, W, 140);
    paintMall(c, s);
    g = c.createLinearGradient(0, 60, 0, 270);
    g.addColorStop(0, 'rgba(250,180,150,0)'); g.addColorStop(1, 'rgba(255,186,150,0.28)');
    c.fillStyle = g; c.fillRect(0, 60, W, 210);
    // the far, highest ramp and the back half of the loop
    deckPillars(c, 'high'); deckBody(c, DECKS.high);
    paintBillboard(c);
    g = c.createLinearGradient(0, 40, 0, 270);
    g.addColorStop(0, 'rgba(255,184,150,0)'); g.addColorStop(1, 'rgba(255,184,150,0.16)');
    c.fillStyle = g; c.fillRect(0, 40, W, 230);
    deckPillars(c, 'back'); deckBody(c, DECKS.back);
    paintEmbankment(c, s);
  }

  function paintMall(c, s) {
    // office tower behind the mall
    let g = c.createLinearGradient(0, 60, 0, 190);
    g.addColorStop(0, '#d0909a'); g.addColorStop(0.45, '#8c7096'); g.addColorStop(1, '#5c5a8a');
    c.fillStyle = g; c.fillRect(196, 60, 62, 210);
    g = c.createLinearGradient(196, 0, 258, 0);
    g.addColorStop(0, 'rgba(40,24,60,0.35)'); g.addColorStop(0.6, 'rgba(40,24,60,0)'); g.addColorStop(1, 'rgba(255,196,150,0.45)');
    c.fillStyle = g; c.fillRect(196, 60, 62, 210);
    c.fillStyle = 'rgba(255,214,190,0.25)';                 // sky reflection streak
    c.beginPath(); c.moveTo(214, 60); c.lineTo(230, 60); c.lineTo(206, 140); c.lineTo(196, 140); c.closePath(); c.fill();
    c.fillStyle = 'rgba(40,28,70,0.3)';
    for (let y = 66; y < 200; y += 7) c.fillRect(196, y, 62, 1);
    for (let x = 203; x < 258; x += 7) c.fillRect(x, 60, 0.8, 140);
    c.fillStyle = '#ffd98f'; for (const [wx, wy] of s.towerLit) c.fillRect(wx, wy, 6, 3);
    c.fillStyle = '#5c4870'; c.fillRect(200, 54, 54, 6); c.fillRect(210, 48, 34, 6); c.fillRect(226, 42, 2, 6);
    c.fillStyle = 'rgba(255,196,150,0.55)'; c.fillRect(250, 54, 4, 6); c.fillRect(240, 48, 4, 6);
    // main block
    const x0 = 14, x1 = 276, top = 104;
    g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#7c6689'); g.addColorStop(1, '#b8959f');
    c.fillStyle = g; c.fillRect(x0, top, x1 - x0, PIER_BOT - top);
    for (let i = 0; i < 6; i++) {
      const y = top + 10 + i * 26;
      g = c.createLinearGradient(0, y, 0, y + 15);
      g.addColorStop(0, '#f2a78e'); g.addColorStop(0.5, '#ac7f9a'); g.addColorStop(1, '#5d6898');
      c.fillStyle = g; c.fillRect(x0 + 4, y, x1 - x0 - 8, 15);
      c.fillStyle = 'rgba(255,214,140,0.72)'; for (const k of s.mallLit[i]) c.fillRect(x0 + 5 + k * 11, y + 2, 10, 11);
      c.fillStyle = 'rgba(48,34,70,0.42)'; for (let x = x0 + 4; x < x1 - 4; x += 11) c.fillRect(x, y, 1, 15);
      c.fillStyle = 'rgba(40,26,60,0.35)'; c.fillRect(x0 + 4, y + 15, x1 - x0 - 8, 2);
    }
    c.fillStyle = '#d1aba8'; c.fillRect(x0 - 3, top - 5, x1 - x0 + 6, 6);          // parapet
    c.fillStyle = 'rgba(120,240,255,0.3)'; c.fillRect(x0 - 3, top + 1, x1 - x0 + 6, 3.5);
    c.fillStyle = '#a8f7ff'; c.fillRect(x0 - 3, top + 1.6, x1 - x0 + 6, 1.1);     // LED strip
    c.fillStyle = '#9a7d8f'; c.fillRect(40, top - 14, 30, 9); c.fillRect(120, top - 11, 22, 6); // rooftop plant
    // curved glass drum on the corner, catching the sun
    const d0 = 262, d1 = 330, dt = 92;
    g = c.createLinearGradient(d0, 0, d1, 0);
    g.addColorStop(0, '#5e5d8c'); g.addColorStop(0.5, '#b58aa1'); g.addColorStop(0.82, '#f8bb94'); g.addColorStop(1, '#a07a92');
    c.fillStyle = g; c.fillRect(d0, dt, d1 - d0, PIER_BOT - dt);
    c.strokeStyle = 'rgba(50,36,72,0.35)'; c.lineWidth = 1;
    c.beginPath();
    for (let y = dt + 12; y < PIER_BOT; y += 13) { c.moveTo(d0, y); c.quadraticCurveTo((d0 + d1) / 2, y + 4, d1, y); }
    for (let x = d0 + 8; x < d1; x += 10) { c.moveTo(x, dt + 3); c.lineTo(x, PIER_BOT); }
    c.stroke();
    c.beginPath(); c.ellipse((d0 + d1) / 2, dt, (d1 - d0) / 2 + 2, 5, 0, 0, TAU); c.fillStyle = '#d8afa8'; c.fill();
    c.fillStyle = '#a8f7ff'; c.fillRect(d0, dt + 5, d1 - d0, 1);
    // sign panel (lettering is drawn live so the web font is used)
    TH.rr(c, 36, 139, 136, 28, 4); c.fillStyle = '#3a2242'; c.fill();
    c.strokeStyle = '#f0c27e'; c.lineWidth = 1.2; c.stroke();
  }

  function paintBillboard(c) {
    const { x, y, w, h } = BB, px = x + w / 2;
    c.fillStyle = '#3b3440'; c.fillRect(px - 3, y + h, 6, PIER_BOT - y - h);            // pole
    c.fillStyle = 'rgba(255,190,140,0.5)'; c.fillRect(px + 1.5, y + h, 1.5, PIER_BOT - y - h);
    c.strokeStyle = '#3b3440'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x + 8, y + h); c.lineTo(px, y + h + 16); c.lineTo(x + w - 8, y + h); c.stroke();
    c.fillStyle = '#2c2630'; c.fillRect(x - 3, y - 3, w + 6, h + 6);                   // frame
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fff8ea'); g.addColorStop(1, '#f3d2b0');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = '#e63946'; c.fillRect(x, y, 6, h);
    c.fillStyle = '#2a9d8f'; c.fillRect(x + w - 16, y + 4, 12, h - 8);               // stylised tower block
    c.fillStyle = '#ffe9a8'; for (let i = 0; i < 4; i++) c.fillRect(x + w - 13, y + 7 + i * 7, 6, 3);
    c.fillStyle = '#2c2630'; c.fillRect(x - 4, y + h + 3, w + 8, 2);                   // catwalk
    for (const lx of [x + 16, x + w - 26]) {                                            // flood lamps
      c.fillStyle = '#2c2630'; c.fillRect(lx - 1, y - 9, 2, 6); c.fillRect(lx - 3, y - 10, 6, 2.5);
      const lg = c.createRadialGradient(lx, y - 6, 0, lx, y - 6, 20);
      lg.addColorStop(0, 'rgba(255,240,200,0.8)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = lg; c.fillRect(lx - 20, y - 26, 40, 40);
    }
  }

  function paintEmbankment(c, s) {
    // road strip climbing onto the crossing
    let g = c.createLinearGradient(0, 262, 0, 300);
    g.addColorStop(0, '#6c5347'); g.addColorStop(0.35, '#584339'); g.addColorStop(1, '#3a2c2a');
    c.fillStyle = g; c.fillRect(0, 266, W, 34);
    for (const [col, lo] of [['rgba(70,96,52,0.8)', 0], ['rgba(98,126,64,0.75)', 1]]) {  // grass on the slope
      c.fillStyle = col;
      c.beginPath();
      for (const gr of s.grass) {
        if (gr.lo !== lo) continue;
        c.moveTo(gr.x, 300); c.lineTo(gr.x + gr.lean, 300 - gr.h); c.lineTo(gr.x + gr.w, 300);
      }
      c.fill();
    }
    c.fillStyle = 'rgba(60,84,48,0.8)';
    for (const [x, r] of [[70, 9], [180, 7], [330, 10], [520, 8], [700, 9], [790, 7], [990, 8]]) { c.beginPath(); c.ellipse(x, 296, r * 1.4, r, 0, Math.PI, TAU); c.fill(); }
    c.fillStyle = '#4c4a52';
    c.beginPath(); c.moveTo(GATE.xc - 36, 300); c.lineTo(GATE.xc - 24, 267); c.lineTo(GATE.xc + 22, 267); c.lineTo(GATE.xc + 34, 300); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(GATE.xc - 1, 276, 2, 6); c.fillRect(GATE.xc - 1, 288, 2.4, 8);
    // gate keeper's hut on the far side of the track
    c.fillStyle = '#9c5a45'; c.fillRect(956, 250, 32, 18);
    c.fillStyle = 'rgba(40,20,20,0.3)'; for (let y = 253; y < 268; y += 3) c.fillRect(956, y, 32, 0.7);
    c.fillStyle = '#ffd98a'; c.fillRect(962, 255, 7, 6);
    c.fillStyle = '#3a2a26'; c.fillRect(976, 254, 7, 14);
    c.fillStyle = '#7d8790'; c.beginPath(); c.moveTo(952, 251); c.lineTo(992, 247); c.lineTo(992, 244); c.lineTo(952, 248); c.closePath(); c.fill();
    // ballast, sleepers and rails
    c.fillStyle = '#857872'; c.fillRect(0, 265, W, 6);
    c.fillStyle = 'rgba(60,48,44,0.5)'; for (let x = 0; x < W; x += 5) c.fillRect(x + ((x * 7) % 3), 267 + ((x * 11) % 3), 1.5, 1.2);
    c.fillStyle = '#6b6260'; c.fillRect(GATE.xc - 24, 266, 46, 4);
    c.fillStyle = '#4b3a32'; for (let x = 1; x < W; x += 9) c.fillRect(x, RAIL, 5, 2.2);
    c.fillStyle = '#5b5553'; c.fillRect(0, RAIL - 2, W, 2.2); c.fillRect(0, RAIL - 4.4, W, 1.4);
    c.fillStyle = '#efdccc'; c.fillRect(0, RAIL - 2, W, 0.8);
  }

  // Cache resolution follows the real device scale (2x..3x); the far layer is soft enough for 3x.
  function cacheScale(ctx) {
    if (typeof ctx.getTransform !== 'function') return 2;
    const m = ctx.getTransform(), k = m ? Math.hypot(m.a, m.b) : NaN;
    return Number.isFinite(k) ? Math.max(2, Math.min(3, Math.ceil(k - 0.15))) : 2;
  }
  function makeCache(s, k) {
    try {
      const cv = document.createElement('canvas');
      cv.width = W * k; cv.height = 300 * k;
      const c = cv.getContext('2d');
      if (!c) return null;
      c.scale(k, k);
      paintFar(c, s);
      return cv;
    } catch (e) { return null; }
  }

  // ---------- footpath props (drawMid) ----------
  function lamp(ctx, x, dir) {
    const top = 128, base = 338, hx = x + dir * 26;
    ctx.fillStyle = grad(ctx, 'cone', () => {
      const g = ctx.createLinearGradient(0, top, 0, 346);
      g.addColorStop(0, 'rgba(255,214,150,0.13)'); g.addColorStop(1, 'rgba(255,214,150,0)');
      return g;
    });
    ctx.beginPath(); ctx.moveTo(hx - 7, top + 4); ctx.lineTo(hx + 7, top + 4); ctx.lineTo(hx + 44, 346); ctx.lineTo(hx - 44, 346); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f454d'; ctx.fillRect(x - 2.5, top + 6, 5, base - top - 6);
    ctx.fillStyle = 'rgba(255,190,140,0.6)'; ctx.fillRect(x + 1, top + 6, 1.5, base - top - 6);
    ctx.fillStyle = '#2f343a'; ctx.fillRect(x - 5, base - 16, 10, 16);
    ctx.fillStyle = 'rgba(255,190,140,0.5)'; ctx.fillRect(x + 3, base - 16, 2, 16);
    ctx.strokeStyle = '#3f454d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, top + 12); ctx.quadraticCurveTo(x, top, hx, top + 1); ctx.stroke();
    ctx.fillStyle = '#2f343a'; ctx.fillRect(hx - 9, top - 1, 18, 4);
    ctx.fillStyle = '#fff3cf'; ctx.fillRect(hx - 7, top + 3, 14, 1.8);
    ctx.fillStyle = grad(ctx, 'lamp' + hx, () => {
      const g = ctx.createRadialGradient(hx, top + 4, 1, hx, top + 4, 34);
      g.addColorStop(0, 'rgba(255,232,172,0.8)'); g.addColorStop(0.35, 'rgba(255,200,130,0.24)'); g.addColorStop(1, 'rgba(255,190,120,0)');
      return g;
    });
    ctx.fillRect(hx - 34, top - 30, 68, 68);
  }
  function person(ctx, x, gy, o) {
    // simple footpath figure facing right; o = { skin, shirt, low, sari, sit }
    const sit = o.sit ? 26 : 0;
    ctx.fillStyle = o.low;
    if (o.sit) { ctx.fillRect(x - 6, gy - 36, 22, 9); ctx.fillRect(x + 10, gy - 30, 7, 30); }
    else { ctx.fillRect(x - 6, gy - 44, 5, 44); ctx.fillRect(x + 1, gy - 44, 5, 44); }
    ctx.fillStyle = o.shirt; TH.rr(ctx, x - 8, gy - 78 + sit, 17, 38, 5); ctx.fill();
    if (o.sari) { ctx.fillStyle = o.sari; ctx.beginPath(); ctx.moveTo(x - 8, gy - 74 + sit); ctx.lineTo(x + 9, gy - 50 + sit); ctx.lineTo(x + 9, gy - 44 + sit); ctx.lineTo(x - 8, gy - 64 + sit); ctx.closePath(); ctx.fill(); }
    TH.line(ctx, [x + 5, gy - 72 + sit, x + 9, gy - 54 + sit, x + 6, gy - 44 + sit], o.shirt, 5);
    TH.circle(ctx, x + 1, gy - 86 + sit, 8, o.skin);
    ctx.fillStyle = '#1b1414'; ctx.beginPath(); ctx.arc(x + 1, gy - 87 + sit, 8.2, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  }
  function teaStall(ctx, t) {
    const x0 = 20, x1 = 118, gy = 332;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x0 - 2, gy - 2, x1 - x0 + 6, 4);
    ctx.fillStyle = '#6e4127'; ctx.fillRect(x0 + 4, gy - 64, x1 - x0 - 8, 64);        // wooden box
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = gy - 56; y < gy; y += 11) ctx.fillRect(x0 + 4, y, x1 - x0 - 8, 1.5);
    ctx.fillStyle = 'rgba(255,190,130,0.35)'; ctx.fillRect(x1 - 8, gy - 64, 4, 64);
    ctx.fillStyle = '#a0683e'; ctx.fillRect(x0, gy - 68, x1 - x0, 5);                // counter
    ctx.fillStyle = '#c9a36a'; ctx.fillRect(x0 + 6, gy - 108, 3, 40); ctx.fillRect(x1 - 9, gy - 110, 3, 42); // bamboo posts
    // warm interior + hanging bulb
    ctx.fillStyle = grad(ctx, 'stall', () => {
      const g = ctx.createRadialGradient(62, gy - 96, 1, 62, gy - 96, 46);
      g.addColorStop(0, 'rgba(255,226,150,0.7)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      return g;
    });
    ctx.fillRect(16, gy - 142, 92, 92);
    TH.line(ctx, [62, gy - 110, 62, gy - 100], '#222', 1);
    TH.circle(ctx, 62, gy - 97, 3, '#fff6d0');
    // vendor behind the counter
    ctx.fillStyle = '#e9e3d6'; TH.rr(ctx, 70, gy - 94, 18, 27, 5); ctx.fill();
    TH.circle(ctx, 79, gy - 101, 7, '#8d5a3b');
    ctx.fillStyle = '#1b1414'; ctx.beginPath(); ctx.arc(79, gy - 102, 7.2, Math.PI, TAU); ctx.fill();
    // banana bunch, jars, kettle
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath(); ctx.ellipse(30, gy - 94, 4, 9, 0.3, 0, TAU); ctx.ellipse(37, gy - 92, 4, 9, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(210,230,235,0.75)'; ctx.fillRect(28, gy - 80, 9, 12); ctx.fillRect(40, gy - 80, 9, 12);
    ctx.fillStyle = '#d9822b'; ctx.fillRect(29, gy - 76, 7, 7); ctx.fillStyle = '#c14f3a'; ctx.fillRect(41, gy - 76, 7, 7);
    ctx.fillStyle = '#3a3a3f'; ctx.beginPath(); ctx.ellipse(102, gy - 74, 7, 6, 0, 0, TAU); ctx.fill();
    ctx.fillRect(108, gy - 78, 5, 2);
    // steam
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const ph = t * 1.4 + i * 2.2, sx = 101 + i * 4;
      ctx.moveTo(sx, gy - 82); ctx.quadraticCurveTo(sx - 5 + Math.sin(ph) * 3, gy - 92, sx + Math.sin(ph + 1) * 3, gy - 104);
    }
    ctx.stroke();
    // tin awning + sign
    ctx.fillStyle = '#8c969f';
    ctx.beginPath(); ctx.moveTo(x0 - 8, gy - 112); ctx.lineTo(x1 + 8, gy - 118); ctx.lineTo(x1 + 12, gy - 106); ctx.lineTo(x0 - 10, gy - 100); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,150,0.6)'; ctx.fillRect(x0 - 8, gy - 113, x1 - x0 + 16, 1.2);
    ctx.fillStyle = '#c1121f'; TH.rr(ctx, x0 + 12, gy - 136, 74, 18, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold 11px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('চা-বিস্কুট', x0 + 49, gy - 127, 68);
  }
  function jhalmuri(ctx, t) {
    const x = 432, gy = 334;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 4, gy, 28, 3, 0, 0, TAU); ctx.fill();
    TH.line(ctx, [x - 14, gy, x, gy - 44, x + 14, gy], '#b08a55', 2.4);           // tripod
    ctx.fillStyle = '#c9ccd2'; TH.rr(ctx, x - 13, gy - 70, 26, 28, 3); ctx.fill(); // tin canister
    ctx.fillStyle = 'rgba(255,200,150,0.5)'; ctx.fillRect(x + 8, gy - 70, 3, 28);
    ctx.fillStyle = '#e63946'; ctx.fillRect(x - 13, gy - 62, 26, 10);
    ctx.fillStyle = '#fff'; ctx.font = `bold 7px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ঝালমুড়ি', x, gy - 57, 24);
    ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.ellipse(x, gy - 71, 12, 3, 0, 0, TAU); ctx.fill();
    person(ctx, x + 26, gy, { skin: '#7a4d33', shirt: '#f4efe6', low: '#3a7d44' });
    TH.line(ctx, [x + 30, gy - 62, x + 14, gy - 66 + Math.sin(t * 5) * 2], '#7a4d33', 3.5); // shaking the muri
  }
  function busStop(ctx) {
    const x0 = 730, x1 = 866, gy = 324, roof = 188;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x0 - 4, gy - 1, x1 - x0 + 8, 4);
    ctx.fillStyle = 'rgba(165,196,206,0.2)'; ctx.fillRect(x0 + 10, roof + 14, x1 - x0 - 20, 92);
    ctx.strokeStyle = 'rgba(60,72,82,0.7)'; ctx.lineWidth = 1.4; ctx.strokeRect(x0 + 10, roof + 14, x1 - x0 - 20, 92);
    // lit advert panel
    ctx.fillStyle = grad(ctx, 'advert', () => {
      const g = ctx.createLinearGradient(0, roof + 22, 0, roof + 96);
      g.addColorStop(0, '#fff2d8'); g.addColorStop(1, '#f6c79a');
      return g;
    });
    ctx.fillRect(x0 + 14, roof + 22, 24, 74);
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(x0 + 17, roof + 30, 18, 22);
    ctx.fillStyle = '#e76f51'; ctx.fillRect(x0 + 17, roof + 58, 18, 6); ctx.fillRect(x0 + 17, roof + 68, 12, 4);
    // posts, bench
    ctx.fillStyle = '#48525c'; ctx.fillRect(x0 + 6, roof + 6, 5, gy - roof - 6); ctx.fillRect(x1 - 11, roof + 2, 5, gy - roof - 2);
    ctx.fillStyle = 'rgba(255,190,140,0.55)'; ctx.fillRect(x0 + 9.5, roof + 6, 1.5, gy - roof - 6); ctx.fillRect(x1 - 7.5, roof + 2, 1.5, gy - roof - 2);
    ctx.fillStyle = '#6b4a35'; ctx.fillRect(x0 + 40, gy - 34, x1 - x0 - 56, 5);
    ctx.fillStyle = '#3d4249'; ctx.fillRect(x0 + 46, gy - 29, 3, 29); ctx.fillRect(x1 - 24, gy - 29, 3, 29);
    person(ctx, x0 + 62, gy, { skin: '#a8694a', shirt: '#c2185b', low: '#c2185b', sari: '#f6c945', sit: true });
    person(ctx, x0 + 104, gy, { skin: '#8d5a3b', shirt: '#457b9d', low: '#2f2f38' });
    // roof slab + sign
    ctx.fillStyle = '#56636c';
    ctx.beginPath(); ctx.moveTo(x0 - 8, roof + 6); ctx.lineTo(x1 + 8, roof - 2); ctx.lineTo(x1 + 8, roof + 5); ctx.lineTo(x0 - 8, roof + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f5c79c'; ctx.beginPath(); ctx.moveTo(x0 - 8, roof + 6); ctx.lineTo(x1 + 8, roof - 2); ctx.lineTo(x1 + 8, roof); ctx.lineTo(x0 - 8, roof + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1d4f91'; TH.rr(ctx, x0 + 36, roof - 22, 68, 17, 3); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; TH.rr(ctx, x0 + 38, roof - 20, 64, 13, 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 10px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('বাস স্টপ', x0 + 70, roof - 13, 60);
  }

  TH.roads.push({
    id: 'kuril',
    order: 3,
    name: 'কুড়িল বিশ্বরোড',
    nameEn: 'Kuril Bishwa Road',
    tagline: 'প্যাঁচানো ফ্লাইওভার আর রেলগেট',
    weights: { wrongway: 3, footpath: 1, phone: 1, overload: 1, overcharge: 1, tesla: 3 },
    street: { asphalt: '#47454e', footpath: '#bcaa95' },

    init(rng) {
      const rp = (a) => a[(rng() * a.length) | 0];
      const clouds = [], banks = [], grass = [];
      for (let i = 0; i < 11; i++) {
        const puffs = [];
        for (let k = 0; k < 4; k++) puffs.push([(rng() - 0.5) * 1.1, (rng() - 0.6) * 1.2, 0.35 + rng() * 0.4]);
        clouds.push({ x: (i + rng()) * (W / 11), y: 50 + rng() * 80, w: 50 + rng() * 120, h: 3 + rng() * 5, puffs });
      }
      for (let i = 0; i < 4; i++) banks.push({ x: rng() * W, y: 58 + rng() * 70, w: 160 + rng() * 220, h: 10 + rng() * 12 });
      for (let x = -6; x < W + 6; x += 2.5 + rng() * 4) grass.push({ x, h: 5 + rng() * 14, w: 3 + rng() * 3, lean: 0.5 + rng() * 3, lo: rng() < 0.4 ? 1 : 0 });
      const sky1 = [], sky2 = [];
      for (let x = 290; x < W + 20;) { const w = 22 + rng() * 38; sky1.push({ x, w, top: 178 + rng() * 44 }); x += w + rng() * 8; }
      for (let x = 300; x < W + 20;) {
        const w = 28 + rng() * 44, top = 204 + rng() * 40, wins = [];
        for (let i = 0; i < 6; i++) if (rng() < 0.45) wins.push([4 + rng() * (w - 10), 6 + rng() * (PIER_BOT - top - 12)]);
        sky2.push({ x, w, top, tank: rng() < 0.5, wins });
        x += w + 2 + rng() * 10;
      }
      const mallLit = [];
      for (let i = 0; i < 6; i++) { const row = []; for (let k = 0; k < 23; k++) if (rng() < 0.22) row.push(k); mallLit.push(row); }
      const towerLit = [];
      for (let i = 0; i < 14; i++) towerLit.push([200 + ((rng() * 8) | 0) * 7, 66 + ((rng() * 19) | 0) * 7]);
      const routes = [
        { parts: [['high', -1]], v: 30, lift: 1.3, n: 4 },
        { parts: [['high', 1]], v: 38, lift: 0, n: 4 },
        { parts: [['right', -1], ['back', 1], ['left', -1]], v: 50, lift: 1.8, n: 5 },
        { parts: [['left', 1], ['front', 1], ['right', 1]], v: 56, lift: 0, n: 6 },
      ];
      for (const r of routes) { r.len = r.parts.reduce((a, [k]) => a + DECKS[k].tab.len, 0); r.loop = r.len + 140; }
      const cars = [];
      routes.forEach((r, ri) => {
        for (let i = 0; i < r.n; i++) {
          const u = rng(), type = u < 0.3 ? 'bus' : u < 0.52 ? 'cng' : 'car', bc = rp(BUS_COLS);
          cars.push({ r: ri, d: ((i + rng() * 0.6) / r.n) * r.loop, type, col: type === 'bus' ? bc[0] : type === 'cng' ? '#2e9a52' : rp(CAR_COLS), col2: bc[1], x: 0, y: 0, ang: 0, fs: 1, face: 1, vis: false, layer: 0, far: false });
        }
      });
      const birds = [];
      for (let i = 0; i < 6; i++) birds.push({ x: 300 + i * 22 + rng() * 14, y: 52 + rng() * 16, ph: rng() * TAU, sz: 3 + rng() * 1.6 });
      const walkers = [];
      for (let i = 0; i < 3; i++) walkers.push({ x: OB.x0 + 20 + rng() * (OB.x1 - OB.x0 - 40), dir: rng() < 0.5 ? 1 : -1, v: 8 + rng() * 5, ph: rng(), shirt: rp(['#e63946', '#f1f1f1', '#2a9d8f', '#ffd166', '#9b5de5']) });
      const s = {
        clouds, banks, grass, sky1, sky2, mallLit, towerLit, routes, cars, birds, walkers,
        train: { on: false, x: 0, dir: 1, v: 230, len: 0, units: [], next: 4 + rng() * 3 },
        gate: 0, gateWant: 0, cache: null,
      };
      s.lamps = [];
      for (const k in LAMP_AT) for (const x of LAMP_AT[k]) s.lamps.push({ x, y: yAtX(DECKS[k].tab, x) });
      for (const c of cars) locate(s, c);
      return s;
    },

    update(s, dt) {
      dt = Math.min(dt, 0.1);
      for (const c of s.cars) { const r = s.routes[c.r]; c.d = (c.d + r.v * dt) % r.loop; locate(s, c); }
      for (const b of s.birds) { b.x += 16 * dt; b.ph += dt * 7; if (b.x > W + 40) b.x = -40; }
      for (const w of s.walkers) {
        w.x += w.dir * w.v * dt; w.ph += dt;
        if (w.x > OB.x1 + 2 || w.x < OB.x0 - 2) { w.dir = Math.random() < 0.5 ? 1 : -1; w.x = w.dir > 0 ? OB.x0 - 1 : OB.x1 + 1; }
      }
      const tr = s.train;
      tr.next -= dt;
      if (!tr.on && tr.next <= 0) spawnTrain(tr);
      let want = !tr.on && tr.next < 2.4 ? 1 : 0;              // gate drops before the train shows up
      if (tr.on) {
        tr.x += tr.dir * tr.v * dt;
        const tail = tr.x - tr.dir * tr.len;
        if (tr.dir > 0 ? tail > W + 30 : tail < -30) tr.on = false;
        else want = (tr.dir > 0 ? tail < GATE.xc + 40 : tail > GATE.xc - 40) ? 1 : 0;
      }
      s.gateWant = want;
      s.gate = Math.max(0, Math.min(1, s.gate + Math.max(-dt * 0.8, Math.min(dt * 0.8, want - s.gate))));
    },

    drawBack(ctx, s, env) {
      const k = cacheScale(ctx);
      if (s.cache === null || (s.cache && s.cacheK !== k)) {
        if (s.cache) s.cache.width = 0;
        s.cache = makeCache(s, k) || false;
        s.cacheK = k;
      }
      if (s.cache) ctx.drawImage(s.cache, 0, 0, W, 300); else paintFar(ctx, s);
      const t = env.t;
      // mall lettering + a blinking beacon on the mobile tower
      ctx.save();
      ctx.shadowColor = 'rgba(255,150,100,0.9)'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffeccc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold 15px ${TH.FONT}`; ctx.fillText('শপিং মল', 104, 150, 124);
      ctx.restore();
      ctx.fillStyle = '#f3c89f'; ctx.font = `bold 6px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('SHOPPING MALL', 104, 161, 110);
      ctx.fillStyle = '#b3122b'; ctx.font = `bold 11px ${TH.FONT}`;
      ctx.fillText('স্বপ্নের ফ্ল্যাট', BB.x + 38, BB.y + 14, BB.w - 28);
      ctx.fillStyle = '#1d3a6e'; ctx.font = `bold 7.5px ${TH.FONT}`;
      ctx.fillText('বুকিং চলছে!', BB.x + 38, BB.y + 28, BB.w - 34);
      if (Math.sin(t * 3) > 0.2) { TH.circle(ctx, 958, 149, 4, 'rgba(255,60,60,0.3)'); TH.circle(ctx, 958, 149, 1.6, '#ff5a4d'); }
      // birds heading home
      ctx.strokeStyle = 'rgba(52,30,58,0.8)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const b of s.birds) {
        const f = Math.sin(b.ph) * b.sz * 0.7;
        ctx.moveTo(b.x - b.sz, b.y - f); ctx.quadraticCurveTo(b.x - b.sz * 0.4, b.y - 1, b.x, b.y);
        ctx.quadraticCurveTo(b.x + b.sz * 0.4, b.y - 1, b.x + b.sz, b.y - f);
      }
      ctx.stroke();
      // back layer traffic (high ramp, far side of the loop)
      drawCars(ctx, s, 0);
      railing(ctx, DECKS.high, true);
      railing(ctx, DECKS.back, false);
      // near decks of the loop and the connecting ramps
      for (const k of ['front', 'left', 'right']) deckPillars(ctx, k);
      deckBody(ctx, DECKS.left); deckBody(ctx, DECKS.right); deckBody(ctx, DECKS.front);
      jointPier(ctx, cx - rx); jointPier(ctx, cx + rx);
      for (const [x, y, a, b] of POSTERS) {                  // paper posters pasted on the piers
        ctx.fillStyle = a; ctx.fillRect(x - 5, y, 10, 13);
        ctx.fillStyle = b; ctx.fillRect(x - 4, y + 2, 8, 4); ctx.fillRect(x - 4, y + 8, 6, 1.2);
      }
      drawCars(ctx, s, 1);
      railing(ctx, DECKS.left, false); railing(ctx, DECKS.right, false); railing(ctx, DECKS.front, false);
      deckLamps(ctx, s.lamps);
      dirSign(ctx);
      // railway, level crossing, foot-overbridge
      drawTrain(ctx, s.train);
      drawGate(ctx, s, t);
      drawOverbridge(ctx, s);
    },

    drawMid(ctx, s, env) {
      const t = env.t;
      teaStall(ctx, t);
      lamp(ctx, 186, 1);           // lamps stand clear of the mall sign, the mosque and the mobile tower
      jhalmuri(ctx, t);
      lamp(ctx, 540, -1);
      busStop(ctx);
      lamp(ctx, 938, -1);
    },
  });
})();
