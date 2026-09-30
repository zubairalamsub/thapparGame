// First-person scenery: Gulshan-Badda Link Road (গুলশান-বাড্ডা লিংক রোড) in golden late-afternoon light.
// Right: the lakeside promenade with a railing and krishnachura trees in bloom, the Gulshan lake with
// boats, and Gulshan's glass towers across the water, mirrored and shimmering in the lake under the low
// sun. Left: the Badda-side buildings (shared Dhaka facade kit from badda.js), big billboards, a green
// road sign over the carriageway and a bus stop. Gulshan's towers glint at the vanishing point.
// See js/FP_CONTRACT.md.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = TH.fp;
  if (!fp) return;
  TH.fpRoads = TH.fpRoads || [];
  const { CX, HY, F, NEAR } = fp;
  const cam = fp.cam;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const kit = () => TH.fpDhakaKit || null;

  // ---------- colour helpers ----------
  const rgb3 = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex3 = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  function hm(a, b, t) {
    const A = rgb3(a), B = rgb3(b), k = clamp(t, 0, 1);
    return hex3(Math.round(A[0] + (B[0] - A[0]) * k), Math.round(A[1] + (B[1] - A[1]) * k), Math.round(A[2] + (B[2] - A[2]) * k));
  }
  const rgba = (c, a) => { const A = rgb3(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; };

  function mkTex(list, wu, hu, k) {
    const c = fp.canvas(wu * k, hu * k);
    if (!c) return null;
    c.ctx.setTransform(k, 0, 0, k, 0, 0);
    const t = { cv: c.canvas, g: c.ctx, k, w: wu, h: hu };
    list.push(t);
    return t;
  }

  // ---------- the scene ----------
  const FOG = '#f2d6a4';                  // golden haze at the horizon (before the warm tint)
  const SUN = { x: 800, y: 112 };         // low sun over the lake
  const REF = { z: 1860, u: 70, h: 95 };  // camera the lake panorama is painted for
  const PAN = { x0: 470, x1: 1070, y0: -300, y1: 610, k: 1.25 };
  const DT = 7000;                        // typical depth of the panorama, for its parallax
  const BANK = 3400, WATER = -55;         // far bank of the lake (u) and the water level (h)
  const RAIL = 452;                       // lakeside railing
  const TREE_U = 402;                     // krishnachura trees along the promenade

  const GLASS = [ // glass catching the golden sky: warm at the top, blue in the depths
    ['#f0cf9c', '#8fa3b4', '#2d4760'],
    ['#e4c9a4', '#7d95ae', '#283d5c'],
    ['#dcd3bb', '#6f9ea4', '#224c52'],
    ['#f2d8b4', '#a99a92', '#4b4d5e'],
    ['#d8cdbd', '#9a968f', '#474a55'],
  ];

  // Project for the panorama's reference camera.
  const PR = (z, u, h) => { const d = REF.z - z, s = F / d; return { x: CX + (u - REF.u) * s, y: HY + (REF.h - h) * s, s, d }; };

  function paintTower(g, T, R) {
    const A = PR(T.z, T.u - T.w / 2, T.h), B = PR(T.z, T.u + T.w / 2, -30), Ab = PR(T.z - T.dep, T.u - T.w / 2, T.h), Bb = PR(T.z - T.dep, T.u - T.w / 2, -30);
    const d = A.d, s = A.s, haze = clamp(0.08 + (d - 3500) / 30000, 0, 0.8);
    const pal = GLASS[T.pal].map((c) => hm(c, FOG, haze));
    const xL = A.x, xR = B.x, yT = A.y, yB = B.y;
    // the side facing the road, in shade
    g.beginPath(); g.moveTo(Ab.x, Ab.y); g.lineTo(xL, yT); g.lineTo(xL, yB); g.lineTo(Bb.x, Bb.y); g.closePath();
    const sg = g.createLinearGradient(0, yT, 0, yB);
    sg.addColorStop(0, hm(pal[1], '#1b2536', 0.35)); sg.addColorStop(1, hm(pal[2], '#141b28', 0.4));
    g.fillStyle = sg; g.fill();
    // the face toward us: glass reflecting the paler eastern sky
    const fg = g.createLinearGradient(0, yT, 0, yB);
    if (T.kind === 'band') { fg.addColorStop(0, hm('#f3eee6', FOG, haze)); fg.addColorStop(1, hm('#b9b3aa', FOG, haze)); }
    else { fg.addColorStop(0, pal[0]); fg.addColorStop(0.45, pal[1]); fg.addColorStop(1, pal[2]); }
    g.fillStyle = fg; g.fillRect(xL, yT, xR - xL, yB - yT);
    const fl = T.floor * s;
    if (fl > 1.6) { // floors and mullions
      g.fillStyle = T.kind === 'band' ? rgba(hm('#35506a', FOG, haze), 0.9) : 'rgba(10,24,40,0.28)';
      for (let y = yT + fl * 0.6; y < yB; y += fl) g.fillRect(xL, y, xR - xL, T.kind === 'band' ? fl * 0.5 : Math.max(0.5, fl * 0.12));
      g.fillStyle = 'rgba(10,24,40,0.2)';
      const mw = T.mull * s;
      if (mw > 2.5) for (let x = xL + mw; x < xR - 1; x += mw) g.fillRect(x, yT, Math.max(0.5, mw * 0.08), yB - yT);
      g.strokeStyle = 'rgba(10,20,34,0.25)'; g.lineWidth = Math.max(0.5, fl * 0.12); g.beginPath(); // floors on the side face
      for (let h = T.h - T.floor * 0.4; h > 0; h -= T.floor * 2) { const p = PR(T.z, T.u - T.w / 2, h), q = PR(T.z - T.dep, T.u - T.w / 2, h); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
      g.stroke();
    }
    // a band of bright sky caught in the glass, and random tinted panels
    if (T.kind !== 'band') {
      g.save(); g.beginPath(); g.rect(xL, yT, xR - xL, yB - yT); g.clip();
      g.fillStyle = 'rgba(255,236,200,0.16)';
      g.beginPath(); g.moveTo(xL + (xR - xL) * 0.35, yT); g.lineTo(xL + (xR - xL) * 0.75, yT); g.lineTo(xL + (xR - xL) * 0.1, yB); g.lineTo(xL - (xR - xL) * 0.3, yB); g.closePath(); g.fill();
      if (fl > 2) for (let i = 0; i < 40; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(255,240,215,0.12)' : 'rgba(5,20,40,0.12)';
        g.fillRect(xL + Math.floor(R() * 6) * (xR - xL) / 6, yT + R() * (yB - yT), (xR - xL) / 6, fl * (1 + ((R() * 3) | 0)));
      }
      g.restore();
    }
    // golden rim where the low sun grazes the edges
    g.fillStyle = rgba(hm('#ffd48a', FOG, haze * 0.5), 0.85);
    g.fillRect(xR - Math.max(0.8, 6 * s), yT, Math.max(0.8, 6 * s), yB - yT);
    g.fillRect(xL, yT, xR - xL, Math.max(0.7, 5 * s));
    // crown
    const cx = (xL + xR) / 2;
    g.fillStyle = hm('#d9dfe6', FOG, haze);
    if (T.crown === 'spire') { g.fillRect(cx - 50 * s, yT - 70 * s, 100 * s, 70 * s); g.fillRect(cx - 5 * s, yT - 420 * s, 10 * s, 350 * s); }
    else if (T.crown === 'slant') { g.beginPath(); g.moveTo(xL, yT); g.lineTo(xR, yT); g.lineTo(xR, yT - 260 * s); g.closePath(); g.fillStyle = pal[0]; g.fill(); }
    else if (T.crown === 'crown') { g.fillRect(xL + (xR - xL) * 0.15, yT - 120 * s, (xR - xL) * 0.7, 120 * s); g.fillStyle = pal[1]; g.fillRect(xL + (xR - xL) * 0.18, yT - 110 * s, (xR - xL) * 0.64, 100 * s); }
    else { g.fillRect(xL + (xR - xL) * 0.2, yT - 50 * s, (xR - xL) * 0.3, 50 * s); }
    return { xL, xR, yT, yB, s, pal, haze };
  }

  function paintReflection(g, T, box, R) {
    // mirror about the water plane: a point at height h shows at h' = 2*WATER - h
    const s = box.s, yW = HY + (REF.h - (2 * WATER + 30)) * s, yEnd = HY + (REF.h - (2 * WATER - T.h)) * s;
    const col = box.pal.map((c) => hm(c, '#1c3440', 0.22));
    const n = Math.max(6, Math.min(90, Math.round((Math.min(PAN.y1, yEnd) - yW) / 4)));
    const hStrip = (Math.min(PAN.y1, yEnd) - yW) / n;
    for (let i = 0; i < n; i++) {
      const y = yW + i * hStrip, f = i / n, j = (R() - 0.5) * (1 + f * 7);
      const q = clamp((y - yW) / Math.max(1, yEnd - yW), 0, 1);
      g.fillStyle = rgba(q < 0.45 ? col[2] : q < 0.8 ? col[1] : col[0], 0.72 - f * 0.25);
      g.fillRect(box.xL + j, y, box.xR - box.xL, hStrip + 0.6);
    }
  }

  function paintPanorama(t, s) {
    const g = t.g, R = TH.mulberry32(s.seedPan);
    g.setTransform(PAN.k, 0, 0, PAN.k, -PAN.x0 * PAN.k, -PAN.y0 * PAN.k);
    const bankY = (x) => HY + ((REF.h - WATER) / (BANK - REF.u)) * (x - CX); // waterline at the far bank
    // lake: the sky mirrored (bright near the far bank, deeper and darker toward us)
    const wg = g.createLinearGradient(0, HY, 0, PAN.y1);
    wg.addColorStop(0, '#f4d49c'); wg.addColorStop(0.035, '#e2ba84'); wg.addColorStop(0.12, '#86a2a4'); wg.addColorStop(0.38, '#3f6a74'); wg.addColorStop(1, '#1d3d49');
    g.fillStyle = wg;
    g.beginPath(); g.moveTo(CX - 40, HY); g.lineTo(PAN.x1, bankY(PAN.x1)); g.lineTo(PAN.x1, PAN.y1); g.lineTo(CX - 40, PAN.y1); g.closePath(); g.fill();
    // towers far to near, keeping their boxes for the reflections
    const boxes = [];
    for (const T of s.towers) boxes.push([T, paintTower(g, T, R)]);
    // reflections of the towers (behind the reflected far bank)
    g.save();
    g.beginPath(); g.moveTo(CX - 40, HY); g.lineTo(PAN.x1, bankY(PAN.x1)); g.lineTo(PAN.x1, PAN.y1); g.lineTo(CX - 40, PAN.y1); g.closePath(); g.clip();
    for (const [T, box] of boxes) paintReflection(g, T, box, R);
    g.restore();
    // far-bank trees (and their reflection), with krishnachura in bloom here and there
    const pts = [];
    for (let d = 3000; d < 90000; d *= 1.05) {
      const h = 170 + R() * 260 + (R() < 0.2 ? 120 : 0);
      pts.push({ d, h, kr: R() < 0.12 });
    }
    const TP = (p, h, mirror) => { const z = REF.z - p.d; return PR(z, BANK + 60, mirror ? 2 * WATER - h : h); };
    for (const mirror of [true, false]) {
      g.beginPath();
      const first = TP(pts[0], -30, mirror);
      g.moveTo(first.x, first.y);
      let prev = TP(pts[0], pts[0].h, mirror);
      g.lineTo(prev.x, prev.y);
      for (let i = 1; i < pts.length; i++) {
        const p = TP(pts[i], pts[i].h, mirror);
        g.quadraticCurveTo((prev.x + p.x) / 2, mirror ? Math.max(prev.y, p.y) + Math.abs(prev.x - p.x) * 0.35 : Math.min(prev.y, p.y) - Math.abs(prev.x - p.x) * 0.35, p.x, p.y);
        prev = p;
      }
      const last = TP(pts[pts.length - 1], -30, mirror);
      g.lineTo(last.x, last.y); g.closePath();
      if (mirror) { g.fillStyle = 'rgba(34,48,36,0.72)'; g.fill(); }
      else {
        const tg = g.createLinearGradient(0, 150, 0, HY + 25);
        tg.addColorStop(0, hm('#48673c', FOG, 0.25)); tg.addColorStop(1, hm('#2d4630', FOG, 0.3));
        g.fillStyle = tg; g.fill();
      }
    }
    for (const p of pts) { // backlit tops and flame trees
      if (p.d > 40000) continue;
      const a = TP(p, p.h - 20, false), r = Math.max(0.8, 60 * a.s);
      if (p.kr) { g.fillStyle = '#e24a2a'; g.beginPath(); g.arc(a.x, a.y + r * 0.6, r * 1.2, 0, TAU); g.fill(); g.fillStyle = '#f28a3a'; g.beginPath(); g.arc(a.x + r * 0.3, a.y + r * 0.3, r * 0.6, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,214,140,0.35)'; g.beginPath(); g.arc(a.x + r * 0.4, a.y + r * 0.2, r * 0.7, 0, TAU); g.fill();
    }
    // embankment line and a glare on the water under the sun
    g.strokeStyle = 'rgba(210,190,150,0.7)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(CX, HY); g.lineTo(PAN.x1, bankY(PAN.x1) + 1); g.stroke();
    const gl = g.createRadialGradient(SUN.x, HY + 30, 0, SUN.x, HY + 30, 260);
    gl.addColorStop(0, 'rgba(255,226,160,0.55)'); gl.addColorStop(0.5, 'rgba(255,214,150,0.18)'); gl.addColorStop(1, 'rgba(255,214,150,0)');
    g.save(); g.beginPath(); g.moveTo(CX, HY); g.lineTo(PAN.x1, bankY(PAN.x1)); g.lineTo(PAN.x1, PAN.y1); g.lineTo(CX, PAN.y1); g.closePath(); g.clip();
    g.fillStyle = gl; g.fillRect(SUN.x - 300, HY, 600, 400);
    // static ripples
    for (let i = 0; i < 160; i++) {
      const y = HY + 20 + Math.pow(R(), 1.6) * 360, f = (y - HY) / 360, x = CX + R() * (PAN.x1 - CX), w = (6 + R() * 26) * (0.4 + f * 1.6);
      g.fillStyle = R() < 0.55 ? `rgba(255,230,190,${(0.08 + f * 0.1).toFixed(3)})` : `rgba(10,30,34,${(0.12 + f * 0.12).toFixed(3)})`;
      g.fillRect(x, y, w, 0.8 + f * 1.6);
    }
    g.restore();
  }

  function paintCanopy(t, R) { // krishnachura: wide umbrella crown, flame-red flowers, backlit edges
    const g = t.g, W = t.w, H = t.h;
    const blobs = [];
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI, rr = 0.35 + R() * 0.65;
      blobs.push([W / 2 + Math.cos(a) * W * 0.4 * rr * (R() < 0.5 ? -1 : 1), H * 0.62 - Math.sin(a) * H * 0.38 * rr, 50 + R() * 60]);
    }
    const layer = (col, ox, oy, sc) => {
      g.fillStyle = col; g.beginPath();
      for (const [x, y, r] of blobs) { g.moveTo(x + ox * r + r * sc, y + oy * r); g.ellipse(x + ox * r, y + oy * r, r * sc, r * sc * 0.7, 0, 0, TAU); }
      g.fill();
    };
    layer('#243f24', 0, 0.08, 1);
    layer('#34582e', -0.08, -0.05, 0.82);
    layer('#4d7a3a', -0.16, -0.16, 0.55);
    layer('rgba(255,205,120,0.35)', 0.22, -0.22, 0.42); // sun from behind, over the lake
    for (let i = 0; i < 170; i++) { // flowers, thickest on top
      const [x, y, r] = blobs[(R() * blobs.length) | 0], a = R() * TAU, dd = R() * r * 0.8;
      const fx = x + Math.cos(a) * dd, fy = y + Math.sin(a) * dd * 0.6 - r * 0.2;
      g.fillStyle = ['#e0341f', '#ea4b25', '#f06a2a', '#f79a3c', '#c8261a'][(R() * 5) | 0];
      g.beginPath(); g.ellipse(fx, fy, 7 + R() * 9, 5 + R() * 6, R() * 3, 0, TAU); g.fill();
    }
  }

  function paintVpCluster(t, R) { // Gulshan's towers straight ahead, where the road meets the sky
    const g = t.g;
    const list = [];
    for (let i = 0; i < 9; i++) list.push({ x: 40 + R() * 130, w: 6 + R() * 12, h: 28 + R() * 70, pal: (R() * GLASS.length) | 0, sp: R() < 0.3 });
    list.sort((a, b) => a.h - b.h);
    for (const b of list) {
      const pal = GLASS[b.pal].map((c) => hm(c, FOG, 0.45));
      const top = 200 - b.h;
      g.fillStyle = hm(pal[2], '#1b2536', 0.2); g.fillRect(b.x - b.w * 0.35, top + 3, b.w * 0.35, b.h);
      const gr = g.createLinearGradient(0, top, 0, 200);
      gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]);
      g.fillStyle = gr; g.fillRect(b.x, top, b.w, b.h);
      g.fillStyle = 'rgba(255,215,150,0.8)'; g.fillRect(b.x + b.w - 1.2, top, 1.2, b.h);
      g.fillStyle = 'rgba(10,24,40,0.18)'; for (let y = top + 3; y < 200; y += 3) g.fillRect(b.x, y, b.w, 0.6);
      if (b.sp) { g.fillStyle = pal[0]; g.fillRect(b.x + b.w / 2 - 0.7, top - 14, 1.4, 14); }
    }
    return list.map((b) => ({ x: b.x + b.w - 1, y: 200 - b.h + 2 + R() * b.h * 0.4, ph: R() * TAU }));
  }

  function paintCloudStreak(t, R) {
    const g = t.g;
    for (let i = 0; i < 14; i++) {
      const x = 30 + R() * 300, y = 30 + R() * 20, rx = 40 + R() * 70, ry = 5 + R() * 7;
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, 'rgba(255,238,212,0.55)'); gr.addColorStop(0.6, 'rgba(250,220,190,0.22)'); gr.addColorStop(1, 'rgba(250,220,190,0)');
      g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - rx, y - rx, rx * 2, rx * 2); g.restore();
    }
  }

  // ---------- per-frame pieces ----------
  function skyGrad(ctx, s) {
    let o = s.grads && s.grads.get(ctx);
    if (o) return o;
    o = {};
    o.sky = ctx.createLinearGradient(0, -220, 0, HY + 14);
    o.sky.addColorStop(0, '#7ba5cc'); o.sky.addColorStop(0.35, '#a8bccb'); o.sky.addColorStop(0.62, '#dccbac'); o.sky.addColorStop(0.85, '#efd3a2'); o.sky.addColorStop(1, FOG);
    o.sun = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 460);
    o.sun.addColorStop(0, 'rgba(255,250,232,1)'); o.sun.addColorStop(0.05, 'rgba(255,244,210,0.95)'); o.sun.addColorStop(0.12, 'rgba(255,224,160,0.6)');
    o.sun.addColorStop(0.4, 'rgba(255,206,140,0.25)'); o.sun.addColorStop(1, 'rgba(255,200,140,0)');
    if (!s.grads) s.grads = new WeakMap();
    s.grads.set(ctx, o);
    return o;
  }

  function drawLakeLive(ctx, s) { // sun glitter and drifting ripples over the painted lake
    const t = s.t, kz = DT / (DT + (cam.z - REF.z)), dx = -(cam.u - REF.u) * F / DT;
    const X = (x) => CX + (x - CX) * kz + dx, Y = (y) => HY + (y - HY) * kz;
    const bankAt = (x) => HY + ((REF.h - WATER) / (BANK - REF.u)) * (x - CX);
    const a0 = ctx.globalAlpha;
    // glitter path under the sun: a soft golden column, then the sparkles
    const y0 = bankAt(SUN.x) + 3;
    ctx.globalAlpha = a0 * 0.3; ctx.fillStyle = '#ffe2a6';
    ctx.beginPath(); ctx.moveTo(X(SUN.x - 16), Y(y0)); ctx.lineTo(X(SUN.x + 16), Y(y0)); ctx.lineTo(X(SUN.x + 150), Y(y0 + 300)); ctx.lineTo(X(SUN.x - 150), Y(y0 + 300)); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    for (const g of s.glitter) {
      const f = g.y, y = y0 + 2 + f * 300, spread = 12 + f * 140;
      const x = SUN.x + g.x * spread + Math.sin(t * 0.8 + g.ph) * (2 + f * 8);
      const on = 0.55 + 0.45 * Math.sin(t * g.sp + g.ph);
      const w = (4 + f * 30) * on;
      ctx.moveTo(X(x - w), Y(y)); ctx.lineTo(X(x + w), Y(y));
    }
    ctx.strokeStyle = '#fffbee'; ctx.lineWidth = 2.6; ctx.globalAlpha = a0 * 0.9; ctx.stroke();
    // drifting ripples
    ctx.beginPath();
    for (const r of s.ripples) {
      const f = r.y, x = CX + 40 + ((r.x + t * r.v) % 1) * 560, y = bankAt(x) + 6 + r.y * 330;
      const w = (8 + f * 40) * (0.6 + 0.4 * Math.sin(t * 1.3 + r.ph));
      ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + w), Y(y));
    }
    ctx.strokeStyle = '#ffe6bd'; ctx.lineWidth = 1; ctx.globalAlpha = a0 * 0.35; ctx.stroke();
    ctx.globalAlpha = a0;
  }

  function drawTowerFx(ctx, s) { // glass across the lake: slow sun sweeps and twinkling glints
    const t = s.t, kz = DT / (DT + (cam.z - REF.z)), dx = -(cam.u - REF.u) * F / DT;
    const X = (x) => CX + (x - CX) * kz + dx, Y = (y) => HY + (y - HY) * kz;
    const a0 = ctx.globalAlpha;
    // sun reflections sweeping slowly across the big glass towers
    for (const w of s.sweeps || []) {
      const q = (t * w.sp + w.ph) % 1.6; // sweep for 1, rest for 0.6
      if (q > 1) continue;
      const bw = (w.x1 - w.x0) * 0.22, x = w.x0 - bw + (w.x1 - w.x0 + bw) * q;
      const xa = Math.max(w.x0, x), xb = Math.min(w.x1, x + bw);
      if (xb <= xa) continue;
      ctx.globalAlpha = a0 * 0.22 * Math.sin(q * Math.PI);
      ctx.fillStyle = '#fff1cf'; ctx.fillRect(X(xa), Y(w.y0), (xb - xa) * kz, (Math.min(w.y1, HY) - w.y0) * kz);
    }
    ctx.globalAlpha = a0;
    // glints on the glass across the lake
    ctx.beginPath();
    for (const g of s.glints) {
      const on = Math.sin(t * g.sp + g.ph);
      if (on < 0.55) continue;
      const r = g.r * (on - 0.5) * 2, x = X(g.x), y = Y(g.y);
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x, y + r * 0.8);
    }
    ctx.strokeStyle = '#fffbea'; ctx.lineWidth = 1.3; ctx.stroke();
  }

  function drawPan(ctx, s) {
    const kz = DT / (DT + (cam.z - REF.z)), dx = -(cam.u - REF.u) * F / DT;
    ctx.drawImage(s.pan.cv, CX + (PAN.x0 - CX) * kz + dx, HY + (PAN.y0 - HY) * kz, (PAN.x1 - PAN.x0) * kz, (PAN.y1 - PAN.y0) * kz);
  }
  // Far things batched into one draw-list item placed at the group's far edge (so everything nearer
  // draws over it), each faded into the haze at its own depth.
  const NOFADE = { noFade: true };
  function fadeEach(ctx, list, draw) {
    const a0 = ctx.globalAlpha;
    for (const q of list) { ctx.globalAlpha = a0 * fp.fade(cam.z - q.z); draw(q); }
    ctx.globalAlpha = a0;
  }

  function drawBoat(ctx, b, t) { // wooden nouka on the water, a boatman with a pole
    const p = fp.project(b.z, b.u, WATER);
    if (!p || p.s < 0.02) return;
    const k = Math.min(p.s, 4), bob = Math.sin(t * 1.6 + b.ph) * 1.5;
    ctx.save(); ctx.translate(p.x, p.y + bob * k); ctx.scale(k * b.dir, k);
    ctx.fillStyle = 'rgba(20,30,34,0.35)'; ctx.fillRect(-120, 2, 240, 8); // reflection
    ctx.fillStyle = '#5b3a22';
    ctx.beginPath(); ctx.moveTo(-130, -26); ctx.quadraticCurveTo(0, 14, 130, -30); ctx.lineTo(118, -12); ctx.quadraticCurveTo(0, 10, -118, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a5a33'; ctx.fillRect(-100, -24, 200, 6);
    if (b.kind === 'pole') {
      ctx.fillStyle = '#e9e2d0'; ctx.fillRect(-12, -96, 22, 62); // boatman
      ctx.fillStyle = '#2f4f7a'; ctx.fillRect(-11, -40, 20, 20);
      ctx.fillStyle = '#6f4630'; ctx.beginPath(); ctx.arc(0, -106, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3b2a1c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-40, -150); ctx.lineTo(50, 20); ctx.stroke();
    } else {
      ctx.fillStyle = '#c9a86a'; ctx.beginPath(); ctx.moveTo(-50, -24); ctx.quadraticCurveTo(0, -80, 50, -24); ctx.closePath(); ctx.fill(); // chhoi (reed canopy)
    }
    ctx.restore();
  }

  function drawEgrets(ctx, s) {
    ctx.beginPath();
    for (const e of s.egrets) {
      const x = e.x, y = e.y + Math.sin(s.t * 0.9 + e.ph) * 3, fl = Math.sin(s.t * 6 + e.ph), z = e.sz;
      ctx.moveTo(x - z, y - fl * z * 0.6);
      ctx.quadraticCurveTo(x - z * 0.4, y - z * 0.4 * (fl + 0.3), x, y);
      ctx.quadraticCurveTo(x + z * 0.4, y - z * 0.4 * (fl + 0.3), x + z, y - fl * z * 0.6);
    }
    ctx.strokeStyle = '#fff8ea'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  }

  function drawFarLeft(ctx, s) { // the Badda-side row running on past the last facades, in haze
    ctx.beginPath();
    let first = true;
    for (const b of s.farRow) {
      const pA = fp.project(b.z1, fp.U.wallL - 60, b.h), pB = fp.project(b.z0, fp.U.wallL - 60, b.h);
      if (!pA || !pB) continue;
      if (first) { const g0 = fp.project(b.z1, fp.U.wallL - 60, 0); if (!g0) continue; ctx.moveTo(g0.x, g0.y + 8); first = false; }
      ctx.lineTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
    }
    if (first) return;
    const gl = fp.project(s.farRow[s.farRow.length - 1].z0, fp.U.wallL - 60, 0);
    if (gl) ctx.lineTo(gl.x, gl.y + 8);
    ctx.closePath();
    ctx.fillStyle = hm(FOG, '#8f7c6a', 0.38); ctx.fill();
  }

  // ---------- promenade ----------
  function drawRail(ctx, zA, zB, s) { // railing between zA and zB (zA < zB), batched
    const zc = Math.min(zB, cam.z - 30);
    if (zc <= zA) return;
    const pts = [[8, 16, '#8f8a80', 5], [68, 0, '#4a6a55', 3], [38, 0, '#4a6a55', 2]];
    for (const [h, h2, c, w] of pts) {
      const a = fp.project(zA, RAIL, h), b = fp.project(zc, RAIL, h);
      if (!a || !b) continue;
      ctx.beginPath();
      if (h2) { const a2 = fp.project(zA, RAIL, h2), b2 = fp.project(zc, RAIL, h2); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); continue; }
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = c; ctx.lineWidth = clamp(w * s, 0.6, 5); ctx.stroke();
    }
    if (s < 0.12) return;
    const step = s > 0.35 ? 120 : 240;
    ctx.beginPath();
    for (let z = Math.ceil(zA / step) * step; z < zc; z += step) {
      const a = fp.project(z, RAIL, 16), b = fp.project(z, RAIL, 70);
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = '#3e5a48'; ctx.lineWidth = clamp(4 * s, 0.6, 7); ctx.stroke();
  }

  function drawTree(ctx, tr, st) {
    const p = fp.project(tr.z, tr.u, 8);
    if (!p) return;
    const s = p.s, img = st.canopy && st.canopy[tr.v];
    // shadow on the promenade, thrown toward us (the sun is ahead, over the lake)
    if (s > 0.08) {
      const zc = tr.z + 230, uc = tr.u - 80, pts = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; pts.push(zc + Math.cos(a) * 230, clamp(uc + Math.sin(a) * (170 + 30 * Math.cos(a * 3 + tr.lean * 5)), fp.U.curbR + 8, RAIL - 2), 9); }
      if (fp.path(ctx, pts)) {
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * 0.15; ctx.fillStyle = '#2a2016'; ctx.fill();
        ctx.globalAlpha = a0;
      }
    }
    const k = Math.min(s, 14), x = p.x, y = p.y, H = tr.h;
    ctx.fillStyle = '#5a4a3c';
    if (s > 0.25) {
      ctx.beginPath(); ctx.moveTo(x - 20 * k, y); ctx.lineTo(x - 11 * k, y - H * 0.55 * k); ctx.lineTo(x + 11 * k, y - H * 0.55 * k); ctx.lineTo(x + 20 * k, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a4a3c'; ctx.lineWidth = 9 * k; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(x, y - H * 0.5 * k); ctx.quadraticCurveTo(x - 60 * k, y - H * 0.7 * k, x - 170 * k * tr.lean, y - H * 0.78 * k);
      ctx.moveTo(x, y - H * 0.52 * k); ctx.quadraticCurveTo(x + 50 * k, y - H * 0.72 * k, x + 150 * k, y - H * 0.8 * k);
      ctx.stroke();
    } else ctx.fillRect(x - 14 * s, y - H * 0.6 * s, 28 * s + 0.5, H * 0.6 * s);
    if (img) ctx.drawImage(img.cv, x - (img.w / 2) * k, y - H * k, img.w * k, img.h * k);
    else { ctx.fillStyle = '#34582e'; ctx.beginPath(); ctx.ellipse(x, y - (H - 150) * k, 300 * k, 130 * k, 0, 0, TAU); ctx.fill(); }
  }

  function drawBench(ctx, b, s) {
    const K = kit();
    if (!K) return;
    K.box(ctx, b.z0, b.z1, 404, 436, 30, 40, '#b9b1a3', '#a8a092', '#cfc7b8');
    ctx.fillStyle = '#8f887c'; K.zRect(ctx, b.z1 - 6, 408, 418, 8, 30); K.zRect(ctx, b.z1 - 6, 422, 432, 8, 30);
    if (s > 0.2 && fp.wallQuad(ctx, b.z0, b.z1, 434, 40, 74)) { ctx.fillStyle = '#b3ab9d'; ctx.fill(); } // backrest (facing the lake)
  }

  // ---------- Badda side ----------
  function drawBillboard(ctx, bb, d) { // big roadside billboard on steel legs, facing the traffic
    const s = F / d, K = kit();
    const legU = [bb.u0 + 70, bb.u1 - 70];
    ctx.fillStyle = '#4b5058';
    for (const u of legU) K.zRect(ctx, bb.z, u - 9, u + 9, 8, bb.h0);
    const p = fp.project(bb.z, bb.u0, bb.h1);
    if (!p) return;
    const k = Math.min(p.s, 12), w = bb.u1 - bb.u0, h = bb.h1 - bb.h0;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(k, k);
    ctx.fillStyle = '#3a3d44'; ctx.fillRect(-8, -8, w + 16, h + 16);
    ctx.fillStyle = bb.bg; ctx.fillRect(0, 0, w, h);
    if (s > 0.08) {
      if (bb.kind === 'home') {
        ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(0, h - 40); ctx.quadraticCurveTo(w * 0.5, h - 110, w, h - 80); ctx.lineTo(w, h - 60); ctx.quadraticCurveTo(w * 0.5, h - 90, 0, h - 16); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#eef0f2'; ctx.fillRect(w * 0.7, 26, 60, h - 60); ctx.fillRect(w * 0.7 + 60, 60, 36, h - 94);
        ctx.fillStyle = '#5b8fb0'; for (let y = 36; y < h - 40; y += 16) ctx.fillRect(w * 0.7 + 6, y, 48, 8);
        ctx.fillStyle = '#c1121f'; ctx.fillRect(20, h - 74, w * 0.5, 34);
      } else {
        ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.58, 70, 0, Math.PI); ctx.closePath(); ctx.fill(); // noodle bowl
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 6; ctx.beginPath();
        for (let i = 0; i < 4; i++) { ctx.moveTo(w * 0.78 - 50 + i * 30, h * 0.58); ctx.quadraticCurveTo(w * 0.78 - 35 + i * 30, h * 0.58 - 40, w * 0.78 - 20 + i * 30, h * 0.58 - 5); }
        ctx.stroke();
        ctx.fillStyle = '#b91c1c'; ctx.fillRect(0, h - 44, w, 44);
      }
      if (k * 40 > 6) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = bb.fg; ctx.font = `700 50px ${TH.FONT}`; ctx.fillText(bb.t1, 22, 48, w * 0.62);
        ctx.fillStyle = bb.fg2; ctx.font = `500 26px ${TH.FONT}`; ctx.fillText(bb.t2, 24, 98, w * 0.6);
        ctx.fillStyle = '#ffffff'; ctx.font = `700 24px ${TH.FONT}`; ctx.fillText(bb.t3, 34, h - 22 - (bb.kind === 'home' ? 35 : 0), w * 0.5);
      }
    }
    ctx.restore();
    if (s > 0.12) { // flood lamps on the top edge
      ctx.fillStyle = '#2d2d33';
      for (const f of [0.2, 0.5, 0.8]) K.zRect(ctx, bb.z + 30, bb.u0 + w * f - 16, bb.u0 + w * f + 16, bb.h1 + 20, bb.h1 + 34);
    }
  }

  function drawGantry(ctx, gn, d) { // green overhead sign across the carriageway heading to Gulshan
    const s = F / d, K = kit();
    ctx.fillStyle = '#8a9096';
    K.zRect(ctx, gn.z, gn.uA - 8, gn.uA + 8, 8, gn.hb + 20); K.zRect(ctx, gn.z, gn.uB - 8, gn.uB + 8, 8, gn.hb + 20);
    K.zRect(ctx, gn.z, gn.uA, gn.uB, gn.hb, gn.hb + 12);
    const p = fp.project(gn.z - 2, gn.u0, gn.h1);
    if (!p) return;
    const k = Math.min(p.s, 12), w = gn.u1 - gn.u0, h = gn.h1 - gn.h0;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(k, k);
    ctx.fillStyle = '#146c43'; ctx.fillRect(0, 0, w, h);
    if (s > 0.08) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, w - 16, h - 16);
      if (k * 30 > 5) {
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 34px ${TH.FONT}`; ctx.fillText('গুলশান-বাড্ডা লিংক রোড', w / 2, 38, w - 30);
        ctx.font = `500 19px ${TH.FONT}`; ctx.fillText('Gulshan-Badda Link Road', w / 2, 70, w - 40);
        ctx.font = `700 26px ${TH.FONT}`; ctx.textAlign = 'left'; ctx.fillText('↑ গুলশান ১', 22, h - 30, w * 0.5);
        ctx.textAlign = 'right'; ctx.fillText('বাড্ডা ↓', w - 22, h - 30, w * 0.4);
      }
    }
    ctx.restore();
  }

  function drawShelter(ctx, d) { // bus stop shelter on the left footpath
    const s = F / d, K = kit(), z0 = -520, z1 = -320, u0 = -792, u1 = -690;
    ctx.fillStyle = '#6b7280';
    K.zRect(ctx, z1, u0 + 2, u0 + 10, 8, 250); K.zRect(ctx, z1, u1 - 10, u1 - 2, 8, 250);
    if (fp.wallQuad(ctx, z0, z1, u0 + 4, 60, 240)) { ctx.fillStyle = '#9fb7c2'; ctx.fill(); } // back panel
    if (fp.path(ctx, [z0, u0, 250, z1, u0, 250, z1, u1 + 16, 262, z0, u1 + 16, 262])) { ctx.fillStyle = '#b91c1c'; ctx.fill(); }
    ctx.fillStyle = '#7f1d1d'; K.zRect(ctx, z1, u0, u1 + 16, 250, 268);
    if (s > 0.1) {
      ctx.fillStyle = '#9ca3af'; K.zRect(ctx, z1 - 20, u0 + 10, u1 - 20, 44, 52);
      const p = fp.project(z1 + 2, u0 + 14, 262);
      if (p && p.s * 18 > 4) {
        const k = Math.min(p.s, 12);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(k, k);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `700 13px ${TH.FONT}`;
        ctx.fillText('বাস স্টপ · লিংক রোড', 4, -3, 80);
        ctx.restore();
      }
    }
  }

  const SHOPS = [
    ['লেকভিউ কফি হাউস', 'hotel', '#3f2a1e', '#fde68a', '#fbbf24', 'কফি · স্ন্যাকস · জুস'],
    ['ফার্নিচার গ্যালারি', 'variety', '#7c2d12', '#ffffff', '#fed7aa', 'খাট · সোফা · আলমারি'],
    ['স্মার্ট মোবাইল জোন', 'mobile', '#1d4ed8', '#ffffff', '#bfdbfe', 'নতুন ফোন · এক্সেসরিজ'],
    ['লিংক রোড ফার্মেসী', 'pharmacy', '#f8fafc', '#15803d', '#16a34a', 'সব সময় খোলা'],
    ['চাইনিজ রেস্টুরেন্ট', 'hotel', '#b91c1c', '#fde047', '#fde047', 'থাই · চাইনিজ · ইন্ডিয়ান'],
    ['ফাস্ট ফুড কর্নার', 'biryani', '#ea580c', '#ffffff', '#fed7aa', 'বার্গার · পিৎজা · শর্মা'],
    ['টাইলস ও স্যানিটারি', 'hardware', '#334155', '#f8fafc', '#94a3b8', 'বাথরুম ফিটিংস'],
    ['বাইক শোরুম', 'hardware', '#111827', '#ef4444', '#ef4444', 'মোটরসাইকেল · পার্টস'],
    ['ফ্যাশন প্লাজা', 'fashion', '#9d174d', '#ffffff', '#fbcfe8', 'শাড়ি · থ্রি-পিস · পাঞ্জাবি'],
    ['বেকারি এন্ড সুইটস', 'sweets', '#a16207', '#fff7ed', '#fde68a', 'কেক · বিস্কুট · মিষ্টি'],
    ['অপটিক্যাল শপ', 'salon', '#0e7490', '#ffffff', '#a5f3fc', 'চশমা · লেন্স'],
    ['সুপার শপ', 'grocery', '#15803d', '#ffffff', '#bbf7d0', 'এক ছাদের নিচে সব', 'ফ্লেক্সিলোড'],
    ['ইলেকট্রনিক্স হাউস', 'mobile', '#4338ca', '#ffffff', '#c7d2fe', 'এসি · ফ্রিজ · টিভি'],
    ['টেইলার্স এন্ড ফেব্রিক্স', 'tailor', '#6b21a8', '#ffffff', '#e9d5ff', 'স্যুট · শার্ট · প্যান্ট'],
    ['জুস বার', 'sweets', '#65a30d', '#ffffff', '#d9f99d', 'তাজা ফলের রস'],
    ['হেয়ার স্টুডিও', 'salon', '#1f2937', '#fbbf24', '#fbbf24', 'জেন্টস · লেডিস'],
  ];
  const HANG = [
    ['ইংলিশ মিডিয়াম', 'স্কুল · ৩য় তলা', '#1e3a8a', '#ffffff', '#bfdbfe'],
    ['জিম এন্ড স্পা', 'লিফট আছে', '#111827', '#facc15', '#facc15'],
    ['ডেন্টাল ক্লিনিক', '২য় তলা', '#0e7490', '#ffffff', '#a5f3fc'],
    ['রিয়েল এস্টেট', 'ফ্ল্যাট বিক্রয়', '#b91c1c', '#ffffff', '#fecaca'],
    ['ট্রাভেল এজেন্সি', 'ভিসা · টিকেট', '#0369a1', '#ffffff', '#bae6fd'],
    ['আইটি ট্রেনিং', 'কম্পিউটার কোর্স', '#6d28d9', '#ffffff', '#ddd6fe'],
    ['রুফটপ ক্যাফে', 'ছাদে', '#7c2d12', '#fde68a', '#fde68a'],
  ];
  const VINYL = [['শপিং কমপ্লেক্স', 'দোকান ভাড়া দেওয়া হবে', '#1d4ed8'], ['কোচিং সেন্টার', 'ভর্তি চলছে', '#0e7490'], ['ফুড কোর্ট', '৩য় তলায়', '#b91c1c']];
  const AWN = [['#1d4ed8', '#f1f5f9', '#1e40af'], ['#15803d', '#f8fafc', '#166534'], ['#8b8f94', null, '#6b7076']];
  const PAINT = ['#efe6d4', '#e6d3b3', '#f3efe7', '#dccaa8', '#e8d9c6', '#d9c7b0', '#cfd8d3'];
  const RAW = ['#b1aa9d', '#a9a397'];
  const SIDE = ['#b8ae9c', '#a9a08f', '#c1b6a2'];
  const WB = [0, 1600, 3000, 4800]; // near edges of the batching bands (depth)

  TH.fpRoads.push({
    id: 'linkroad',
    light: { tint: '#ffe2b8', tintA: 0.62, glow: 0, fog: FOG, fogNear: 2200, fogFar: 8800, fogMax: 0.66, lamps: false, headlights: false },
    street: {
      asphalt: '#3d3e44', asphaltOpp: '#404148', lane: '#f2efe6', stop: '#f5f4ef', sidewalk: '#c6b79b', sidewalkL: '#bbad95',
      curb: ['#f2f2ee', '#1c1c1f'], median: '#8a8578', medianTop: '#5f8f46', fence: '#cfd2cc', lampStyle: 'pole', lampEvery: 650,
      fill: 'street', // the ground stops at the building lines: the lake beyond the railing is painted in drawSky
    },
    traffic: { bus: 2, cng: 3, car: 5, bike: 3, truck: 1 }, trafficDensity: 1,
    life: { walker: 4, woman: 3, kid: 1, hawker: 2, dog: 1 }, lifeDensity: 1,
    lifeSpots: [{ z: 700, u: 405, kind: 'crowd' }, { z: -420, u: -728, kind: 'busstop' }],

    init(rng) {
      const R = (a, b) => a + rng() * (b - a), rp = (a) => a[(rng() * a.length) | 0], ch = (p) => rng() < p;
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const s = { t: 0, tex: [], walls: null, built: false, rebuilt: false, age: 0, seedPaint: (rng() * 2147483647) | 0, seedPan: (rng() * 2147483647) | 0 };
      const K = kit();
      // Badda side: taller, newer blocks among older flats
      if (K) {
        s.shops = shuffle(SHOPS.slice()).map((d) => ({
          name: d[0], type: d[1], bg: d[2], fg: d[3], bd: d[4], sub: d[5], mini: d[6] || null, icon: d[1] === 'pharmacy' ? '#16a34a' : null,
          shadow: d[2] !== '#f8fafc', wall: rp(['#d2cabd', '#c8bfb0', '#dcd4c6']), pillar: rp(K.PILLAR), shutterC: rp(K.SHUT),
          state: rp(['open', 'open', 'open', 'open', 'half', 'closed']), sy: R(150, 205), poster: ch(0.4) ? rp(['#fef3c7', '#dbeafe', '#fce7f3']) : null,
        }));
        const vinyl = shuffle(VINYL.slice());
        const specs = [
          { w: 600, floors: 9, style: 'glass' }, { w: 800, floors: 7, style: 'tile' }, { w: 600, floors: 6, style: 'paint' },
          { w: 800, floors: 11, style: 'glass' }, { w: 400, floors: 5, style: 'paint' }, { w: 600, floors: 8, style: 'tile' },
        ];
        specs[1].banner = vinyl[0]; specs[2].banner = vinyl[1];
        s.designs = specs.map((o) => K.designUpper(rng, Object.assign({ paint: PAINT, raw: RAW }, o)));
        s.rows = [K.layoutRow({ side: -1, u: fp.U.wallL, z0: -6300, z1: 2300, band: 0, designs: s.designs, nShops: s.shops.length, setbacks: [0, 0, 0, 24, 48], rng, sideCols: SIDE })];
        const pr = K.propsFor(s.rows, [s.shops], rng, { signP: 0.35, awnP: 0.2, hang: HANG, awn: AWN });
        s.signs = pr.signs; s.awnings = pr.awnings;
      } else { s.rows = []; s.signs = []; s.awnings = []; }
      s.farRow = [];
      for (let z = -4700; z > -19000;) { const L = R(700, 1400) * (1 + (-4700 - z) / 5000); s.farRow.push({ z1: z, z0: z - L, h: R(900, 2000) }); z -= L; }

      // Gulshan across the lake: towers set out in screen x for the reference camera (a gap left for the sun)
      s.towers = [];
      for (let x = 1060; x > 545;) {
        const inSun = x > 735 && x < 870;
        const u = R(3900, 6600), d = ((u - REF.u) * F) / (x - CX);
        const T = {
          u, z: REF.z - d, w: R(650, 1250), dep: R(600, 1000), h: inSun ? R(1300, 1900) : R(2300, 5200), pal: (rng() * GLASS.length) | 0,
          kind: ch(0.25) ? 'band' : 'glass', crown: rp(['flat', 'spire', 'slant', 'crown', 'flat']), floor: R(95, 120), mull: R(70, 110),
        };
        const sc = F / d, half = (T.w / 2) * sc;
        if (x + half > SUN.x - 70 && x - half < SUN.x + 70) T.h = Math.min(T.h, REF.h + (HY - SUN.y - 45) / sc); // keep the sun in view
        s.towers.push(T);
        x -= R(28, 70) * (0.4 + (x - 500) / 500);
      }
      for (let i = 0; i < 10; i++) { // lower blocks just behind the far-bank trees
        const x = R(560, 1060), u = R(3650, 3900), d = ((u - REF.u) * F) / (x - CX);
        const T = { u, z: REF.z - d, w: R(500, 900), dep: R(500, 800), h: R(700, 1300), pal: 4, kind: ch(0.5) ? 'band' : 'glass', crown: 'flat', floor: R(110, 130), mull: R(80, 120) };
        const sc = F / d, half = (T.w / 2) * sc;
        if (x + half > SUN.x - 70 && x - half < SUN.x + 70) T.h = Math.min(T.h, REF.h + (HY - SUN.y - 45) / sc);
        s.towers.push(T);
      }
      s.towers.sort((a, b) => a.z - b.z);
      // glints on tower edges (screen positions for the reference camera)
      s.glints = [];
      for (const T of s.towers) {
        if (T.h < 2000 || !ch(0.55)) continue;
        const p = PR(T.z, T.u + T.w / 2, T.h * R(0.45, 0.95));
        s.glints.push({ x: p.x, y: p.y, r: R(5, 12), sp: R(0.7, 1.8), ph: R(0, TAU) });
      }
      // slow sweeps of reflected sun across the biggest glass towers (screen boxes for the reference camera)
      s.sweeps = s.towers.filter((T) => T.kind === 'glass' && T.h > 2600).map((T) => {
        const a = PR(T.z, T.u - T.w / 2, T.h), b = PR(T.z, T.u + T.w / 2, -30);
        return { x0: a.x, x1: b.x, y0: a.y, y1: b.y, area: (b.x - a.x) * (b.y - a.y) };
      }).sort((p, q) => q.area - p.area).slice(0, 3).map((b, i) => Object.assign(b, { ph: i * 2.3, sp: 0.09 + i * 0.03 }));
      s.glitter = Array.from({ length: 40 }, () => ({ x: R(-1, 1) * Math.abs(R(-1, 1)), y: Math.pow(rng(), 1.3), ph: R(0, TAU), sp: R(1.5, 4) }));
      s.ripples = Array.from({ length: 22 }, () => ({ x: rng(), y: Math.pow(rng(), 1.4), v: R(0.004, 0.012), ph: R(0, TAU) }));
      s.boats = [
        { z: -2600, u: 2300, dir: 1, v: 14, kind: 'pole', ph: 0 },
        { z: -900, u: 1250, dir: -1, v: 0, kind: 'chhoi', ph: 2 },
        { z: -5200, u: 2900, dir: -1, v: 10, kind: 'pole', ph: 4 },
      ];
      s.egrets = [{ x: 640, y: 150, v: 18, sz: 6, ph: 0 }, { x: 668, y: 162, v: 18, sz: 5, ph: 1.7 }, { x: 900, y: 120, v: -22, sz: 5.5, ph: 3.1 }];
      s.vpGlints = [];
      // promenade: krishnachura trees, benches, the railing
      s.trees = [];
      for (let z = -6200; z < 2400; z += R(430, 560)) s.trees.push({ z, u: TREE_U + R(-10, 10), h: R(520, 600), v: (rng() * 3) | 0, lean: R(0.7, 1.1) });
      s.benches = [];
      for (let z = -3900; z < 1400; z += R(700, 1000)) if (Math.abs(z - 700) > 160) s.benches.push({ z0: z, z1: z + 110 });
      // Badda side extras
      s.billboards = [
        { z: -1500, u0: -800, u1: -330, h0: 660, h1: 920, kind: 'home', bg: '#0f5f6b', fg: '#fde047', fg2: '#f1f5f9', t1: 'লেকভিউ রেসিডেন্স', t2: 'গুলশানে স্বপ্নের ঠিকানা', t3: 'বুকিং চলছে!' },
        { z: -3900, u0: -790, u1: -340, h0: 640, h1: 890, kind: 'food', bg: '#fbbf24', fg: '#7f1d1d', fg2: '#7f1d1d', t1: 'ঝটপট নুডলস', t2: 'মাত্র ২ মিনিটে রেডি!', t3: 'মজার স্বাদ, ঝটপট' },
      ];
      s.gantry = { z: 200, uA: -655, uB: -272, hb: 560, u0: -640, u1: -292, h0: 572, h1: 732 };
      s.cloudPos = [[R(80, 260), R(40, 80)], [R(420, 620), R(20, 60)]];
      return s;
    },

    update(s, dt) {
      s.t += dt;
      const K = kit();
      if (K && s.built && !s.rebuilt && (s.age += dt) > 4) { s.rebuilt = true; if (s.band) K.repaintBand(s.band, s.shops, s.seedPaint); }
      for (const b of s.boats) if (b.v) { b.z += b.v * b.dir * dt * 0.3; b.u += b.v * dt * 0.4; if (b.u > BANK - 400) b.u = 900; }
      for (const e of s.egrets) { e.x += e.v * dt; if (e.x > 1060) e.x = 540; if (e.x < 540) e.x = 1060; }
    },

    walls(s) {
      if (s.walls) return s.walls;
      const K = kit();
      s.walls = [];
      if (K && s.rows.length) {
        s.band = K.paintBand(s.tex, s.shops, 0.8, s.seedPaint);
        s.ups = K.paintUppers(s.tex, s.designs, 0.45, s.seedPaint ^ 0x68e31da4);
        if (s.band) s.walls = K.wallsFor(s.rows, [s.band], s.ups);
      }
      const pan = mkTex(s.tex, (PAN.x1 - PAN.x0) * PAN.k, (PAN.y1 - PAN.y0) * PAN.k, 1);
      if (pan) { paintPanorama(pan, s); s.pan = pan; }
      const R = TH.mulberry32(s.seedPan ^ 0x1234567);
      s.canopy = [0, 1, 2].map(() => { const t = mkTex(s.tex, 640, 330, 0.8); if (t) paintCanopy(t, R); return t; });
      if (!s.canopy[0]) s.canopy = null;
      const vp = mkTex(s.tex, 190, 205, 2);
      if (vp) { s.vpGlints = paintVpCluster(vp, R); s.vp = vp; }
      s.clouds = [0, 1].map(() => { const t = mkTex(s.tex, 360, 80, 1); if (t) paintCloudStreak(t, R); return t; });
      s.built = true;
      s.bytes = s.tex.reduce((m, t) => m + t.cv.width * t.cv.height * 4, 0);
      return s.walls;
    },

    drawSky(ctx, s) {
      const G = skyGrad(ctx, s), t = s.t;
      ctx.fillStyle = '#9a8a74'; ctx.fillRect(-400, HY, 1800, 800);
      ctx.fillStyle = G.sky; ctx.fillRect(-400, -400, 1800, HY + 414);
      ctx.fillStyle = G.sun; ctx.fillRect(SUN.x - 460, SUN.y - 460, 920, 920);
      const a0 = ctx.globalAlpha;
      if (s.clouds && s.clouds[0]) s.cloudPos.forEach(([x0, y], i) => {
        const img = s.clouds[i], x = ((x0 + t * 2.5 - cam.u * 0.02 + 300) % 1500) - 300;
        ctx.drawImage(img.cv, x, y, 360 * 1.3, 80);
      });
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(SUN.x, SUN.y, 20, 0, TAU); ctx.fill();
      // Gulshan's towers ahead, glinting
      if (s.vp) {
        const x = 380 - (cam.u - REF.u) * F / 30000, y = HY - 200 + 4;
        ctx.drawImage(s.vp.cv, x, y, 190, 205);
        ctx.beginPath();
        for (const g of s.vpGlints) {
          const on = Math.sin(t * 1.3 + g.ph);
          if (on < 0.6) continue;
          const r = 3 + (on - 0.6) * 12, gx = x + g.x, gy = y + g.y;
          ctx.moveTo(gx - r, gy); ctx.lineTo(gx + r, gy); ctx.moveTo(gx, gy - r * 0.8); ctx.lineTo(gx, gy + r * 0.8);
        }
        ctx.strokeStyle = '#fffbea'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      drawFarLeft(ctx, s);
      // the lake and the skyline across it (the engine's ground fog hazes the far water afterwards)
      if (s.pan) { drawPan(ctx, s); drawLakeLive(ctx, s); drawTowerFx(ctx, s); }
      for (const b of s.boats) drawBoat(ctx, b, t);
      drawEgrets(ctx, s);
      ctx.globalAlpha = a0;
      const K = kit();
      if (K && s.built && s.rows.length) {
        ctx.fillStyle = '#b3a58d'; // footpath behind set-back buildings on the Badda side
        if (fp.quad(ctx, cam.z - fp.FAR, cam.z, fp.U.wallL - 500, fp.U.wallL, fp.CURB_H)) ctx.fill();
        K.drawCrossFaces(ctx, s.rows);
      }
    },

    add(s, env, add) {
      const K = kit();
      const zF = cam.z - fp.FAR, zN = cam.z - NEAR - 10;
      // railing along the lake, one item per depth band, drawn at the band's far edge (everything on
      // the promenade stands in front of it)
      for (let i = 0; i < WB.length; i++) {
        const dA = WB[i], dB = i + 1 < WB.length ? WB[i + 1] : fp.FAR - 20;
        const zA = cam.z - dB, zB = cam.z - Math.max(dA, 30);
        if (zB <= Math.max(zA, -6200)) continue;
        const dM = dA + (dB - dA) * 0.3 + 1;
        add(zA + 1, (c) => { c.globalAlpha *= fp.fade(dM); drawRail(c, Math.max(zA, -6200), Math.min(zB, 2300), F / dM); }, undefined, undefined, NOFADE);
      }
      const farT = [[], []];
      for (const tr of s.trees) {
        const d = cam.z - tr.z;
        if (d < NEAR + 5 || d > fp.FAR - 10) continue;
        if (d < 3000) add(tr.z, (c) => drawTree(c, tr, s), tr.u, 340);
        else farT[d < 5000 ? 0 : 1].push(tr);
      }
      farT.forEach((list) => { if (list.length) add(list[0].z, (c) => fadeEach(c, list, (tr) => drawTree(c, tr, s)), undefined, undefined, NOFADE); });
      for (const b of s.benches) {
        const d = cam.z - b.z1;
        if (d < NEAR + 10 || d > 3200) continue;
        add(b.z0, (c, dd) => drawBench(c, b, F / dd), 420, 60);
      }
      if (!K) return;
      const farS = [];
      for (const sg of s.signs) {
        const d = cam.z - sg.z;
        if (d < NEAR + 10 || d > 5600) continue;
        if (d < 2600) add(sg.z, (c, dd) => K.drawSign(c, sg, dd), sg.wallU - sg.side * (sg.w / 2 + 16), sg.w);
        else farS.push(sg);
      }
      if (farS.length) add(farS[0].z, (c) => fadeEach(c, farS, (sg) => K.drawSignFar(c, sg, F / (cam.z - sg.z))), undefined, undefined, NOFADE);
      for (const aw of s.awnings) {
        if (aw.zb < cam.z - 2700 || aw.za > zN) continue;
        add(aw.za, (c, d) => K.drawAwning(c, aw, d), aw.wallU - aw.side * 35, 140);
      }
      for (const bb of s.billboards) if (bb.z > zF && bb.z < zN) add(bb.z, (c, d) => drawBillboard(c, bb, d), (bb.u0 + bb.u1) / 2, 300);
      if (s.gantry.z < zN) add(s.gantry.z, (c, d) => drawGantry(c, s.gantry, d), -460, 260);
      if (-320 < zN) add(-520, (c, d) => drawShelter(c, d), -740, 90);
    },

    dispose(s) {
      for (const t of s.tex) { t.cv.width = 0; t.cv.height = 0; }
      s.tex.length = 0;
      s.walls = null; s.band = null; s.ups = null; s.pan = null; s.canopy = null; s.vp = null; s.clouds = null; s.built = false;
    },
  });
})();
