// Road: Badda (Pragati Sarani) — dense, chaotic and colourful. Stacked flats with grills, AC units,
// drying clothes and rooftop tanks; shop signboards and a rooftop billboard; tangled wires with crows;
// a tea stall, a fruit van and a street dog on the footpath, under a hazy late-afternoon sky.
// The static scene is painted once into offscreen caches (2x-3x); only animation and text are drawn per frame.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;
  const TAU = Math.PI * 2;
  const GT = 234;                 // ground-floor top (first-floor slab); shops fill GT..300
  const SUN = { x: 880, y: 92 };  // low sun, upper right: every highlight faces it
  const MID_Y0 = 96;              // the mid-layer cache covers y MID_Y0..352
  const POLES = [60, 440, 830];   // x of the electric poles (the one at 830 carries the transformer)
  const STALL_X = 322;            // tea stall booth, x STALL_X-7 .. STALL_X+68
  // x ranges hiding the shop-sign band (y 237-257): one-way board, tea stall, signal head, poles, screen edges
  const SIGN_OCC = [[-1e4, 3], [200, 302], [STALL_X - 8, STALL_X + 69], [646, 686], ...POLES.map((p) => [p - 7, p + 7]), [W - 3, 1e4]];
  // ...and the first-floor band (y 205-245): one-way board, the stall's চা board, signal head, transformer
  const BANNER_OCC = [[196, 306], [STALL_X + 12, STALL_X + 47], [640, 692], [806, 854]];
  function freeSpan(x0, x1, occ) { // widest part of [x0, x1] not hidden by the occluders
    let spans = [[x0, x1]];
    for (const [a, b] of occ) spans = spans.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v > u)));
    return spans.reduce((m, sp) => (sp[1] - sp[0] > m[1] - m[0] ? sp : m), [x0, x0]);
  }
  const hits = (x0, x1, occ) => occ.some(([a, b]) => x1 > a && x0 < b);

  // ---------- colour helpers ----------
  const rgbOf = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hexOf = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  const mix = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return hexOf(...A.map((v, i) => Math.round(v + (B[i] - v) * t))); };
  const tone = (c, t) => (t >= 0 ? mix(c, '#fff2d8', t) : mix(c, '#2a2032', -t)); // warm lights, dusky-violet shadows
  const sh = (a) => `rgba(42,28,46,${a})`;    // shadow tint
  const lt = (a) => `rgba(255,238,206,${a})`; // sunlight tint

  const PAINT = ['#e3c39a', '#d99b80', '#9fbfae', '#e0b25a', '#a9c2d3', '#e4b1a8', '#c8cf9e', '#efdcbc', '#c3a3c1'];
  const RAW = ['#a9a397', '#b1aa9d', '#9f998e'];
  const ACCENT = ['#8e3b2e', '#2f5d62', '#b8654a', '#5a4a7a', '#f1e6d0', '#6b8f4e'];
  const GRILL = ['#2e3236', '#2e3236', '#e9e5da', '#2f6b4f', '#7a3b2a'];
  const CURT = ['#c0392b', '#2e86ab', '#f4d35e', '#8e44ad', '#e67e22', '#16a085', '#f5f0e6', '#d35d8a'];
  const CLOTH = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#264653', '#f8f8f2', '#9b5de5', '#f15bb5', '#00bbf9', '#3a86ff', '#ff006e'];
  const GOODS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#f1faee', '#ffb703', '#8ecae6', '#fb8500', '#6a994e', '#d62828'];
  const WIRE = ['#141213', '#1d1a1b', '#262223', '#302b29', '#3b3532', '#55504c'];
  const SKIN = ['#8d5a3b', '#a0694a', '#6f4630'];
  const AWN = [['#1d4ed8', '#f1f5f9'], ['#dc2626', '#fef3c7'], ['#15803d', '#f8fafc'], ['#8b8f94', '#6b7076']];

  // Shop boards: name -> look. The first three are Badda's signature names and always appear.
  const KEEP = ['মায়ের দোয়া স্টোর', 'বাবার দোয়া', 'হোটেল ভাই ভাই'];
  const SHOP = {
    'মায়ের দোয়া স্টোর': { type: 'grocery', sign: '#b91c1c', text: '#fff7e0', border: '#fde047', mini: 'ফ্লেক্সিলোড' },
    'বাবার দোয়া': { type: 'variety', sign: '#15803d', text: '#ffffff', border: '#fef08a' },
    'হোটেল ভাই ভাই': { type: 'hotel', sign: '#1e3a8a', text: '#fde047', border: '#f8fafc', blue: true },
    'ঢাকা বিরিয়ানি': { type: 'biryani', sign: '#7f1d1d', text: '#fde68a', border: '#fbbf24' },
    'কাচ্চি ঘর': { type: 'biryani', sign: '#f59e0b', text: '#3b0d0d', border: '#7f1d1d' },
    'মোবাইল সার্ভিসিং': { type: 'mobile', sign: '#0f766e', text: '#ffffff', border: '#99f6e4', mini: 'রিচার্জ' },
    'সততা ফার্মেসী': { type: 'pharmacy', sign: '#f8fafc', text: '#15803d', border: '#16a34a', icon: '#16a34a' },
    'রহমান টেইলার্স': { type: 'tailor', sign: '#6b21a8', text: '#ffffff', border: '#e9d5ff' },
    'স্বপ্ন সুইটস': { type: 'sweets', sign: '#db2777', text: '#ffffff', border: '#fce7f3' },
    'বাড্ডা হার্ডওয়্যার': { type: 'hardware', sign: '#c2410c', text: '#ffffff', border: '#fed7aa' },
    'নিউ ফ্যাশন': { type: 'tailor', sign: '#1f2937', text: '#fbbf24', border: '#fbbf24' },
    'আল-আমিন ফার্মেসী': { type: 'pharmacy', sign: '#166534', text: '#ffffff', border: '#bbf7d0', icon: '#ffffff' },
  };

  // ---------- offscreen caches ----------
  function layer(w, h, k) {
    try {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
      const g = cv.getContext('2d');
      return g ? { cv, g } : null;
    } catch (e) { return null; }
  }
  function pxScale(ctx) { // device pixels per world unit, so the cache stays crisp on big/hi-dpi screens
    try {
      if (typeof ctx.getTransform === 'function') {
        const m = ctx.getTransform(), v = Math.hypot(m.a, m.b);
        if (isFinite(v) && v > 0) return v;
      }
    } catch (e) { /* ignore */ }
    return 2;
  }
  function ensureCache(ctx, s) {
    const k = Math.min(3, Math.max(2, Math.ceil(pxScale(ctx) * 2) / 2));
    if (s.cache && (s.cache.k === k || s.cache.failed)) return s.cache;
    const back = layer(W, 300, k), mid = layer(W, 352 - MID_Y0, k);
    if (!back || !mid) return (s.cache = { k, failed: true });
    back.g.setTransform(k, 0, 0, k, 0, 0); paintBack(back.g, s);
    mid.g.setTransform(k, 0, 0, k, 0, -MID_Y0 * k); paintMid(mid.g, s);
    const clouds = s.cloudShapes.map((c) => {
      const L = layer(c.w, c.h, 2);
      if (L) { L.g.setTransform(2, 0, 0, 2, -c.x0 * 2, -c.y0 * 2); paintCloud(L.g, c); }
      return L ? L.cv : null;
    });
    return (s.cache = { k, back: back.cv, mid: mid.cv, clouds });
  }

  // ---------- small painters ----------
  function stain(g, x, y, w, h, a) { // streak fading downwards
    const s = g.createLinearGradient(0, y, 0, y + h);
    s.addColorStop(0, sh(a)); s.addColorStop(1, sh(0));
    g.fillStyle = s; g.fillRect(x, y, w, h);
  }
  function wash(g, x0, y0, x1, y1, c0, c1, rect) { // gradient painted only over what is already there
    const h = g.createLinearGradient(x0, y0, x1, y1);
    h.addColorStop(0, c0); h.addColorStop(1, c1);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = h; g.fillRect(rect[0], rect[1], rect[2], rect[3]);
    g.globalCompositeOperation = 'source-over';
  }
  function slab(g, x, w, y, accent) {
    g.fillStyle = accent; g.fillRect(x, y - 2, w, 4);
    g.fillStyle = lt(0.35); g.fillRect(x, y - 2, w, 0.9);
    g.fillStyle = sh(0.25); g.fillRect(x, y + 2, w, 2);
  }
  function wireY(w, x) {
    const u = (x - w.x1) / (w.x2 - w.x1), cy = Math.max(w.y1, w.y2) + w.sag;
    return (1 - u) * (1 - u) * w.y1 + 2 * (1 - u) * u * cy + u * u * w.y2;
  }

  // ---------- sky ----------
  function paintCloud(g, c) { // soft puffs: shaded underside first, sunlit tops on the right
    for (const pass of [0, 1]) {
      for (const p of c.puffs) {
        const x = p.x + (pass ? 2 : -3), y = p.y + (pass ? -2 : 4), r = p.r * (pass ? 0.9 : 1);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const col = pass ? '255,248,234' : '214,152,138';
        const a = pass ? 0.74 : 0.34;
        gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  }
  const RAYS = [[0.905, 38, 0.075], [0.93, 24, 0.06], [0.955, 50, 0.055], [0.975, 30, 0.05]];
  // Gradients for the live layers, made once per context (world coordinates, all constant).
  const gradCache = new WeakMap();
  function grads(ctx, s) {
    let o = gradCache.get(ctx);
    if (o) return o;
    o = {};
    o.sky = ctx.createLinearGradient(0, 0, 0, 300);
    o.sky.addColorStop(0, '#c89e94'); o.sky.addColorStop(0.38, '#e7b68d'); o.sky.addColorStop(0.74, '#f5d4a5'); o.sky.addColorStop(1, '#f9e3bf');
    o.sun = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 300);
    o.sun.addColorStop(0, 'rgba(255,251,232,1)'); o.sun.addColorStop(0.068, 'rgba(255,246,214,0.97)'); o.sun.addColorStop(0.1, 'rgba(255,226,170,0.55)');
    o.sun.addColorStop(0.35, 'rgba(255,206,140,0.22)'); o.sun.addColorStop(1, 'rgba(255,200,140,0)');
    o.rays = RAYS.map(([f]) => {
      const ang = Math.PI * f, gr = ctx.createLinearGradient(SUN.x, SUN.y, SUN.x + Math.cos(ang) * 820, SUN.y + Math.sin(ang) * 820);
      gr.addColorStop(0, 'rgba(255,236,196,1)'); gr.addColorStop(1, 'rgba(255,236,196,0)');
      return gr;
    });
    o.haze = ctx.createLinearGradient(0, 0, 0, 210);
    o.haze.addColorStop(0, 'rgba(255,222,178,0.14)'); o.haze.addColorStop(1, 'rgba(255,222,178,0)');
    const d = s.dog;
    o.dog = ctx.createLinearGradient(0, d.y - 12, 0, d.y);
    o.dog.addColorStop(0, d.c1l); o.dog.addColorStop(1, d.c2);
    gradCache.set(ctx, o);
    return o;
  }
  function drawSky(ctx, s, C, G) {
    ctx.fillStyle = G.sky; ctx.fillRect(0, 0, W, 300);
    ctx.fillStyle = G.sun; ctx.fillRect(SUN.x - 300, 0, 600, 300);
    for (const c of s.clouds) {
      const sp = s.cloudShapes[c.shape], img = C.clouds && C.clouds[c.shape];
      ctx.globalAlpha = c.a;
      if (img) ctx.drawImage(img, c.x + sp.x0 * c.s, c.y + sp.y0 * c.s * c.flat, sp.w * c.s, sp.h * c.s * c.flat);
      else { ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.s, c.s * c.flat); paintCloud(ctx, sp); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }
  function drawRays(ctx, t, G) { // faint god-rays from the sun across the facades
    RAYS.forEach(([f, wd, a0], i) => {
      const ang = Math.PI * f, ex = SUN.x + Math.cos(ang) * 820, ey = SUN.y + Math.sin(ang) * 820;
      const px = -Math.sin(ang) * wd, py = Math.cos(ang) * wd;
      ctx.globalAlpha = a0 * (0.75 + 0.25 * Math.sin(t * 0.35 + i * 1.7));
      ctx.fillStyle = G.rays[i];
      ctx.beginPath(); ctx.moveTo(SUN.x, SUN.y); ctx.lineTo(ex + px, ey + py); ctx.lineTo(ex - px, ey - py); ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
  function drawKite(ctx, k, t) {
    if (!k) return;
    const kx = k.x + Math.sin(t * 0.7) * 6 + Math.sin(t * 1.9) * 2, ky = k.y + Math.sin(t * 0.9 + 1) * 4;
    ctx.beginPath(); ctx.moveTo(k.hx, k.hy);
    ctx.quadraticCurveTo((k.hx + kx) / 2 + 6, (k.hy + ky) / 2 + 12, kx, ky + 8);
    ctx.strokeStyle = 'rgba(70,45,45,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(t * 1.3) * 0.18);
    ctx.fillStyle = k.c1; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = k.c2; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-7, 0); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = k.c1; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(3, 13); ctx.lineTo(-3, 13); ctx.closePath(); ctx.fill(); // tail
    ctx.strokeStyle = 'rgba(40,20,20,0.5)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 9); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, -5, 7, 0); ctx.stroke();
    ctx.restore();
  }

  // ---------- far skyline ----------
  function paintFar(g, s) {
    for (const f of s.far1) {
      g.fillStyle = f.c; g.fillRect(f.x, f.top, f.w, 300 - f.top);
      if (f.cap) g.fillRect(f.x + f.w * 0.3, f.top - 7, f.w * 0.34, 7);
      if (f.mast) { g.fillRect(f.x + f.w * 0.6, f.top - 22, 1.2, 22); g.fillRect(f.x + f.w * 0.6 - 3, f.top - 16, 7, 1); }
      g.fillStyle = 'rgba(95,70,85,0.13)';
      for (let y = f.top + 5; y < 300; y += 6) g.fillRect(f.x + 2, y, f.w - 5, 2.2);
      g.fillStyle = 'rgba(255,240,215,0.25)'; g.fillRect(f.x + f.w - 3, f.top, 3, 300 - f.top);
    }
    paintMinaret(g, s.minaret); paintCrane(g, s.crane); paintTower(g, s.tower);
    wash(g, 0, 40, 0, 300, 'rgba(250,222,184,0)', 'rgba(250,222,184,0.62)', [0, 0, W, 300]);
    for (const f of s.far2) {
      const gr = g.createLinearGradient(f.x + f.w, f.top, f.x, 300);
      gr.addColorStop(0, tone(f.c, 0.12)); gr.addColorStop(1, tone(f.c, -0.1));
      g.fillStyle = gr; g.fillRect(f.x, f.top, f.w, 300 - f.top);
      if (f.tank > 0) { g.fillStyle = tone(f.c, -0.3); g.fillRect(f.x + f.w * f.tank, f.top - 9, 9, 9); }
      g.fillStyle = tone(f.c, 0.14); g.fillRect(f.x - 1, f.top - 2.5, f.w + 2, 2.5);
      g.fillStyle = sh(0.22);
      const cw = (f.w - 8) / f.cols;
      for (let y = f.top + 7; y < 292; y += 11) for (let i = 0; i < f.cols; i++) g.fillRect(f.x + 4 + i * cw + 1.5, y, cw - 4, 5);
      g.fillStyle = 'rgba(255,238,210,0.3)'; g.fillRect(f.x + f.w - 2, f.top, 2, 300 - f.top);
    }
    wash(g, 0, 100, 0, 300, 'rgba(248,220,182,0)', 'rgba(248,220,182,0.36)', [0, 0, W, 300]);
  }
  function paintMinaret(g, m) {
    const x = m.x, t = m.top, c = '#dccbb8';
    g.fillStyle = c; g.fillRect(x - 3, t + 16, 6, 300 - t - 16);
    g.fillStyle = 'rgba(255,244,222,0.45)'; g.fillRect(x + 1.2, t + 16, 1.8, 300 - t - 16);
    g.fillStyle = tone(c, -0.12);
    for (const yy of [t + 30, t + 62]) { g.fillRect(x - 5.5, yy, 11, 2.5); g.fillRect(x - 4, yy + 2.5, 8, 1.5); }
    g.fillStyle = c; g.fillRect(x - 3.5, t + 8, 7, 8);
    g.fillStyle = tone(c, -0.2); g.fillRect(x - 2.2, t + 10, 1.3, 5); g.fillRect(x + 0.9, t + 10, 1.3, 5);
    g.fillStyle = '#a3b89c';
    g.beginPath(); g.moveTo(x - 4.5, t + 8); g.quadraticCurveTo(x - 3.5, t + 1, x, t - 3); g.quadraticCurveTo(x + 3.5, t + 1, x + 4.5, t + 8); g.closePath(); g.fill();
    g.strokeStyle = '#cdb77a'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, t - 3); g.lineTo(x, t - 7); g.stroke();
    g.beginPath(); g.arc(x + 0.6, t - 8.8, 1.6, 0.5 * Math.PI, 1.6 * Math.PI); g.stroke();
  }
  function paintCrane(g, c) {
    const col = '#bb9869', x = c.x, t = c.top, d = c.dir;
    g.strokeStyle = col; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - 2.5, 300); g.lineTo(x - 2.5, t); g.moveTo(x + 2.5, 300); g.lineTo(x + 2.5, t);
    for (let y = t + 3; y < 300; y += 5) { g.moveTo(x - 2.5, y); g.lineTo(x + 2.5, y + 5); }
    g.stroke();
    g.lineWidth = 1.3; g.beginPath(); g.moveTo(x - d * 24, t + 1); g.lineTo(x + d * 92, t + 1); g.stroke();
    g.lineWidth = 0.5; g.beginPath(); g.moveTo(x, t - 10); g.lineTo(x + d * 92, t + 1); g.moveTo(x, t - 10); g.lineTo(x - d * 24, t + 1); g.moveTo(x, t - 10); g.lineTo(x, t); g.stroke();
    g.fillStyle = '#9d887a'; g.fillRect(x - d * 22 - 4, t + 1, 8, 5);
    g.fillStyle = col; g.fillRect(x - 3.5, t + 1, 7, 5);
    g.strokeStyle = 'rgba(90,70,60,0.6)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x + d * 62, t + 1); g.lineTo(x + d * 62, t + 42); g.stroke();
    g.fillStyle = '#7a6a60'; g.fillRect(x + d * 62 - 1.5, t + 42, 3, 3);
  }
  function paintTower(g, tw) { // mobile phone lattice tower
    const x = tw.x, t = tw.top, span = 300 - t;
    g.strokeStyle = '#a58f93'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - 9, 300); g.lineTo(x - 2, t); g.moveTo(x + 9, 300); g.lineTo(x + 2, t);
    for (let y = t + 6; y < 300; y += 9) {
      const a = 2 + 7 * (y - t) / span, b = 2 + 7 * Math.min(1, (y + 9 - t) / span);
      g.moveTo(x - a, y); g.lineTo(x + b, y + 9); g.moveTo(x + a, y); g.lineTo(x - b, y + 9);
    }
    g.stroke();
    g.fillStyle = '#9a878c'; g.fillRect(x - 5.5, t + 3, 2.5, 8); g.fillRect(x + 3, t + 3, 2.5, 8); g.fillRect(x - 1, t, 2, 8);
    TH.circle(g, x, t - 2, 1.4, '#d9564a');
  }

  // ---------- main buildings ----------
  function paintBack(g, s) {
    paintFar(g, s);
    for (const b of s.buildings) paintBuilding(g, b);
    paintBillboard(g, s.billboard);
    // warm light from the upper right, dusty haze settling near the street
    wash(g, W, 0, 200, 300, 'rgba(255,212,150,0.16)', 'rgba(110,64,92,0.12)', [0, 0, W, 300]);
    wash(g, 0, 240, 0, 300, 'rgba(240,208,168,0)', 'rgba(240,208,168,0.2)', [0, 240, W, 60]);
  }

  function paintBuilding(g, b) {
    const { x, w, top, fh } = b, c = b.color, r = TH.mulberry32(b.seed);
    g.save();
    g.beginPath(); g.rect(x, top, w, 300 - top); g.clip();
    const body = g.createLinearGradient(x + w, top, x + w * 0.1, 300);
    body.addColorStop(0, tone(c, 0.14)); body.addColorStop(0.5, c); body.addColorStop(1, tone(c, -0.16));
    g.fillStyle = body; g.fillRect(x, top, w, 300 - top);
    if (b.glass) paintGlass(g, b, r);
    else {
      // weathering: blotches, formwork lines on raw concrete, mould near the roof
      for (let i = 0, n = b.raw ? 16 : 7; i < n; i++) {
        g.fillStyle = r() < 0.55 ? sh(b.raw ? 0.08 : 0.05) : lt(b.raw ? 0.08 : 0.05);
        g.beginPath(); g.ellipse(x + r() * w, top + r() * (GT - top), 6 + r() * 16, 4 + r() * 12, 0, 0, TAU); g.fill();
      }
      if (b.raw) { g.fillStyle = sh(0.07); for (let y = top + 8; y < GT; y += 10) g.fillRect(x, y, w, 0.8); }
      stain(g, x, top, w, 16, b.raw ? 0.28 : 0.14);
      for (let i = 0, n = b.raw ? 7 : 4; i < n; i++) stain(g, x + r() * w, top, 1.5 + r() * 3, 20 + r() * 50, b.raw ? 0.22 : 0.13);
      if (b.brick) paintBrickFloor(g, b, r);
      // pilasters
      g.fillStyle = tone(c, 0.06); g.fillRect(x, top, 4, GT - top); g.fillRect(x + w - 4, top, 4, GT - top);
      // upper floors
      for (let f = 1; f < b.floors; f++) {
        const yT = GT - f * fh, yB = yT + fh, bare = b.brick && f === b.floors - 1;
        for (let ci = 0; ci < b.nb; ci++) {
          const cell = b.cells[(f - 1) * b.nb + ci], bx = x + b.m + ci * b.bw;
          if (bare) { g.fillStyle = '#2d2527'; g.fillRect(bx + 5, yT + 6, b.bw - 10, fh - 10); g.fillStyle = sh(0.4); g.fillRect(bx + 5, yT + 6, b.bw - 10, 2); }
          else if (cell.k === 'jali') paintJali(g, b, bx, yT, yB);
          else if (cell.k === 'win') paintWindow(g, b, cell, bx, yT, yB);
          else paintBalcony(g, b, cell, bx, yT, yB);
        }
        if (f > 1) slab(g, x, w, yB, b.accent);
      }
    }
    if (b.banner) paintBanner(g, b.banner);
    // ground floor: shops
    g.fillStyle = tone(c, -0.12); g.fillRect(x, GT, w, 300 - GT);
    for (const sp of b.shops) paintShop(g, sp, r);
    if (b.shops.length > 1) { const mx = b.shops[1].x0 - 2; g.fillStyle = tone(c, -0.04); g.fillRect(mx - 1, GT, 4, 66); g.fillStyle = lt(0.25); g.fillRect(mx + 2, GT, 1, 66); }
    slab(g, x, w, GT, b.accent);
    for (const sp of b.shops) paintSign(g, sp);
    stain(g, x, 300, w, -14, 0.22); // splash grime rising from the footpath
    // sunlit right edge, shaded left edge
    g.fillStyle = lt(0.38); g.fillRect(x + w - 1.6, top, 1.6, 300 - top);
    g.fillStyle = sh(0.24); g.fillRect(x, top, 1.6, 300 - top);
    g.restore();
    paintRoof(g, b, r);
  }

  function paintBrickFloor(g, b, r) {
    const { x, w, top, fh } = b;
    g.fillStyle = '#a4573e'; g.fillRect(x, top, w, fh);
    for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,30,20,0.25)' : 'rgba(240,170,120,0.2)'; g.fillRect(x + ((r() * w / 8) | 0) * 8, top + ((r() * fh / 3.4) | 0) * 3.4, 7.3, 2.7); }
    g.fillStyle = 'rgba(232,204,172,0.4)';
    for (let y = top + 3.4; y < top + fh; y += 3.4) g.fillRect(x, y - 0.7, w, 0.7);
    g.fillStyle = 'rgba(70,30,22,0.3)';
    for (let row = 0, y = top; y < top + fh; row++, y += 3.4) for (let bx = x + (row % 2) * 4; bx < x + w; bx += 8) g.fillRect(bx, y, 0.7, 2.7);
    const col = '#aca698';
    g.fillStyle = col;
    for (const cx of [x, x + w / 2 - 2.5, x + w - 5]) g.fillRect(cx, top, 5, fh);
    g.fillStyle = lt(0.3); for (const cx of [x, x + w / 2 - 2.5, x + w - 5]) g.fillRect(cx + 4, top, 1, fh);
  }

  function paintGlass(g, b, r) { // newer commercial block: aluminium panels and tinted glass mirroring the sky
    const { x, w, top, fh } = b;
    const acp = g.createLinearGradient(x + w, top, x, GT);
    acp.addColorStop(0, '#efece5'); acp.addColorStop(1, '#b7b5b0');
    g.fillStyle = acp; g.fillRect(x, top, w, GT - top);
    for (let f = 1; f < b.floors; f++) {
      const yT = GT - f * fh, gy = yT + 5, gh = fh - 10, gx = x + 8, gw = w - 16;
      const gr = g.createLinearGradient(0, gy, 0, gy + gh);
      gr.addColorStop(0, '#f0cfa6'); gr.addColorStop(0.32, '#9db2b8'); gr.addColorStop(1, '#3e5866');
      g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
      g.fillStyle = 'rgba(38,50,62,0.32)'; // rooftops of the street opposite, mirrored
      for (let rx = gx; rx < gx + gw;) { const rw = Math.min(8 + r() * 16, gx + gw - rx), rh = gh * (0.22 + r() * 0.35); g.fillRect(rx, gy + gh - rh, rw, rh); rx += rw + 2 + r() * 4; }
      g.fillStyle = sh(0.35); g.fillRect(gx, gy, gw, 1.5);
      const n = Math.max(1, Math.round(gw / 14));
      g.fillStyle = '#8f9496';
      for (let i = 0; i <= n; i++) g.fillRect(gx + i * gw / n - 0.6, gy, 1.2, gh);
      g.fillRect(gx, gy + gh * 0.32, gw, 0.8);
      g.fillStyle = '#f6f4ee'; g.fillRect(x, yT + fh - 3, w, 3);
      g.fillStyle = sh(0.22); g.fillRect(x, yT + fh, w, 1.2);
    }
    g.fillStyle = lt(0.22); // sun glare sweeping across the glass
    g.beginPath(); g.moveTo(x + w * 0.55, top); g.lineTo(x + w * 0.75, top); g.lineTo(x + w * 0.25, GT); g.lineTo(x + w * 0.05, GT); g.closePath(); g.fill();
    g.fillStyle = lt(0.12);
    g.beginPath(); g.moveTo(x + w * 0.86, top); g.lineTo(x + w * 0.93, top); g.lineTo(x + w * 0.56, GT); g.lineTo(x + w * 0.49, GT); g.closePath(); g.fill();
    g.fillStyle = b.accent; g.fillRect(x + 2, top, 3.5, GT - top);
    stain(g, x, top, w, 10, 0.12);
  }

  function paintBanner(g, bn) { // vinyl banner tied across a floor (text drawn live)
    const { x, y, w, h, c } = bn;
    g.strokeStyle = 'rgba(40,30,30,0.6)'; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x - 2, y - 4); g.moveTo(x + w - 1, y); g.lineTo(x + w + 2, y - 4); g.stroke();
    g.fillStyle = sh(0.32); g.fillRect(x - 1.5, y + 1.5, w, h);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, tone(c, 0.22)); gr.addColorStop(1, tone(c, -0.18));
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = '#fde047'; g.fillRect(x, y + h - 2.2, w, 1.2);
    g.fillStyle = lt(0.45); g.fillRect(x, y, w, 0.8);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + w * 0.3, y, 2, h); g.fillRect(x + w * 0.72, y, 1.5, h);
  }

  function paintJali(g, b, bx, yT, yB) { // stairwell ventilation blocks
    const jx = bx + 4, jw = b.bw - 8, jy = yT + 4, jh = yB - yT - 7;
    g.fillStyle = tone(b.color, -0.05); g.fillRect(jx, jy, jw, jh);
    g.fillStyle = sh(0.5);
    for (let yy = jy + 1.5; yy < jy + jh - 2; yy += 4.2) for (let xx = jx + 1.5; xx < jx + jw - 2; xx += 4.2) g.fillRect(xx, yy, 2.4, 2.4);
    g.fillStyle = lt(0.3); g.fillRect(jx, jy + jh, jw, 1);
  }

  function paintWindow(g, b, cell, bx, yT, yB) {
    const wx = bx + 4, ww = b.bw - 8, wy = yT + 8, wh = yB - yT - 14;
    const gl = g.createLinearGradient(0, wy, 0, wy + wh);
    if (cell.dark) { gl.addColorStop(0, '#2a2226'); gl.addColorStop(1, '#3d3134'); }
    else { gl.addColorStop(0, '#c2ab98'); gl.addColorStop(0.45, '#7e8891'); gl.addColorStop(1, '#4a525c'); }
    g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
    if (!cell.dark) { // sky glint on the glass
      g.fillStyle = lt(0.2);
      g.beginPath(); g.moveTo(wx + ww * 0.55, wy); g.lineTo(wx + ww * 0.8, wy); g.lineTo(wx + ww * 0.35, wy + wh); g.lineTo(wx + ww * 0.1, wy + wh); g.closePath(); g.fill();
    }
    if (cell.curtain) {
      const cw = ww * (0.28 + cell.cOpen * 0.22);
      g.fillStyle = cell.curtain; g.fillRect(wx, wy, cw, wh); g.fillRect(wx + ww - cw * 0.8, wy, cw * 0.8, wh);
      g.fillStyle = sh(0.2); g.fillRect(wx + cw * 0.5, wy, 0.8, wh); g.fillRect(wx + ww - cw * 0.4, wy, 0.8, wh);
    }
    g.fillStyle = sh(0.38); g.fillRect(wx, wy, ww, 2); g.fillRect(wx + ww - 2, wy + 2, 2, wh - 2); // recess
    g.fillStyle = 'rgba(214,210,200,0.8)'; g.fillRect(wx + ww / 2 - 0.4, wy, 0.8, wh);             // sash
    // box grill with its shadow on the glass (down-left)
    g.fillStyle = sh(0.3);
    for (let gx = wx + 2; gx < wx + ww - 1; gx += 3.3) g.fillRect(gx - 1, wy + 1, 0.9, wh);
    g.fillStyle = b.grill;
    for (let gx = wx + 2; gx < wx + ww - 1; gx += 3.3) g.fillRect(gx, wy, 0.9, wh);
    g.fillRect(wx - 1, wy - 0.5, ww + 2, 1.2); g.fillRect(wx - 1, wy + wh * 0.5, ww + 2, 1); g.fillRect(wx - 1, wy + wh - 1, ww + 2, 1.2);
    g.fillRect(wx - 1, wy, 1.2, wh); g.fillRect(wx + ww - 0.2, wy, 1.2, wh);
    if (b.fancy) { g.strokeStyle = b.grill; g.lineWidth = 0.8; g.beginPath(); g.arc(wx + ww / 2, wy + wh * 0.5, ww * 0.28, Math.PI, TAU); g.stroke(); }
    if (cell.ac) { // split-AC outdoor unit hung on the grill
      const aw = Math.min(14, ww - 2), ah = 9, ax = wx + (ww - aw) / 2 + cell.acDx, ay = wy + wh - ah + 3;
      g.fillStyle = sh(0.3); g.fillRect(ax - 2, ay + 2, aw, ah);
      const ag = g.createLinearGradient(ax, 0, ax + aw, 0); ag.addColorStop(0, '#cbc6bc'); ag.addColorStop(1, '#f3efe6');
      g.fillStyle = ag; g.fillRect(ax, ay, aw, ah);
      TH.circle(g, ax + aw * 0.38, ay + ah / 2, ah * 0.34, '#6d6a66');
      g.strokeStyle = 'rgba(230,226,218,0.8)'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(ax + aw * 0.38 - 3, ay + ah / 2); g.lineTo(ax + aw * 0.38 + 3, ay + ah / 2); g.moveTo(ax + aw * 0.38, ay + ah / 2 - 3); g.lineTo(ax + aw * 0.38, ay + ah / 2 + 3); g.stroke();
      g.fillStyle = sh(0.22); g.fillRect(ax + aw * 0.72, ay + 2, aw * 0.18, ah - 4);
      g.fillStyle = lt(0.7); g.fillRect(ax, ay, aw, 0.9);
      stain(g, ax + aw * 0.7, ay + ah, 1.6, 15, 0.28);
    }
    // sunshade (chhajja) and its shadow
    g.fillStyle = sh(0.28);
    g.beginPath(); g.moveTo(wx - 3, wy - 1); g.lineTo(wx + ww + 3, wy - 1); g.lineTo(wx + ww, wy + 3); g.lineTo(wx - 6, wy + 3); g.closePath(); g.fill();
    g.fillStyle = tone(b.color, 0.1); g.fillRect(wx - 3, wy - 4, ww + 6, 3);
    g.fillStyle = lt(0.5); g.fillRect(wx - 3, wy - 4, ww + 6, 0.8);
    // sill
    g.fillStyle = tone(b.color, 0.08); g.fillRect(wx - 2, wy + wh, ww + 4, 2);
    g.fillStyle = sh(0.2); g.fillRect(wx - 3, wy + wh + 2, ww + 4, 1.2);
    if (cell.stain) stain(g, wx + cell.stain * ww, wy + wh + 2, 2.2, 8 + cell.stain * 12, 0.2);
  }

  function paintBalcony(g, b, cell, bx, yT, yB) {
    const bw = b.bw, ox = bx + 2, ow = bw - 4, oy = yT + 3, oh = yB - yT - 4, ry = yB - 11;
    const ig = g.createLinearGradient(0, oy, 0, oy + oh);
    ig.addColorStop(0, '#2b2327'); ig.addColorStop(1, '#4a3c3b');
    g.fillStyle = ig; g.fillRect(ox, oy, ow, oh);
    g.fillStyle = cell.door; g.fillRect(ox + ow * 0.18, oy + 3, ow * 0.36, oh - 4);
    g.fillStyle = sh(0.3); g.fillRect(ox + ow * 0.36, oy + 3, 0.7, oh - 4);
    g.fillStyle = sh(0.45); g.fillRect(ox, oy, ow, 3); g.fillRect(ox + ow - 3, oy, 3, oh);
    if (cell.clothes) {
      g.strokeStyle = 'rgba(30,24,24,0.7)'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(ox + 1, oy + 5); g.lineTo(ox + ow - 1, oy + 5.6); g.stroke();
      let cx = ox + 2.5;
      for (const cl of cell.clothes) {
        if (cx + cl.w > ox + ow - 2) break;
        g.fillStyle = cl.c;
        g.fillRect(cx, oy + 5.5, cl.w, cl.h);
        if (cl.shirt) g.fillRect(cx - 1.2, oy + 5.5, cl.w + 2.4, 2.4);
        g.fillStyle = sh(0.22); g.fillRect(cx, oy + 4.3 + cl.h, cl.w, 1.2);
        g.fillStyle = lt(0.3); g.fillRect(cx + cl.w - 0.8, oy + 5.5, 0.8, cl.h);
        cx += cl.w + 1.8;
      }
    }
    if (cell.person) {
      const px = ox + ow * 0.52;
      g.fillStyle = cell.person.shirt; TH.rr(g, px - 3.2, ry - 5, 6.4, 6, 2); g.fill();
      TH.circle(g, px, ry - 7.5, 2.5, cell.person.skin);
      g.fillStyle = '#1b1616'; g.beginPath(); g.arc(px, ry - 8, 2.6, Math.PI, TAU); g.fill();
    }
    if (b.rail === 'wall') {
      g.fillStyle = tone(b.color, 0.05); g.fillRect(bx, ry, bw, 10);
      g.fillStyle = lt(0.45); g.fillRect(bx, ry, bw, 1);
      g.fillStyle = sh(0.2); g.fillRect(bx, ry + 1, 1.2, 9);
    } else {
      g.fillStyle = sh(0.3); for (let gx = bx + 3; gx < bx + bw - 2; gx += 3) g.fillRect(gx - 0.8, ry + 1, 0.8, 9);
      g.fillStyle = b.grill; g.fillRect(bx + 1, ry, bw - 2, 1.5); g.fillRect(bx + 1, ry + 5, bw - 2, 0.8);
      for (let gx = bx + 3; gx < bx + bw - 2; gx += 3) g.fillRect(gx, ry, 0.9, 10);
    }
    if (cell.sari) { // sari drying over the railing
      const sx = bx + bw * 0.2, sw = bw * 0.42;
      g.fillStyle = cell.sari; g.fillRect(sx, ry - 1, sw, 12);
      g.fillStyle = '#e9c46a'; g.fillRect(sx, ry + 8, sw, 1.5);
      g.fillStyle = sh(0.18); g.fillRect(sx, ry - 1, 1, 12);
    }
    if (cell.plant) {
      const px = bx + bw * 0.78;
      g.fillStyle = '#b5562f'; g.fillRect(px - 2.5, ry - 3.5, 5, 3.5);
      TH.circle(g, px - 1, ry - 5.5, 3, '#4d7c3a'); TH.circle(g, px + 1.5, ry - 6.5, 2.4, '#79a85a');
    }
    if (cell.tolet) {
      const tx = bx + bw / 2;
      g.fillStyle = sh(0.25); g.fillRect(tx - 9, ry + 1, 16, 7);
      g.fillStyle = '#fbfaf3'; g.fillRect(tx - 8, ry, 16, 7);
    }
    // projecting balcony slab
    g.fillStyle = tone(b.color, 0.14); g.fillRect(bx - 1, yB - 1.5, bw + 2, 3);
    g.fillStyle = sh(0.3); g.fillRect(bx - 2, yB + 1.5, bw + 2, 2);
  }

  function paintRoof(g, b, r) {
    const { x, w, top } = b, R = b.roof, py = top - 7;
    if (R.stair) { // stair room (chilekotha)
      const sx = x + R.stair.dx, sw = R.stair.w, sy = py - R.stair.h;
      const sg = g.createLinearGradient(sx, 0, sx + sw, 0);
      sg.addColorStop(0, tone(b.color, -0.14)); sg.addColorStop(1, tone(b.color, 0.08));
      g.fillStyle = sg; g.fillRect(sx, sy, sw, top - sy);
      g.fillStyle = '#4a3a34'; g.fillRect(sx + sw * 0.22, sy + 5, sw * 0.3, top - sy - 5);
      g.fillStyle = sh(0.4); g.fillRect(sx + sw * 0.22, sy + 5, sw * 0.3, 1.5);
      g.fillStyle = sh(0.5); for (let i = 0; i < 3; i++) g.fillRect(sx + sw * 0.66, sy + 6 + i * 2.4, sw * 0.2, 1.2);
      g.fillStyle = tone(b.color, 0.18); g.fillRect(sx - 2, sy - 2.5, sw + 4, 2.5);
      g.fillStyle = sh(0.3); g.fillRect(sx - 1, sy, sw, 1.5);
      g.fillStyle = lt(0.35); g.fillRect(sx + sw - 1.2, sy, 1.2, top - sy);
    }
    for (const tk of R.tanks) {
      const cx = x + tk.dx;
      let base = py - 4;
      if (tk.onStair) base = py - R.stair.h - 2.5;
      else { g.fillStyle = '#3a3334'; g.fillRect(cx - tk.w / 2 + 2, base, 1.6, 5); g.fillRect(cx + tk.w / 2 - 3.6, base, 1.6, 5); }
      paintTank(g, cx, base, tk);
    }
    if (R.dish) {
      const dx = x + R.dish.dx, d = R.dish;
      g.strokeStyle = '#5b5b60'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(dx, py); g.lineTo(dx, py - 10); g.stroke();
      const dg = g.createLinearGradient(dx - d.r, 0, dx + d.r, 0); dg.addColorStop(0, '#9a9a9e'); dg.addColorStop(1, '#ececec');
      g.fillStyle = dg; g.beginPath(); g.ellipse(dx, py - 13, d.r, d.r * 0.55, d.rot, 0, TAU); g.fill();
      g.strokeStyle = '#6b6b70'; g.lineWidth = 0.6; g.stroke();
      g.beginPath(); g.moveTo(dx, py - 13); g.lineTo(dx - d.r * 0.6, py - 13 - d.r * 0.9); g.stroke();
      g.fillStyle = '#4a4a4f'; g.fillRect(dx - d.r * 0.6 - 1.2, py - 14.5 - d.r * 0.9, 2.4, 2.4);
    }
    if (R.antenna > 0) {
      const ax = x + R.antenna;
      g.strokeStyle = '#4d4a4c'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(ax, py); g.lineTo(ax, py - 26);
      for (let i = 0; i < 5; i++) { const hw = 7 - i; g.moveTo(ax - hw, py - 25 + i * 3); g.lineTo(ax + hw, py - 25 + i * 3); }
      g.stroke();
    }
    if (R.line) { // rooftop clothesline
      const lx = x + R.line.dx, len = R.line.len;
      g.strokeStyle = '#5b4a40'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, py); g.lineTo(lx, py - 16); g.moveTo(lx + len, py); g.lineTo(lx + len, py - 16); g.stroke();
      g.strokeStyle = 'rgba(40,30,30,0.7)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(lx, py - 15); g.quadraticCurveTo(lx + len / 2, py - 12, lx + len, py - 15); g.stroke();
      let cx = lx + 3;
      for (const cl of R.line.clothes) {
        if (cx + cl.w > lx + len - 2) break;
        g.fillStyle = cl.c; g.fillRect(cx, py - 14, cl.w, cl.h);
        g.fillStyle = lt(0.3); g.fillRect(cx + cl.w - 0.8, py - 14, 0.8, cl.h);
        cx += cl.w + 2;
      }
    }
    if (R.kid) { // boy flying a kite
      const kx = x + R.kid;
      g.fillStyle = '#e76f51'; TH.rr(g, kx - 2.4, py - 7, 4.8, 7, 1.5); g.fill();
      TH.circle(g, kx, py - 9.6, 2.3, '#8d5a3b');
      g.fillStyle = '#1b1616'; g.beginPath(); g.arc(kx, py - 10, 2.4, Math.PI, TAU); g.fill();
      g.strokeStyle = '#8d5a3b'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(kx + 1.5, py - 6); g.lineTo(kx + 3.4, py - 12.5); g.stroke();
    }
    // parapet (solid wall or railing)
    if (R.rail) {
      g.fillStyle = b.grill; g.fillRect(x, py, w, 1.4); g.fillRect(x, py + 3.5, w, 0.8);
      for (let px = x + 2; px < x + w; px += 7) g.fillRect(px, py, 1, 7);
      g.fillStyle = tone(b.color, 0.2); g.fillRect(x, top - 1.5, w, 1.5);
    } else {
      g.fillStyle = tone(b.color, 0.04); g.fillRect(x, py, w, 7);
      g.fillStyle = tone(b.color, 0.24); g.fillRect(x - 1, py - 1.5, w + 2, 2);
      g.fillStyle = sh(0.25); g.fillRect(x, py + 0.5, w, 1.2);
      g.fillStyle = lt(0.35); g.fillRect(x + w - 1.5, py, 1.5, 7);
      stain(g, x, py + 1.7, w, 5, 0.18);
    }
    if (R.rebar) { // columns waiting for the next floor
      g.strokeStyle = '#5b3a2a'; g.lineWidth = 0.8;
      g.beginPath();
      for (const cx of [x + 3, x + w / 2, x + w - 3]) for (let i = -1; i <= 1; i++) {
        const h = 8 + r() * 6;
        g.moveTo(cx + i * 1.3, py); g.lineTo(cx + i * 1.3, py - h); g.lineTo(cx + i * 1.3 + (r() - 0.5) * 3, py - h - 2);
      }
      g.stroke();
    }
    if (R.plants) for (const pdx of R.plants) {
      const px = x + pdx;
      g.fillStyle = '#b5562f'; g.beginPath(); g.moveTo(px - 3, py - 5); g.lineTo(px + 3, py - 5); g.lineTo(px + 2.2, py - 1.5); g.lineTo(px - 2.2, py - 1.5); g.closePath(); g.fill();
      TH.circle(g, px - 1.5, py - 7, 3.2, '#4d7c3a'); TH.circle(g, px + 1.8, py - 8, 2.6, '#6f9e4f'); TH.circle(g, px + 2.4, py - 8.8, 1.2, '#9cc47a');
    }
  }

  function paintTank(g, cx, by, tk) {
    const tw = tk.w, th = tk.h, tx = cx - tw / 2, ty = by - th, col = tk.c;
    g.fillStyle = sh(0.25); g.fillRect(tx - 2.5, by - 1, tw, 2.5);
    if (tk.box) { // concrete tank
      const bg = g.createLinearGradient(tx, 0, tx + tw, 0); bg.addColorStop(0, tone(col, -0.2)); bg.addColorStop(1, tone(col, 0.12));
      g.fillStyle = bg; g.fillRect(tx, ty, tw, th);
      g.fillStyle = tone(col, 0.25); g.fillRect(tx - 1, ty - 1.5, tw + 2, 2);
      stain(g, tx, ty + 0.5, tw, th * 0.6, 0.25);
      return;
    }
    const tg = g.createLinearGradient(tx, 0, tx + tw, 0);
    tg.addColorStop(0, tone(col, -0.3)); tg.addColorStop(0.62, tone(col, 0.12)); tg.addColorStop(0.82, tone(col, 0.38)); tg.addColorStop(1, tone(col, 0.02));
    g.fillStyle = tg; TH.rr(g, tx, ty + 2, tw, th - 2, 2.5); g.fill();
    g.fillStyle = sh(0.32);
    for (let i = 1; i < 4; i++) g.fillRect(tx + 0.5, ty + 2 + i * (th - 2) / 4, tw - 1, 0.8);
    g.fillStyle = tone(col, 0.12); g.beginPath(); g.ellipse(cx, ty + 2, tw / 2, 2.2, 0, 0, TAU); g.fill();
    g.fillStyle = tone(col, 0.3); g.fillRect(cx - 2.5, ty - 0.5, 5, 2);
    g.strokeStyle = '#8a8a8a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(tx + tw - 2, by - 1); g.lineTo(tx + tw + 2, by + 4); g.stroke();
  }

  function paintShop(g, sp, r) {
    const ox = sp.x0 + 3, ow = sp.x1 - sp.x0 - 6, oy = 259;
    const ig = g.createLinearGradient(0, oy, 0, 300);
    if (sp.type === 'pharmacy') { ig.addColorStop(0, '#e4ede6'); ig.addColorStop(1, '#b8c8be'); }
    else { ig.addColorStop(0, '#2c221e'); ig.addColorStop(1, '#4a382d'); }
    g.fillStyle = ig; g.fillRect(ox, oy, ow, 41);
    const tg = g.createRadialGradient(ox + ow / 2, oy + 3, 0, ox + ow / 2, oy + 3, ow * 0.6);
    tg.addColorStop(0, 'rgba(255,245,215,0.35)'); tg.addColorStop(1, 'rgba(255,245,215,0)');
    g.fillStyle = tg; g.fillRect(ox, oy, ow, 41);
    g.fillStyle = 'rgba(255,252,240,0.95)'; g.fillRect(ox + ow * 0.3, oy + 2, ow * 0.4, 1.4); // tube light
    paintGoods(g, sp, ox, ow, r);
    g.fillStyle = sh(0.35); g.fillRect(ox + ow - 2.5, oy, 2.5, 41);
    if (sp.sy > oy) paintShutter(g, ox, ow, oy, sp.sy, sp.shutterC, r);
    if (sp.awning) paintAwning(g, ox, ow, sp.awning);
    paintHanging(g, sp, ox, ow, r);
    if (sp.mini) { // small hanging board (text drawn live)
      const m = sp.mini;
      g.strokeStyle = 'rgba(40,30,30,0.7)'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(m.x + 3, 258); g.lineTo(m.x + 3, m.y); g.moveTo(m.x + m.w - 3, 258); g.lineTo(m.x + m.w - 3, m.y); g.stroke();
      g.fillStyle = sh(0.3); g.fillRect(m.x - 1.5, m.y + 1.5, m.w, m.h);
      g.fillStyle = '#fbfaf3'; g.fillRect(m.x, m.y, m.w, m.h);
      g.strokeStyle = '#b91c1c'; g.lineWidth = 0.6; g.strokeRect(m.x + 1, m.y + 1, m.w - 2, m.h - 2);
    }
  }

  function paintGoods(g, sp, ox, ow, r) {
    const t = sp.type;
    const shelves = (ys, light, h0, h1) => {
      for (const yy of ys) {
        g.fillStyle = light ? '#f4f1ea' : '#6b4a32'; g.fillRect(ox + 2, yy, ow - 4, 1.3);
        for (let xx = ox + 3; xx < ox + ow - 5;) {
          const iw = 2.5 + r() * 3, ih = h0 + r() * (h1 - h0);
          g.fillStyle = light ? ['#ffffff', '#dbeafe', '#bbf7d0', '#fde68a', '#fecaca'][(r() * 5) | 0] : GOODS[(r() * GOODS.length) | 0];
          g.fillRect(xx, yy - ih, iw, ih);
          xx += iw + 0.6;
        }
      }
    };
    const tables = () => {
      g.fillStyle = '#6b4a32'; g.fillRect(ox + ow * 0.45, 284, ow * 0.45, 2.2);
      g.fillRect(ox + ow * 0.48, 286, 1.5, 10); g.fillRect(ox + ow * 0.86, 286, 1.5, 10);
      g.fillStyle = '#c9ced3'; g.fillRect(ox + ow * 0.58, 279, 3.5, 5); g.fillRect(ox + ow * 0.7, 281, 2, 3);
      g.fillStyle = '#f5efe0'; g.fillRect(ox + ow * 0.62, 265, 16, 9);
      g.fillStyle = sh(0.4); for (let i = 0; i < 3; i++) g.fillRect(ox + ow * 0.62 + 2, 267 + i * 2.2, 12, 0.7);
    };
    if (t === 'grocery') {
      shelves([270, 281, 292], false, 4, 8);
      for (let i = 0; i < 3; i++) { // rice and lentil sacks
        const sx = ox + 3 + i * 10;
        g.fillStyle = ['#d8c7a0', '#cdb98c', '#e2d3ad'][i]; TH.rr(g, sx, 289, 9, 11, 3); g.fill();
        g.fillStyle = ['#f4f1e6', '#e0a458', '#c9a227'][i]; g.beginPath(); g.ellipse(sx + 4.5, 290, 4, 1.5, 0, 0, TAU); g.fill();
      }
    } else if (t === 'variety') {
      shelves([272, 284], false, 5, 9);
      const cx = ox + ow - 14; // stacked plastic chairs
      for (let j = 0; j < 4; j++) { g.fillStyle = j % 2 ? '#c81e1e' : '#a51515'; TH.rr(g, cx, 276 + j * 1.8, 11, 9, 2); g.fill(); }
      g.fillStyle = '#a51515'; g.fillRect(cx + 1, 285, 1.5, 15); g.fillRect(cx + 8.5, 285, 1.5, 15);
      for (let j = 0; j < 3; j++) { g.fillStyle = ['#2563eb', '#16a34a', '#f59e0b'][j]; g.fillRect(ox + 4, 291 - j * 4, 12 - j, 4); }
    } else if (t === 'hotel') {
      tables();
      const sx = ox + 3, sw = Math.min(40, ow * 0.42); // glass showcase: parota and singara
      g.fillStyle = '#8b939b'; g.fillRect(sx, 280, sw, 20);
      g.fillStyle = 'rgba(215,235,240,0.35)'; g.fillRect(sx + 1.5, 281.5, sw - 3, 11);
      for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#d9a441' : '#e8c27a'; g.beginPath(); g.ellipse(sx + 5 + i * (sw - 10) / 4, 290, 3.2, 1.5, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#c98a2e';
      for (let i = 0; i < 4; i++) { const tx = sx + 6 + i * (sw - 12) / 3; g.beginPath(); g.moveTo(tx - 2.5, 287); g.lineTo(tx + 2.5, 287); g.lineTo(tx, 283.5); g.closePath(); g.fill(); }
      g.fillStyle = lt(0.55); g.fillRect(sx + sw - 4, 281.5, 1, 11);
    } else if (t === 'biryani') {
      tables();
      const px = ox + ow * 0.3, py = 300; // the big deg with a red cloth over the lid
      g.fillStyle = '#3a3030'; g.fillRect(px - 13, py - 5, 26, 5);
      const pg = g.createLinearGradient(px - 13, 0, px + 13, 0); pg.addColorStop(0, '#7d8288'); pg.addColorStop(0.72, '#eceef0'); pg.addColorStop(1, '#9ea3a8');
      g.fillStyle = pg; g.beginPath(); g.ellipse(px, py - 13, 13, 9, 0, 0, TAU); g.fill();
      g.fillStyle = '#b91c1c'; g.beginPath(); g.ellipse(px, py - 21, 10, 3.8, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(px - 10, py - 21); g.quadraticCurveTo(px - 11, py - 16.5, px - 7, py - 15.5); g.lineTo(px + 7, py - 15.5); g.quadraticCurveTo(px + 11, py - 16.5, px + 10, py - 21); g.closePath(); g.fill();
      g.fillStyle = '#f5d76e'; g.fillRect(px - 8, py - 17.5, 16, 1);
      g.fillStyle = lt(0.6); g.fillRect(px + 7, py - 17, 1.4, 8);
    } else if (t === 'pharmacy') {
      shelves([268, 277], true, 3, 6);
      g.fillStyle = 'rgba(190,220,228,0.7)'; g.fillRect(ox + 2, 285, ow - 4, 15);
      g.fillStyle = '#8b939b'; g.fillRect(ox + 2, 285, ow - 4, 1.5); g.fillRect(ox + 2, 292, ow - 4, 0.8);
      g.fillStyle = lt(0.7); g.fillRect(ox + ow - 8, 286.5, 1, 12);
    } else if (t === 'tailor') {
      for (const [y0, h] of [[262, 12], [277, 11]]) {
        g.fillStyle = '#6b4a32'; g.fillRect(ox + 2, y0 + h, ow - 4, 1.3);
        for (let xx = ox + 3; xx < ox + ow - 6; xx += 4.4) { g.fillStyle = CLOTH[(r() * CLOTH.length) | 0]; g.fillRect(xx, y0, 3.8, h); }
      }
      const px = ox + ow * 0.72; // panjabi on a hanger
      g.strokeStyle = '#3a3030'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(px, 262); g.lineTo(px, 267); g.stroke();
      g.fillStyle = '#f1ead8'; g.fillRect(px - 4.5, 268, 9, 22); g.fillRect(px - 7.5, 268, 15, 4); g.fillRect(px - 7.5, 268, 3, 12); g.fillRect(px + 4.5, 268, 3, 12);
      g.fillStyle = sh(0.18); g.fillRect(px - 0.4, 270, 0.8, 8);
    } else if (t === 'sweets') {
      shelves([270], true, 4, 7);
      g.fillStyle = '#8b939b'; g.fillRect(ox + 2, 281, ow - 4, 19);
      g.fillStyle = 'rgba(232,242,242,0.4)'; g.fillRect(ox + 3.5, 282.5, ow - 7, 14);
      const SW = ['#f7f1e3', '#5a2418', '#e3a54a', '#f2d7a0', '#e0708a'];
      for (let row = 0; row < 2; row++) for (let xx = ox + 6, i = 0; xx < ox + ow - 5; xx += 4, i++) TH.circle(g, xx, 288 + row * 5, 1.6, SW[(Math.floor(i / 3) + row) % SW.length]);
      g.fillStyle = lt(0.6); g.fillRect(ox + ow - 7, 283, 1, 13);
    } else if (t === 'mobile') {
      for (let i = 0; i < 3; i++) { // phone posters on the back wall
        const px = ox + 4 + i * (ow - 8) / 3, pw = (ow - 8) / 3 - 3;
        g.fillStyle = ['#e11d48', '#7c3aed', '#0ea5e9'][i]; g.fillRect(px, 263, pw, 14);
        g.fillStyle = '#111827'; TH.rr(g, px + pw * 0.6, 265, pw * 0.3, 10, 1.2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(px + 2, 266, pw * 0.4, 1.2); g.fillRect(px + 2, 269, pw * 0.3, 1);
      }
      g.fillStyle = 'rgba(190,225,255,0.55)'; g.fillRect(ox + 2, 284, ow - 4, 16);
      g.fillStyle = '#111827'; for (let xx = ox + 6; xx < ox + ow - 6; xx += 7) g.fillRect(xx, 288, 3, 5);
      g.fillStyle = '#8b939b'; g.fillRect(ox + 2, 284, ow - 4, 1.2);
    } else if (t === 'hardware') {
      g.fillStyle = '#9ca3af'; for (let i = 0; i < 4; i++) g.fillRect(ox + 3, 265 + i * 2.5, ow - 6, 1.4);
      g.fillStyle = '#f4f4f0'; for (let i = 0; i < 3; i++) g.fillRect(ox + 3, 276 + i * 2.5, ow * 0.6, 1.4);
      for (let i = 0; i < 4; i++) { // paint buckets
        const bx = ox + 4 + i * 9;
        g.fillStyle = ['#2563eb', '#dc2626', '#f8fafc', '#16a34a'][i]; g.fillRect(bx, 290, 8, 10);
        g.fillStyle = '#6b7280'; g.fillRect(bx - 0.5, 289, 9, 1.5);
      }
      g.strokeStyle = '#15803d'; g.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(ox + ow - 12, 292, 7 - i * 1.5, 4 - i, 0, 0, TAU); g.stroke(); }
    }
  }

  function paintShutter(g, ox, ow, oy, sy, col, r) {
    const hgt = sy - oy;
    const sg = g.createLinearGradient(ox, 0, ox + ow, 0);
    sg.addColorStop(0, tone(col, -0.14)); sg.addColorStop(1, tone(col, 0.12));
    g.fillStyle = sg; g.fillRect(ox, oy, ow, hgt);
    g.fillStyle = sh(0.28); for (let y = oy + 2; y < sy - 2; y += 2.6) g.fillRect(ox, y, ow, 0.7);
    g.fillStyle = lt(0.2); for (let y = oy + 2.8; y < sy - 2; y += 2.6) g.fillRect(ox, y, ow, 0.5);
    for (let i = 0; i < 2; i++) { // rust streaks
      const rx = ox + r() * (ow - 3), ry = oy + r() * hgt * 0.4, rh = hgt * (0.3 + r() * 0.4);
      const rg = g.createLinearGradient(0, ry, 0, ry + rh);
      rg.addColorStop(0, 'rgba(140,70,30,0.35)'); rg.addColorStop(1, 'rgba(140,70,30,0)');
      g.fillStyle = rg; g.fillRect(rx, ry, 2, rh);
    }
    g.fillStyle = tone(col, -0.32); g.fillRect(ox, sy - 2.5, ow, 2.5);
    g.fillStyle = '#2b2b2b'; g.fillRect(ox + ow * 0.25, sy - 1.5, 3, 1.5); g.fillRect(ox + ow * 0.72, sy - 1.5, 3, 1.5);
    if (sy < 300) { g.fillStyle = sh(0.45); g.fillRect(ox, sy, ow, 2.2); }
  }

  function paintAwning(g, ox, ow, aw) {
    const y0 = 258, y1 = 267, x0 = ox - 2, x1 = ox + ow + 2;
    g.save();
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1 + 4, y1); g.lineTo(x0 - 4, y1); g.closePath(); g.clip();
    g.fillStyle = aw[0]; g.fillRect(x0 - 5, y0, x1 - x0 + 10, y1 - y0);
    g.fillStyle = aw[1]; for (let sx = x0 - 4; sx < x1 + 4; sx += 8) g.fillRect(sx, y0, 4, y1 - y0);
    const sg = g.createLinearGradient(0, y0, 0, y1); sg.addColorStop(0, lt(0.3)); sg.addColorStop(1, sh(0.25));
    g.fillStyle = sg; g.fillRect(x0 - 5, y0, x1 - x0 + 10, y1 - y0);
    g.restore();
    g.fillStyle = aw[0]; // scalloped hem
    for (let sx = x0 - 2; sx < x1 + 3; sx += 4) { g.beginPath(); g.arc(sx, y1, 2, 0, Math.PI); g.fill(); }
    stain(g, ox, y1 + 2, ow, 5, 0.4);
  }

  function paintHanging(g, sp, ox, ow, r) {
    if (sp.type !== 'grocery' && sp.type !== 'variety') return;
    const m = sp.mini, left = ox + 5 + (m && m.x < ox + ow / 2 ? 36 : 0), right = ox + ow - (m && m.x > ox + ow / 2 ? 40 : 6);
    const n = Math.max(3, Math.floor((right - left) / 12));
    for (let i = 0; i < n; i++) {
      const hx = left + i * (right - left) / Math.max(1, n - 1), top = sp.awning ? 268 : 259;
      g.strokeStyle = 'rgba(30,20,20,0.6)'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(hx, top); g.lineTo(hx, top + 22); g.stroke();
      if (sp.type === 'grocery') { // strings of chips packets
        for (let j = 0; j < 3; j++) {
          g.fillStyle = GOODS[(r() * GOODS.length) | 0]; g.fillRect(hx - 2.8, top + 2 + j * 6.8, 5.6, 5.8);
          g.fillStyle = lt(0.5); g.fillRect(hx + 1.2, top + 2.6 + j * 6.8, 1, 4.4);
        }
      } else { // plastic buckets and mugs
        const c = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#db2777'][(r() * 5) | 0];
        g.fillStyle = c; g.beginPath(); g.moveTo(hx - 4, top + 5); g.lineTo(hx + 4, top + 5); g.lineTo(hx + 3, top + 13); g.lineTo(hx - 3, top + 13); g.closePath(); g.fill();
        g.fillStyle = tone(c, 0.3); g.fillRect(hx - 4, top + 5, 8, 1.2);
        g.fillStyle = lt(0.4); g.fillRect(hx + 1.8, top + 6, 1, 6);
      }
    }
  }

  function paintSign(g, sp) {
    const x = sp.sx0, w = sp.sx1 - sp.sx0, y = 237, h = 20;
    g.fillStyle = sh(0.35); g.fillRect(x - 1.5, y + 2, w, h);
    const sg = g.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, tone(sp.signC, 0.24)); sg.addColorStop(0.5, sp.signC); sg.addColorStop(1, tone(sp.signC, -0.2));
    g.fillStyle = sg; g.fillRect(x, y, w, h);
    g.strokeStyle = sp.border; g.lineWidth = 1; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = lt(0.5); g.fillRect(x, y, w, 1);
    g.fillStyle = 'rgba(80,55,40,0.14)'; g.fillRect(x, y + h - 5, w, 5); // dust
    if (sp.icon) { // pharmacy cross
      const cx = x + 10, cy = y + h / 2;
      g.fillStyle = sp.icon; g.fillRect(cx - 4, cy - 1.4, 8, 2.8); g.fillRect(cx - 1.4, cy - 4, 2.8, 8);
    }
    g.fillStyle = '#d4d4d4'; for (const bx of [x + 3.5, x + w - 3.5]) { g.beginPath(); g.arc(bx, y + 3.5, 0.8, 0, TAU); g.fill(); }
  }

  function paintBillboard(g, bb) {
    if (!bb) return;
    const { x, y, w, h } = bb, legY = bb.roof - 7;
    for (const lx of [x + 20, x + w - 20]) { // truss legs down to the roof
      g.strokeStyle = '#4a4648'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(lx - 4, y + h); g.lineTo(lx - 4, legY); g.moveTo(lx + 4, y + h); g.lineTo(lx + 4, legY); g.stroke();
      g.lineWidth = 0.7; g.beginPath();
      for (let yy = y + h + 5, i = 0; yy < legY; yy += 5, i++) { g.moveTo(lx + (i % 2 ? 4 : -4), yy); g.lineTo(lx + (i % 2 ? -4 : 4), Math.min(legY, yy + 5)); }
      g.stroke();
    }
    g.fillStyle = sh(0.3); g.fillRect(x - 6, y + 1, w + 6, h + 5);
    g.fillStyle = '#3a3a40'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    const pg = g.createLinearGradient(x, y, x + w, y + h);
    pg.addColorStop(0, '#12707a'); pg.addColorStop(1, '#0b3a4d');
    g.fillStyle = pg; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(253,224,71,0.85)'; // golden swoosh
    g.beginPath(); g.moveTo(x, y + h - 6); g.quadraticCurveTo(x + w * 0.45, y + h - 22, x + w, y + h - 16); g.lineTo(x + w, y + h - 12); g.quadraticCurveTo(x + w * 0.45, y + h - 16, x, y + h - 2); g.closePath(); g.fill();
    const tx = x + w * 0.7, tw = w * 0.2; // apartment tower illustration
    g.fillStyle = '#efe7d4'; g.fillRect(tx, y + 6, tw, h - 12); g.fillRect(tx + tw, y + 16, tw * 0.55, h - 22);
    g.fillStyle = '#2a6f7a';
    for (let yy = y + 9; yy < y + h - 8; yy += 4) for (let i = 0; i < 3; i++) g.fillRect(tx + 2 + i * (tw - 3) / 3, yy, (tw - 3) / 3 - 1.5, 2);
    g.fillStyle = sh(0.25); g.fillRect(tx, y + 6, 1.5, h - 12);
    TH.circle(g, tx - 4, y + h - 10, 5, '#3f8f4a'); TH.circle(g, tx - 7, y + h - 8, 4, '#56a85c');
    g.fillStyle = '#c1121f'; // ribbon for "booking open"
    g.beginPath(); g.moveTo(x + 6, y + 38); g.lineTo(x + w * 0.56, y + 38); g.lineTo(x + w * 0.6, y + 44); g.lineTo(x + w * 0.56, y + 50); g.lineTo(x + 6, y + 50); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,230,190,0.1)'; g.fillRect(x, y, w, h); // sun-faded
    g.fillStyle = lt(0.5); g.fillRect(x + w + 1.5, y - 3, 1.5, h + 6);
    g.fillStyle = '#4a4648'; g.fillRect(x - 6, y + h + 3, w + 12, 2.5); // catwalk
    g.fillRect(x - 6, y + h - 3, w + 12, 0.8);
    for (let px = x - 5; px < x + w + 6; px += 12) g.fillRect(px, y + h - 3, 0.8, 6);
    for (let i = 0; i < 3; i++) { // flood lamps on arms
      const lx = x + w * (0.2 + i * 0.3);
      g.strokeStyle = '#4a4648'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, y - 3); g.quadraticCurveTo(lx, y - 10, lx + 6, y - 11); g.stroke();
      g.fillStyle = '#2d2d33'; g.fillRect(lx + 4, y - 13, 6, 3.5);
      g.fillStyle = lt(0.6); g.fillRect(lx + 4.5, y - 10, 5, 0.8);
    }
  }

  // live text on the backdrop (drawn every frame so the Bangla web font is always used)
  function drawBackText(ctx, s) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const sp of s.shops) { // centred in the part of the board not hidden by street furniture
      const [x0, x1] = sp.tspan, cx = (x0 + x1) / 2;
      if (x1 - x0 < 30) continue;
      ctx.font = `700 ${x1 - x0 < 80 ? 10 : 11.5}px ${TH.FONT}`;
      if (sp.shadow) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(sp.name, cx + 0.7, 247.9, x1 - x0); }
      ctx.fillStyle = sp.textC; ctx.fillText(sp.name, cx, 247.2, x1 - x0);
    }
    ctx.font = `700 8.5px ${TH.FONT}`; ctx.fillStyle = '#ffffff';
    for (const bn of s.banners) ctx.fillText(bn.text, bn.x + bn.w / 2, bn.y + bn.h / 2 - 0.8, bn.w - 8);
    ctx.font = `700 6px ${TH.FONT}`; ctx.fillStyle = '#b91c1c';
    for (const sp of s.shops) if (sp.mini) ctx.fillText(sp.mini.text, sp.mini.x + sp.mini.w / 2, sp.mini.y + sp.mini.h / 2 + 0.3, sp.mini.w - 3);
    if (s.tolet) { ctx.font = `700 5.5px ${TH.FONT}`; ctx.fillStyle = '#c1121f'; ctx.fillText('টু-লেট', s.tolet.x, s.tolet.y, 14); }
    const b = s.billboard;
    if (b) {
      ctx.textAlign = 'left';
      ctx.font = `700 14px ${TH.FONT}`; ctx.fillStyle = '#fde047'; ctx.fillText('স্বপ্নের ঠিকানা', b.x + 7, b.y + 14, b.w * 0.6);
      ctx.font = `500 8px ${TH.FONT}`; ctx.fillStyle = '#f1f5f9'; ctx.fillText('রেডি ফ্ল্যাট বিক্রয় চলছে · বাড্ডা', b.x + 7, b.y + 28, b.w * 0.6);
      ctx.textAlign = 'center';
      ctx.font = `700 7.5px ${TH.FONT}`; ctx.fillStyle = '#ffffff'; ctx.fillText('বুকিং চলছে!', b.x + 6 + (b.w * 0.56 - 6) / 2, b.y + 44.3, b.w * 0.5);
    }
  }

  // ---------- footpath layer (poles, wires, stall, van) ----------
  function paintMid(g, s) {
    paintStall(g, s.stall);
    paintVan(g, s.van);
    for (const p of s.poles) paintPole(g, p);
    for (const w of s.wires) {
      g.strokeStyle = w.c; g.lineWidth = w.lw;
      g.beginPath(); g.moveTo(w.x1, w.y1); g.quadraticCurveTo((w.x1 + w.x2) / 2, Math.max(w.y1, w.y2) + w.sag, w.x2, w.y2); g.stroke();
      if (w.lw > 1.35) { // sun glints along the thick lines
        g.strokeStyle = lt(0.22); g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(w.x1, w.y1 - 0.6); g.quadraticCurveTo((w.x1 + w.x2) / 2, Math.max(w.y1, w.y2) + w.sag - 0.6, w.x2, w.y2 - 0.6); g.stroke();
      }
    }
    for (const d of s.drops) { // service lines into the flats
      g.strokeStyle = d.c; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(d.x1, d.y1); g.quadraticCurveTo((d.x1 + d.x2) / 2, Math.max(d.y1, d.y2) + d.sag, d.x2, d.y2); g.lineTo(d.x2, d.y2 + 6); g.stroke();
      g.fillStyle = '#1f1d1e'; g.fillRect(d.x2 - 2, d.y2 - 1.5, 4, 3.5);
    }
    for (const p of s.poles) paintPoleGear(g, p);
  }

  function paintPole(g, p) {
    const x = p.x, y0 = 116, y1 = 346;
    g.fillStyle = sh(0.22); g.beginPath(); g.ellipse(x - 6, 345.5, 11, 2, 0, 0, TAU); g.fill();
    const pg = g.createLinearGradient(x - 6, 0, x + 6, 0);
    pg.addColorStop(0, '#6f6a66'); pg.addColorStop(0.55, '#aaa59c'); pg.addColorStop(0.8, '#d3cdc1'); pg.addColorStop(1, '#8d8882');
    g.fillStyle = pg;
    g.beginPath(); g.moveTo(x - 3.2, y0); g.lineTo(x + 3.2, y0); g.lineTo(x + 5.5, y1); g.lineTo(x - 5.5, y1); g.closePath(); g.fill();
    g.fillStyle = '#e9e6de'; g.fillRect(x - 5.1, 318, 10.2, 7); // painted base bands
    g.fillStyle = '#26262b'; g.fillRect(x - 5.3, 325, 10.6, 7);
    g.fillStyle = '#e9e6de'; g.fillRect(x - 5.4, 332, 10.8, 7);
    stain(g, x - 5.5, 346, 11, -22, 0.3);
    g.fillStyle = sh(0.25); for (let y = 140; y < 316; y += 22) g.fillRect(x - 4, y, 8, 0.8); // mould seams
    if (p.poster) { // pasted bills
      g.fillStyle = p.poster.c; g.fillRect(x - 6, p.poster.y, 12, 15);
      g.fillStyle = 'rgba(190,30,30,0.7)'; g.fillRect(x - 4.5, p.poster.y + 3, 9, 1.4); g.fillRect(x - 4.5, p.poster.y + 6.5, 6, 1); g.fillRect(x - 4.5, p.poster.y + 9, 8, 1);
      g.fillStyle = sh(0.2); g.fillRect(x - 6, p.poster.y + 12, 12, 3);
    }
  }

  function paintPoleGear(g, p) {
    const x = p.x;
    for (const [y, hw, ins] of [[130, 22, [-17, -6, 6, 17]], [146, 14, [-11, 11]]]) { // cross-arms + insulators
      g.fillStyle = '#55555b'; g.fillRect(x - hw, y, hw * 2, 3.5);
      g.fillStyle = lt(0.35); g.fillRect(x - hw, y, hw * 2, 0.8);
      g.strokeStyle = '#55555b'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - hw + 4, y + 3.5); g.lineTo(x, y + 12); g.lineTo(x + hw - 4, y + 3.5); g.stroke();
      for (const d of ins) {
        g.fillStyle = '#e7e1d4'; g.fillRect(x + d - 1.6, y - 4, 3.2, 4);
        g.fillStyle = '#b9b2a4'; g.fillRect(x + d - 2.4, y - 2.5, 4.8, 1); g.fillRect(x + d - 2.4, y - 4.6, 4.8, 1);
      }
    }
    for (const c of p.coils) { // spare cable coiled on the pole
      g.strokeStyle = c.c; g.lineWidth = c.lw;
      g.beginPath(); g.ellipse(x + c.dx, c.y, c.rx, c.ry, c.rot, 0, TAU); g.stroke();
    }
    g.strokeStyle = '#1b1819'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x + p.loop.dx - 4, p.loop.y); g.quadraticCurveTo(x + p.loop.dx, p.loop.y + p.loop.len * 2, x + p.loop.dx + 5, p.loop.y); g.stroke();
    for (const b of p.boxes) { // splitter / ONU boxes
      const bx = x + b.dx - b.w / 2;
      g.fillStyle = sh(0.3); g.fillRect(bx - 1.5, b.y + 1.5, b.w, b.h);
      const bg = g.createLinearGradient(bx, 0, bx + b.w, 0); bg.addColorStop(0, tone(b.c, -0.2)); bg.addColorStop(1, tone(b.c, 0.15));
      g.fillStyle = bg; g.fillRect(bx, b.y, b.w, b.h);
      g.fillStyle = sh(0.3); g.fillRect(bx + 1.5, b.y + b.h * 0.6, b.w - 3, 0.8);
      TH.circle(g, bx + b.w - 2.5, b.y + 2.5, 0.8, '#22c55e');
    }
    if (p.trans) paintTransformer(g, x);
    const d = p.lamp; // street lamp on a curved arm
    g.strokeStyle = '#5a5a60'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, 124); g.quadraticCurveTo(x + d * 14, 106, x + d * 30, 110); g.stroke();
    g.fillStyle = '#3f3f46'; g.beginPath(); g.ellipse(x + d * 32, 111.5, 7, 2.6, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,248,220,0.85)'; g.fillRect(x + d * 32 - 4, 113, 8, 1.2);
    g.fillStyle = '#6b6b72'; g.fillRect(x - 4, 115, 8, 2.5); // pole cap
  }

  function paintTransformer(g, x) {
    const y = 210;
    g.fillStyle = '#4b4b50'; g.fillRect(x - 15, y - 3, 30, 2.5); g.fillRect(x - 15, y + 30, 30, 2.5);
    g.strokeStyle = '#222'; g.lineWidth = 0.8; g.beginPath();
    for (const dx of [-6, 0, 6]) { g.moveTo(x + dx, y - 8); g.quadraticCurveTo(x + dx * 1.8, y - 30, x + dx * 1.9, 146); }
    g.stroke();
    for (const dx of [-6, 0, 6]) { g.fillStyle = '#8a4b2e'; g.fillRect(x + dx - 1.3, y - 8, 2.6, 7); g.fillStyle = '#b5704b'; g.fillRect(x + dx - 2, y - 6, 4, 1); }
    const tg = g.createLinearGradient(x - 12, 0, x + 12, 0);
    tg.addColorStop(0, '#5c6763'); tg.addColorStop(0.68, '#95a29c'); tg.addColorStop(0.88, '#bcc8c1'); tg.addColorStop(1, '#6e7a75');
    g.fillStyle = tg; TH.rr(g, x - 11, y, 22, 30, 2); g.fill();
    g.fillStyle = '#56605c';
    for (let i = 0; i < 4; i++) { g.fillRect(x - 15, y + 3 + i * 6.5, 4, 3.5); g.fillRect(x + 11, y + 3 + i * 6.5, 4, 3.5); }
    g.fillStyle = '#7d8984'; g.fillRect(x - 12.5, y - 2, 25, 3);
    g.fillStyle = '#facc15'; g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x + 5, y + 18); g.lineTo(x - 5, y + 18); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + 0.8, y + 11.5); g.lineTo(x - 1, y + 14.5); g.lineTo(x + 1, y + 14.5); g.lineTo(x - 0.8, y + 17); g.stroke();
    stain(g, x - 7, y + 30, 3, 18, 0.3);
  }

  function paintStall(g, st) { // tea stall (tong): booth, jars, kettle on a clay stove, bench
    const x = st.x, by = st.base;
    g.fillStyle = sh(0.22); g.beginPath(); g.ellipse(x + 28, by + 0.5, 44, 3.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#4a311e'; g.fillRect(x + 10, 290, 2, by - 291); g.fillRect(x + 48, 290, 2, by - 291);
    g.fillStyle = '#5b3d25'; g.fillRect(x + 2, 290, 3, by - 290); g.fillRect(x + 55, 290, 3, by - 290);
    g.fillStyle = '#2d2421'; g.fillRect(x + 1, 242, 58, 28);
    // hanging bananas and shampoo-sachet strips
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + 8, 242); g.lineTo(x + 8, 246); g.stroke();
    g.strokeStyle = '#e8c33a'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + 4.5 + i * 1.8, 246 + (i % 2) * 1.5, 5, 0.25 * Math.PI, 0.7 * Math.PI); g.stroke(); }
    g.lineCap = 'butt';
    for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) { g.fillStyle = ['#e11d48', '#0ea5e9', '#facc15', '#22c55e'][(i + j * 2) % 4]; g.fillRect(x + 49 + j * 4.5, 243 + i * 3.3, 3.6, 2.9); }
    // the tea seller behind the counter
    const sx = x + 33;
    g.fillStyle = '#efeae0'; TH.rr(g, sx - 7, 257, 14, 14, 3); g.fill();
    g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(sx - 7, 258); g.lineTo(sx - 2, 258); g.lineTo(sx + 3, 270); g.lineTo(sx - 2, 270); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(sx - 4, 261, 3, 0.7); g.fillRect(sx - 2.6, 265, 3, 0.7);
    TH.circle(g, sx, 251.5, 4.4, '#8d5a3b');
    g.fillStyle = '#f5f2ea'; g.beginPath(); g.ellipse(sx, 248.5, 4.4, 2.6, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#2a2020'; g.beginPath(); g.arc(sx, 253.5, 3.6, 0.15 * Math.PI, 0.85 * Math.PI); g.fill(); // beard
    g.strokeStyle = '#8d5a3b'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx - 6, 261); g.lineTo(sx - 11, 268); g.stroke(); g.lineCap = 'butt';
    // counter box: painted planks, sunlit from the right
    const bg = g.createLinearGradient(x, 0, x + 60, 0); bg.addColorStop(0, '#2c5a62'); bg.addColorStop(1, '#4f8c96');
    g.fillStyle = bg; g.fillRect(x, 271, 60, 20);
    g.fillStyle = sh(0.3); for (let y = 276; y < 291; y += 5) g.fillRect(x, y, 60, 0.8);
    g.fillStyle = '#e9c46a'; g.fillRect(x, 283.5, 60, 1.4);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 8, 278, 10, 3); g.fillRect(x + 36, 286, 14, 2);
    g.fillStyle = '#b8895a'; g.fillRect(x - 2, 269, 64, 3);
    g.fillStyle = lt(0.55); g.fillRect(x - 2, 269, 64, 0.8);
    for (let i = 0; i < 3; i++) { // biscuit jars
      const jx = x + 3 + i * 7.5;
      g.fillStyle = 'rgba(215,232,238,0.55)'; TH.rr(g, jx, 259, 6.5, 10, 1.5); g.fill();
      g.fillStyle = st.jars[i]; g.fillRect(jx + 0.8, 262.5, 4.9, 6);
      g.fillStyle = ['#c1121f', '#1d4ed8', '#f59e0b'][i]; g.fillRect(jx - 0.3, 257.5, 7.1, 2.2);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(jx + 4.8, 260, 0.9, 7.5);
    }
    for (const cx of [x + 45, x + 50.5]) { g.fillStyle = '#f5f1e8'; g.fillRect(cx, 265.5, 3.4, 3.6); g.fillStyle = '#7a4a2a'; g.fillRect(cx + 0.4, 265.5, 2.6, 0.9); }
    // side posts and corrugated tin roof
    g.fillStyle = '#6b4a2e'; g.fillRect(x - 1, 240, 2.5, 31); g.fillRect(x + 58.5, 240, 2.5, 31);
    g.fillStyle = '#7b6f66';
    g.beginPath(); g.moveTo(x - 7, 241); g.lineTo(x + 67, 237); g.lineTo(x + 68, 241.5); g.lineTo(x - 7, 245.5); g.closePath(); g.fill();
    g.fillStyle = sh(0.3); for (let i = 0; i < 25; i++) g.fillRect(x - 6 + i * 3, 241 - i * 0.16, 0.8, 4.3);
    g.fillStyle = 'rgba(150,80,40,0.45)'; g.fillRect(x + 10, 240, 12, 4); g.fillRect(x + 44, 238.5, 8, 3.5);
    g.fillStyle = lt(0.55); g.beginPath(); g.moveTo(x - 7, 241); g.lineTo(x + 67, 237); g.lineTo(x + 67, 238); g.lineTo(x - 7, 242); g.closePath(); g.fill();
    // little "cha" board on the roof (text drawn live)
    g.fillStyle = '#4a311e'; g.fillRect(x + 22, 231, 1.5, 8); g.fillRect(x + 38, 230, 1.5, 8);
    g.fillStyle = sh(0.3); TH.rr(g, x + 15.5, 224, 27, 11, 2); g.fill();
    g.fillStyle = '#b91c1c'; TH.rr(g, x + 17, 222.5, 27, 11, 2); g.fill();
    g.fillStyle = lt(0.45); g.fillRect(x + 18, 223, 25, 0.8);
    // kettle on a clay stove, on a small stand to the right
    const kx = x + 73;
    g.fillStyle = '#5b3d25'; g.fillRect(x + 63, 294, 20, 2.5); g.fillRect(x + 64, 296, 2, by - 296); g.fillRect(x + 80, 296, 2, by - 296);
    const cg = g.createLinearGradient(kx - 7, 0, kx + 7, 0); cg.addColorStop(0, '#6e3b22'); cg.addColorStop(1, '#a8623a');
    g.fillStyle = cg; TH.rr(g, kx - 7, 284, 14, 10, 2); g.fill();
    g.fillStyle = '#2a1510'; g.fillRect(kx - 3.5, 288, 7, 4);
    g.fillStyle = 'rgba(30,20,20,0.5)'; g.beginPath(); g.ellipse(kx, 283.5, 6.5, 1.8, 0, 0, TAU); g.fill();
    const kg = g.createLinearGradient(kx - 7, 0, kx + 7, 0); kg.addColorStop(0, '#8d9196'); kg.addColorStop(0.7, '#eceef0'); kg.addColorStop(1, '#a9adb2');
    g.fillStyle = kg; g.beginPath(); g.ellipse(kx, 279, 7, 5.5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#a4a8ad'; g.lineWidth = 2; g.beginPath(); g.moveTo(kx - 5, 280); g.quadraticCurveTo(kx - 9, 279, kx - 11, 274); g.stroke();
    g.fillStyle = '#c7cacd'; g.fillRect(kx - 3.5, 273, 7, 1.8); TH.circle(g, kx, 272.4, 1.2, '#55595e');
    g.strokeStyle = '#3f3f46'; g.lineWidth = 1.2; g.beginPath(); g.arc(kx, 276, 5.5, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    // bench in front, with a cup and a folded newspaper
    const b0 = x - 4, b1 = x + 46;
    g.fillStyle = sh(0.22); g.beginPath(); g.ellipse((b0 + b1) / 2 - 3, 324.5, 29, 2.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#4a311e'; g.fillRect(b0 + 7, 316, 1.8, 6); g.fillRect(b1 - 9, 316, 1.8, 6);
    g.fillStyle = '#5b3d25'; g.fillRect(b0 + 3, 316, 2.2, 8); g.fillRect(b1 - 5, 316, 2.2, 8);
    const pg = g.createLinearGradient(0, 312.5, 0, 316.5); pg.addColorStop(0, '#b07e4f'); pg.addColorStop(1, '#7a5233');
    g.fillStyle = pg; g.fillRect(b0, 312.5, b1 - b0, 4);
    g.fillStyle = lt(0.45); g.fillRect(b0, 312.5, b1 - b0, 0.8);
    g.fillStyle = '#f5f1e8'; g.fillRect(b0 + 10, 309.5, 3, 3);
    g.fillStyle = '#e4dccb'; g.fillRect(b1 - 20, 311, 11, 1.6);
  }

  function paintWheel(g, cx, cy, r) {
    g.strokeStyle = '#1c1c1c'; g.lineWidth = 2.2; g.beginPath(); g.arc(cx, cy, r - 1, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(205,205,205,0.6)'; g.lineWidth = 0.5; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 6, c = Math.cos(a) * (r - 2), s = Math.sin(a) * (r - 2); g.moveTo(cx + c, cy + s); g.lineTo(cx - c, cy - s); }
    g.stroke();
    TH.circle(g, cx, cy, 1.4, '#9ca3af');
  }

  function paintVan(g, v) { // parked fruit van: flatbed tricycle loaded with malta and bananas
    const x = v.x, by = v.base;
    g.fillStyle = sh(0.24); g.beginPath(); g.ellipse(x + 38, by + 0.5, 46, 3.2, 0, 0, TAU); g.fill();
    paintWheel(g, x + 26, by - 9, 9);
    paintWheel(g, x + 78, by - 8, 8);
    g.strokeStyle = '#2f3b4a'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + 26, by - 9); g.lineTo(x + 56, by - 18); g.lineTo(x + 68, by - 30);
    g.moveTo(x + 56, by - 18); g.lineTo(x + 78, by - 8); g.lineTo(x + 80, by - 34); g.moveTo(x + 68, by - 30); g.lineTo(x + 79, by - 29); g.stroke();
    g.strokeStyle = '#1f1f1f'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + 76, by - 35); g.lineTo(x + 84, by - 36); g.stroke();
    g.fillStyle = '#1f1f1f'; TH.rr(g, x + 63, by - 34, 10, 3, 1.5); g.fill();
    g.fillStyle = '#8a5a33'; g.fillRect(x, by - 24, 56, 4);
    g.fillStyle = '#2f6fb0'; g.fillRect(x, by - 20, 56, 3);
    g.fillStyle = '#e9c46a'; g.fillRect(x + 4, by - 19, 48, 0.8);
    g.fillStyle = lt(0.4); g.fillRect(x, by - 24, 56, 0.8);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) { // malta pyramid
      const r = 2.9, cx = x + 3 + r + row * r + i * r * 2, cy = by - 24 - r - row * r * 1.7;
      TH.circle(g, cx, cy, r, row % 2 ? '#d98a2b' : '#e89a33');
      TH.circle(g, cx + r * 0.35, cy - r * 0.35, r * 0.35, 'rgba(255,232,176,0.75)');
    }
    g.lineCap = 'round'; // banana bunches
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = i % 2 ? '#e6bf2e' : '#f2cf46'; g.lineWidth = 2.4;
      g.beginPath(); g.arc(x + 38 + (i % 3) * 5, by - 34 + Math.floor(i / 3) * 4, 8, 0.2 * Math.PI, 0.55 * Math.PI); g.stroke();
    }
    g.lineCap = 'butt';
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(v.cardX, v.cardY + 4); g.lineTo(v.cardX, by - 26); g.stroke();
    g.fillStyle = sh(0.3); g.fillRect(v.cardX - 13.5, v.cardY - 3, 26, 8);
    g.fillStyle = '#fbfaf3'; g.fillRect(v.cardX - 12, v.cardY - 4.5, 24, 8);
  }

  // ---------- live footpath animation ----------
  function drawCrow(ctx, c, t) {
    const cw = c.caw > 0 ? Math.sin((1 - c.caw / 0.55) * Math.PI) : 0, bob = Math.sin(t * 2.2 + c.ph) * 0.4;
    const k = '#16151a';
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.dir * c.sc, c.sc);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-1, -3.5); ctx.lineTo(-1.5, 0); ctx.moveTo(1.5, -3.5); ctx.lineTo(1.5, 0); ctx.stroke();
    ctx.fillStyle = k;
    ctx.beginPath(); ctx.moveTo(-4, -6.5); ctx.lineTo(-12.5, -2.5 + cw * 2); ctx.lineTo(-11.5, -0.5 + cw * 2); ctx.lineTo(-3, -3.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -7 + bob, 7, 4.5, -0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6a6570'; ctx.beginPath(); ctx.ellipse(4.2, -10 + bob, 3.6, 3, -0.4, 0, TAU); ctx.fill(); // grey collar
    const hx = 6.3, hy = -12.6 + bob - cw * 1.5;
    TH.circle(ctx, hx, hy, 3.2, k);
    ctx.fillStyle = '#0c0b0e';
    ctx.beginPath(); ctx.moveTo(hx + 2.4, hy - 1.2); ctx.lineTo(hx + 7.5, hy - 0.2 - cw * 2); ctx.lineTo(hx + 2.8, hy + 0.4); ctx.closePath(); ctx.fill();
    if (cw > 0.1) { ctx.beginPath(); ctx.moveTo(hx + 2.4, hy + 0.6); ctx.lineTo(hx + 6.5, hy + 1.8 + cw * 1.5); ctx.lineTo(hx + 2.4, hy + 1.6); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(175,170,205,0.4)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(-0.5, -7.5 + bob, 5, 3, -0.28, -1.6, -0.2); ctx.stroke();
    TH.circle(ctx, hx + 1.1, hy - 0.7, 0.7, '#d8d0c0');
    ctx.restore();
  }

  function drawDog(ctx, d, t, G) { // street dog napping by the tea stall; now and then it looks up and wags
    const x = d.x, y = d.y, cyc = (t + d.ph) % 12;
    const up = cyc < 4 ? Math.min(1, cyc * 2, (4 - cyc) * 2) : 0;
    const breathe = Math.sin(t * 2.1) * 0.35;
    ctx.fillStyle = 'rgba(40,26,34,0.28)'; ctx.beginPath(); ctx.ellipse(x - 3, y, 21, 2.6, 0, 0, TAU); ctx.fill();
    const wag = Math.sin(t * (up > 0 ? 11 : 2.5)) * (up > 0 ? 0.6 : 0.2);
    ctx.save(); ctx.translate(x + 14, y - 5); ctx.rotate(-0.5 + wag);
    ctx.strokeStyle = d.c2; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -1, 9, -5); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = G.dog;
    ctx.beginPath(); ctx.ellipse(x + 2, y - 5.5, 13.5, Math.max(1, 5.5 + breathe), 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 9, y - 4, 6, 4.2, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = d.c1;
    TH.rr(ctx, x - 18, y - 3.4, 13, 3, 1.5); ctx.fill();
    TH.rr(ctx, x - 16, y - 2, 11, 2.6, 1.3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,232,196,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + 2, y - 5.5, 13.5, 5.5, 0, -2.1, -0.5); ctx.stroke(); // sunlit back
    const hx = x - 12, hy = y - 6.5 - up * 4.5;
    ctx.fillStyle = d.c1; ctx.beginPath(); ctx.ellipse(hx, hy, 5.2, 4.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = d.c3; ctx.beginPath(); ctx.ellipse(hx - 4.6, hy + 1.3, 3.4, 2.4, 0.1, 0, TAU); ctx.fill();
    TH.circle(ctx, hx - 7.6, hy + 0.7, 1.1, '#1a1414');
    ctx.fillStyle = d.c2;
    ctx.beginPath(); ctx.moveTo(hx + 0.5, hy - 3.8); ctx.lineTo(hx + 4.6, hy - 2 - up * 1.5); ctx.lineTo(hx + 2.6, hy + 1.4); ctx.closePath(); ctx.fill();
    if (up > 0.5) TH.circle(ctx, hx - 1.8, hy - 1, 0.9, '#1a1414');
    else { ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 0.8); ctx.lineTo(hx - 0.8, hy - 0.6); ctx.stroke(); }
  }

  function drawSteam(ctx, st, t) {
    ctx.fillStyle = '#fffaf0';
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.55 + i / 4) % 1;
      ctx.globalAlpha = 0.4 * (1 - u) * Math.min(1, u * 6);
      ctx.beginPath(); ctx.arc(st.spoutX - 1 - u * 5 + Math.sin(u * 6 + i * 2 + t) * 2, st.spoutY - 2 - u * 20, 1.6 + u * 4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255,150,50,${(0.55 + 0.3 * Math.sin(t * 13) * Math.sin(t * 7.3)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(st.fireX, st.fireY, 3.2, 1.8, 0, 0, TAU); ctx.fill();
  }

  // ---------- flying birds ----------
  function spawnFlock(s) {
    const dir = Math.random() < 0.5 ? 1 : -1, n = 3 + ((Math.random() * 5) | 0), birds = [];
    for (let i = 0; i < n; i++) birds.push({ dx: -dir * (i * 13 + Math.random() * 8), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 6 + Math.random() * 4, ph: Math.random() * TAU, sz: 3.5 + Math.random() * 2.5 });
    s.flock = { x: dir > 0 ? -30 : W + 30, y: 80 + Math.random() * 90, vx: dir * (45 + Math.random() * 30), vy: (Math.random() - 0.5) * 6, birds };
  }

  // ---------- road definition ----------
  TH.roads.push({
    id: 'badda',
    order: 1,
    name: 'বাড্ডা',
    nameEn: 'Badda',
    tagline: 'দোকান, জট আর তারের জঙ্গল',
    weights: { wrongway: 3, footpath: 3, phone: 1, overload: 1, overcharge: 1, tesla: 1 },
    street: {},

    init(rng) {
      const R = (a, b) => a + rng() * (b - a);
      const rp = (a) => a[(rng() * a.length) | 0];
      const chance = (p) => rng() < p;
      const seed = () => (rng() * 2147483647) | 0;
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const sunZone = (x0, x1, pad) => x1 > SUN.x - pad && x0 < SUN.x + pad;
      const clothes = () => Array.from({ length: 2 + ((rng() * 3) | 0) }, () => ({ c: rp(CLOTH), w: R(3.5, 6.5), h: R(5, 10), shirt: chance(0.35) }));

      // distant skyline: hazy towers, then a nearer row of mid-rise blocks
      const far1 = [];
      for (let x = -10; x < W + 10;) {
        const w = R(26, 62);
        far1.push({ x, w, top: sunZone(x, x + w, 50) ? R(132, 175) : R(66, 175), c: rp(['#ad949b', '#b69c97', '#a8959f', '#b9a29a']), cap: chance(0.4), mast: chance(0.15) });
        x += w + R(-4, 10);
      }
      const far2 = [];
      for (let x = -10; x < W + 10;) {
        const w = R(40, 88);
        far2.push({ x, w, top: sunZone(x, x + w, 45) ? R(152, 200) : R(126, 200), c: rp(['#9c8584', '#a38a86', '#958489', '#aa918a']), cols: Math.max(2, Math.round(w / 15)), tank: chance(0.5) ? R(0.2, 0.75) : -1 });
        x += w + R(0, 14);
      }

      // the street row: 4-7 storey flats with shops below
      const bs = [];
      for (let x = -12; x < W + 8;) {
        const w = R(96, 166);
        bs.push({ x, w, floors: rp([4, 5, 5, 6, 6, 7]), fh: rp([28, 29, 30, 31]) });
        x += w + (chance(0.3) ? R(3, 6) : 0);
      }
      const at = (px) => bs.find((b) => px >= b.x && px < b.x + b.w) || bs[0];
      for (const b of bs) if (sunZone(b.x, b.x + b.w, 45)) b.floors = Math.min(b.floors, 4); // keep the sun in view
      const bbB = bs.find((b) => b.x + b.w / 2 > 320 && b.x + b.w / 2 < 480) || at(400);
      bbB.floors = 4; bbB.billboard = true;
      let kiteB = bs.find((b) => !b.billboard && b.x + b.w / 2 > 40 && b.x + b.w / 2 < 300 && b.floors <= 5) || at(150);
      if (kiteB.billboard) kiteB = null; else kiteB.floors = Math.min(kiteB.floors, 5);
      const glassB = shuffle(bs.filter((b) => !b.billboard && b !== kiteB && b.floors >= 5 && !sunZone(b.x, b.x + b.w, 45)))[0];
      if (glassB) glassB.glass = true;

      const allShops = [];
      for (const b of bs) {
        while (GT - (b.floors - 1) * b.fh < 58) b.floors--;
        b.top = GT - (b.floors - 1) * b.fh;
        b.raw = !b.glass && chance(0.3);
        b.color = b.glass ? '#d8d6cf' : b.raw ? rp(RAW) : rp(PAINT);
        b.accent = b.glass ? rp(['#1d4ed8', '#c1121f', '#0f766e']) : b.raw ? tone(b.color, -0.12) : chance(0.5) ? rp(ACCENT) : tone(b.color, 0.25);
        b.grill = rp(GRILL); b.fancy = chance(0.4); b.rail = chance(0.5) ? 'wall' : 'grill';
        b.brick = b.floors >= 5 && !b.billboard && !b.glass && chance(0.22);
        b.seed = seed();
        b.m = 6;
        b.nb = Math.max(2, Math.round((b.w - 12) / R(26, 34)));
        b.bw = (b.w - 12) / b.nb;
        // bay columns keep their type on every floor, like real facades
        const pattern = rp(['win', 'balc', 'mix', 'mix']), colType = [];
        for (let c = 0; c < b.nb; c++) colType.push(pattern === 'win' ? 'win' : pattern === 'balc' ? (c % 2 ? 'win' : 'balc') : chance(0.45) ? 'balc' : 'win');
        if (b.nb >= 4 && chance(0.6)) colType[1 + ((rng() * (b.nb - 2)) | 0)] = 'jali';
        b.cells = [];
        for (let f = 1; f < b.floors; f++) for (let c = 0; c < b.nb; c++) {
          const k = colType[c], balc = k === 'balc';
          b.cells.push({
            k, f, c, dark: chance(0.3), curtain: chance(0.55) ? rp(CURT) : null, cOpen: rng(),
            ac: k === 'win' && chance(0.22), acDx: R(-2, 2), stain: chance(0.4) ? R(0.1, 0.9) : 0,
            clothes: balc && chance(0.5) ? clothes() : null, sari: balc && chance(0.18) ? rp(CLOTH) : null,
            plant: balc && chance(0.3), person: balc && chance(0.06) ? { skin: rp(SKIN), shirt: rp(CLOTH) } : null,
            door: rp(['#6b4a34', '#7c5a3f', '#4d6b6a', '#8a8f7a']), tolet: false,
          });
        }
        // rooftop: stair room, water tanks, dish, antenna, clothesline, rebar, plants
        const w = b.w, roof = { tanks: [] };
        roof.stair = !b.billboard && chance(0.5) ? { dx: R(8, w - 40), w: R(24, 32), h: R(15, 19) } : null;
        const nt = chance(0.85) ? 1 + (chance(0.35) ? 1 : 0) : 0;
        for (let i = 0; i < nt; i++) {
          const t = { c: rp(['#26262c', '#26262c', '#2d5fa8', '#c8c1b3']), w: R(13, 18), h: R(14, 19) };
          t.box = t.c === '#c8c1b3';
          if (i === 0 && roof.stair) { t.onStair = true; t.dx = roof.stair.dx + roof.stair.w / 2; }
          else if (roof.stair) t.dx = roof.stair.dx > w / 2 ? R(12, roof.stair.dx - 12) : R(roof.stair.dx + roof.stair.w + 12, w - 12);
          else t.dx = b.billboard ? (i ? w - 12 : 12) : R(12, w - 12);
          t.dx = Math.max(10, Math.min(w - 10, t.dx));
          roof.tanks.push(t);
        }
        roof.dish = !b.billboard && chance(0.55) ? { dx: R(8, w - 10), r: R(5, 8), rot: R(-0.8, -0.3) } : null;
        roof.antenna = !b.billboard && chance(0.25) ? R(10, w - 10) : -1;
        roof.line = !b.billboard && chance(0.3) ? { dx: R(6, w * 0.45), len: R(30, 48), clothes: clothes() } : null;
        roof.rebar = b.brick || (!b.glass && chance(0.25));
        roof.plants = chance(0.35) ? Array.from({ length: 1 + ((rng() * 3) | 0) }, () => R(6, w - 8)) : null;
        roof.rail = !b.glass && chance(0.3);
        roof.kid = b === kiteB ? R(w * 0.3, w * 0.7) : 0;
        b.roof = roof;
        // one or two shops on the ground floor
        const edges = w > 136 ? [[b.x + 4, b.x + w / 2 - 2], [b.x + w / 2 + 2, b.x + w - 4]] : [[b.x + 4, b.x + w - 4]];
        b.shops = edges.map(([x0, x1]) => ({
          x0, x1, sx0: x0 - 1, sx1: x1 + 1, state: rp(['half', 'half', 'open', 'open', 'low', 'closed']),
          shutterC: rp(['#9aa0a6', '#9aa0a6', '#8c9399', '#4f7aa8', '#5e8a6a']), awning: chance(0.4) ? rp(AWN) : null,
        }));
        allShops.push(...b.shops);
      }

      // shop names: the three signature boards go to the most visible boards; no blue board behind the blue one-way sign
      const vis = (sp) => { const f = freeSpan(sp.sx0 + 5, sp.sx1 - 5, SIGN_OCC); return f[1] - f[0]; };
      const byVis = allShops.slice().sort((a, b) => vis(b) - vis(a));
      const extra = shuffle(Object.keys(SHOP).filter((n) => !KEEP.includes(n)));
      const top3 = shuffle(KEEP.slice());
      byVis.forEach((sp, i) => { sp.name = i < KEEP.length ? top3[i] : extra[(i - KEEP.length) % extra.length]; });
      const behindSign = (sp) => sp.x1 > 200 && sp.x0 < 302;
      for (const sp of allShops) if (behindSign(sp) && SHOP[sp.name].blue) {
        const ok = (q) => !behindSign(q) && !SHOP[q.name].blue;
        const o = byVis.find((q) => ok(q) && KEEP.includes(q.name)) || byVis.find(ok);
        if (o) [sp.name, o.name] = [o.name, sp.name];
      }
      for (const sp of allShops) {
        const d = SHOP[sp.name];
        Object.assign(sp, { type: d.type, signC: d.sign, textC: d.text, border: d.border, icon: d.icon || null, shadow: d.sign !== '#f8fafc' && d.sign !== '#f59e0b' });
        if (sp.icon && hits(sp.sx0 + 3, sp.sx0 + 17, SIGN_OCC)) sp.icon = null; // no pharmacy cross half-hidden behind a pole
        sp.tspan = freeSpan(sp.sx0 + (sp.icon ? 18 : 5), sp.sx1 - 5, SIGN_OCC);
        if (['hotel', 'biryani', 'sweets', 'pharmacy'].includes(d.type) && (sp.state === 'closed' || sp.state === 'low')) sp.state = 'open';
        sp.sy = sp.state === 'open' ? 262 : sp.state === 'half' ? R(272, 278) : sp.state === 'low' ? R(284, 289) : 300;
        sp.mini = null;
        if (d.mini && sp.x1 - sp.x0 > 56) { // small hanging board on whichever side is not behind a pole or the signal
          const mx = [sp.x1 - 38, sp.x0 + 7].find((x) => !hits(x - 2, x + 33, SIGN_OCC));
          if (mx !== undefined) sp.mini = { x: mx, y: 268, w: 31, h: 9, text: d.mini };
        }
      }

      // first-floor vinyl banners (clinics, coaching...), clear of the one-way sign, the signal and the transformer
      const BANNERS = [['কোচিং সেন্টার', '#0e7490'], ['ডেন্টাল কেয়ার', '#be123c'], ['বিউটি পার্লার', '#a21caf'], ['ডায়াগনস্টিক সেন্টার', '#4338ca'], ['ফিটনেস জিম', '#1f2937'], ['কাজী অফিস', '#15803d'], ['ট্রাভেলস এজেন্সি', '#b45309']];
      const bpick = shuffle(BANNERS.slice()), banners = [];
      const bOcc = BANNER_OCC.concat([[-1e4, 4], [W - 4, 1e4]], POLES.map((p) => [p - 6, p + 6])); // no pole through the lettering
      for (const b of shuffle(bs.filter((q) => !q.glass))) {
        if (banners.length >= 3) break;
        const [f0, f1] = freeSpan(b.x + 6, b.x + b.w - 6, bOcc), w = Math.min(f1 - f0, R(84, 124));
        if (w < 72) continue;
        const x = f0 + (f1 - f0 - w) * R(0.35, 0.65), [text, c] = bpick[banners.length];
        b.banner = { x, y: GT - 14.5, w, h: 12, c, text, f: 1 }; // first floor, below the wire tangle
        banners.push(b.banner);
      }

      // a "To-let" notice on some balcony railing
      let tolet = null;
      const cand = [];
      for (const b of bs) for (const c of b.cells) {
        const cx = b.x + b.m + (c.c + 0.5) * b.bw;
        if (b.glass || (b.banner && b.banner.f === c.f)) continue;
        const hidden = hits(cx - 10, cx + 10, c.f === 1 ? [[190, 312], [STALL_X + 10, STALL_X + 50], [640, 692], [806, 854]] : [[640, 692]]); // sign, cha board, signal, transformer
        if (c.k === 'balc' && c.f <= 3 && !(b.brick && c.f === b.floors - 1) && !hidden && cx > 20 && cx < W - 20) cand.push([b, c, cx]);
      }
      if (cand.length) { const [b, c, cx] = rp(cand); c.tolet = true; tolet = { x: cx, y: GT - (c.f - 1) * b.fh - 7.5 }; }

      const billboard = (() => { const w = Math.min(152, bbB.w + 26); return { x: bbB.x + bbB.w / 2 - w / 2, y: bbB.top - 84, w, h: 56, roof: bbB.top }; })();
      let kite = null;
      if (kiteB) {
        const hx = kiteB.x + kiteB.roof.kid + 3.4, hy = kiteB.top - 7 - 12.5, dir = hx > 120 ? -1 : 1;
        kite = { hx, hy, x: hx + dir * R(30, 60), y: Math.max(66, kiteB.top - R(62, 82)), c1: rp(['#e63946', '#7b2cbf', '#0077b6']), c2: rp(['#ffd166', '#f1faee', '#90e0ef']) };
      }
      // landmarks peeking over the low roofs: a minaret, a tower crane, a mobile tower
      const low = shuffle(bs.filter((b) => !b.billboard && b.top >= 112 && !sunZone(b.x, b.x + b.w, 60) && b.x > 20 && b.x + b.w < W - 20));
      const lx = (i, d) => (low[i] ? low[i].x + low[i].w * R(0.3, 0.7) : d);
      const minaret = { x: lx(0, 560), top: R(66, 80) };
      const crane = { x: lx(1, 160), top: R(60, 74), dir: chance(0.5) ? 1 : -1 };
      if (crane.x + crane.dir * 94 > 800 || crane.x + crane.dir * 94 < 10) crane.dir *= -1;
      const tower = { x: lx(2, 720), top: R(58, 72) };

      // poles, wires and the tangle
      const coils = () => Array.from({ length: 7 }, () => ({ dx: R(-12, 12), y: R(160, 197), rx: R(4, 11), ry: R(2.5, 6.5), rot: R(-0.5, 0.5), lw: R(0.9, 1.9), c: rp(WIRE) }));
      const poles = POLES.map((x, i) => ({
        x, lamp: i === 2 ? -1 : 1, trans: i === 2, coils: coils(),
        boxes: Array.from({ length: 1 + (chance(0.6) ? 1 : 0) }, (_, j) => ({ dx: j ? R(3, 7) : R(-8, -3), y: R(168, 196), w: R(7, 10), h: R(9, 13), c: rp(['#e5e7eb', '#a3a8ae', '#3f4650']) })),
        loop: { dx: R(-8, 8), y: R(186, 198), len: R(8, 14) },
        poster: chance(0.8) ? { y: R(250, 282), c: rp(['#fef3c7', '#fde68a', '#dbeafe', '#fce7f3', '#dcfce7']) } : null,
      }));
      const anchors = [-40, ...POLES, W + 40], wires = [];
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i + 1], lim = a < 296 && b > 206 ? 198 : 214; // stay above the one-way sign
        const add = (x1, y1, x2, y2, sag, c, lw) => {
          const hi = Math.max(y1, y2);
          if ((y1 + y2 + 2 * (hi + sag)) / 4 > lim) sag = Math.max(2, (4 * lim - y1 - y2) / 2 - hi);
          wires.push({ x1, y1, x2, y2, sag, c, lw });
        };
        for (const d of [-17, -6, 6, 17]) add(a + d, 126, b + d, 126, R(14, 20), '#2a2426', 1.5);
        for (const d of [-11, 11]) add(a + d, 142, b + d, 142, R(18, 26), '#2e2829', 1.2);
        for (let j = 0; j < 8; j++) add(a + R(-3, 3), R(152, 196), b + R(-3, 3), R(152, 196), R(8, 44), rp(WIRE), R(0.7, 1.5));
        for (let j = 0; j < 2; j++) { // twisted bundles
          const y1 = R(160, 190), y2 = R(160, 190), sg = R(16, 36);
          for (let q = 0; q < 3; q++) add(a, y1 + q * 1.3, b, y2 + q * 1.1, sg + q * 0.8, '#1f1c1d', 0.9);
        }
      }
      const drops = [];
      for (const p of POLES) for (let j = 0; j < 3; j++) {
        let x2 = p + (chance(0.5) ? 1 : -1) * R(40, 150);
        if (x2 > 190 && x2 < 312) x2 = x2 < 251 ? 188 : 314;
        x2 = Math.max(8, Math.min(W - 8, x2));
        drops.push({ x1: p + R(-3, 3), y1: R(152, 184), x2, y2: R(194, 211), sag: R(4, 12), c: rp(WIRE) });
      }
      const crows = [];
      for (const cx of [146, 252, 302, 319, 548, 606, 752, 948]) {
        const span = wires.filter((w) => w.x1 <= cx - 8 && w.x2 >= cx + 8);
        if (!span.length) continue;
        const w = rp(span);
        crows.push({ x: cx, y: wireY(w, cx), dir: chance(0.5) ? 1 : -1, sc: R(0.9, 1.08), ph: R(0, TAU), caw: 0, next: R(1, 9) });
      }

      // sky
      const cloudShapes = [0, 1, 2].map(() => {
        const n = 6 + ((rng() * 4) | 0), len = R(120, 200), puffs = [];
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), r = R(18, 32) * (1 - Math.abs(u - 0.5) * 0.9);
          puffs.push({ x: u * len + R(-8, 8), y: R(-6, 4) - r * 0.3, r });
        }
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of puffs) { x0 = Math.min(x0, p.x - p.r - 6); x1 = Math.max(x1, p.x + p.r + 6); y0 = Math.min(y0, p.y - p.r - 6); y1 = Math.max(y1, p.y + p.r + 8); }
        return { puffs, x0, y0, w: x1 - x0, h: y1 - y0 };
      });
      const clouds = Array.from({ length: 6 }, (_, i) => ({ x: -150 + (i + rng() * 0.6) * (W + 150) / 6, y: R(56, 150), s: R(0.7, 1.25), v: R(2.5, 6.5), a: R(0.7, 1), flat: R(0.55, 0.75), shape: i % 3 }));
      const motes = Array.from({ length: 28 }, () => ({ x: R(0, W), y: R(56, 240), r: R(0.5, 1.3), vx: R(-4, 6), ph: R(0, TAU) }));

      // footpath props (bases 312-334, behind the footpath rickshaw lane at 345)
      const stall = { x: STALL_X, base: 312, jars: [rp(['#d9a45b', '#b5652f']), rp(['#f2d27a', '#e07a5f']), rp(['#d64545', '#c9a227'])] };
      Object.assign(stall, { spoutX: stall.x + 62, spoutY: 274, fireX: stall.x + 73, fireY: 290, signX: stall.x + 30.5, signY: 228 });
      const van = { x: 526, base: 324 };
      Object.assign(van, { cardX: van.x + 44, cardY: van.base - 45 });
      const dog = { x: 474, y: 334, ph: R(0, 12), c1: '#c68f5c', c1l: '#dcae7c', c2: '#9c6a3f', c3: '#6b4428' };

      return {
        far1, far2, minaret, crane, tower, buildings: bs, shops: allShops, banners, tolet, billboard, kite,
        poles, wires, drops, crows, cloudShapes, clouds, motes, flock: null, flockT: R(2, 5), stall, van, dog, cache: null,
      };
    },

    update(s, dt, env) {
      const t = (env && env.t) || 0;
      for (const c of s.clouds) {
        const sp = s.cloudShapes[c.shape];
        c.x += c.v * dt;
        if (c.x + sp.x0 * c.s > W + 20) c.x = -(sp.x0 + sp.w) * c.s - 20;
      }
      for (const m of s.motes) {
        m.x += m.vx * dt; m.y = Math.max(50, Math.min(242, m.y + Math.sin(t * 0.8 + m.ph) * 4 * dt));
        if (m.x > W + 5) m.x = -5; else if (m.x < -5) m.x = W + 5;
      }
      for (const c of s.crows) { // an occasional caw
        c.caw = Math.max(0, c.caw - dt); c.next -= dt;
        if (c.next <= 0) { c.caw = 0.55; c.next = 3 + Math.random() * 8; }
      }
      const f = s.flock;
      if (f) {
        f.x += f.vx * dt; f.y = Math.max(78, Math.min(176, f.y + f.vy * dt));
        if (f.vx > 0 ? f.x - 140 > W : f.x + 140 < 0) { s.flock = null; s.flockT = 6 + Math.random() * 10; }
      } else if ((s.flockT -= dt) <= 0) spawnFlock(s);
    },

    drawBack(ctx, s, env) {
      const t = (env && env.t) || 0, C = ensureCache(ctx, s), G = grads(ctx, s);
      drawSky(ctx, s, C, G);
      if (C.failed) paintBack(ctx, s); else ctx.drawImage(C.back, 0, 0, W, 300);
      drawKite(ctx, s.kite, t);
      drawBackText(ctx, s);
      drawRays(ctx, t, G);
    },

    drawMid(ctx, s, env) {
      const t = (env && env.t) || 0, C = ensureCache(ctx, s);
      if (C.failed) paintMid(ctx, s); else ctx.drawImage(C.mid, 0, MID_Y0, W, 352 - MID_Y0);
      drawSteam(ctx, s.stall, t);
      drawDog(ctx, s.dog, t, grads(ctx, s));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 9px ${TH.FONT}`; ctx.fillStyle = '#fff7e6';
      ctx.fillText('চা', s.stall.signX, s.stall.signY + 0.4, 24);
      ctx.font = `700 5.5px ${TH.FONT}`; ctx.fillStyle = '#b91c1c';
      ctx.fillText('তাজা ফল', s.van.cardX, s.van.cardY - 0.3, 22);
      for (const c of s.crows) drawCrow(ctx, c, t);
    },

    // Overhead: warm dust haze, motes glinting in the sun, passing birds (all above y 250).
    drawFront(ctx, s, env) {
      const t = (env && env.t) || 0;
      ctx.fillStyle = grads(ctx, s).haze; ctx.fillRect(0, 0, W, 210);
      ctx.fillStyle = 'rgba(255,244,214,1)';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = 0.4 + 0.25 * Math.sin(t * 1.7 + pass * 2.1);
        ctx.beginPath();
        for (let i = pass; i < s.motes.length; i += 2) { const m = s.motes[i]; ctx.moveTo(m.x + m.r, m.y); ctx.arc(m.x, m.y, m.r, 0, TAU); }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const f = s.flock;
      if (f) {
        ctx.strokeStyle = 'rgba(52,36,40,0.8)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const b of f.birds) {
          const x = f.x + b.dx, y = f.y + b.dy + Math.sin(t * 1.3 + b.ph) * 2, fl = Math.sin(t * 10 + b.ph), z = b.sz;
          ctx.moveTo(x - z, y - fl * z * 0.7);
          ctx.quadraticCurveTo(x - z * 0.4, y - z * 0.5 * (fl + 0.3), x, y);
          ctx.quadraticCurveTo(x + z * 0.4, y - z * 0.5 * (fl + 0.3), x + z, y - fl * z * 0.7);
        }
        ctx.stroke();
      }
    },
  });
})();
