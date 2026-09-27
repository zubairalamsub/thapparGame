// Road: Gulshan-Badda Link Road — Gulshan's glass towers across the lake, boats, kash flowers.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;

  const BANK = 212;            // far-bank waterline
  const SHORE = 291;           // near-bank waterline
  const BASE = 206;            // foot of the towers (hidden behind the far-bank trees)
  const SUN_X = 892, SUN_Y = 64;
  const REFL = 0.62;           // vertical squash of the reflections in the lake
  const GAP = [246, 256];      // keep the one-way sign pole (x 248-253) in front of our railing
  const TAU = Math.PI * 2;

  // glass curtain walls: [sky-lit top, mid, deep bottom]
  const GLASS = [
    ['#b6e2ef', '#4699b7', '#1c5670'],
    ['#c0dbf5', '#4f86c6', '#203f73'],
    ['#c2eadf', '#3fa091', '#1a5a54'],
    ['#cbdae9', '#6187a8', '#2a445c'],
  ];
  const RES = ['#efe6d4', '#e6d3b3', '#f3efe7', '#dccaa8'];
  const TREE = {
    rain: ['#2e5a38', '#437a46', '#7aab64'],
    dark: ['#254c31', '#35673c', '#5f9150'],
    krishna: ['#35663b', '#4b8446', '#7aa85f'],
  };
  const LED = [['নতুন ৫জি ফোন', '#2563eb'], ['কফি মাত্র ৳৪৫০', '#e0620d'], ['ঈদ অফার ৫০% ছাড়', '#db2777']];

  // '#rrggbb' blend, t in [0, 1]
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // Static art is painted once into offscreen canvases at device scale (2x-3x) so it stays crisp.
  function ensure(s, key, ctx, y0, y1, paint) {
    if (typeof document === 'undefined') return null;
    let k = 2;
    try {
      if (typeof ctx.getTransform === 'function') {
        const m = ctx.getTransform();
        k = Math.min(3, Math.max(2, Math.ceil(Math.hypot(m.a, m.b) * 2) / 2));
      }
    } catch (e) { k = 2; }
    if (!isFinite(k)) k = 2;
    let c = s.cache[key];
    if (!c || c.k !== k) {
      if (c) c.cv.width = 0; // free the old bitmap right away
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(W * k); cv.height = Math.ceil((y1 - y0) * k);
      const g = cv.getContext('2d');
      g.scale(k, k); g.translate(0, -y0);
      paint(g);
      c = s.cache[key] = { cv, k, y0, y1 };
    }
    return c;
  }
  function blit(ctx, c, paint) {
    if (c) ctx.drawImage(c.cv, 0, c.y0, W, c.y1 - c.y0); else paint(ctx);
  }

  // ---------- skyline across the lake ----------
  function sheen(g, x, top, w, h, a) { // diagonal band of sunlight across a facade
    const sh = g.createLinearGradient(x + w, top + h * 0.05, x, top + h * 0.8);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.28, `rgba(255,255,255,${a})`);
    sh.addColorStop(0.36, 'rgba(255,255,255,0.02)');
    sh.addColorStop(0.45, `rgba(255,255,255,${a * 0.6})`);
    sh.addColorStop(0.56, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(x, top, w, h);
  }

  // Side face: lit on the right of the towers left of centre, shaded on the left of the others.
  function face(g, b, top) {
    const d = b.d;
    g.beginPath();
    if (b.side > 0) { g.moveTo(b.x + b.w, top); g.lineTo(b.x + b.w + d, top + d * 0.5); g.lineTo(b.x + b.w + d, BASE); g.lineTo(b.x + b.w, BASE); }
    else { g.moveTo(b.x, top); g.lineTo(b.x - d, top + d * 0.5); g.lineTo(b.x - d, BASE); g.lineTo(b.x, BASE); }
    g.closePath();
  }

  function glassTower(g, b, r) {
    const { x, w, top } = b, pal = GLASS[b.pal];
    const tl = top + Math.max(0, b.slant), tr = top + Math.max(0, -b.slant);
    const st = b.side > 0 ? tr : tl;
    face(g, b, st);
    const sg = g.createLinearGradient(0, st, 0, BASE);
    if (b.side > 0) { sg.addColorStop(0, mix(pal[0], '#ffffff', 0.35)); sg.addColorStop(1, mix(pal[1], '#ffffff', 0.2)); }
    else { sg.addColorStop(0, mix(pal[1], '#0b1a2a', 0.4)); sg.addColorStop(1, mix(pal[2], '#0b1a2a', 0.5)); }
    g.fillStyle = sg; g.fill();
    g.save(); g.clip();
    g.fillStyle = b.side > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
    for (let y = st + 3; y < BASE; y += b.floor) g.fillRect(x - 20, y, w + 40, 0.8);
    g.restore();

    g.save();
    g.beginPath(); g.moveTo(x, tl); g.lineTo(x + w, tr); g.lineTo(x + w, BASE); g.lineTo(x, BASE); g.closePath();
    const fg = g.createLinearGradient(0, top, 0, BASE);
    fg.addColorStop(0, pal[0]); fg.addColorStop(0.42, pal[1]); fg.addColorStop(1, pal[2]);
    g.fillStyle = fg; g.fill(); g.clip();
    const h = BASE - top;
    for (let i = 0, n = (w * h) / 110; i < n; i++) { // panels with slightly different tints
      const px = x + Math.floor(r() * (w / b.mull)) * b.mull, py = top + Math.floor(r() * (h / b.floor)) * b.floor;
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(5,25,45,0.14)';
      g.fillRect(px, py, b.mull, b.floor);
    }
    g.fillStyle = 'rgba(255,255,255,0.16)'; // a cloud caught in the glass
    g.beginPath(); g.ellipse(x + w * 0.62, top + 24, w * 0.34, 7, -0.15, 0, TAU); g.fill();
    const hz = g.createLinearGradient(x, 0, x + w, 0);
    hz.addColorStop(0, 'rgba(6,24,44,0.3)'); hz.addColorStop(0.55, 'rgba(6,24,44,0)'); hz.addColorStop(1, 'rgba(255,255,255,0.22)');
    g.fillStyle = hz; g.fillRect(x, top, w, h);
    g.fillStyle = 'rgba(8,32,52,0.3)';
    for (let y = top + 2; y < BASE; y += b.floor) g.fillRect(x, y, w, 0.9);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (let y = top + 2.9; y < BASE; y += b.floor) g.fillRect(x, y, w, 0.5);
    g.fillStyle = 'rgba(8,32,52,0.22)';
    for (let xx = x + b.mull; xx < x + w - 0.5; xx += b.mull) g.fillRect(xx, top, 0.7, h);
    sheen(g, x, top, w, h, 0.3);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + w - 1, tr, 1, BASE - tr);
    TH.line(g, [x, tl, x + w, tr], 'rgba(255,255,255,0.75)', 1);

    const cx = x + w / 2;
    if (b.crown === 'spire') {
      g.fillStyle = '#dde3e8'; g.fillRect(cx - 8, top - 6, 16, 6);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(cx - 8, top - 6, 5, 6);
      TH.line(g, [cx, top - 6, cx, top - 30], '#9aa3ab', 1.6);
      TH.line(g, [cx - 3.5, top - 17, cx + 3.5, top - 17], '#9aa3ab', 1);
    } else if (b.crown === 'crown') { // glass lantern set back on the roof, with fins
      const lx = x + w * 0.18, lw = w * 0.64;
      const lg = g.createLinearGradient(lx, 0, lx + lw, 0);
      lg.addColorStop(0, mix(pal[1], '#0b1a2a', 0.2)); lg.addColorStop(1, mix(pal[0], '#ffffff', 0.3));
      g.fillStyle = lg; g.fillRect(lx, top - 13, lw, 13);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let xx = lx + 3; xx < lx + lw; xx += 5) g.fillRect(xx, top - 13, 0.8, 13);
      g.fillStyle = '#e8edf1'; g.fillRect(lx - 2, top - 15, lw + 4, 2.2);
      TH.line(g, [cx, top - 15, cx, top - 28], '#aab2ba', 1.4);
    } else if (b.crown === 'fin') {
      const fx = b.side > 0 ? x + w - 9 : x;
      g.fillStyle = mix(pal[0], '#ffffff', 0.25); g.fillRect(fx, top - 16, 9, 16);
      g.fillStyle = 'rgba(8,32,52,0.25)'; for (let y = top - 14; y < top; y += 4) g.fillRect(fx, y, 9, 0.6);
    }
  }

  function bandTower(g, b, r) {
    const { x, w, top } = b, h = BASE - top;
    face(g, b, top);
    g.fillStyle = b.side > 0 ? '#fbf8f0' : '#a4a7a7'; g.fill();
    g.save(); g.clip();
    g.fillStyle = b.side > 0 ? '#93c2e2' : '#22405c';
    for (let y = top + 6; y < BASE; y += 10) g.fillRect(x - 20, y, w + 40, 6);
    g.restore();
    const fg = g.createLinearGradient(x, 0, x + w, 0);
    fg.addColorStop(0, '#d5d2c9'); fg.addColorStop(1, '#f6f3ec');
    g.fillStyle = fg; g.fillRect(x, top, w, h);
    const n = Math.floor((h - 8) / 10);
    for (let i = 0; i < n; i++) { // ribbon windows, lighter higher up where they catch the sky
      const y = top + 6 + i * 10, f = n > 1 ? i / (n - 1) : 0;
      g.fillStyle = mix('#a3d0ec', '#1d4670', 0.12 + f * 0.75 + r() * 0.08);
      g.fillRect(x + 2, y, w - 4, 6);
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + 2, y, w - 4, 0.8);
      g.fillStyle = 'rgba(8,28,48,0.3)';
      for (let xx = x + 2 + b.mull; xx < x + w - 3; xx += b.mull) g.fillRect(xx, y, 0.7, 6);
      g.fillStyle = 'rgba(60,50,40,0.2)'; g.fillRect(x, y + 6, w, 1);
    }
    sheen(g, x, top, w, h, 0.22);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + w - 1, top, 1, h);
    g.fillStyle = '#ebe8e0'; g.fillRect(x - 1, top - 3, w + 2, 3);
    g.fillStyle = '#c9c5bb'; g.fillRect(x + w * 0.14, top - 8, w * 0.28, 5);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + w * 0.14, top - 8, 3, 5);
    if (b.led) { // rooftop LED screen frame (the picture is drawn live)
      const L = b.led;
      TH.line(g, [L.x + 10, top - 3, L.x + 10, L.y + L.h, L.x + L.w - 10, top - 3, L.x + L.w - 10, L.y + L.h], '#4b5563', 1.4);
      g.fillStyle = '#1f2937'; g.fillRect(L.x - 2, L.y - 2, L.w + 4, L.h + 4);
      g.fillStyle = '#0b1220'; g.fillRect(L.x, L.y, L.w, L.h);
    } else {
      g.fillStyle = '#d9d5cc'; g.fillRect(x + w * 0.6, top - 6, w * 0.22, 3);
    }
  }

  function resTower(g, b, r) {
    const { x, w, top } = b, h = BASE - top, col = b.col;
    face(g, b, top);
    g.fillStyle = b.side > 0 ? mix(col, '#ffffff', 0.4) : mix(col, '#40382f', 0.38); g.fill();
    const fg = g.createLinearGradient(x, 0, x + w, 0);
    fg.addColorStop(0, mix(col, '#6b5f52', 0.22)); fg.addColorStop(1, mix(col, '#ffffff', 0.2));
    g.fillStyle = fg; g.fillRect(x, top, w, h);
    const cx = x + b.core; // glass stair core
    const cg = g.createLinearGradient(0, top, 0, BASE);
    cg.addColorStop(0, '#abd5e7'); cg.addColorStop(1, '#2e5a72');
    g.fillStyle = cg; g.fillRect(cx, top + 3, 8, h - 3);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = top + 6; y < BASE; y += 5.5) g.fillRect(cx, y, 8, 0.6);
    const cols = Math.max(2, Math.floor((w - 6) / 11)), gx = x + (w - cols * 11) / 2 + 2;
    for (let y = top + 8; y < BASE - 6; y += 11) {
      for (let c = 0; c < cols; c++) {
        const wx = gx + c * 11;
        if (wx + 8 > cx && wx < cx + 9) continue;
        const v = r();
        g.fillStyle = v < 0.18 ? '#8db4cc' : '#3d5465'; g.fillRect(wx, y, 7, 6);
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(wx, y, 7, 0.8);
        if (v > 0.62) { // balcony + rail, sometimes a potted plant
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(wx - 1.5, y + 6.2, 10, 1.6);
          g.fillStyle = '#fbfaf6'; g.fillRect(wx - 1.5, y + 5, 10, 1.2);
          if (v > 0.9) TH.circle(g, wx + 7.5, y + 4.2, 1.8, '#3f8a3c');
        } else if (v > 0.48) {
          g.fillStyle = '#e8ebee'; g.fillRect(wx + 7.3, y + 3, 2.6, 2.4); // AC unit
        }
      }
    }
    sheen(g, x, top, w, h, 0.12);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + w - 1, top, 1, h);
    // roof: parapet, stair room, black water tanks, a dish
    g.fillStyle = mix(col, '#ffffff', 0.3); g.fillRect(x - 1, top - 2.5, w + 2, 2.5);
    const sx = x + w * 0.18;
    g.fillStyle = mix(col, '#6b5f52', 0.08); g.fillRect(sx, top - 9, 14, 6.5);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(sx, top - 9, 4, 6.5);
    for (let i = 0; i < b.tanks; i++) {
      const tx = x + w * 0.55 + i * 8;
      g.fillStyle = '#202428'; g.fillRect(tx, top - 8, 6, 5.5);
      g.beginPath(); g.ellipse(tx + 3, top - 8, 3, 1.1, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(tx + 4.2, top - 7.5, 0.8, 4.5);
    }
    g.strokeStyle = '#cfd4d8'; g.lineWidth = 1;
    g.beginPath(); g.arc(sx + 20, top - 6, 3, Math.PI * 0.8, Math.PI * 1.8); g.stroke();
  }

  function buildTower(g, b, r) { // under construction: concrete frame, brick infill, green net
    const { x, w, top } = b, h = BASE - top;
    g.fillStyle = '#4d4944'; g.fillRect(x, top, w, h);
    g.fillStyle = 'rgba(255,240,210,0.08)';
    for (let xx = x + 5; xx < x + w; xx += 9) g.fillRect(xx, top, 3, h);
    const bays = Math.max(2, Math.round(w / 13)), bw = w / bays;
    for (let y = top + 36; y < BASE; y += 9) {
      for (let i = 0; i < bays; i++) {
        if (r() < 0.55) { g.fillStyle = r() < 0.5 ? '#b0553b' : '#9a4933'; g.fillRect(x + i * bw, y, bw, 9); }
      }
    }
    for (let i = 0; i <= bays; i++) {
      const xx = Math.min(x + w - 2.4, x + i * bw);
      g.fillStyle = '#c3bcad'; g.fillRect(xx, top, 2.4, h);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(xx + 1.6, top, 0.8, h);
    }
    for (let y = top; y < BASE; y += 9) {
      g.fillStyle = '#d8d2c4'; g.fillRect(x - 1.5, y, w + 3, 2.2);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + 2.2, w, 1.2);
    }
    g.strokeStyle = '#6b4a36'; g.lineWidth = 0.6; g.beginPath(); // rebar sticking out of the top
    for (let i = 0; i <= bays; i++) { const xx = Math.min(x + w - 1.2, x + i * bw + 1.2); g.moveTo(xx, top); g.lineTo(xx + 0.4, top - 6); }
    g.stroke();
    const ny = top + h * 0.42;
    g.fillStyle = 'rgba(34,122,74,0.86)'; g.fillRect(x - 2, ny, w + 4, BASE - ny);
    g.strokeStyle = 'rgba(160,220,170,0.25)'; g.lineWidth = 0.5; g.beginPath();
    for (let xx = x - 2; xx < x + w + 2; xx += 3) { g.moveTo(xx, ny); g.lineTo(xx, BASE); }
    for (let y = ny; y < BASE; y += 3) { g.moveTo(x - 2, y); g.lineTo(x + w + 2, y); }
    g.stroke();
    const ng = g.createLinearGradient(x, 0, x + w, 0);
    ng.addColorStop(0, 'rgba(0,0,0,0.25)'); ng.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = ng; g.fillRect(x - 2, ny, w + 4, BASE - ny);
    const hx = x + w + 1; // site hoist
    g.fillStyle = '#8a8f94'; g.fillRect(hx, top + 12, 2, h - 12);
    g.fillStyle = '#f2b20c'; g.fillRect(hx - 1, top + h * 0.3, 5, 6);
  }

  function paintCrane(g, c) {
    const Y = '#f3b515', YD = '#c28a0a', { x, base, jy, jl, cl } = c, mw = 5;
    TH.line(g, [x, base, x, jy], YD, 1.2);
    TH.line(g, [x + mw, base, x + mw, jy], Y, 1.2);
    g.beginPath();
    for (let y = base, i = 0; y > jy + 2; y -= 5, i++) { g.moveTo(x + (i % 2 ? mw : 0), y); g.lineTo(x + (i % 2 ? 0 : mw), Math.max(jy, y - 5)); }
    g.strokeStyle = Y; g.lineWidth = 0.7; g.stroke();
    const tip = x - jl, end = x + mw + cl, topAt = (xx) => jy - 0.5 - (xx - tip - 3) / (x - tip - 3) * 3.5;
    TH.line(g, [tip, jy + 1, end, jy + 1], Y, 1.4);
    TH.line(g, [tip + 3, jy - 0.5, x, jy - 4, x + mw, jy - 4, end, jy - 2], Y, 1);
    g.beginPath(); // jib lattice
    for (let xx = tip + 3, i = 0; xx < x - 2; xx += 3.5, i++) { g.moveTo(xx, jy + 1); g.lineTo(xx + 1.75, topAt(xx + 1.75)); g.lineTo(xx + 3.5, jy + 1); }
    g.strokeStyle = Y; g.lineWidth = 0.6; g.stroke();
    g.fillStyle = '#9aa1a8'; g.fillRect(end - 9, jy - 4, 8, 9); // counterweights
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(end - 9, jy - 4, 3, 9);
    TH.line(g, [x, jy - 4, x + mw / 2, jy - 18, x + mw, jy - 4], Y, 1.2); // cat head + pendant ties
    TH.line(g, [x + mw / 2, jy - 18, tip + 8, jy - 0.8], 'rgba(60,60,60,0.7)', 0.6);
    TH.line(g, [x + mw / 2, jy - 18, end - 4, jy - 2.5], 'rgba(60,60,60,0.7)', 0.6);
    g.fillStyle = '#eef0f2'; g.fillRect(x + mw, jy + 1.5, 6, 5); // cab
    g.fillStyle = '#5b7f99'; g.fillRect(x + mw + 1.5, jy + 2.5, 3.5, 2.5);
    const tx = c.tx; // trolley, hook and a bundle of rods
    g.fillStyle = '#555'; g.fillRect(tx - 2, jy + 1.5, 4, 2);
    TH.line(g, [tx - 0.6, jy + 3.5, tx - 0.6, c.hy], '#333', 0.5);
    TH.line(g, [tx + 0.6, jy + 3.5, tx + 0.6, c.hy], '#333', 0.5);
    g.fillStyle = Y; g.fillRect(tx - 2, c.hy, 4, 3);
    TH.line(g, [tx - 7, c.hy + 9, tx, c.hy + 3, tx + 7, c.hy + 9], '#444', 0.5);
    g.fillStyle = '#7a4b33'; g.fillRect(tx - 10, c.hy + 9, 20, 2.5);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(tx - 10, c.hy + 9, 20, 0.7);
  }

  function tree(g, t, r) {
    const [dk, md, lt] = TREE[t.kind];
    g.fillStyle = '#3f3226'; g.fillRect(t.x - 0.8, t.y, 1.6, BASE - t.y);
    const layer = (col, ox, oy, sc) => {
      g.fillStyle = col; g.beginPath();
      for (const [dx, dy, rr] of t.blobs) {
        const bx = t.x + dx + rr * ox, by = t.y + dy + rr * oy;
        g.moveTo(bx + rr * sc, by); g.arc(bx, by, rr * sc, 0, TAU);
      }
      g.fill();
    };
    layer(dk, 0, 0, 1);
    layer(md, 0.15, -0.2, 0.74);
    layer(lt, 0.36, -0.42, 0.36);
    if (t.kind === 'krishna') { // flame tree in bloom
      for (let i = 0; i < 18; i++) {
        const a = r() * TAU, d = r() * t.r * 0.9;
        TH.circle(g, t.x + Math.cos(a) * d * 1.2, t.y - 2 + Math.sin(a) * d * 0.8, 1 + r() * 1.3, r() < 0.55 ? '#e8452c' : '#f7843a');
      }
    }
  }

  function palm(g, p) {
    const tx = p.x + p.lean, ty = BASE - p.h;
    g.strokeStyle = '#6e5b45'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(p.x, BASE); g.quadraticCurveTo(p.x + p.lean * 0.15, BASE - p.h * 0.5, tx, ty); g.stroke();
    g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI, len = 12 + (i % 2) * 4;
      g.strokeStyle = i > 5 ? '#76ab55' : i > 2 ? '#4f8a42' : '#3a6d35';
      g.beginPath(); g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * len * 0.55, ty + Math.sin(a) * len * 0.7 - 2, tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.45 + 6);
      g.stroke();
    }
    TH.circle(g, tx - 1.2, ty + 1.6, 1.3, '#5a4a2a');
    TH.circle(g, tx + 1.2, ty + 1.9, 1.3, '#6b5a32');
  }

  function paintSkyline(g, s) {
    const r = TH.mulberry32(s.seed);
    for (const f of s.haze) { // distant towers in the afternoon haze
      const hg = g.createLinearGradient(0, f.top, 0, BASE);
      hg.addColorStop(0, '#b4cbe0'); hg.addColorStop(1, '#d3e3ee');
      g.fillStyle = hg; g.fillRect(f.x, f.top, f.w, BASE - f.top);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(f.x + f.w - 1.5, f.top, 1.5, BASE - f.top);
      g.fillStyle = 'rgba(110,140,170,0.16)';
      for (let y = f.top + 4; y < BASE; y += 4.5) g.fillRect(f.x, y, f.w, 1);
      if (f.mast) TH.line(g, [f.x + f.w / 2, f.top, f.x + f.w / 2, f.top - 10], '#a9bfd3', 1);
    }
    const paint = { glass: glassTower, band: bandTower, res: resTower, build: buildTower };
    for (const b of s.towers) paint[b.type](g, b, r);
    paintCrane(g, s.crane);
    const kx = s.kite.ax - 1.6, ky = s.kite.ay + 9.6; // the kite flier on the rooftop
    g.fillStyle = '#2b2b2b'; g.fillRect(kx - 0.9, ky - 3, 0.7, 3); g.fillRect(kx + 0.2, ky - 3, 0.7, 3);
    g.fillStyle = '#f4a261'; g.fillRect(kx - 1.2, ky - 6.6, 2.4, 3.8);
    TH.line(g, [kx + 0.8, ky - 6, kx + 1.6, ky - 9.6], '#7a4f35', 0.7);
    TH.circle(g, kx, ky - 7.7, 1, '#7a4f35');

    // far bank: grass, palms, trees, the lakeside walkway and its wall
    const bg = g.createLinearGradient(0, 194, 0, 207);
    bg.addColorStop(0, '#528a44'); bg.addColorStop(1, '#3a6a33');
    g.fillStyle = bg; g.fillRect(0, 196, W, 11);
    for (const p of s.palms) palm(g, p);
    for (const t of s.trees) tree(g, t, r);
    g.fillStyle = '#e8e3d6'; g.fillRect(0, 205.5, W, 2.5);
    g.fillStyle = '#a9a395'; g.fillRect(0, 208, W, 4);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    for (let x = 6; x < W; x += 16) g.fillRect(x, 208, 0.6, 4);
    for (let x = 30; x < W; x += 120) { TH.line(g, [x, 205.5, x, 195.5], '#6b7280', 0.7); TH.circle(g, x, 195.2, 1.1, '#f1f5f9'); }
    for (const p of s.strollers) { // evening walkers on the far walkway
      g.fillStyle = '#2b2b2b'; g.fillRect(p.x - 0.9, 203, 0.7, 2.6); g.fillRect(p.x + 0.2, 203, 0.7, 2.6);
      g.fillStyle = p.c; g.fillRect(p.x - 1.1, 199.8, 2.2, 3.4);
      TH.circle(g, p.x, 198.9, 0.95, '#7a4f35');
    }
    for (const h of s.farHy) { // water hyacinth along the far bank
      for (let x = h.x; x < h.x + h.w; x += 3.2) {
        const y = 213.6 + r() * 1.8;
        g.fillStyle = '#35702f'; g.beginPath(); g.ellipse(x, y, 2.6, 1.2, 0, 0, TAU); g.fill();
        g.fillStyle = '#7cb35a'; g.beginPath(); g.ellipse(x + 0.6, y - 0.5, 1.4, 0.6, 0, 0, TAU); g.fill();
        if (r() < 0.12) TH.circle(g, x, y - 1.4, 0.8, '#c3a6ec');
      }
    }
  }

  // ---------- near bank: billboard, hyacinth, grass, kash flowers ----------
  function paintBillboard(g, b) {
    const { x, y, w, h } = b, px = x + w / 2;
    const pg = g.createLinearGradient(px - 5, 0, px + 5, 0);
    pg.addColorStop(0, '#565d66'); pg.addColorStop(0.65, '#aab2ba'); pg.addColorStop(1, '#6b737c');
    g.fillStyle = pg; g.fillRect(px - 5, y + h, 10, 300 - y - h);
    g.fillStyle = '#39414b'; g.fillRect(px - 16, y + h - 2, 32, 9);
    g.fillStyle = '#1f2630'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    const fg = g.createLinearGradient(0, y, 0, y + h);
    fg.addColorStop(0, '#fffdf7'); fg.addColorStop(1, '#efe3cb');
    g.fillStyle = fg; g.fillRect(x, y, w, h);
    // artwork: a lakeside tower at golden hour
    const ax = x + 3, ay = y + 3, aw = 54, ah = h - 6;
    const ag = g.createLinearGradient(0, ay, 0, ay + ah);
    ag.addColorStop(0, '#ffd08c'); ag.addColorStop(0.6, '#ff966a'); ag.addColorStop(1, '#6f58a3');
    g.fillStyle = ag; g.fillRect(ax, ay, aw, ah);
    TH.circle(g, ax + 14, ay + 18, 6, 'rgba(255,246,222,0.95)');
    g.fillStyle = '#42507a'; g.fillRect(ax + 6, ay + 26, 10, ah - 38);
    const tg = g.createLinearGradient(ax + 24, 0, ax + 46, 0);
    tg.addColorStop(0, '#1d4b69'); tg.addColorStop(1, '#6db0cf');
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(ax + 24, ay + 12); g.lineTo(ax + 46, ay + 5); g.lineTo(ax + 46, ay + ah - 12); g.lineTo(ax + 24, ay + ah - 12); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    for (let yy = ay + 14; yy < ay + ah - 13; yy += 3.5) g.fillRect(ax + 24, yy, 22, 0.6);
    g.fillStyle = '#3a6690'; g.fillRect(ax, ay + ah - 12, aw, 12);
    g.fillStyle = 'rgba(255,210,160,0.55)';
    for (let yy = ay + ah - 10; yy < ay + ah; yy += 3) g.fillRect(ax + 24 + ((yy * 7) % 5), yy, 14, 0.8);
    g.fillStyle = '#d62828'; g.fillRect(x + 62, y + h - 18, w - 68, 13);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 62, y + h - 5, w - 68, 1);
    const gl = g.createLinearGradient(x, y, x + w, y + h);
    gl.addColorStop(0, 'rgba(0,0,0,0.07)'); gl.addColorStop(0.6, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0.14)');
    g.fillStyle = gl; g.fillRect(x, y, w, h);
    // catwalk and flood lights
    g.fillStyle = '#4b5563'; g.fillRect(x - 4, y + h + 5, w + 8, 2.4);
    g.strokeStyle = '#6b7280'; g.lineWidth = 0.8; g.beginPath();
    for (let xx = x - 3; xx <= x + w + 3; xx += 12) { g.moveTo(xx, y + h + 5); g.lineTo(xx, y + h - 0.5); }
    g.moveTo(x - 3, y + h - 0.5); g.lineTo(x + w + 3, y + h - 0.5); g.stroke();
    for (const lx of [x + 24, x + w / 2, x + w - 30]) {
      TH.line(g, [lx, y - 3, lx + 2, y - 11], '#374151', 1);
      g.fillStyle = '#4b5563'; g.fillRect(lx - 1, y - 14, 7, 3.5);
      g.fillStyle = '#e5e7eb'; g.fillRect(lx - 0.5, y - 11, 6, 1);
    }
  }

  function hyacinth(g, h, r) {
    g.fillStyle = 'rgba(15,50,55,0.3)';
    g.beginPath(); g.ellipse(h.x, h.y + 2, h.w * 0.58, 2.6, 0, 0, TAU); g.fill();
    const leaves = [];
    for (let i = 0; i < h.n; i++) leaves.push([h.x + (r() - 0.5) * h.w, h.y - r() * 5, 2.8 + r() * 2.4]);
    leaves.sort((a, b) => a[1] - b[1]);
    for (const [lx, ly, lr] of leaves) {
      g.fillStyle = '#2b662a'; g.beginPath(); g.ellipse(lx, ly, lr, lr * 0.68, 0, 0, TAU); g.fill();
      g.fillStyle = '#58993d'; g.beginPath(); g.ellipse(lx + lr * 0.15, ly - lr * 0.16, lr * 0.74, lr * 0.46, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(215,248,175,0.6)'; g.beginPath(); g.ellipse(lx + lr * 0.36, ly - lr * 0.3, lr * 0.3, lr * 0.14, -0.4, 0, TAU); g.fill();
    }
    for (let i = 0; i < h.fl; i++) { // pale lilac flower spikes
      const fx = h.x + (r() - 0.5) * h.w * 0.6, fy = h.y - 8 - r() * 3;
      TH.line(g, [fx, fy + 6, fx, fy], '#4f8a3a', 0.8);
      g.fillStyle = '#bca0e8';
      for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(fx + (j % 2 ? 1.2 : -1.2), fy - j * 1.3, 1.35, 0, TAU); g.fill(); }
      TH.circle(g, fx + 0.3, fy - 2.2, 0.55, '#f5d142');
    }
  }

  function kash(g, k) { // কাশফুল: white autumn plumes on the bank
    for (const st of k.stalks) {
      const bx = k.x + st.dx, by = 299, tx = bx + st.lean, ty = by - st.h;
      g.strokeStyle = '#7f9150'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + st.lean * 0.2, by - st.h * 0.6, tx, ty); g.stroke();
      g.save(); g.translate(tx, ty); g.rotate(st.lean * 0.06);
      const pg = g.createLinearGradient(-3, 0, 3, 0);
      pg.addColorStop(0, 'rgba(214,210,196,0.95)'); pg.addColorStop(1, 'rgba(255,255,252,0.98)');
      g.fillStyle = pg;
      g.beginPath(); g.ellipse(0, -7, 2.4, 8, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.5; g.beginPath();
      for (let i = 0; i < 5; i++) { g.moveTo(0, -2 - i * 2.6); g.lineTo((i % 2 ? 3.6 : -3.4), -5 - i * 2.8); }
      g.stroke();
      g.restore();
    }
    g.strokeStyle = '#5c8a3a'; g.lineWidth = 1; g.beginPath(); // long leaves
    for (const st of k.stalks) {
      const bx = k.x + st.dx;
      g.moveTo(bx, 299); g.quadraticCurveTo(bx + st.lean * 0.8, 289, bx + st.lean * 2.2 + 5, 286 + st.h * 0.05);
    }
    g.stroke();
  }

  function paintNear(g, s) {
    const r = TH.mulberry32(s.seed + 7);
    paintBillboard(g, s.board);
    for (const h of s.nearHy) hyacinth(g, h, r);
    g.beginPath(); g.moveTo(0, 301); // grassy slope from the water up to the footpath
    for (let x = 0; x <= W; x += 20) g.lineTo(x, SHORE + Math.sin(x * 0.05) * 0.8 + (r() - 0.5) * 1.2);
    g.lineTo(W, 301); g.closePath();
    const gg = g.createLinearGradient(0, SHORE - 1, 0, 301);
    gg.addColorStop(0, '#76a34a'); gg.addColorStop(1, '#3f6b2d');
    g.fillStyle = gg; g.fill();
    g.fillStyle = 'rgba(20,50,40,0.35)'; g.fillRect(0, SHORE - 1.5, W, 1.2);
    g.strokeStyle = 'rgba(150,200,100,0.7)'; g.lineWidth = 0.7; g.beginPath();
    for (let x = 2; x < W; x += 3 + r() * 4) { const y = SHORE + 1 + r() * 2; g.moveTo(x, y + 3); g.lineTo(x + (r() - 0.3) * 3, y - 2); }
    g.stroke();
    for (const k of s.kash) kash(g, k);
  }

  // ---------- footpath furniture (drawMid) ----------
  function lamp(g, L) {
    const x = L.x, base = 308, top = 152, d = L.dir;
    g.fillStyle = 'rgba(40,35,30,0.14)'; // shadow falls towards the viewer, away from the sun
    g.beginPath(); g.moveTo(x - 3, base); g.lineTo(x + 3, base); g.lineTo(x - 21, 344); g.lineTo(x - 26, 344); g.closePath(); g.fill();
    g.fillStyle = '#9ca3af'; g.fillRect(x - 5, base - 5, 10, 5);
    g.fillStyle = '#d1d5db'; g.fillRect(x - 5, base - 5, 10, 1);
    const pg = g.createLinearGradient(x - 3, 0, x + 3, 0);
    pg.addColorStop(0, '#5b626b'); pg.addColorStop(0.7, '#cfd4d9'); pg.addColorStop(1, '#7a818a');
    g.fillStyle = pg;
    g.beginPath(); g.moveTo(x - 3, base - 5); g.lineTo(x - 1.6, top); g.lineTo(x + 1.6, top); g.lineTo(x + 3, base - 5); g.closePath(); g.fill();
    g.fillStyle = '#4b5563'; g.fillRect(x - 3.6, base - 24, 7.2, 3);
    g.strokeStyle = '#8b939c'; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, top + 2); g.quadraticCurveTo(x, top - 8, x + d * 14, top - 9); g.lineTo(x + d * 26, top - 9); g.stroke();
    const hx = d > 0 ? x + 22 : x - 48;
    g.fillStyle = '#3f4650'; TH.rr(g, hx, top - 12, 26, 5, 2.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(hx + 2, top - 12, 22, 0.9);
    g.fillStyle = '#e8f1f8'; g.fillRect(hx + 2, top - 7.4, 22, 1.4);
  }

  function paintSign(g, sg) {
    const { x, y, w, h } = sg;
    for (const px of [x + 24, x + w - 24]) {
      g.fillStyle = 'rgba(40,35,30,0.14)';
      g.beginPath(); g.moveTo(px - 3.5, 307); g.lineTo(px + 3.5, 307); g.lineTo(px - 19, 344); g.lineTo(px - 25, 344); g.closePath(); g.fill();
      const pg = g.createLinearGradient(px - 3.5, 0, px + 3.5, 0);
      pg.addColorStop(0, '#6b727b'); pg.addColorStop(0.7, '#d5d9de'); pg.addColorStop(1, '#858c95');
      g.fillStyle = pg; g.fillRect(px - 3.5, y + 6, 7, 305 - y - 6);
      g.fillStyle = '#9ca3af'; g.fillRect(px - 6.5, 302, 13, 5.5);
      g.fillStyle = '#d1d5db'; g.fillRect(px - 6.5, 302, 13, 1);
    }
    g.fillStyle = 'rgba(0,0,0,0.22)'; TH.rr(g, x - 3, y + 4, w, h, 6); g.fill();
    const bg = g.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#0f7d47'); bg.addColorStop(1, '#075a31');
    g.fillStyle = bg; TH.rr(g, x, y, w, h, 6); g.fill();
    g.strokeStyle = '#f8fafc'; g.lineWidth = 1.8; TH.rr(g, x + 3.5, y + 3.5, w - 7, h - 7, 4); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 12, y + 43, w - 24, 1.2);
    const ay = y + 53.5;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(x + 12, ay); g.lineTo(x + 19, ay - 5); g.lineTo(x + 19, ay - 1.8); g.lineTo(x + 27, ay - 1.8);
    g.lineTo(x + 27, ay + 1.8); g.lineTo(x + 19, ay + 1.8); g.lineTo(x + 19, ay + 5); g.closePath(); g.fill();
    const rx = x + w;
    g.beginPath(); g.moveTo(rx - 12, ay); g.lineTo(rx - 19, ay - 5); g.lineTo(rx - 19, ay - 1.8); g.lineTo(rx - 27, ay - 1.8);
    g.lineTo(rx - 27, ay + 1.8); g.lineTo(rx - 19, ay + 1.8); g.lineTo(rx - 19, ay + 5); g.closePath(); g.fill();
    const sh = g.createLinearGradient(x + w, y, x + w * 0.35, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,0.2)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.04)'); sh.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = sh; TH.rr(g, x, y, w, h, 6); g.fill();
  }

  function guard(g, tr) { // sapling trunk in an iron tree guard
    const x = tr.x, base = tr.base, top = base - 32;
    g.fillStyle = 'rgba(40,35,30,0.15)';
    g.beginPath(); g.moveTo(x - 10, base); g.lineTo(x + 10, base); g.lineTo(x - 2, base + 14); g.lineTo(x - 22, base + 14); g.closePath(); g.fill();
    g.fillStyle = '#6b4f36'; g.beginPath(); g.ellipse(x, base - 1, 10.5, 2.6, 0, 0, TAU); g.fill();
    g.strokeStyle = '#6d4c33'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, base - 1); g.quadraticCurveTo(x - 2.5, base - 34, x + 1, tr.top); g.stroke();
    g.strokeStyle = 'rgba(255,220,180,0.4)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x + 1, base - 2); g.quadraticCurveTo(x - 1.4, base - 34, x + 2, tr.top + 2); g.stroke();
    g.lineWidth = 1.1;
    for (let i = 0; i < 7; i++) {
      const bx = x - 9.5 + i * (19 / 6);
      g.strokeStyle = i > 4 ? '#5e8f78' : '#23463a';
      g.beginPath(); g.moveTo(bx, base - 1.5); g.lineTo(bx, top); g.stroke();
    }
    g.strokeStyle = '#2f5a48'; g.lineWidth = 1.2;
    for (const yy of [base - 3, base - 17, top]) { g.beginPath(); g.ellipse(x, yy, 10, 2.2, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#f1f1ec'; g.fillRect(x - 10, top + 3, 20, 2.2); // painted band
  }

  function paintMid(g, s) {
    const r = TH.mulberry32(s.seed + 13);
    g.save();
    g.beginPath(); g.rect(0, 0, GAP[0], 360); g.rect(GAP[1], 0, W - GAP[1], 360); g.clip();
    g.fillStyle = 'rgba(206,170,58,0.8)'; g.fillRect(0, 330, W, 5.5); // tactile guide strip
    g.fillStyle = 'rgba(255,240,170,0.35)'; g.fillRect(0, 330, W, 0.7);
    g.fillStyle = 'rgba(110,80,20,0.28)';
    for (const yy of [331.8, 333.6]) g.fillRect(0, yy, W, 0.6);
    for (let x = r() * 9; x < W; x += 7 + r() * 9) g.fillRect(x, 330.8 + r() * 3.5, 1.2 + r() * 1.5, 0.8); // wear
    g.fillStyle = 'rgba(40,35,30,0.13)'; g.fillRect(0, 306, W, 5); // railing shadow
    g.fillStyle = '#d9d4c9'; g.fillRect(0, 299.5, W, 6.5); // plinth
    g.fillStyle = '#f2eee6'; g.fillRect(0, 299.5, W, 1.2);
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, 304.5, W, 1.5);
    for (let x = 8; x < W; x += 34) { // railing posts
      g.fillStyle = '#2b5257'; g.fillRect(x - 1.8, 279, 3.6, 21);
      g.fillStyle = '#629a9f'; g.fillRect(x + 0.6, 279, 1.2, 21);
    }
    for (const [y, th] of [[279.5, 2.6], [288.5, 1.8], [295.5, 1.8]]) {
      g.fillStyle = '#29494e'; g.fillRect(0, y, W, th);
      g.fillStyle = 'rgba(175,220,224,0.85)'; g.fillRect(0, y, W, 0.7);
    }
    for (let x = 8; x < W; x += 34) { TH.circle(g, x, 278.6, 2.4, '#2b5257'); TH.circle(g, x + 0.7, 277.9, 1, '#9fd0d4'); }
    g.restore();
    for (const L of s.lamps) lamp(g, L);
    paintSign(g, s.sign);
    for (const tr of s.saplings) guard(g, tr);
  }

  // ---------- live pieces ----------
  function drawCloud(ctx, c) {
    const layer = (col, ox, oy, sc) => {
      ctx.fillStyle = col; ctx.beginPath();
      for (const [dx, dy, rr] of c.puffs) {
        const x = c.x + (dx + ox) * c.s, y = c.y + (dy + oy) * c.s, R = rr * sc * c.s;
        ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU);
      }
      ctx.fill();
    };
    layer('rgba(190,210,234,0.9)', -2, 3, 1);        // shaded underside (sun is up and to the right)
    layer('rgba(255,255,255,0.97)', 1, -1, 0.9);
    layer('rgba(255,255,255,0.6)', 3, -3, 0.55);
  }

  function hullPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-40, -12);
    ctx.quadraticCurveTo(-32, -5, -22, -5);
    ctx.lineTo(22, -5);
    ctx.quadraticCurveTo(34, -5, 42, -13);
    ctx.quadraticCurveTo(37, 0, 22, 2);
    ctx.lineTo(-22, 2);
    ctx.quadraticCurveTo(-36, 1, -40, -12);
    ctx.closePath();
  }

  function drawBoat(ctx, b, t) { // ডিঙি নৌকা, facing +x before mirroring
    const bob = Math.sin(t * 1.6 + b.ph) * 0.7;
    ctx.save();
    ctx.translate(b.x, b.y + bob);
    ctx.scale(b.s * b.dir, b.s);
    ctx.save(); ctx.translate(0, 3); ctx.scale(1, -0.55); hullPath(ctx); ctx.restore();
    ctx.fillStyle = 'rgba(20,38,34,0.35)'; ctx.fill();
    ctx.fillStyle = 'rgba(20,38,34,0.18)'; ctx.fillRect(-24, 3, 12, b.kind === 'pole' ? 22 : 12);
    if (b.kind === 'pole') { // boatman poling with a bamboo লগি
      const sw = Math.sin(t * 0.9 + b.ph);
      const tx = -6 + sw * 3, ty = -66, bx = -60 + sw * 6, by = 14;
      const at = (u) => [tx + (bx - tx) * u, ty + (by - ty) * u];
      TH.line(ctx, [-20, -14, -21, -5], '#6e4630', 2.2);
      TH.line(ctx, [-15, -14, -13, -5], '#6e4630', 2.2);
      ctx.fillStyle = '#2f58a3';
      ctx.beginPath(); ctx.moveTo(-23, -30); ctx.lineTo(-12, -30); ctx.lineTo(-11, -13); ctx.lineTo(-25, -13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(160,190,240,0.6)'; ctx.fillRect(-24, -24, 12.5, 1.2); ctx.fillRect(-24.5, -18, 13.5, 1.2);
      ctx.fillStyle = '#f3f1ea'; TH.rr(ctx, -23, -45, 11, 16, 3); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-23, -43, 3, 13);
      const h1 = at(0.24), h2 = at(0.38);
      TH.line(ctx, [-14, -42, h1[0], h1[1]], '#7a4b30', 2.2);
      TH.line(ctx, [-20, -41, h2[0], h2[1]], '#6e4630', 2.2);
      TH.circle(ctx, -17.5, -50, 4.3, '#7a4b30');
      ctx.fillStyle = '#1f1f1f'; ctx.beginPath(); ctx.arc(-17.5, -51, 4.3, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#d64545'; ctx.fillRect(-22, -53.5, 9, 2.2); // গামছা headband
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-19, -53.5, 1.4, 2.2);
      hullPath(ctx); ctx.fillStyle = '#5a3a21'; ctx.fill();
      const u0 = (0 - ty) / (by - ty), wl = at(u0);
      TH.line(ctx, [tx, ty, wl[0], wl[1]], '#c9a96b', 2);
      TH.line(ctx, [wl[0], wl[1], bx, by], 'rgba(201,169,107,0.3)', 2);
      ctx.fillStyle = '#8a6a3a'; for (const u of [0.12, 0.5, 0.75]) { const p = at(u); ctx.fillRect(p[0] - 1.3, p[1], 2.6, 1); }
    } else { // fisherman sitting with a ছিপ, boat tied to a bamboo stake
      TH.line(ctx, [-48, 8, -47, -22], '#b89a60', 2);
      TH.line(ctx, [-47, -14, -38, -11], 'rgba(90,70,40,0.8)', 0.8);
      ctx.fillStyle = '#2a9d8f'; TH.rr(ctx, 3, -25, 11, 15, 3); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(3, -23, 3, 12);
      TH.circle(ctx, 9, -30, 4.2, '#8d5a3b');
      ctx.fillStyle = '#f5f5f0'; ctx.beginPath(); ctx.arc(9, -31, 4.4, Math.PI, TAU); ctx.fill(); // টুপি
      TH.line(ctx, [12, -20, 20, -17], '#8d5a3b', 2);
      const flick = Math.sin(t * 0.7 + b.ph) * 1.5;
      TH.line(ctx, [18, -16, 58, -44 + flick], '#8a6a3a', 1.2);
      TH.line(ctx, [58, -44 + flick, 66, 3], 'rgba(230,240,240,0.7)', 0.5);
      hullPath(ctx); ctx.fillStyle = '#4f331d'; ctx.fill();
    }
    ctx.fillStyle = '#2e1c0f'; // inner shadow + gunwale + plank seam
    ctx.beginPath(); ctx.moveTo(-38, -11.5); ctx.quadraticCurveTo(-31, -6.5, -22, -6.5); ctx.lineTo(22, -6.5); ctx.quadraticCurveTo(33, -6.5, 40, -12.5);
    ctx.lineTo(40, -11.5); ctx.quadraticCurveTo(33, -4.8, 22, -4.8); ctx.lineTo(-22, -4.8); ctx.quadraticCurveTo(-31, -4.8, -38, -10.5); ctx.closePath(); ctx.fill();
    TH.line(ctx, [-24, -4.6, 24, -4.6], '#b27d48', 1.3);
    TH.line(ctx, [-26, -1, 26, -1], 'rgba(20,10,5,0.5)', 0.8);
    ctx.fillStyle = 'rgba(255,220,170,0.25)'; ctx.fillRect(4, -4, 22, 1.4);
    const rp = Math.sin(t * 1.2 + b.ph) * 2; // ripple rings
    ctx.strokeStyle = 'rgba(235,250,255,0.4)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(0, 2.5, 46 + rp, 2.4, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,250,255,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 3, 56 - rp, 3.4, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  // Static gradients, built once and reused every frame.
  function grads(ctx, s) {
    if (s.grads) return s.grads;
    const sky = ctx.createLinearGradient(0, 0, 0, BANK);
    sky.addColorStop(0, '#2474cc'); sky.addColorStop(0.45, '#56a6e6'); sky.addColorStop(0.82, '#a8d6f1'); sky.addColorStop(1, '#ddf1f8');
    const sun = ctx.createRadialGradient(SUN_X, SUN_Y, 8, SUN_X, SUN_Y, 200);
    sun.addColorStop(0, 'rgba(255,249,224,0.9)'); sun.addColorStop(0.16, 'rgba(255,246,214,0.38)'); sun.addColorStop(1, 'rgba(255,246,214,0)');
    const water = ctx.createLinearGradient(0, BANK, 0, 300);
    water.addColorStop(0, '#a3d2dd'); water.addColorStop(0.35, '#5fa8bc'); water.addColorStop(1, '#2c7389');
    const tint = ctx.createLinearGradient(0, BANK, 0, 300);
    tint.addColorStop(0, 'rgba(160,210,222,0.2)'); tint.addColorStop(0.5, 'rgba(70,145,165,0.4)'); tint.addColorStop(1, 'rgba(34,98,118,0.58)');
    const path = ctx.createRadialGradient(0, 0, 0, 0, 0, 62); // used under translate/scale
    path.addColorStop(0, 'rgba(255,250,225,0.6)'); path.addColorStop(0.5, 'rgba(255,250,225,0.22)'); path.addColorStop(1, 'rgba(255,250,225,0)');
    const L = s.led;
    const led = LED.map(([, col]) => {
      const g = ctx.createLinearGradient(0, L.y, 0, L.y + L.h);
      g.addColorStop(0, col); g.addColorStop(1, mix(col, '#000000', 0.45));
      return g;
    });
    return (s.grads = { sky, sun, water, tint, path, led });
  }

  function drawLake(ctx, s, t, sky, G) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, BANK, W, 300 - BANK); ctx.clip();
    ctx.fillStyle = G.water; ctx.fillRect(0, BANK, W, 300 - BANK);
    if (sky) { // the skyline mirrored strip by strip, each strip nudged by the ripples
      const span = (300 - BANK) / REFL, k = sky.k;
      ctx.save();
      ctx.translate(0, BANK); ctx.scale(1, -REFL);
      for (let ys = BANK - 2; ys > BANK - span - 2; ys -= 2) {
        const f = (BANK - ys) / span;
        const dx = Math.sin(t * 1.3 + ys * 0.45) * (0.4 + f * 3) + Math.sin(t * 2.2 - ys * 0.83) * (0.2 + f * 1.3);
        ctx.drawImage(sky.cv, 0, (ys - 0.5 - sky.y0) * k, W * k, 2.5 * k, dx, ys - 0.5 - BANK, W, 2.5);
      }
      ctx.restore();
      // the LED screen is drawn live, so its glow is added to the mirrored (black) frame here
      const L = s.led, i = Math.floor(t / 3.5) % LED.length, ry = BANK + (BANK - L.y - L.h + 1) * REFL;
      ctx.globalAlpha = 0.42; ctx.fillStyle = LED[i][1]; ctx.beginPath();
      for (let y = ry; y < ry + (L.h - 2) * REFL; y += 2.5) ctx.rect(L.x + 1 + Math.sin(t * 1.7 + y * 0.6) * 1.8, y, L.w - 2, 2);
      ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = G.tint; ctx.fillRect(0, BANK, W, 300 - BANK);
    ctx.save(); // sun path on the water
    ctx.translate(SUN_X, 256); ctx.scale(0.55, 1);
    ctx.fillStyle = G.path; ctx.fillRect(-62, -62, 124, 124);
    ctx.restore();
    ctx.fillStyle = 'rgba(232,248,255,0.5)'; // ripples: sunlit crests, then shaded troughs
    ctx.beginPath();
    for (const p of s.ripples) {
      const a = Math.sin(t * 1.1 + p.ph);
      if (a > -0.25) ctx.rect(p.x + Math.sin(t * 0.6 + p.ph * 2) * 5, p.y, p.w * (0.65 + 0.35 * a), p.th);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(12,55,72,0.26)';
    ctx.beginPath();
    for (const p of s.ripples) ctx.rect(p.x + 3 + Math.sin(t * 0.6 + p.ph * 2) * 5, p.y + p.th, p.w * 0.7, p.th);
    ctx.fill();
    ctx.fillStyle = '#fffbe8'; // sun glitter
    ctx.beginPath();
    for (const g of s.glints) {
      const a = Math.sin(t * 3.1 + g.ph);
      if (a > 0.15) ctx.rect(SUN_X + g.dx - g.w / 2, g.y, g.w * a, 1.3);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawLed(ctx, L, t, G) {
    const i = Math.floor(t / 3.5) % LED.length, ph = t % 3.5;
    ctx.fillStyle = G.led[i]; ctx.fillRect(L.x + 1, L.y + 1, L.w - 2, L.h - 2);
    const off = ph < 0.35 ? (1 - ph / 0.35) * 10 : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(L.x + 1, L.y + 1, L.w - 2, L.h - 2); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.font = `bold 9px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LED[i][0], L.x + L.w / 2, L.y + L.h / 2 + 1 + off, L.w - 8);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(L.x + 1, L.y + 1, L.w - 2, (L.h - 2) * 0.42);
  }

  function drawCanopy(ctx, tr, t) {
    const sw = Math.sin(t * 1.4 + tr.ph) * 1.2, cx = tr.x + 1 + sw, cy = tr.top - 8;
    const layer = (col, ox, oy, sc) => {
      ctx.fillStyle = col; ctx.beginPath();
      for (const [dx, dy, rr] of tr.blobs) {
        const x = cx + dx + rr * ox, y = cy + dy + rr * oy, R = rr * sc;
        ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU);
      }
      ctx.fill();
    };
    layer('#2d6630', 0, 0, 1);
    layer('#4a8f3c', 0.16, -0.22, 0.76);
    layer('#86c25a', 0.38, -0.45, 0.4);
  }

  function drawEgret(ctx, e, t) { // বক flying over the lake
    const f = Math.sin(t * 4.6 + e.ph);
    ctx.save();
    ctx.translate(e.x, e.y + Math.sin(t * 1.1 + e.ph) * 3);
    ctx.scale(e.s * e.dir, e.s);
    const f2 = Math.sin(t * 4.6 + e.ph - 0.3);
    ctx.fillStyle = '#cdd5dc'; // far wing
    ctx.beginPath(); ctx.moveTo(-4, -1.5); ctx.quadraticCurveTo(-2, -4 - f2 * 6, -6, -5 - f2 * 10); ctx.quadraticCurveTo(3, -3 - f2 * 4, 6, -1.5); ctx.closePath(); ctx.fill();
    TH.line(ctx, [-8, 1, -21, 2.5], '#2b2b2b', 1);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.2, -0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(150,165,180,0.5)'; ctx.beginPath(); ctx.ellipse(-1, 1.4, 7, 1.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(7, -1); ctx.quadraticCurveTo(12.5, -0.5, 11, -4); ctx.stroke();
    TH.circle(ctx, 12, -4.6, 2.2, '#ffffff');
    TH.line(ctx, [13.6, -4.6, 20, -3.4], '#f2c94c', 1.2);
    ctx.fillStyle = '#ffffff'; // near wing, tip sweeping from high above to below the body
    ctx.beginPath(); ctx.moveTo(-5, -0.5); ctx.quadraticCurveTo(-3, -4 - f * 8, -10, -6 - f * 13); ctx.quadraticCurveTo(3, -3 - f * 5, 7, -0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,165,180,0.35)';
    ctx.beginPath(); ctx.moveTo(-5, -0.5); ctx.quadraticCurveTo(-3.5, -3 - f * 6, -10, -6 - f * 13); ctx.quadraticCurveTo(-4, -2 - f * 4, -5, -0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawKite(ctx, k, t) { // ঘুড়ি flown by a kid on a rooftop across the lake
    const x = k.x + Math.sin(t * 0.5) * 6, y = k.y + Math.sin(t * 1.3) * 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo((x + k.ax) / 2 + 4, (y + k.ay) / 2 + 12, k.ax, k.ay); ctx.stroke();
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.9) * 0.18);
    ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 13);
    for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(t * 4 + i) * 3, 13 + i * 4.5);
    ctx.stroke();
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(10, 0); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-10, 0); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1d3557'; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-3.5, 16); ctx.lineTo(3.5, 16); ctx.closePath(); ctx.fill();
    TH.line(ctx, [0, -12, 0, 12], 'rgba(70,45,20,0.75)', 0.8);
    ctx.strokeStyle = 'rgba(70,45,20,0.75)'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -7, 10, 0); ctx.stroke();
    ctx.restore();
  }

  TH.roads.push({
    id: 'linkroad',
    order: 2,
    name: 'গুলশান-বাড্ডা লিংক রোড',
    nameEn: 'Gulshan-Badda Link Road',
    tagline: 'লেকের হাওয়া, আকাশছোঁয়া ভাড়া',
    weights: { wrongway: 2, footpath: 1, phone: 2, overload: 1, overcharge: 3, tesla: 2 },
    street: { asphalt: '#3b3d43', footpath: '#bdb5a4', curb: ['#f2f2ee', '#1c1c1f'] },

    init(rng) {
      const R = (a, b) => a + rng() * (b - a);
      const pick = (a) => a[(rng() * a.length) | 0];
      const seed = (rng() * 2147483647) | 0;
      const haze = [];
      for (let x = -20; x < W + 20;) {
        const w = R(28, 64);
        haze.push({ x, w, top: R(96, 158), mast: rng() < 0.2 });
        x += w + R(-4, 10);
      }
      // Gulshan skyline across the lake: [type, x, w, top, crown, slant]
      const plan = [
        ['res', -6, 74, 128], ['glass', 60, 72, 78, 'slant', 18], ['band', 132, 92, 134], ['build', 222, 62, 106],
        ['glass', 292, 68, 98, 'spire'], ['res', 362, 100, 148], ['glass', 460, 76, 68, 'crown'], ['band', 540, 88, 132],
        ['glass', 628, 60, 106, 'fin'], ['res', 690, 92, 146], ['glass', 780, 64, 116, 'slant', -14], ['band', 842, 88, 142],
        ['glass', 928, 80, 124, 'spire'],
      ];
      const towers = plan.map(([type, x, w, top, crown, slant], i) => {
        const b = {
          type, x: x + R(-3, 3), w, top: top + R(-6, 6), crown: crown || 'flat', slant: slant || 0,
          pal: i % GLASS.length, floor: R(4.6, 6), mull: R(6.5, 9), d: R(6, 11),
          col: pick(RES), core: R(0.25, 0.6) * w, tanks: 1 + ((rng() * 2) | 0),
        };
        b.side = b.x + b.w / 2 < W / 2 ? 1 : -1;
        return b;
      });
      const led = towers[7], kt = towers[5];
      led.led = { x: led.x + 6, y: led.top - 31, w: 76, h: 24 };
      const kite = { x: kt.x + kt.w * 0.82 - 60, y: kt.top - 64, ax: kt.x + kt.w * 0.82 + 1.6, ay: kt.top - 12.1 };
      const bt = towers[3];
      const crane = { x: bt.x + bt.w * 0.62, base: bt.top, jy: 72, jl: 92, cl: 30 };
      crane.tx = crane.x - 58; crane.hy = 104;
      // draw from the edges inwards so central towers overlap the outer side faces
      towers.sort((a, b) => Math.abs(b.x + b.w / 2 - W / 2) - Math.abs(a.x + a.w / 2 - W / 2));
      const beacons = [];
      for (const b of towers) {
        if (b.crown === 'spire') beacons.push([b.x + b.w / 2, b.top - 31]);
        if (b.crown === 'crown') beacons.push([b.x + b.w / 2, b.top - 29]);
      }
      beacons.push([crane.x + 2.5, crane.jy - 19]);

      const trees = [];
      for (let x = -10; x < W + 10; x += R(13, 24)) {
        const r = R(8, 13), n = 3 + ((rng() * 2) | 0);
        const kind = Math.abs(x - 420) < 12 || Math.abs(x - 770) < 12 ? 'krishna' : rng() < 0.5 ? 'rain' : 'dark';
        const blobs = [];
        for (let j = 0; j < n; j++) blobs.push([R(-1, 1) * r * 0.8, R(-0.6, 0.3) * r, r * R(0.65, 1)]);
        trees.push({ x, y: R(186, 195), r, kind, blobs });
      }
      const palms = [110, 345, 612, 880].map((x) => ({ x: x + R(-10, 10), h: R(34, 44), lean: R(-6, 6) }));
      const strollers = Array.from({ length: 6 }, () => ({ x: R(20, W - 20), c: pick(['#e63946', '#f4a261', '#2a9d8f', '#f1f1f1', '#9b5de5', '#ffd166']) }));
      const farHy = Array.from({ length: 5 }, () => ({ x: R(0, W - 60), w: R(20, 60) }));
      const nearHy = [70, 330, 505, 700, 845, 960].map((x) => ({ x: x + R(-15, 15), y: R(268, 282), w: R(26, 46), n: 7 + ((rng() * 5) | 0), fl: 1 + ((rng() * 2) | 0) }));
      const kash = [18, 300, 420, 590, 735, 900].map((x) => ({
        x: x + R(-10, 10),
        stalks: Array.from({ length: 7 + ((rng() * 4) | 0) }, () => ({ dx: R(-9, 9), h: R(20, 34), lean: R(-5, 7) })),
      }));
      const ripples = Array.from({ length: 44 }, () => {
        const y = R(BANK + 3, 297), f = (y - BANK) / (300 - BANK);
        return { x: R(-10, W), y, w: R(6, 24) * (0.45 + f), th: 0.7 + f * 0.8, ph: R(0, TAU) };
      });
      const glints = Array.from({ length: 42 }, () => {
        const y = R(BANK + 2, 292), f = (y - BANK) / (300 - BANK);
        return { dx: R(-0.5, 0.5) * (16 + f * 70) * (0.3 + rng() * 0.7), y, w: R(4, 12) * (0.5 + f), ph: R(0, TAU) };
      });
      const clouds = [[150, 78, 1], [455, 52, 0.75], [700, 102, 1.15], [985, 118, 0.7]].map(([x, y, sc]) => {
        const n = 5 + ((rng() * 2) | 0), puffs = [];
        for (let j = 0; j < n; j++) {
          const u = j / (n - 1) - 0.5, rr = R(12, 17) * (1 - Math.abs(u) * 0.9);
          puffs.push([u * 72 + R(-4, 4), -rr * 0.55 + R(-2, 2), rr]);
        }
        puffs.push([-12, 2, 14], [14, 2, 13]); // flat-ish base
        return { x, y, s: sc, v: R(3, 6), puffs };
      });
      const sapling = (x) => {
        const blobs = [[-10, 2, 9], [9, 3, 9], [0, -6, 11], [-6, -13, 7], [7, -12, 7], [0, 5, 8]]
          .map(([dx, dy, r]) => [dx + R(-2, 2), dy + R(-2, 2), r * R(0.85, 1.1)]);
        return { x, base: 328, top: 268, ph: R(0, TAU), blobs };
      };
      return {
        seed, cache: {}, haze, towers, crane, beacons, led: led.led, trees, palms, strollers, farHy, nearHy, kash,
        ripples, glints, clouds,
        wisps: [[300, 130, 90], [620, 86, 120], [840, 150, 70]],
        boats: [ // far to near
          { x: 452, y: 227, s: 0.42, dir: -1, v: 0, kind: 'fish', ph: 2 },
          { x: 330, y: 250, s: 0.6, dir: 1, v: 9, kind: 'pole', ph: 0 },
        ],
        board: { x: 8, y: 100, w: 172, h: 62 },
        sign: { x: 722, y: 128, w: 220, h: 64 },
        lamps: [{ x: 196, dir: 1 }, { x: 470, dir: 1 }, { x: 996, dir: -1 }],
        saplings: [sapling(345), sapling(578), sapling(832)],
        egrets: [
          { x: 236, y: 160, dir: 1, v: 24, s: 0.9, ph: 0 },
          { x: 284, y: 176, dir: 1, v: 24, s: 0.75, ph: 1.7 },
          { x: 760, y: 118, dir: -1, v: 30, s: 0.8, ph: 3.1 },
        ],
        kite,
      };
    },

    update(s, dt) {
      for (const c of s.clouds) { c.x += c.v * dt; if (c.x > W + 130) c.x = -130; }
      for (const b of s.boats) {
        if (!b.v) continue;
        b.x += b.v * b.dir * dt;
        if (b.x > W + 60) b.x = -60;
        if (b.x < -60) b.x = W + 60;
      }
      for (const e of s.egrets) {
        e.x += e.v * e.dir * dt;
        if (e.x > W + 40 || e.x < -40) { e.x = e.dir > 0 ? -40 : W + 40; e.y = 110 + Math.random() * 90; }
      }
    },

    drawBack(ctx, s, env) {
      const t = env.t, G = grads(ctx, s);
      ctx.fillStyle = G.sky; ctx.fillRect(0, 0, W, BANK);
      ctx.fillStyle = G.sun; ctx.fillRect(SUN_X - 200, 0, 400, BANK);
      TH.circle(ctx, SUN_X, SUN_Y, 21, '#fffdf3');
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; // high wisps
      for (const [x, y, w] of s.wisps) { ctx.beginPath(); ctx.ellipse(x, y, w, 2.6, -0.04, 0, TAU); ctx.fill(); }
      for (const c of s.clouds) drawCloud(ctx, c);

      const sc = ensure(s, 'sky', ctx, 28, 224, (g) => paintSkyline(g, s));
      drawLake(ctx, s, t, sc, G);
      blit(ctx, sc, (g) => paintSkyline(g, s));
      for (const [x, y] of s.beacons) { // aviation lights
        if ((t + x * 0.01) % 1.6 < 0.3) { TH.circle(ctx, x, y, 4, 'rgba(255,70,60,0.3)'); TH.circle(ctx, x, y, 1.7, '#ff3b30'); }
        else TH.circle(ctx, x, y, 1.3, '#8b1e1e');
      }
      drawLed(ctx, s.led, t, G);
      for (const b of s.boats) drawBoat(ctx, b, t);
      // kite and egrets are over the lake, so they stay behind the near bank, signs and lamps
      drawKite(ctx, s.kite, t);
      for (const e of s.egrets) drawEgret(ctx, e, t);
      blit(ctx, ensure(s, 'near', ctx, 84, 302, (g) => paintNear(g, s)), (g) => paintNear(g, s));

      const b = s.board, tx = b.x + 62 + (b.w - 68) / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#123a63'; ctx.font = `bold 14px ${TH.FONT}`;
      ctx.fillText('লেকভিউ রেসিডেন্স', tx, b.y + 16, b.w - 72);
      ctx.fillStyle = '#5b6470'; ctx.font = `500 10px ${TH.FONT}`;
      ctx.fillText('গুলশানে স্বপ্নের ঠিকানা', tx, b.y + 33, b.w - 74);
      ctx.fillStyle = '#ffffff'; ctx.font = `bold 10px ${TH.FONT}`;
      ctx.fillText('বুকিং চলছে!', tx, b.y + b.h - 11, b.w - 80);
    },

    drawMid(ctx, s, env) {
      blit(ctx, ensure(s, 'mid', ctx, 118, 348, (g) => paintMid(g, s)), (g) => paintMid(g, s));
      for (const tr of s.saplings) drawCanopy(ctx, tr, env.t);
      const sg = s.sign, cx = sg.x + sg.w / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
      ctx.font = `bold 17px ${TH.FONT}`;
      ctx.fillText('গুলশান-বাড্ডা লিংক রোড', cx, sg.y + 20, sg.w - 22);
      ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = `500 10px ${TH.FONT}`;
      ctx.fillText('Gulshan-Badda Link Road', cx, sg.y + 35, sg.w - 40);
      ctx.fillStyle = '#ffffff'; ctx.font = `bold 11px ${TH.FONT}`;
      ctx.textAlign = 'left'; ctx.fillText('বাড্ডা', sg.x + 31, sg.y + 54, 70);
      ctx.textAlign = 'right'; ctx.fillText('গুলশান ১', sg.x + sg.w - 31, sg.y + 54, 80);
    },
  });
})();
