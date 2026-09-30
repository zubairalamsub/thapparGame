// First-person scenery: Badda (বাড্ডা), Pragati Sarani on a bright, hazy midday.
// Dense 4-9 storey flats strip-mapped from painted facade textures (shops below, stained concrete,
// balconies with laundry, AC units and grilles above), hanging signboards, awnings, a tea stall and a
// fruit van on the footpath, electric poles with a tangled mess of wires and crows, a banner across
// the road and a hazy skyline with a minaret and a water tank at the vanishing point.
// Also defines TH.fpDhakaKit, the shared Dhaka facade painter that js/fproads/linkroad.js reuses.
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

  // ---------- colour helpers (hex in, hex out, for painting) ----------
  const rgb3 = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex3 = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  function hm(a, b, t) {
    const A = rgb3(a), B = rgb3(b), k = clamp(t, 0, 1);
    return hex3(Math.round(A[0] + (B[0] - A[0]) * k), Math.round(A[1] + (B[1] - A[1]) * k), Math.round(A[2] + (B[2] - A[2]) * k));
  }
  const dk = (c, t) => hm(c, '#1c1a1d', t);
  const lt = (c, t) => hm(c, '#fffaf0', t);
  const rgba = (c, a) => { const A = rgb3(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; };
  const SH = (a) => `rgba(34,26,30,${a})`;    // soft shadow
  const HI = (a) => `rgba(255,251,240,${a})`; // soft light
  // Colour c seen through the haze at depth d (quantised so fp.mix can memoise).
  const fogMix = (c, d) => { const t = Math.round(fp.fogAt(d) * 0.95 * 20) / 20; return t <= 0 ? c : fp.mix(c, fp.fog.color, t); };

  // ---------- offscreen textures ----------
  function mkTex(list, wu, hu, k) {
    const c = fp.canvas(wu * k, hu * k);
    if (!c) return null;
    c.ctx.setTransform(k, 0, 0, k, 0, 0);
    const t = { cv: c.canvas, g: c.ctx, k, w: wu, h: hu };
    list.push(t);
    return t;
  }
  const texBytes = (list) => list.reduce((m, t) => m + t.cv.width * t.cv.height * 4, 0);
  function freeTex(list) { for (const t of list) { t.cv.width = 0; t.cv.height = 0; } list.length = 0; }
  function stain(g, x, y, w, h, a) { // streak fading downwards (or upwards for h < 0)
    const s = g.createLinearGradient(0, y, 0, y + h);
    s.addColorStop(0, SH(a)); s.addColorStop(1, SH(0));
    g.fillStyle = s; g.fillRect(x, Math.min(y, y + h), w, Math.abs(h));
  }
  function blotches(g, R, x, y, w, h, n, a) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = R() < 0.6 ? SH(a * (0.5 + R())) : HI(a * (0.4 + R() * 0.6));
      g.beginPath(); g.ellipse(x + R() * w, y + R() * h, 20 + R() * 60, 14 + R() * 40, 0, 0, TAU); g.fill();
    }
  }

  // ======================================================================================
  // Dhaka facade kit (shared with linkroad.js)
  // ======================================================================================
  const MW = 200;    // one shop per 200-unit module of frontage
  const BAND = 300;  // ground-floor band texture: h 8..308 (shutters, signboards, slab)
  const FH = 170;    // storey height of the flats above
  const ROOF = 250;  // roof zone above the top floor (parapet + tanks, stair room, dish...)
  const PARA = 60;   // parapet height
  const DEPTH = 900; // how far the side walls run back from the facade

  const CURT = ['#c0392b', '#2e86ab', '#f4d35e', '#8e44ad', '#e67e22', '#16a085', '#f5f0e6', '#d35d8a', '#3a7d44'];
  const CLOTH = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#264653', '#f8f8f2', '#9b5de5', '#f15bb5', '#00bbf9', '#3a86ff', '#ff006e', '#ffbe0b', '#8ac926'];
  const GOODS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#f1faee', '#ffb703', '#8ecae6', '#fb8500', '#6a994e', '#d62828'];
  const PILLAR = ['#b9b2a6', '#a79f93', '#c7c0b2', '#8f8a84', '#b8a28c', '#9aa39b'];
  const SHUT = ['#9aa0a6', '#9aa0a6', '#8c9399', '#4f7aa8', '#5e8a6a', '#a15c38'];

  // ---- ground floor, one module: x..x+200 in the band texture (y 0 = slab top h 308, y 300 = footpath)
  function paintShop(g, x, sp, R) {
    const W = MW, wall = sp.wall;
    g.fillStyle = wall; g.fillRect(x, 0, W, BAND);
    // slab band with grime drips
    g.fillStyle = dk(wall, 0.2); g.fillRect(x, 0, W, 30);
    g.fillStyle = HI(0.18); g.fillRect(x, 0, W, 3);
    g.fillStyle = SH(0.35); g.fillRect(x, 27, W, 5);
    for (let i = 0; i < 4; i++) stain(g, x + R() * W, 30, 3 + R() * 5, 20 + R() * 40, 0.25);
    // tiled pillars
    for (const px of [x, x + W - 16]) {
      g.fillStyle = sp.pillar; g.fillRect(px, 96, 16, 204);
      g.fillStyle = SH(0.14); for (let y = 108; y < 296; y += 17) g.fillRect(px, y, 16, 1.5);
      g.fillStyle = HI(0.2); g.fillRect(px + 12, 96, 2, 204);
      g.fillStyle = SH(0.2); g.fillRect(px, 96, 2, 204);
    }
    // the shop opening
    const ox = x + 16, ow = W - 32, oy = 100, ob = 288;
    interior(g, sp, ox, oy, ow, ob - oy, R);
    if (sp.state !== 'open') shutter(g, sp, ox, oy, ow, sp.state === 'closed' ? ob : sp.sy, R);
    else { // rolled-up shutter box
      g.fillStyle = '#8a8f94'; g.fillRect(ox, oy, ow, 11);
      g.fillStyle = HI(0.35); g.fillRect(ox, oy, ow, 2);
      g.fillStyle = SH(0.35); g.fillRect(ox, oy + 11, ow, 4);
    }
    g.fillStyle = SH(0.3); g.fillRect(ox, oy, 4, ob - oy); g.fillRect(ox + ow - 4, oy, 4, ob - oy);
    // step and footpath grime
    g.fillStyle = '#8e8a82'; g.fillRect(x, ob, W, BAND - ob);
    g.fillStyle = HI(0.22); g.fillRect(x, ob, W, 2);
    stain(g, x, BAND, W, -40, 0.28);
    // signboard
    const bx = x + 6, by = 33, bw = W - 12, bh = 60;
    g.fillStyle = SH(0.4); g.fillRect(bx + 4, by + 5, bw, bh);
    const sg = g.createLinearGradient(0, by, 0, by + bh);
    sg.addColorStop(0, lt(sp.bg, 0.22)); sg.addColorStop(0.5, sp.bg); sg.addColorStop(1, dk(sp.bg, 0.22));
    g.fillStyle = sg; g.fillRect(bx, by, bw, bh);
    g.strokeStyle = sp.bd; g.lineWidth = 2.5; g.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    g.fillStyle = HI(0.4); g.fillRect(bx, by, bw, 2);
    let tx = x + W / 2, tw = bw - 18;
    if (sp.icon) { // pharmacy cross
      const cx = bx + 22, cy = by + bh / 2;
      g.fillStyle = sp.icon; g.fillRect(cx - 11, cy - 4, 22, 8); g.fillRect(cx - 4, cy - 11, 8, 22);
      tx += 16; tw -= 34;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (sp.shadow) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.font = `700 27px ${TH.FONT}`; g.fillText(sp.name, tx + 1.5, by + 25.5, tw); }
    g.fillStyle = sp.fg; g.font = `700 27px ${TH.FONT}`; g.fillText(sp.name, tx, by + 24, tw);
    g.font = `500 12px ${TH.FONT}`; g.fillText(sp.sub, tx, by + 47, tw);
    g.fillStyle = 'rgba(90,70,50,0.16)'; g.fillRect(bx, by + bh - 12, bw, 12); // dust
    stain(g, bx + R() * bw * 0.8, by + bh, 3, 18, 0.3);
    if (sp.mini) { // small hanging board under the sign
      const mx = x + W - 78;
      g.strokeStyle = '#3a302c'; g.lineWidth = 1; g.beginPath(); g.moveTo(mx + 6, by + bh); g.lineTo(mx + 6, 106); g.moveTo(mx + 54, by + bh); g.lineTo(mx + 54, 106); g.stroke();
      g.fillStyle = SH(0.3); g.fillRect(mx + 3, 108, 60, 20);
      g.fillStyle = '#fbfaf3'; g.fillRect(mx, 105, 60, 20);
      g.strokeStyle = '#b91c1c'; g.lineWidth = 1.2; g.strokeRect(mx + 2, 107, 56, 16);
      g.fillStyle = '#b91c1c'; g.font = `700 11px ${TH.FONT}`; g.fillText(sp.mini, mx + 30, 115.5, 54);
    }
  }

  function interior(g, sp, ox, oy, ow, oh, R) {
    const ob = oy + oh, t = sp.type;
    const bright = t === 'pharmacy' || t === 'sweets' || t === 'mobile' || t === 'salon';
    const gr = g.createLinearGradient(0, oy, 0, ob);
    if (bright) { gr.addColorStop(0, '#eef3ee'); gr.addColorStop(1, '#b9c6bf'); }
    else if (t === 'hotel' || t === 'biryani') { gr.addColorStop(0, '#a9cbbd'); gr.addColorStop(1, '#5f7f72'); }
    else { gr.addColorStop(0, '#2e2420'); gr.addColorStop(1, '#4d3a2e'); }
    g.fillStyle = gr; g.fillRect(ox, oy, ow, oh);
    const lg = g.createRadialGradient(ox + ow / 2, oy + 16, 0, ox + ow / 2, oy + 16, ow * 0.75);
    lg.addColorStop(0, 'rgba(255,250,230,0.45)'); lg.addColorStop(1, 'rgba(255,250,230,0)');
    g.fillStyle = lg; g.fillRect(ox, oy, ow, oh);
    g.fillStyle = '#fffdf2'; g.fillRect(ox + ow * 0.3, oy + 16, ow * 0.4, 4);
    const shelves = (ys, light, h0, h1, pal) => {
      for (const yy of ys) {
        g.fillStyle = light ? '#f4f1ea' : '#6b4a32'; g.fillRect(ox + 4, yy, ow - 8, 3);
        for (let xx = ox + 6; xx < ox + ow - 12;) {
          const iw = 6 + R() * 8, ih = h0 + R() * (h1 - h0);
          g.fillStyle = pal[(R() * pal.length) | 0]; g.fillRect(xx, yy - ih, iw, ih);
          g.fillStyle = HI(0.25); g.fillRect(xx + iw - 2, yy - ih, 1.5, ih);
          xx += iw + 1.5;
        }
      }
    };
    const table = (x0, x1) => {
      g.fillStyle = '#6b4a32'; g.fillRect(x0, ob - 48, x1 - x0, 5);
      g.fillRect(x0 + 4, ob - 43, 4, 43); g.fillRect(x1 - 8, ob - 43, 4, 43);
      g.fillStyle = '#c9ced3'; g.fillRect(x0 + (x1 - x0) * 0.3, ob - 58, 8, 10); g.fillRect(x0 + (x1 - x0) * 0.6, ob - 55, 6, 7);
    };
    if (t === 'grocery') {
      shelves([oy + 62, oy + 104, oy + 146], false, 14, 28, GOODS);
      for (let i = 0; i < 4; i++) {
        const sx = ox + 6 + i * 26;
        g.fillStyle = ['#d8c7a0', '#cdb98c', '#e2d3ad', '#c9b48a'][i]; TH.rr(g, sx, ob - 40, 24, 40, 7); g.fill();
        g.fillStyle = ['#f4f1e6', '#e0a458', '#c9a227', '#9c4a2e'][i]; g.beginPath(); g.ellipse(sx + 12, ob - 38, 10, 4, 0, 0, TAU); g.fill();
      }
      for (let i = 0; i < 7; i++) { // strings of chips packets hanging at the front
        const hx = ox + 10 + i * (ow - 20) / 6;
        g.strokeStyle = 'rgba(30,20,20,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, oy + 12); g.lineTo(hx, oy + 66); g.stroke();
        for (let j = 0; j < 4; j++) { g.fillStyle = GOODS[(R() * GOODS.length) | 0]; g.fillRect(hx - 6, oy + 16 + j * 13, 12, 11); }
      }
    } else if (t === 'variety') {
      const BK = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#db2777', '#0891b2'];
      for (const yy of [oy + 78, oy + 128]) {
        g.fillStyle = '#6b4a32'; g.fillRect(ox + 4, yy, ow - 8, 3);
        for (let xx = ox + 8; xx < ox + ow - 26; xx += 22) {
          const c = BK[(R() * BK.length) | 0];
          g.fillStyle = c; g.beginPath(); g.moveTo(xx, yy - 26); g.lineTo(xx + 18, yy - 26); g.lineTo(xx + 15, yy); g.lineTo(xx + 3, yy); g.closePath(); g.fill();
          g.fillStyle = HI(0.35); g.fillRect(xx, yy - 26, 18, 3);
        }
      }
      const cx = ox + ow - 40; // stacked plastic chairs
      for (let j = 0; j < 5; j++) { g.fillStyle = j % 2 ? '#c81e1e' : '#a51515'; TH.rr(g, cx, ob - 90 + j * 5, 34, 28, 5); g.fill(); }
      g.fillStyle = '#a51515'; g.fillRect(cx + 3, ob - 60, 4, 60); g.fillRect(cx + 27, ob - 60, 4, 60);
    } else if (t === 'hotel') {
      g.fillStyle = '#f5efe0'; g.fillRect(ox + ow * 0.52, oy + 30, 56, 34); // menu board
      g.fillStyle = SH(0.45); for (let i = 0; i < 4; i++) g.fillRect(ox + ow * 0.52 + 6, oy + 40 + i * 6, 44, 2);
      table(ox + ow * 0.45, ox + ow - 8);
      const sx = ox + 4, sw = 70; // glass showcase: parota and singara
      g.fillStyle = '#8b939b'; g.fillRect(sx, ob - 62, sw, 62);
      g.fillStyle = 'rgba(215,235,240,0.5)'; g.fillRect(sx + 4, ob - 58, sw - 8, 30);
      for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#d9a441' : '#e8c27a'; g.beginPath(); g.ellipse(sx + 12 + i * 12, ob - 34, 7, 3, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#c98a2e';
      for (let i = 0; i < 4; i++) { const tx = sx + 14 + i * 14; g.beginPath(); g.moveTo(tx - 6, ob - 44); g.lineTo(tx + 6, ob - 44); g.lineTo(tx, ob - 54); g.closePath(); g.fill(); }
      g.fillStyle = HI(0.6); g.fillRect(sx + sw - 10, ob - 58, 2, 30);
    } else if (t === 'biryani') {
      table(ox + ow * 0.5, ox + ow - 8);
      const px = ox + ow * 0.26, py = ob; // the big deg with a red cloth over the lid
      g.fillStyle = '#3a3030'; g.fillRect(px - 30, py - 12, 60, 12);
      const pg = g.createLinearGradient(px - 32, 0, px + 32, 0); pg.addColorStop(0, '#7d8288'); pg.addColorStop(0.72, '#eceef0'); pg.addColorStop(1, '#9ea3a8');
      g.fillStyle = pg; g.beginPath(); g.ellipse(px, py - 34, 32, 23, 0, 0, TAU); g.fill();
      g.fillStyle = '#b91c1c'; g.beginPath(); g.ellipse(px, py - 54, 25, 9, 0, 0, TAU); g.fill();
      g.fillRect(px - 25, py - 54, 50, 12);
      g.fillStyle = '#f5d76e'; g.fillRect(px - 20, py - 44, 40, 2.5);
    } else if (t === 'pharmacy') {
      shelves([oy + 50, oy + 82, oy + 114], false, 8, 16, ['#ffffff', '#dbeafe', '#bbf7d0', '#fde68a', '#fecaca', '#e9d5ff']);
      g.fillStyle = 'rgba(190,220,228,0.8)'; g.fillRect(ox + 4, ob - 52, ow - 8, 52);
      g.fillStyle = '#8b939b'; g.fillRect(ox + 4, ob - 52, ow - 8, 4); g.fillRect(ox + 4, ob - 28, ow - 8, 2);
      g.fillStyle = HI(0.7); g.fillRect(ox + ow - 24, ob - 46, 3, 40);
    } else if (t === 'tailor' || t === 'fashion') {
      if (t === 'tailor') {
        for (const [y0, h] of [[oy + 24, 44], [oy + 80, 40]]) {
          g.fillStyle = '#6b4a32'; g.fillRect(ox + 4, y0 + h, ow - 8, 3);
          for (let xx = ox + 6; xx < ox + ow - 12; xx += 11) { g.fillStyle = CLOTH[(R() * CLOTH.length) | 0]; g.fillRect(xx, y0, 9.5, h); }
        }
        g.fillStyle = '#2b2b30'; g.fillRect(ox + 16, ob - 48, 44, 6); g.fillRect(ox + 20, ob - 70, 30, 22); // sewing machine
        g.fillRect(ox + 20, ob - 42, 4, 42); g.fillRect(ox + 52, ob - 42, 4, 42);
      } else {
        g.fillStyle = '#9ca3af'; g.fillRect(ox + 6, oy + 26, ow - 12, 3);
        for (let xx = ox + 12; xx < ox + ow - 24; xx += 24) { // garments on a rail
          const c = CLOTH[(R() * CLOTH.length) | 0];
          g.fillStyle = c; g.beginPath(); g.moveTo(xx, oy + 30); g.lineTo(xx + 20, oy + 30); g.lineTo(xx + 23, oy + 96); g.lineTo(xx - 3, oy + 96); g.closePath(); g.fill();
          g.fillStyle = SH(0.2); g.fillRect(xx + 9, oy + 30, 2, 66);
        }
        g.fillStyle = '#d9b99b'; TH.circle(g, ox + ow - 30, ob - 150, 9, '#d9b99b'); // mannequin
        g.fillStyle = CLOTH[(R() * CLOTH.length) | 0]; g.fillRect(ox + ow - 42, ob - 140, 24, 80);
        g.fillStyle = '#6b4a32'; g.fillRect(ox + ow - 32, ob - 60, 4, 60);
      }
      const px = ox + ow * 0.68; // panjabi on a hanger
      g.fillStyle = '#f1ead8'; g.fillRect(px - 10, oy + 110, 20, 56); g.fillRect(px - 17, oy + 110, 34, 9);
      g.fillRect(px - 17, oy + 110, 7, 28); g.fillRect(px + 10, oy + 110, 7, 28);
    } else if (t === 'sweets') {
      g.strokeStyle = 'rgba(120,140,140,0.25)'; g.lineWidth = 1; g.beginPath();
      for (let yy = oy + 20; yy < ob - 60; yy += 18) { g.moveTo(ox, yy); g.lineTo(ox + ow, yy); }
      for (let xx = ox + 18; xx < ox + ow; xx += 18) { g.moveTo(xx, oy); g.lineTo(xx, ob - 60); }
      g.stroke();
      g.fillStyle = '#8b939b'; g.fillRect(ox + 4, ob - 62, ow - 8, 62);
      g.fillStyle = 'rgba(232,242,242,0.55)'; g.fillRect(ox + 8, ob - 58, ow - 16, 42);
      const SW = ['#f7f1e3', '#5a2418', '#e3a54a', '#f2d7a0', '#e0708a'];
      for (let row = 0; row < 2; row++) for (let xx = ox + 16, i = 0; xx < ox + ow - 12; xx += 11, i++) TH.circle(g, xx, ob - 48 + row * 16, 4.4, SW[(Math.floor(i / 3) + row) % SW.length]);
      g.fillStyle = '#e8e2d2'; for (let i = 0; i < 3; i++) g.fillRect(ox + 14 + i * 44, ob - 72, 36, 8); // trays of doi
    } else if (t === 'hardware') {
      g.fillStyle = '#9ca3af'; for (let i = 0; i < 5; i++) g.fillRect(ox + 6, oy + 30 + i * 8, ow - 12, 4);
      g.fillStyle = '#f4f4f0'; for (let i = 0; i < 3; i++) g.fillRect(ox + 6, oy + 80 + i * 8, ow * 0.6, 4);
      for (let i = 0; i < 5; i++) {
        const bx = ox + 8 + i * 25;
        g.fillStyle = ['#2563eb', '#dc2626', '#f8fafc', '#16a34a', '#f59e0b'][i]; g.fillRect(bx, ob - 32, 22, 32);
        g.fillStyle = '#6b7280'; g.fillRect(bx - 1, ob - 34, 24, 4);
      }
      g.strokeStyle = '#15803d'; g.lineWidth = 3.5;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(ox + ow - 30, ob - 70, 20 - i * 4, 12 - i * 3, 0, 0, TAU); g.stroke(); }
    } else if (t === 'mobile') {
      for (let i = 0; i < 3; i++) { // phone posters
        const px = ox + 8 + i * (ow - 16) / 3, pw = (ow - 16) / 3 - 8;
        g.fillStyle = ['#e11d48', '#7c3aed', '#0ea5e9'][i]; g.fillRect(px, oy + 26, pw, 52);
        g.fillStyle = '#111827'; TH.rr(g, px + pw * 0.55, oy + 32, pw * 0.34, 40, 3); g.fill();
        g.fillStyle = HI(0.8); g.fillRect(px + 5, oy + 36, pw * 0.4, 3); g.fillRect(px + 5, oy + 44, pw * 0.3, 2);
      }
      g.fillStyle = 'rgba(190,225,255,0.7)'; g.fillRect(ox + 4, ob - 60, ow - 8, 60);
      g.fillStyle = '#111827'; for (let xx = ox + 14; xx < ox + ow - 14; xx += 18) g.fillRect(xx, ob - 46, 8, 14);
      g.fillStyle = '#8b939b'; g.fillRect(ox + 4, ob - 60, ow - 8, 3);
    } else if (t === 'salon') {
      for (let i = 0; i < 2; i++) { // mirrors
        const mx = ox + 14 + i * 76;
        g.fillStyle = '#e5e7eb'; g.fillRect(mx - 4, oy + 26, 60, 84);
        g.fillStyle = '#a5c8dc'; g.fillRect(mx, oy + 30, 52, 76);
        g.fillStyle = HI(0.5); g.beginPath(); g.moveTo(mx + 30, oy + 30); g.lineTo(mx + 44, oy + 30); g.lineTo(mx + 14, oy + 106); g.lineTo(mx, oy + 106); g.closePath(); g.fill();
      }
      g.fillStyle = '#7f1d1d'; TH.rr(g, ox + 40, ob - 70, 50, 40, 8); g.fill(); // barber chair
      g.fillStyle = '#374151'; g.fillRect(ox + 60, ob - 30, 10, 30); g.fillRect(ox + 46, ob - 6, 38, 6);
    }
  }

  function shutter(g, sp, ox, oy, ow, sy, R) {
    const h = sy - oy;
    if (h <= 2) return;
    const col = sp.shutterC;
    const sg = g.createLinearGradient(ox, 0, ox + ow, 0);
    sg.addColorStop(0, dk(col, 0.14)); sg.addColorStop(0.6, col); sg.addColorStop(1, lt(col, 0.12));
    g.fillStyle = sg; g.fillRect(ox, oy, ow, h);
    g.fillStyle = SH(0.3); for (let y = oy + 5; y < sy - 3; y += 7) g.fillRect(ox, y, ow, 1.8);
    g.fillStyle = HI(0.18); for (let y = oy + 7; y < sy - 3; y += 7) g.fillRect(ox, y, ow, 1.2);
    for (let i = 0; i < 3; i++) { // rust streaks
      const rx = ox + R() * (ow - 6), ry = oy + R() * h * 0.4, rh = h * (0.3 + R() * 0.5);
      const rg = g.createLinearGradient(0, ry, 0, ry + rh);
      rg.addColorStop(0, 'rgba(140,70,30,0.4)'); rg.addColorStop(1, 'rgba(140,70,30,0)');
      g.fillStyle = rg; g.fillRect(rx, ry, 5, rh);
    }
    if (sp.poster && h > 90) { // pasted bills and a painted phone number
      const px = ox + 14 + R() * (ow - 80);
      g.fillStyle = sp.poster; g.fillRect(px, oy + h * 0.35, 46, 60);
      g.fillStyle = 'rgba(190,30,30,0.75)'; g.fillRect(px + 5, oy + h * 0.35 + 8, 36, 5); g.fillRect(px + 5, oy + h * 0.35 + 18, 26, 3); g.fillRect(px + 5, oy + h * 0.35 + 25, 32, 3);
      g.fillStyle = SH(0.2); g.fillRect(px, oy + h * 0.35 + 50, 46, 10);
    }
    g.fillStyle = dk(col, 0.35); g.fillRect(ox, sy - 6, ow, 6);
    if (sy >= 280) { g.fillStyle = '#2b2b2b'; g.fillRect(ox + ow * 0.25, sy - 10, 7, 9); g.fillRect(ox + ow * 0.7, sy - 10, 7, 9); } // padlocks
    else { g.fillStyle = SH(0.45); g.fillRect(ox, sy, ow, 5); }
  }

  // ---- flats above: texture w x (floors*FH + ROOF); y 0 = top of the roof zone, y H = h 300
  function paintUpper(g, b, R) {
    const W = b.w, n = b.floors, H = n * FH + ROOF, c = b.color;
    const yPara = ROOF - PARA;
    roofItems(g, b, R);
    const yBody = b.parapet === 'rail' ? ROOF : yPara;
    const bg = g.createLinearGradient(0, yBody, 0, H);
    bg.addColorStop(0, lt(c, 0.12)); bg.addColorStop(0.55, c); bg.addColorStop(1, dk(c, 0.1));
    g.fillStyle = bg; g.fillRect(0, yBody, W, H - yBody);
    if (b.style === 'glass') { paintGlassUpper(g, b, R, H); return; }
    blotches(g, R, 0, yBody, W, H - yBody, b.style === 'raw' ? 26 : 12, b.style === 'raw' ? 0.09 : 0.06);
    if (b.style === 'raw') { g.fillStyle = SH(0.08); for (let y = yBody + 24; y < H; y += 42) g.fillRect(0, y, W, 2); }
    if (b.style === 'tile') { g.fillStyle = SH(0.07); for (let y = yBody + 10; y < H; y += 20) g.fillRect(0, y, W, 1.2); for (let x = 10; x < W; x += 20) g.fillRect(x, yBody, 1.2, H - yBody); }
    const mg = 18, bw = (W - 2 * mg) / b.nb;
    // pilasters between bays
    g.fillStyle = lt(c, 0.05);
    for (let i = 0; i <= b.nb; i++) g.fillRect(mg + i * bw - 5, yBody, 10, H - yBody);
    for (let f = 0; f < n; f++) {
      const fy = H - (f + 1) * FH;
      const bare = b.style === 'brick' && f === n - 1;
      if (b.style === 'brick' && !bare) { // brick infill panels between the concrete frame
        for (let i = 0; i < b.nb; i++) brickPanel(g, mg + i * bw + 5, fy + 10, bw - 10, FH - 18, R);
      }
      for (let ci = 0; ci < b.nb; ci++) {
        const cell = b.cells[f * b.nb + ci], bx = mg + ci * bw;
        if (bare) bareOpening(g, bx, fy, bw);
        else if (cell.k === 'win') paintWin(g, b, cell, bx, fy, bw);
        else if (cell.k === 'balc') paintBalc(g, b, cell, bx, fy, bw, R);
        else paintJali(g, b, bx, fy, bw);
      }
      if (f > 0) { // floor slab band
        const y = H - f * FH;
        g.fillStyle = b.accent; g.fillRect(0, y - 9, W, 12);
        g.fillStyle = HI(0.3); g.fillRect(0, y - 9, W, 2);
        g.fillStyle = SH(0.28); g.fillRect(0, y + 3, W, 6);
      }
    }
    // first-floor slab (sits on the shop band)
    g.fillStyle = b.accent; g.fillRect(0, H - 12, W, 12);
    g.fillStyle = HI(0.3); g.fillRect(0, H - 12, W, 2);
    // parapet
    if (b.parapet === 'rail') {
      g.fillStyle = b.grill; g.fillRect(0, yPara, W, 5); g.fillRect(0, yPara + 26, W, 3);
      for (let x = 4; x < W; x += 16) g.fillRect(x, yPara, 3, PARA);
      g.fillStyle = lt(c, 0.2); g.fillRect(0, ROOF - 5, W, 5);
    } else {
      g.fillStyle = lt(c, 0.06); g.fillRect(0, yPara, W, PARA);
      g.fillStyle = lt(c, 0.25); g.fillRect(-2, yPara - 4, W + 4, 7);
      g.fillStyle = SH(0.25); g.fillRect(0, yPara + 3, W, 3);
      stain(g, 0, yPara + 6, W, 30, 0.22);
    }
    const streaks = b.style === 'raw' ? 9 : 5;
    for (let i = 0; i < streaks; i++) stain(g, R() * W, yPara + 6, 4 + R() * 9, 80 + R() * 260, b.style === 'raw' ? 0.22 : 0.14);
    if (b.banner) vinyl(g, b.banner, H);
    if (b.tolet) toLet(g, b.tolet.x, b.tolet.y);
    g.fillStyle = SH(0.16); g.fillRect(0, yPara, 5, H - yPara);
    g.fillStyle = HI(0.12); g.fillRect(W - 5, yPara, 5, H - yPara);
  }

  function paintGlassUpper(g, b, R, H) { // newer commercial block: aluminium panels and tinted glass bands
    const W = b.w, n = b.floors;
    g.fillStyle = SH(0.06); for (let x = 0; x < W; x += 50) g.fillRect(x, ROOF - PARA, 1.5, H);
    for (let f = 0; f < n; f++) {
      const fy = H - (f + 1) * FH, gy = fy + 26, gh = FH - 52;
      const gr = g.createLinearGradient(0, gy, 0, gy + gh);
      gr.addColorStop(0, b.glass[0]); gr.addColorStop(0.35, b.glass[1]); gr.addColorStop(1, b.glass[2]);
      g.fillStyle = gr; g.fillRect(14, gy, W - 28, gh);
      g.fillStyle = 'rgba(30,40,52,0.28)'; // the street opposite, mirrored
      for (let x = 14; x < W - 14;) { const w = Math.min(20 + R() * 40, W - 14 - x), h = gh * (0.2 + R() * 0.35); g.fillRect(x, gy + gh - h, w, h); x += w + 4 + R() * 8; }
      g.fillStyle = '#8f9496'; for (let x = 14; x <= W - 14; x += 48) g.fillRect(x - 1.5, gy, 3, gh);
      g.fillRect(14, gy + gh * 0.35, W - 28, 2);
      g.fillStyle = SH(0.35); g.fillRect(14, gy, W - 28, 4);
      g.fillStyle = '#f2f0ea'; g.fillRect(0, fy + FH - 10, W, 10);
      g.fillStyle = SH(0.2); g.fillRect(0, fy + FH, W, 3);
    }
    g.fillStyle = HI(0.2); // sun glare sweeping across the glass
    g.beginPath(); g.moveTo(W * 0.55, ROOF); g.lineTo(W * 0.72, ROOF); g.lineTo(W * 0.3, H); g.lineTo(W * 0.13, H); g.closePath(); g.fill();
    g.fillStyle = b.accent; g.fillRect(4, ROOF - PARA, 10, H - ROOF + PARA);
    g.fillStyle = lt(b.color, 0.3); g.fillRect(-2, ROOF - PARA - 4, W + 4, 8);
    if (b.banner) vinyl(g, b.banner, H);
  }

  function brickPanel(g, x, y, w, h, R) {
    g.fillStyle = '#a4573e'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(232,204,172,0.35)'; for (let yy = y + 9; yy < y + h; yy += 9) g.fillRect(x, yy - 1.5, w, 1.5);
    g.fillStyle = 'rgba(70,30,22,0.25)';
    for (let row = 0, yy = y; yy < y + h; row++, yy += 9) for (let bx = x + (row % 2) * 11; bx < x + w; bx += 22) g.fillRect(bx, yy, 1.5, 7.5);
    for (let i = 0; i < 10; i++) { g.fillStyle = R() < 0.5 ? 'rgba(90,30,20,0.2)' : 'rgba(240,170,120,0.16)'; g.fillRect(x + R() * (w - 20), y + R() * (h - 8), 20, 7.5); }
  }
  function bareOpening(g, bx, fy, bw) {
    g.fillStyle = '#2d2527'; g.fillRect(bx + 10, fy + 14, bw - 20, FH - 24);
    g.fillStyle = SH(0.4); g.fillRect(bx + 10, fy + 14, bw - 20, 6);
  }
  function paintJali(g, b, bx, fy, bw) { // stairwell ventilation blocks
    const jx = bx + 24, jw = bw - 48, jy = fy + 20, jh = FH - 38;
    g.fillStyle = dk(b.color, 0.06); g.fillRect(jx, jy, jw, jh);
    g.fillStyle = SH(0.55);
    for (let yy = jy + 5; yy < jy + jh - 9; yy += 14) for (let xx = jx + 5; xx < jx + jw - 9; xx += 14) g.fillRect(xx, yy, 8.5, 8.5);
    g.fillStyle = HI(0.3); g.fillRect(jx, jy + jh, jw, 2);
  }

  function paintWin(g, b, cell, bx, fy, bw) {
    const wx = bx + 22, ww = bw - 44, wy = fy + 42, wh = 84;
    const modern = b.style === 'tile';
    g.fillStyle = SH(0.3); g.fillRect(wx - 10, wy - 6, ww + 20, 12);                 // chhajja shadow
    g.fillStyle = lt(b.color, 0.12); g.fillRect(wx - 14, wy - 17, ww + 28, 11);        // chhajja
    g.fillStyle = HI(0.35); g.fillRect(wx - 14, wy - 17, ww + 28, 2);
    const gl = g.createLinearGradient(0, wy, 0, wy + wh);
    if (cell.dark) { gl.addColorStop(0, '#2a2226'); gl.addColorStop(1, '#3d3134'); }
    else { gl.addColorStop(0, '#c4d3db'); gl.addColorStop(0.45, '#7a8894'); gl.addColorStop(1, '#434c56'); }
    g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
    if (!cell.dark) { g.fillStyle = HI(0.2); g.beginPath(); g.moveTo(wx + ww * 0.55, wy); g.lineTo(wx + ww * 0.8, wy); g.lineTo(wx + ww * 0.35, wy + wh); g.lineTo(wx + ww * 0.1, wy + wh); g.closePath(); g.fill(); }
    if (cell.curtain) {
      const cw = ww * (0.24 + cell.cOpen * 0.24);
      g.fillStyle = cell.curtain; g.fillRect(wx, wy, cw, wh); g.fillRect(wx + ww - cw * 0.8, wy, cw * 0.8, wh);
      g.fillStyle = SH(0.2); g.fillRect(wx + cw * 0.5, wy, 2, wh);
    }
    g.fillStyle = SH(0.4); g.fillRect(wx, wy, ww, 5); g.fillRect(wx + ww - 4, wy, 4, wh);
    g.fillStyle = modern ? '#c9ccd0' : '#d7d2c8'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    if (modern) { g.fillStyle = '#c9ccd0'; g.fillRect(wx - 3, wy - 3, ww + 6, 4); g.fillRect(wx - 3, wy + wh - 1, ww + 6, 4); g.fillRect(wx - 3, wy, 4, wh); g.fillRect(wx + ww - 1, wy, 4, wh); }
    else { // box grille, with its shadow on the glass
      g.fillStyle = SH(0.28); for (let gx = wx + 4; gx < wx + ww - 1; gx += 10) g.fillRect(gx - 2.5, wy + 3, 2.2, wh);
      g.fillStyle = b.grill;
      for (let gx = wx + 4; gx < wx + ww - 1; gx += 10) g.fillRect(gx, wy - 3, 2.2, wh + 6);
      g.fillRect(wx - 4, wy - 4, ww + 8, 3.5); g.fillRect(wx - 4, wy + wh * 0.5, ww + 8, 3); g.fillRect(wx - 4, wy + wh, ww + 8, 3.5);
      g.fillRect(wx - 4, wy - 4, 3.5, wh + 8); g.fillRect(wx + ww + 0.5, wy - 4, 3.5, wh + 8);
      if (b.fancy) { g.strokeStyle = b.grill; g.lineWidth = 2.2; g.beginPath(); g.arc(wx + ww / 2, wy + wh * 0.5, ww * 0.3, Math.PI, TAU); g.stroke(); }
    }
    g.fillStyle = lt(b.color, 0.1); g.fillRect(wx - 7, wy + wh + 3, ww + 14, 6);   // sill
    g.fillStyle = SH(0.22); g.fillRect(wx - 7, wy + wh + 9, ww + 14, 4);
    if (cell.ac) { // split-AC outdoor unit hung under the window
      const aw = Math.min(64, ww + 10), ah = 40, ax = wx + (ww - aw) / 2 + cell.acDx, ay = wy + wh + 14;
      g.fillStyle = SH(0.3); g.fillRect(ax + 4, ay + 5, aw, ah);
      const ag = g.createLinearGradient(ax, 0, ax + aw, 0); ag.addColorStop(0, '#cbc6bc'); ag.addColorStop(1, '#f3efe6');
      g.fillStyle = ag; g.fillRect(ax, ay, aw, ah);
      TH.circle(g, ax + aw * 0.36, ay + ah / 2, ah * 0.34, '#6d6a66');
      g.strokeStyle = 'rgba(230,226,218,0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax + aw * 0.36 - 10, ay + ah / 2); g.lineTo(ax + aw * 0.36 + 10, ay + ah / 2); g.moveTo(ax + aw * 0.36, ay + ah / 2 - 10); g.lineTo(ax + aw * 0.36, ay + ah / 2 + 10); g.stroke();
      g.fillStyle = SH(0.25); for (let i = 0; i < 4; i++) g.fillRect(ax + aw * 0.68, ay + 7 + i * 7, aw * 0.24, 2.5);
      g.fillStyle = HI(0.7); g.fillRect(ax, ay, aw, 2.5);
      stain(g, ax + aw * 0.72, ay + ah, 5, 60, 0.3);
    }
    if (cell.stain) stain(g, wx + cell.stain * ww, wy + wh + 12, 5, 40 + cell.stain * 50, 0.2);
  }

  function paintBalc(g, b, cell, bx, fy, bw, R) {
    const ox = bx + 8, ow = bw - 16, oy = fy + 14, oh = FH - 22, ry = fy + FH - 64;
    const modern = b.style === 'tile';
    const ig = g.createLinearGradient(0, oy, 0, oy + oh);
    ig.addColorStop(0, '#2b2327'); ig.addColorStop(1, '#4a3c3b');
    g.fillStyle = ig; g.fillRect(ox, oy, ow, oh);
    g.fillStyle = cell.door; g.fillRect(ox + ow * 0.18, oy + 10, ow * 0.34, oh - 12);
    g.fillStyle = SH(0.3); g.fillRect(ox + ow * 0.35, oy + 10, 2, oh - 12);
    g.fillStyle = SH(0.45); g.fillRect(ox, oy, ow, 8); g.fillRect(ox + ow - 8, oy, 8, oh);
    if (cell.clothes) {
      g.strokeStyle = 'rgba(30,24,24,0.7)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(ox + 3, oy + 16); g.lineTo(ox + ow - 3, oy + 18); g.stroke();
      let cx = ox + 6;
      for (const cl of cell.clothes) {
        if (cx + cl.w > ox + ow - 4) break;
        g.fillStyle = cl.c; g.fillRect(cx, oy + 17, cl.w, cl.h);
        if (cl.shirt) g.fillRect(cx - 4, oy + 17, cl.w + 8, 8);
        g.fillStyle = SH(0.2); g.fillRect(cx, oy + 13 + cl.h, cl.w, 4);
        g.fillStyle = HI(0.25); g.fillRect(cx + cl.w - 2, oy + 17, 2, cl.h);
        cx += cl.w + 5;
      }
    }
    if (cell.person) {
      const px = ox + ow * 0.55;
      g.fillStyle = cell.person.shirt; TH.rr(g, px - 10, ry - 22, 20, 24, 6); g.fill();
      TH.circle(g, px, ry - 31, 8, cell.person.skin);
      g.fillStyle = '#1b1616'; g.beginPath(); g.arc(px, ry - 33, 8.4, Math.PI, TAU); g.fill();
    }
    if (b.rail === 'wall') {
      g.fillStyle = lt(b.color, 0.05); g.fillRect(bx, ry, bw, 58);
      g.fillStyle = lt(b.color, 0.3); g.fillRect(bx - 2, ry - 3, bw + 4, 6);
      g.fillStyle = SH(0.18); g.fillRect(bx, ry + 3, 4, 55);
      blotches(g, R, bx, ry, bw, 58, 2, 0.05);
    } else if (modern) {
      g.fillStyle = 'rgba(180,210,220,0.45)'; g.fillRect(bx + 2, ry, bw - 4, 58);
      g.fillStyle = '#c9ccd0'; g.fillRect(bx, ry - 3, bw, 5); for (let x = bx + 4; x < bx + bw; x += 40) g.fillRect(x, ry, 3, 58);
    } else {
      g.fillStyle = SH(0.3); for (let gx = bx + 6; gx < bx + bw - 3; gx += 9) g.fillRect(gx - 2.5, ry + 3, 2.2, 55);
      g.fillStyle = b.grill; g.fillRect(bx + 2, ry, bw - 4, 4); g.fillRect(bx + 2, ry + 26, bw - 4, 2.5);
      for (let gx = bx + 6; gx < bx + bw - 3; gx += 9) g.fillRect(gx, ry, 2.2, 58);
    }
    if (cell.sari) { // sari drying over the railing
      const sx = bx + bw * 0.2, sw = bw * 0.45;
      g.fillStyle = cell.sari; g.fillRect(sx, ry - 4, sw, 52);
      g.fillStyle = '#e9c46a'; g.fillRect(sx, ry + 38, sw, 5);
      g.fillStyle = SH(0.18); g.fillRect(sx, ry - 4, 3, 52);
      g.fillStyle = HI(0.2); g.fillRect(sx + sw - 3, ry - 4, 3, 52);
    }
    if (cell.plant) {
      const px = bx + bw * 0.8;
      g.fillStyle = '#b5562f'; g.fillRect(px - 8, ry - 12, 16, 12);
      TH.circle(g, px - 3, ry - 18, 10, '#4d7c3a'); TH.circle(g, px + 5, ry - 22, 8, '#79a85a');
    }
    if (cell.cage) { // full-height security grille over the balcony
      g.fillStyle = b.grill;
      for (let gx = bx + 10; gx < bx + bw - 4; gx += 16) g.fillRect(gx, oy, 2, ry - oy);
      g.fillRect(bx + 4, oy + 2, bw - 8, 3); g.fillRect(bx + 4, oy + (ry - oy) * 0.5, bw - 8, 2.5);
    }
    g.fillStyle = lt(b.color, 0.16); g.fillRect(bx - 3, fy + FH - 8, bw + 6, 9);   // balcony slab
    g.fillStyle = SH(0.3); g.fillRect(bx - 3, fy + FH + 1, bw + 6, 6);
  }

  function toLet(g, x, y) {
    g.fillStyle = SH(0.3); g.fillRect(x - 25, y + 3, 52, 22);
    g.fillStyle = '#fbfaf3'; g.fillRect(x - 28, y, 52, 22);
    g.fillStyle = '#c1121f'; g.font = `700 13px ${TH.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('টু-লেট', x - 2, y + 11.5, 48);
  }
  function vinyl(g, bn, H) { // vinyl banner tied across the first floor
    const y = H - FH + 38, h = 62, { x, w, c } = bn;
    g.fillStyle = SH(0.32); g.fillRect(x + 4, y + 5, w, h);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, lt(c, 0.2)); gr.addColorStop(1, dk(c, 0.18));
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = '#fde047'; g.fillRect(x, y + h - 8, w, 3);
    g.fillStyle = HI(0.4); g.fillRect(x, y, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + w * 0.3, y, 5, h); g.fillRect(x + w * 0.7, y, 4, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = `700 26px ${TH.FONT}`; g.fillText(bn.text, x + w / 2, y + 24, w - 20);
    g.font = `500 12px ${TH.FONT}`; g.fillText(bn.sub, x + w / 2, y + 45, w - 24);
  }

  function paintTank(g, cx, by, tk) {
    const tw = tk.w, th = tk.h, tx = cx - tw / 2, ty = by - th, col = tk.c;
    g.fillStyle = SH(0.25); g.fillRect(tx - 6, by - 3, tw, 6);
    if (tk.box) {
      const bg = g.createLinearGradient(tx, 0, tx + tw, 0); bg.addColorStop(0, dk(col, 0.2)); bg.addColorStop(1, lt(col, 0.12));
      g.fillStyle = bg; g.fillRect(tx, ty, tw, th);
      g.fillStyle = lt(col, 0.25); g.fillRect(tx - 3, ty - 4, tw + 6, 5);
      stain(g, tx, ty + 2, tw, th * 0.6, 0.25);
      return;
    }
    const tg = g.createLinearGradient(tx, 0, tx + tw, 0);
    tg.addColorStop(0, dk(col, 0.3)); tg.addColorStop(0.62, lt(col, 0.12)); tg.addColorStop(0.82, lt(col, 0.38)); tg.addColorStop(1, lt(col, 0.02));
    g.fillStyle = tg; TH.rr(g, tx, ty + 6, tw, th - 6, 7); g.fill();
    g.fillStyle = SH(0.32); for (let i = 1; i < 4; i++) g.fillRect(tx + 1, ty + 6 + i * (th - 6) / 4, tw - 2, 2);
    g.fillStyle = lt(col, 0.12); g.beginPath(); g.ellipse(cx, ty + 6, tw / 2, 6, 0, 0, TAU); g.fill();
    g.fillStyle = lt(col, 0.3); g.fillRect(cx - 7, ty - 1, 14, 6);
  }

  function roofItems(g, b, R) {
    const r = b.roof, base = ROOF;
    if (r.stair) {
      const sx = r.stair.x, sw = r.stair.w, sy = base - r.stair.h;
      const sg = g.createLinearGradient(sx, 0, sx + sw, 0);
      sg.addColorStop(0, dk(b.color, 0.14)); sg.addColorStop(1, lt(b.color, 0.08));
      g.fillStyle = sg; g.fillRect(sx, sy, sw, base - sy);
      g.fillStyle = '#4a3a34'; g.fillRect(sx + sw * 0.2, sy + 18, sw * 0.3, base - sy - 18);
      g.fillStyle = SH(0.5); for (let i = 0; i < 3; i++) g.fillRect(sx + sw * 0.64, sy + 22 + i * 8, sw * 0.22, 4);
      g.fillStyle = lt(b.color, 0.2); g.fillRect(sx - 6, sy - 7, sw + 12, 8);
      stain(g, sx, sy + 1, sw, 30, 0.25);
    }
    for (const tk of r.tanks) {
      const cx = tk.x;
      let by = base - 18;
      if (tk.onStair && r.stair) by = base - r.stair.h - 7;
      else { g.fillStyle = '#3a3334'; g.fillRect(cx - tk.w / 2 + 6, by, 5, 18); g.fillRect(cx + tk.w / 2 - 11, by, 5, 18); }
      paintTank(g, cx, by, tk);
    }
    if (r.dish) {
      const dx = r.dish.x, d = r.dish;
      g.strokeStyle = '#5b5b60'; g.lineWidth = 3; g.beginPath(); g.moveTo(dx, base); g.lineTo(dx, base - 40); g.stroke();
      const dg = g.createLinearGradient(dx - d.r, 0, dx + d.r, 0); dg.addColorStop(0, '#9a9a9e'); dg.addColorStop(1, '#ececec');
      g.fillStyle = dg; g.beginPath(); g.ellipse(dx, base - 50, d.r, d.r * 0.55, d.rot, 0, TAU); g.fill();
      g.strokeStyle = '#6b6b70'; g.lineWidth = 1.5; g.stroke();
    }
    if (r.ant) {
      const ax = r.ant;
      g.strokeStyle = '#4d4a4c'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(ax, base); g.lineTo(ax, base - 130);
      for (let i = 0; i < 5; i++) { const hw = 26 - i * 4; g.moveTo(ax - hw, base - 125 + i * 11); g.lineTo(ax + hw, base - 125 + i * 11); }
      g.stroke();
    }
    if (r.line) { // rooftop clothesline
      const lx = r.line.x, len = r.line.len;
      g.strokeStyle = '#5b4a40'; g.lineWidth = 3; g.beginPath(); g.moveTo(lx, base); g.lineTo(lx, base - 110); g.moveTo(lx + len, base); g.lineTo(lx + len, base - 110); g.stroke();
      g.strokeStyle = 'rgba(40,30,30,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(lx, base - 106); g.quadraticCurveTo(lx + len / 2, base - 96, lx + len, base - 106); g.stroke();
      let cx = lx + 8;
      for (const cl of r.line.clothes) {
        if (cx + cl.w > lx + len - 6) break;
        g.fillStyle = cl.c; g.fillRect(cx, base - 101, cl.w, cl.h);
        g.fillStyle = HI(0.25); g.fillRect(cx + cl.w - 2, base - 101, 2, cl.h);
        cx += cl.w + 6;
      }
    }
    if (r.rebar) { // columns waiting for the next floor
      g.strokeStyle = '#5b3a2a'; g.lineWidth = 2;
      g.beginPath();
      for (const cx of [10, b.w / 2, b.w - 10]) for (let i = -1; i <= 1; i++) {
        const h = 70 + R() * 50;
        g.moveTo(cx + i * 4, base); g.lineTo(cx + i * 4, base - h); g.lineTo(cx + i * 4 + (R() - 0.5) * 10, base - h - 8);
      }
      g.stroke();
    }
    if (r.plants) for (const px of r.plants) {
      g.fillStyle = '#b5562f'; g.fillRect(px - 10, base - PARA - 16, 20, 16);
      TH.circle(g, px - 5, base - PARA - 24, 11, '#4d7c3a'); TH.circle(g, px + 6, base - PARA - 28, 9, '#6f9e4f');
    }
  }

  // ---- design generators (data only; rng-driven)
  function designUpper(R, o) {
    const rp = (a) => a[(R() * a.length) | 0], ch = (p) => R() < p;
    const w = o.w, floors = o.floors, style = o.style;
    const color = o.color || (style === 'raw' ? rp(o.raw) : style === 'glass' ? '#dcdad3' : rp(o.paint));
    const b = {
      w, floors, style, color,
      accent: style === 'raw' ? dk(color, 0.1) : ch(0.5) ? rp(['#8e3b2e', '#2f5d62', '#b8654a', '#5a4a7a', '#f1e6d0', '#6b8f4e']) : lt(color, 0.25),
      grill: rp(['#2e3236', '#2e3236', '#e9e5da', '#2f6b4f', '#7a3b2a', '#2b4a7a']),
      fancy: ch(0.4), rail: ch(0.5) ? 'wall' : 'grill', parapet: ch(0.25) ? 'rail' : 'wall',
      glass: rp([['#d9e6ea', '#6f98a8', '#2c4a5a'], ['#e3dccb', '#7f93a0', '#34495a'], ['#cfe3dc', '#5f9a8c', '#27514a']]),
      nb: Math.max(2, Math.round((w - 36) / 150)), cells: [],
    };
    if (style === 'glass') b.accent = rp(['#1d4ed8', '#c1121f', '#0f766e', '#334155']);
    const pattern = rp(['win', 'balc', 'mix', 'mix']), colType = [];
    for (let c = 0; c < b.nb; c++) colType.push(pattern === 'win' ? 'win' : pattern === 'balc' ? (c % 2 ? 'win' : 'balc') : ch(0.45) ? 'balc' : 'win');
    if (b.nb >= 4 && ch(0.6)) colType[1 + ((R() * (b.nb - 2)) | 0)] = 'jali';
    const cage = style !== 'tile' && ch(0.35);
    const clothes = () => Array.from({ length: 2 + ((R() * 3) | 0) }, () => ({ c: rp(CLOTH), w: 14 + R() * 18, h: 30 + R() * 40, shirt: ch(0.35) }));
    for (let f = 0; f < floors; f++) for (let c = 0; c < b.nb; c++) {
      const k = colType[c], balc = k === 'balc';
      b.cells.push({
        k, dark: ch(0.3), curtain: ch(0.55) ? rp(CURT) : null, cOpen: R(), ac: k === 'win' && ch(0.28), acDx: (R() - 0.5) * 10,
        stain: ch(0.4) ? 0.1 + R() * 0.8 : 0, clothes: balc && ch(0.6) ? clothes() : null, sari: balc && ch(0.22) ? rp(CLOTH) : null,
        plant: balc && ch(0.3), person: balc && ch(0.05) ? { skin: rp(['#8d5a3b', '#a0694a', '#6f4630']), shirt: rp(CLOTH) } : null,
        door: rp(['#6b4a34', '#7c5a3f', '#4d6b6a', '#8a8f7a']), cage: balc && cage,
      });
    }
    const roof = { tanks: [] };
    roof.stair = ch(0.6) ? { x: 20 + R() * Math.max(10, w - 190), w: 130 + R() * 40, h: 140 + R() * 20 } : null;
    const nt = 1 + (ch(0.45) ? 1 : 0);
    for (let i = 0; i < nt; i++) {
      const t = { c: rp(['#26262c', '#26262c', '#26262c', '#2d5fa8', '#c8c1b3']), w: 58 + R() * 20, h: 64 + R() * 22 };
      t.box = t.c === '#c8c1b3';
      if (i === 0 && roof.stair && ch(0.7)) { t.onStair = true; t.x = roof.stair.x + roof.stair.w / 2; }
      else t.x = roof.stair ? (roof.stair.x > w / 2 ? 40 + R() * Math.max(1, roof.stair.x - 90) : roof.stair.x + roof.stair.w + 40 + R() * Math.max(1, w - roof.stair.x - roof.stair.w - 80)) : 40 + R() * (w - 80);
      t.x = clamp(t.x, 36, w - 36);
      roof.tanks.push(t);
    }
    roof.dish = ch(0.5) ? { x: 30 + R() * (w - 60), r: 20 + R() * 10, rot: -0.3 - R() * 0.5 } : null;
    roof.ant = ch(0.3) ? 30 + R() * (w - 60) : 0;
    roof.line = ch(0.3) ? { x: 20 + R() * w * 0.4, len: 120 + R() * 80, clothes: clothes() } : null;
    roof.rebar = style === 'brick' || (style === 'raw' && ch(0.5));
    roof.plants = b.parapet === 'wall' && ch(0.35) ? Array.from({ length: 1 + ((R() * 3) | 0) }, () => 20 + R() * (w - 40)) : null;
    b.roof = roof;
    if (o.banner) b.banner = { x: w * (0.12 + R() * 0.1), w: w * (0.62 + R() * 0.12), c: o.banner[2], text: o.banner[0], sub: o.banner[1] };
    else if (style !== 'glass' && ch(0.4)) { // a To-let notice on some balcony railing
      const cand = [];
      for (let f = 0; f < Math.min(3, floors); f++) for (let c = 0; c < b.nb; c++) if (colType[c] === 'balc') cand.push([f, c]);
      if (cand.length) { const [f, c] = rp(cand), bw = (w - 36) / b.nb; b.tolet = { x: 18 + (c + 0.5) * bw, y: floors * FH + ROOF - f * FH - 56 }; }
    }
    b.top = BAND + floors * FH + PARA;
    return b;
  }

  // Ground-floor band texture: one 200-unit module per shop, painted side by side.
  function paintBand(list, shops, k, seed) {
    const band = mkTex(list, shops.length * MW, BAND, k);
    if (band) repaintBand(band, shops, seed);
    return band;
  }
  function repaintBand(band, shops, seed) {
    const g = band.g, R = TH.mulberry32(seed);
    g.clearRect(0, 0, band.w, BAND);
    shops.forEach((sp, i) => { g.save(); g.beginPath(); g.rect(i * MW, 0, MW, BAND); g.clip(); paintShop(g, i * MW, sp, R); g.restore(); });
  }
  // One texture per upper-floor design.
  function paintUppers(list, designs, k, seed) {
    const R = TH.mulberry32(seed);
    return designs.map((b) => {
      const t = mkTex(list, b.w, b.floors * FH + ROOF, k);
      if (t) paintUpper(t.g, b, R);
      return t;
    });
  }

  // Lay out a row of buildings along one side (data only).
  // o: { side, u, z0, z1, designs, nShops, setbacks: [du...], rng, sideCols }
  function layoutRow(o) {
    const R = o.rng, rp = (a) => a[(R() * a.length) | 0];
    const out = [];
    let z = o.z0, last = -1, last2 = -1;
    while (z < o.z1) {
      let j = 0;
      for (let tries = 0; tries < 8; tries++) { j = (R() * o.designs.length) | 0; if (j !== last && j !== last2) break; }
      last2 = last; last = j;
      const d = o.designs[j], nm = d.w / MW;
      const m = (R() * (o.nShops - nm + 1)) | 0;
      const du = rp(o.setbacks);
      out.push({
        side: o.side, j, band: o.band || 0, u: o.u + o.side * du, z0: z, z1: z + d.w, m, nm, top: d.top, floors: d.floors,
        sideC: d.style === 'glass' ? dk(d.color, 0.25) : R() < 0.55 ? rp(o.sideCols) : dk(d.color, 0.12),
        ad: null,
      });
      z += d.w;
    }
    return out;
  }
  // Wall segments for rows: each building is a ground-floor band slice plus its upper-floor texture.
  function wallsFor(rows, bands, ups) {
    const walls = [];
    for (const row of rows) for (const b of row) {
      const band = bands[b.band], up = ups[b.j];
      if (band) walls.push({ u: b.u, z0: b.z0, z1: b.z1, h: BAND, base: fp.CURB_H, tex: band.cv, sx0: b.m * MW * band.k, sx1: (b.m + b.nm) * MW * band.k, ret: b.sideC });
      if (up) walls.push({ u: b.u, z0: b.z0, z1: b.z1, h: up.h, base: BAND, tex: up.cv, ret: b.sideC });
    }
    return walls;
  }

  // Side walls where a building rises above (or is set back from) its nearer neighbour. Drawn in the
  // sky pass, before the facades, so the facades painted afterwards hide whatever should be hidden.
  // (A plane at constant z faces the camera, so it projects to an axis-aligned screen rectangle.)
  function drawCrossFaces(ctx, rows) {
    for (const row of rows) {
      for (let i = 0; i < row.length - 1; i++) {
        const A = row[i], B = row[i + 1];
        const d = cam.z - A.z1;
        if (d < NEAR + 4 || d > fp.FAR) continue;
        const setback = Math.abs(B.u) > Math.abs(A.u) + 1;
        if (!setback && B.top >= A.top - 4) continue;
        const h0 = setback ? fp.CURB_H : Math.max(fp.CURB_H, B.top - 24);
        const ua = A.u, ub = A.u + A.side * DEPTH, u0 = Math.min(ua, ub), u1 = Math.max(ua, ub);
        const s = F / d, x0 = clamp(CX + (u0 - cam.u) * s, -50, 1050), x1 = clamp(CX + (u1 - cam.u) * s, -50, 1050);
        if (x1 - x0 < 0.5) continue;
        const yT = HY + (cam.h - A.top) * s, yB = HY + (cam.h - h0) * s;
        ctx.fillStyle = fogMix(A.sideC, d); ctx.fillRect(x0, yT, x1 - x0, yB - yT);
        if (s < 0.1) continue;
        // floor seams, parapet coping, a few small windows near the front edge
        ctx.fillStyle = fogMix(dk(A.sideC, 0.18), d);
        const th = Math.max(0.7, 5 * s);
        for (let h = BAND + FH, n = 0; h < A.top - PARA && n < 5; h += FH) if (h > h0 + 4) { ctx.fillRect(x0, HY + (cam.h - h) * s, x1 - x0, th); n++; }
        if (s > 0.2) {
          const wu = A.side > 0 ? A.u + 90 : A.u - 150, wx = CX + (wu - cam.u) * s;
          for (let h = BAND + FH + 70, n = 0; h < A.top - PARA - 40 && n < 4; h += FH * 2) if (h > h0 + 40) { ctx.fillRect(wx, HY + (cam.h - h - 50) * s, 60 * s, 50 * s); n++; }
        }
        ctx.fillStyle = fogMix(lt(A.sideC, 0.2), d); ctx.fillRect(x0, yT, x1 - x0, 8 * s);
        if (A.ad && s > 0.12 && A.top - h0 > 380) drawWallAd(ctx, A, s, d, h0);
      }
    }
  }
  function drawWallAd(ctx, A, s, d, h0) { // big painted ad on a blank side wall (it faces the camera: affine)
    const ad = A.ad, w = 420, h = 200;
    const uL = A.side > 0 ? A.u + 200 : A.u - 200 - w, hT = Math.min(A.top - 70, h0 + 60 + h + (A.top - h0 - 130 - h) * 0.5);
    if (hT - h < h0 + 30) return;
    const x = CX + (uL - cam.u) * s, y = HY + (cam.h - hT) * s, k = Math.min(s, 12);
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = fogMix(ad[2], d); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fogMix(ad[3], d); ctx.fillRect(0, h - 22, w, 8);
    if (k * 50 > 7) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 64px ${TH.FONT}`; ctx.fillText(ad[0], w / 2, 76, w - 30);
      ctx.font = `500 30px ${TH.FONT}`; ctx.fillText(ad[1], w / 2, 142, w - 40);
    }
    ctx.restore();
  }

  // Hanging signboard sticking out from a facade toward the road (a plane facing +z: affine).
  // sg: { z, side, wallU, w, hh, h0, bg, fg, bd, t1, t2 }
  function drawSignFar(ctx, sg, s) { // two rectangles, straight in screen space (the sign faces the camera)
    const uL = sg.side > 0 ? sg.wallU - 16 - sg.w : sg.wallU + 16;
    const x = CX + (uL - cam.u) * s, y = HY + (cam.h - sg.h0 - sg.hh) * s;
    ctx.fillStyle = sg.bg; ctx.fillRect(x, y, sg.w * s, sg.hh * s);
    ctx.fillStyle = sg.bd; ctx.fillRect(x, y + sg.hh * 0.42 * s, sg.w * s, Math.max(0.6, 10 * s));
  }
  function drawSign(ctx, sg, d) {
    const s = F / d;
    if (s < 0.2) { drawSignFar(ctx, sg, s); return; }
    const uL = sg.side > 0 ? sg.wallU - 16 - sg.w : sg.wallU + 16;
    const p = fp.project(sg.z, uL, sg.h0 + sg.hh);
    if (!p) return;
    const k = Math.min(p.s, 12);
    ctx.translate(p.x, p.y); ctx.scale(k, k);
    const wallX = sg.wallU - uL;
    ctx.fillStyle = '#3a3a3e';
    if (sg.side > 0) ctx.fillRect(sg.w * 0.15, -12, wallX - sg.w * 0.15, 6); else ctx.fillRect(wallX, -12, sg.w * 0.85 - wallX, 6);
    ctx.fillStyle = sg.bg; ctx.fillRect(0, 0, sg.w, sg.hh);
    ctx.strokeStyle = sg.bd; ctx.lineWidth = 3; ctx.strokeRect(5, 5, sg.w - 10, sg.hh - 10);
    if (k * 20 < 5) return;
    ctx.fillStyle = sg.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${sg.fs}px ${TH.FONT}`; ctx.fillText(sg.t1, sg.w / 2, sg.t2 ? sg.hh * 0.38 : sg.hh / 2, sg.w - 16);
    if (sg.t2 && k * 12 > 4) { ctx.font = `500 ${Math.round(sg.fs * 0.55)}px ${TH.FONT}`; ctx.fillText(sg.t2, sg.w / 2, sg.hh * 0.74, sg.w - 18); }
  }

  // Awning over a shop opening, sloping from the wall down toward the road.
  // aw: { za, zb, wallU, side, c0, c1 }
  function drawAwning(ctx, aw, d) {
    const s = F / d, u0 = aw.wallU - aw.side * 2, u1 = aw.wallU - aw.side * 70, h0 = 214, h1 = 180;
    if (!fp.path(ctx, [aw.za, u0, h0, aw.zb, u0, h0, aw.zb, u1, h1 - 18, aw.za, u1, h1 - 18])) return;
    ctx.fillStyle = aw.c2; ctx.fill(); // underside in shade, plus the front flap
    if (s > 0.28 && aw.c1) {
      ctx.beginPath();
      const n = 5, dz = (aw.zb - aw.za) / n;
      for (let i = 0; i < n; i += 2) fp.subPath(ctx, [aw.za + i * dz, u1, h1 - 18, aw.za + (i + 1) * dz, u1, h1 - 18, aw.za + (i + 1) * dz, u1, h1, aw.za + i * dz, u1, h1]);
      ctx.fillStyle = aw.c1; ctx.fill();
    }
  }

  const K = (TH.fpDhakaKit = {
    MW, BAND, FH, ROOF, PARA, DEPTH, CLOTH, GOODS, PILLAR, SHUT,
    hm, dk, lt, rgba, fogMix, mkTex, texBytes, freeTex, stain,
    paintShop, paintUpper, designUpper, paintBand, paintUppers, repaintBand, layoutRow, wallsFor,
    drawCrossFaces, drawSign, drawSignFar, drawAwning,
  });

  // Hanging signs and awnings along rows of buildings (data only).
  function propsFor(rows, shopsByBand, R, o) {
    const rp = (a) => a[(R() * a.length) | 0];
    const signs = [], awnings = [];
    for (const row of rows) for (const b of row) {
      const side = b.side, wallU = b.u;
      for (let i = 0; i < b.nm; i++) {
        const sp = shopsByBand[b.band][b.m + i];
        // module i of the texture: right side runs far -> near, left side near -> far
        const za = side > 0 ? b.z0 + i * MW : b.z1 - (i + 1) * MW, zb = za + MW;
        if (R() < o.signP) {
          const hs = rp(o.hang), w = 90 + R() * 60, hh = 70 + R() * 50;
          signs.push({ z: za + MW * (0.25 + R() * 0.5), side, wallU, w, hh, h0: 330 + R() * 150, bg: hs[2], fg: hs[3], bd: hs[4], t1: hs[0], t2: hs[1], fs: Math.round(Math.min(28, (w - 16) / Math.max(3, hs[0].length) * 2.3)) });
        }
        if (sp.state !== 'closed' && R() < o.awnP) {
          const a = rp(o.awn);
          awnings.push({ za: za + 18, zb: zb - 18, wallU, side, c0: a[0], c1: a[1], c2: a[2] });
        }
      }
    }
    signs.sort((a, b) => a.z - b.z); awnings.sort((a, b) => a.za - b.za);
    return { signs, awnings };
  }
  K.propsFor = propsFor;

  // ======================================================================================
  // Badda
  // ======================================================================================
  const PAINT = ['#e3c39a', '#d99b80', '#9fbfae', '#e0b25a', '#a9c2d3', '#e4b1a8', '#c8cf9e', '#efdcbc', '#c3a3c1', '#ece6da', '#d4c29a'];
  const RAW = ['#a9a397', '#b1aa9d', '#9f998e'];
  const SIDE = ['#a8a297', '#9d978c', '#b3ab9c', '#a39a8a', '#b0a18e'];
  const SHOPS = [
    ['মায়ের দোয়া স্টোর', 'grocery', '#b91c1c', '#fff7e0', '#fde047', 'পাইকারি ও খুচরা বিক্রেতা', 'ফ্লেক্সিলোড'],
    ['বাবার দোয়া ভ্যারাইটিজ', 'variety', '#15803d', '#ffffff', '#fef08a', 'প্লাস্টিক · কসমেটিক্স · গিফট'],
    ['হোটেল ভাই ভাই', 'hotel', '#1e3a8a', '#fde047', '#f8fafc', 'ভাত · মাছ · গরুর মাংস'],
    ['ঢাকা বিরিয়ানি হাউস', 'biryani', '#7f1d1d', '#fde68a', '#fbbf24', 'কাচ্চি · তেহারি · মোরগ পোলাও'],
    ['মোবাইল সার্ভিসিং', 'mobile', '#0f766e', '#ffffff', '#99f6e4', 'রিচার্জ · এক্সেসরিজ', 'রিচার্জ'],
    ['সততা ফার্মেসী', 'pharmacy', '#f8fafc', '#15803d', '#16a34a', 'এখানে সব ধরনের ঔষধ পাওয়া যায়'],
    ['রহমান টেইলার্স', 'tailor', '#6b21a8', '#ffffff', '#e9d5ff', 'জেন্টস ও লেডিস'],
    ['স্বপ্ন সুইটস', 'sweets', '#db2777', '#ffffff', '#fce7f3', 'রসগোল্লা · দই · চমচম'],
    ['বাড্ডা হার্ডওয়্যার', 'hardware', '#c2410c', '#ffffff', '#fed7aa', 'রং · পাইপ · স্যানিটারি'],
    ['নিউ ফ্যাশন', 'fashion', '#1f2937', '#fbbf24', '#fbbf24', 'থ্রি-পিস · শাড়ি · পাঞ্জাবি'],
    ['আল-আমিন ফার্মেসী', 'pharmacy', '#166534', '#ffffff', '#bbf7d0', '২৪ ঘণ্টা খোলা'],
    ['লাকি হেয়ার কাটিং', 'salon', '#0369a1', '#ffffff', '#bae6fd', 'জেন্টস পার্লার'],
    ['জননী ইলেকট্রিক', 'hardware', '#ca8a04', '#1f2937', '#1f2937', 'ফ্যান · লাইট · তার'],
    ['বিসমিল্লাহ ট্রেডার্স', 'grocery', '#9d174d', '#ffffff', '#fbcfe8', 'চাল · ডাল · তেল · চিনি', 'ফ্লেক্সিলোড'],
    ['কাচ্চি ঘর', 'biryani', '#f59e0b', '#3b0d0d', '#7f1d1d', 'বিয়ে ও পার্টির অর্ডার নেওয়া হয়'],
    ['ফ্রেন্ডস কম্পিউটার', 'mobile', '#4338ca', '#ffffff', '#c7d2fe', 'ফটোকপি · প্রিন্ট · কম্পোজ'],
  ];
  const SHOPS_L = [
    ['নিউ মদিনা হোটেল', 'hotel', '#166534', '#fde047', '#fef9c3', 'নাস্তা · দুপুরের খাবার'],
    ['রাজধানী ফার্মেসী', 'pharmacy', '#f8fafc', '#1d4ed8', '#1d4ed8', 'ডাক্তারের চেম্বার আছে'],
    ['মা ইলেকট্রনিক্স', 'mobile', '#7c2d12', '#ffffff', '#fed7aa', 'টিভি · ফ্রিজ · মোবাইল'],
    ['আলিফ টেইলার্স', 'tailor', '#0f766e', '#ffffff', '#99f6e4', 'অর্ডার নেওয়া হয়'],
    ['মিতালী স্টোর', 'grocery', '#1d4ed8', '#fde047', '#fde047', 'মুদি মালামাল', 'ফ্লেক্সিলোড'],
    ['রূপসী পার্লার', 'salon', '#be185d', '#ffffff', '#fbcfe8', 'শুধু মহিলাদের জন্য'],
    ['সোনার বাংলা সুইটস', 'sweets', '#b45309', '#fff7ed', '#fde68a', 'মিষ্টি · দই · নিমকি'],
    ['নূর হার্ডওয়্যার', 'hardware', '#374151', '#facc15', '#facc15', 'টিন · রড · সিমেন্ট'],
    ['তাজ বিরিয়ানি', 'biryani', '#991b1b', '#ffffff', '#fecaca', 'হাজীর কাচ্চি স্বাদ'],
    ['শাপলা ভ্যারাইটিজ', 'variety', '#6d28d9', '#ffffff', '#ddd6fe', 'গিফট আইটেম'],
    ['ঢাকা ফ্যাশন হাউস', 'fashion', '#db2777', '#ffffff', '#fce7f3', 'শাড়ি · লুঙ্গি · গামছা'],
    ['ভাই ভাই মোবাইল', 'mobile', '#0369a1', '#ffffff', '#bae6fd', 'সার্ভিসিং সেন্টার'],
    ['মেঘনা জেনারেল স্টোর', 'grocery', '#15803d', '#ffffff', '#bbf7d0', 'চাল · ডাল · তেল'],
    ['ইসলামিয়া হোটেল', 'hotel', '#7f1d1d', '#fde68a', '#fde68a', 'গরম গরম পরোটা'],
    ['সুন্দরবন কম্পিউটার', 'mobile', '#1e3a8a', '#ffffff', '#bfdbfe', 'ফটোকপি · স্ক্যান · প্রিন্ট'],
    ['জোনাকী সেলুন', 'salon', '#ca8a04', '#1f2937', '#1f2937', 'চুল কাটা · সেভ'],
  ];
  const HANG = [
    ['ডেন্টাল কেয়ার', '২য় তলা', '#0e7490', '#ffffff', '#a5f3fc'],
    ['কোচিং সেন্টার', 'ভর্তি চলছে', '#b91c1c', '#fde047', '#fde047'],
    ['ডায়াগনস্টিক', '২৪ ঘণ্টা', '#1d4ed8', '#ffffff', '#bfdbfe'],
    ['বিউটি পার্লার', 'শুধু মহিলাদের', '#be185d', '#ffffff', '#fbcfe8'],
    ['ফিটনেস জিম', '৩য় তলা', '#111827', '#facc15', '#facc15'],
    ['কাজী অফিস', 'বিবাহ রেজিস্ট্রি', '#15803d', '#ffffff', '#bbf7d0'],
    ['হোমিও হল', 'ডাক্তার বসেন', '#7c2d12', '#fde68a', '#fde68a'],
    ['ট্রাভেলস', 'বিমান টিকেট', '#0369a1', '#ffffff', '#bae6fd'],
    ['লন্ড্রি', 'ধোলাই ও ইস্ত্রি', '#f8fafc', '#1d4ed8', '#1d4ed8'],
    ['চক্ষু চিকিৎসা', 'চেম্বার', '#f8fafc', '#b91c1c', '#b91c1c'],
    ['ইংলিশ কোচিং', 'স্পোকেন', '#6d28d9', '#ffffff', '#ddd6fe'],
    ['ল্যাব টেস্ট', '১ম তলা', '#0f766e', '#ffffff', '#99f6e4'],
  ];
  const VINYL = [['কোচিং সেন্টার', 'এসএসসি · এইচএসসি · ভর্তি চলছে', '#0e7490'], ['ডেন্টাল কেয়ার', 'দাঁতের সব চিকিৎসা', '#be123c'],
    ['বিউটি পার্লার', 'ব্রাইডাল মেকআপ', '#a21caf'], ['ডায়াগনস্টিক সেন্টার', 'সব ধরনের টেস্ট করা হয়', '#4338ca'], ['ফিটনেস জিম', 'নারী ও পুরুষ আলাদা', '#1f2937']];
  const AWN = [['#1d4ed8', '#f1f5f9', '#1e40af'], ['#dc2626', '#fef3c7', '#b91c1c'], ['#15803d', '#f8fafc', '#166534'], ['#8b8f94', null, '#6b7076'], ['#f59e0b', '#fff7ed', '#b45309']];
  const ADS = [['রংধনু পেইন্টস', 'ঘর সাজাই রঙে রঙে', '#1d4ed8', '#fde047'], ['মজবুত সিমেন্ট', 'বাড়ি হোক মজবুত', '#b91c1c', '#ffffff'], ['টু-লেট', 'ফ্ল্যাট ভাড়া হবে · যোগাযোগ করুন', '#f5f0e6', '#c1121f'], ['সুপার ডাল', 'রান্নায় স্বাদ', '#f59e0b', '#3b0d0d']];

  const WB = [700, 1700, 2600, 3800, 5200]; // near edges (depth) of the wire batching bands
  const RP = 228, LP = -662;       // electric pole lines (right footpath at the curb, left footpath)
  const PH = 540;                  // pole height
  const STALL = { z0: 846, z1: 934 }; // tea stall on the right footpath
  const VAN = { z0: 180, z1: 330 };  // parked fruit van

  // ---------- poles ----------
  function poleGrad(ctx, st) { // shading across the shaft, in the pole's local units (reused by every pole)
    let o = st.pg && st.pg.get(ctx);
    if (o) return o;
    o = ctx.createLinearGradient(-11, 0, 11, 0);
    o.addColorStop(0, '#77726b'); o.addColorStop(0.55, '#aaa59c'); o.addColorStop(0.8, '#d3cdc1'); o.addColorStop(1, '#8d8882');
    if (!st.pg) st.pg = new WeakMap();
    st.pg.set(ctx, o);
    return o;
  }
  function drawPole(ctx, pl, d, st) {
    const p = fp.project(pl.z, pl.u, 0);
    if (!p) return;
    const s = p.s, x = p.x, y = p.y, a = pl.lampDir;
    if (s < 0.4) { // mid and far: rectangles straight in screen space
      ctx.fillStyle = '#948f86'; ctx.fillRect(x - 8 * s, y - PH * s, 16 * s + 0.5, PH * s);
      ctx.fillStyle = '#55555b'; ctx.fillRect(x - 72 * s, y - 524 * s, 144 * s, Math.max(0.8, 9 * s));
      if (s < 0.1) return;
      ctx.fillRect(x - 46 * s, y - 476 * s, 92 * s, Math.max(0.7, 8 * s));
      if (pl.trans) { ctx.fillStyle = '#7f8c86'; ctx.fillRect(x - 30 * s, y - 392 * s, 60 * s, 92 * s); }
      if (s < 0.2) { ctx.fillStyle = '#5a5a60'; ctx.fillRect(Math.min(x, x + a * 130 * s), y - 552 * s, 130 * s, Math.max(0.7, 6 * s)); return; }
      ctx.strokeStyle = '#5a5a60'; ctx.lineWidth = Math.max(0.7, 5 * s);
      ctx.beginPath(); ctx.moveTo(x, y - 500 * s); ctx.quadraticCurveTo(x + a * 50 * s, y - 560 * s, x + a * 120 * s, y - 548 * s); ctx.stroke();
      return;
    }
    const k = Math.min(s, 14);
    ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = poleGrad(ctx, st);
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-7, -PH); ctx.lineTo(7, -PH); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ece8df'; ctx.fillRect(-11, -62, 22, 62);   // painted base bands
    ctx.fillStyle = '#26262b'; ctx.fillRect(-11, -42, 22, 20);
    if (pl.poster) { // pasted bills
      ctx.fillStyle = pl.poster; ctx.fillRect(-12, -196, 24, 30);
      ctx.fillStyle = '#c1121f'; ctx.fillRect(-9, -191, 18, 6); ctx.fillStyle = '#374151'; ctx.fillRect(-9, -181, 14, 3);
    }
    ctx.fillStyle = '#55555b'; ctx.fillRect(-72, -524, 144, 9); ctx.fillRect(-46, -476, 92, 8);
    if (s > 0.55) {
      ctx.fillStyle = '#e7e1d4'; // insulators
      for (const dx of [-60, -24, 24, 60]) ctx.fillRect(dx - 4, -534, 8, 10);
      ctx.strokeStyle = '#1b1819'; ctx.lineWidth = 3; // coiled spare cable
      const c = pl.coils[0];
      ctx.beginPath(); ctx.ellipse(c.dx, c.y, c.rx, c.ry, c.rot, 0, TAU); ctx.stroke();
      ctx.fillStyle = pl.boxes[0].c; ctx.fillRect(pl.boxes[0].dx - 11, pl.boxes[0].y, 22, 30);
    }
    if (pl.trans) { // transformer on a platform
      ctx.fillStyle = '#4b4b50'; ctx.fillRect(-44, -300, 88, 6);
      ctx.fillStyle = '#7f8c86'; ctx.fillRect(-30, -392, 60, 92);
      ctx.fillStyle = '#5f6b66'; ctx.fillRect(-40, -386, 10, 78); ctx.fillRect(30, -386, 10, 78);
      ctx.fillStyle = '#8a4b2e'; ctx.fillRect(-19, -408, 38, 16);
      ctx.fillStyle = '#facc15'; ctx.fillRect(-7, -366, 14, 14);
    }
    // street lamp on a curved arm, reaching over the road
    ctx.strokeStyle = '#5a5a60'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -500); ctx.quadraticCurveTo(a * 50, -560, a * 120, -548); ctx.stroke();
    ctx.fillStyle = '#3f3f46'; ctx.fillRect(a * 128 - 22, -552, 44, 14);
  }

  // ---------- wires ----------
  // Adds a hanging wire to the current path as quadratic pieces. It is clipped where it leaves the top
  // of the screen near the camera (the steep perspective there would throw the curve fit off), and gets
  // more pieces the more its depth changes along its length.
  function wirePath(ctx, w) {
    const hLow = Math.min(w.h0, w.h1) - w.sag;
    const dMin = hLow > cam.h + 20 ? Math.max(45, ((hLow - cam.h) * F) / (HY + 60)) : 45;
    const zc = cam.z - dMin;
    if (w.z0 > zc && w.z1 > zc) return false;
    const dz = w.z1 - w.z0;
    let ta = 0, tb = 1;
    if (w.z0 > zc) ta = (zc - w.z0) / dz;
    if (w.z1 > zc) tb = (zc - w.z0) / dz;
    const P = (t) => fp.project(w.z0 + dz * t, w.u0 + (w.u1 - w.u0) * t, w.h0 + (w.h1 - w.h0) * t - w.sag * 4 * t * (1 - t));
    let A = P(ta);
    const B = P(tb);
    if (!A || !B) return false;
    const ratio = Math.max(A.d, B.d) / Math.min(A.d, B.d);
    const n = ratio > 2.2 ? 3 : ratio > 1.35 ? 2 : 1;
    ctx.moveTo(A.x, A.y);
    for (let i = 1; i <= n; i++) {
      const t1 = ta + ((tb - ta) * i) / n, tm = t1 - (tb - ta) / (2 * n);
      const E = i === n ? B : P(t1), M = P(tm);
      if (!E || !M) return true;
      ctx.quadraticCurveTo(2 * M.x - (A.x + E.x) / 2, 2 * M.y - (A.y + E.y) / 2, E.x, E.y);
      A = E;
    }
    return true;
  }
  function wireAt(w, t) { return fp.project(w.z0 + (w.z1 - w.z0) * t, w.u0 + (w.u1 - w.u0) * t, w.h0 + (w.h1 - w.h0) * t - w.sag * 4 * t * (1 - t)); }

  // All spans of one depth band in two strokes (heavy lines, thin tangle), then the crows on them.
  const WGRP = [['#1b1819', 3], ['#2b2625', 2]];
  const tierAt = (sm) => (sm > 0.3 ? 2 : sm > 0.13 ? 1 : 0);
  function drawWireBand(ctx, spans, st, dRef) {
    const sRef = F / Math.max(60, dRef);
    for (let gi = 0; gi < 2; gi++) {
      ctx.beginPath();
      let any = false;
      for (const sp of spans) {
        const tier = tierAt(F / Math.max(60, cam.z - sp.zm));
        for (const w of sp.groups[gi]) if (w.tier <= tier && wirePath(ctx, w)) any = true;
      }
      if (any) { ctx.strokeStyle = WGRP[gi][0]; ctx.lineWidth = clamp(WGRP[gi][1] * sRef, 0.6, 4.5); ctx.stroke(); }
    }
    if (!st.crowImg) return;
    for (const sp of spans) {
      if (!sp.crows.length) continue;
      const tier = tierAt(F / Math.max(60, cam.z - sp.zm));
      for (const c of sp.crows) {
        if (c.w.tier > tier) continue;
        const p = wireAt(c.w, c.t);
        if (!p || p.d < 60) continue;
        const k = Math.min(p.s, 6), img = st.crowImg[(c.dir > 0 ? 0 : 2) + (c.caw > 0 ? 1 : 0)];
        const hgt = 30 * k, wd = hgt * (img.w / img.h);
        if (hgt < 1.5) continue;
        ctx.drawImage(img.cv, p.x - wd / 2, p.y - hgt + 2 * k + Math.sin(st.t * 2.2 + c.ph) * 0.6 * k, wd, hgt);
      }
    }
  }

  // ---------- street props ----------
  // A plane at constant z faces the camera: one fillRect (fillStyle set by the caller).
  function zRect(ctx, z, u0, u1, h0, h1) {
    const d = cam.z - z;
    if (d < NEAR) return false;
    const s = F / d;
    ctx.fillRect(CX + (u0 - cam.u) * s, HY + (cam.h - h1) * s, (u1 - u0) * s, (h1 - h0) * s);
    return true;
  }
  K.zRect = zRect;
  function box(ctx, z0, z1, u0, u1, h0, h1, cF, cS, cT) { // visible faces of an axis-aligned box
    ctx.fillStyle = cF; zRect(ctx, z1, u0, u1, h0, h1);
    if (cam.u < u0 && fp.wallQuad(ctx, z0, z1, u0, h0, h1)) { ctx.fillStyle = cS; ctx.fill(); }
    else if (cam.u > u1 && fp.wallQuad(ctx, z0, z1, u1, h0, h1)) { ctx.fillStyle = cS; ctx.fill(); }
    if (cT && cam.h > h1 && fp.quad(ctx, z0, z1, u0, u1, h1)) { ctx.fillStyle = cT; ctx.fill(); }
  }
  K.box = box;
  function bb(ctx, z, u, h, fn) { // billboard in local world units (y up = negative)
    const p = fp.project(z, u, h);
    if (!p) return;
    const k = Math.min(p.s, 12);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(k, k); fn(ctx, k); ctx.restore();
  }

  function drawStall(ctx, st, d) {
    const z0 = STALL.z0, z1 = STALL.z1, t = st.t;
    const s = F / d;
    // bench in front, for the tea drinkers
    if (fp.quad(ctx, 858, 924, 344, 376, 48)) { ctx.fillStyle = '#b07e4f'; ctx.fill(); }
    if (cam.u < 344 && fp.wallQuad(ctx, 858, 924, 344, 40, 48)) { ctx.fillStyle = '#7a5233'; ctx.fill(); }
    ctx.fillStyle = '#4a311e'; zRect(ctx, 922, 346, 351, 8, 40); zRect(ctx, 922, 369, 374, 8, 40);
    // the tea seller standing behind the counter
    bb(ctx, 890, 432, 8, (c) => {
      c.fillStyle = '#efeae0'; c.fillRect(-16, -150, 32, 50);
      TH.circle(c, 0, -164, 11, '#8d5a3b');
      c.fillStyle = '#f5f2ea'; c.fillRect(-11, -178, 22, 8); // tupi
      c.fillStyle = '#2a2020'; c.beginPath(); c.arc(0, -160, 9, 0.15 * Math.PI, 0.85 * Math.PI); c.fill(); // beard
      c.strokeStyle = '#8d5a3b'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-12, -138); c.lineTo(-26, -118 + Math.sin(t * 3) * 3); c.stroke();
    });
    // counter box: painted planks with a yellow stripe
    box(ctx, z0 + 6, z1 - 6, 398, 452, 8, 104, '#3f7680', '#2c5a62', null);
    ctx.fillStyle = '#e9c46a'; zRect(ctx, z1 - 6, 398, 452, 62, 68);
    if (s > 0.3 && cam.u < 398 && fp.wallQuad(ctx, z0 + 6, z1 - 6, 398, 62, 68)) ctx.fill();
    // jars on the counter
    bb(ctx, 880, 404, 104, (c) => {
      for (let i = 0; i < 3; i++) {
        c.fillStyle = st.jars[i]; c.fillRect(-26 + i * 18, -22, 13, 22);
        c.fillStyle = ['#c1121f', '#1d4ed8', '#f59e0b'][i]; c.fillRect(-27 + i * 18, -27, 15, 5);
      }
    });
    // front posts and the tin roof
    ctx.fillStyle = '#6b4a2e'; zRect(ctx, z1 - 6, 396, 400, 104, 204); zRect(ctx, z0 + 6, 396, 400, 104, 204);
    if (fp.path(ctx, [z0 - 8, 378, 200, z1 + 10, 378, 200, z1 + 10, 462, 216, z0 - 8, 462, 216])) { ctx.fillStyle = '#6e645c'; ctx.fill(); }
    ctx.fillStyle = '#9a8f84'; zRect(ctx, z1 + 10, 378, 462, 196, 204);
    // hanging bananas and sachet strips at the front edge
    bb(ctx, z0 + 20, 394, 198, (c) => {
      c.strokeStyle = '#e8c33a'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i < 3; i++) { c.moveTo(-6 + i * 5 + 14 * Math.cos(0.25 * Math.PI), 14 + (i % 2) * 4 + 14 * Math.sin(0.25 * Math.PI)); c.arc(-6 + i * 5, 14 + (i % 2) * 4, 14, 0.25 * Math.PI, 0.7 * Math.PI); }
      c.stroke();
      for (let i = 0; i < 4; i++) { c.fillStyle = ['#e11d48', '#0ea5e9', '#facc15', '#22c55e'][i]; c.fillRect(34, 4 + i * 11, 10, 10); }
    });
    // "cha" board on the roof, facing the traffic
    bb(ctx, z1 + 10, 420, 216, (c, k) => {
      c.fillStyle = '#4a311e'; c.fillRect(-16, -8, 32, 8);
      c.fillStyle = '#b91c1c'; c.fillRect(-44, -52, 88, 44);
      if (k * 30 > 5) {
        c.fillStyle = '#fff7e6'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `700 26px ${TH.FONT}`; c.fillText('চা', 0, -36, 80);
        c.font = `500 11px ${TH.FONT}`; c.fillText('চা · বিস্কুট · পান', 0, -17, 80);
      }
    });
    // kettle on a clay stove, with steam
    bb(ctx, z1 + 30, 426, 8, (c) => {
      c.fillStyle = '#5b3d25'; c.fillRect(-26, -62, 52, 62);
      c.fillStyle = '#9a5634'; c.fillRect(-20, -92, 40, 30);
      c.fillStyle = `rgba(255,140,40,${(0.6 + 0.3 * Math.sin(t * 13) * Math.sin(t * 7.3)).toFixed(3)})`; c.fillRect(-9, -80, 18, 10);
      c.fillStyle = '#c9ccd0'; c.beginPath(); c.ellipse(0, -104, 18, 14, 0, 0, TAU); c.fill();
      c.strokeStyle = '#a4a8ad'; c.lineWidth = 5; c.beginPath(); c.moveTo(-14, -104); c.quadraticCurveTo(-24, -106, -30, -118); c.stroke();
      const a0 = c.globalAlpha;
      c.globalAlpha = a0 * 0.35; c.fillStyle = '#fffaf0'; c.beginPath();
      for (let i = 0; i < 3; i++) {
        const q = (t * 0.5 + i / 3) % 1, x = -30 - q * 10 + Math.sin(q * 6 + i * 2 + t) * 5, y = -122 - q * 60, r = 4 + q * 12;
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      }
      c.fill();
      c.globalAlpha = a0;
    });
  }

  function drawVan(ctx, st, d) {
    const s = F / d;
    // rear wheels, bed with the fruit, the front wheel and seat
    const w1 = fp.project(312, 392, 28), w2 = fp.project(312, 444, 28);
    if (w1 && w2) {
      const k = Math.min(w1.s, 12);
      ctx.fillStyle = '#1c1c1c'; ctx.beginPath();
      ctx.moveTo(w1.x + 6 * k, w1.y); ctx.ellipse(w1.x, w1.y, 6 * k, 20 * k, 0, 0, TAU);
      ctx.moveTo(w2.x + 6 * k, w2.y); ctx.ellipse(w2.x, w2.y, 6 * k, 20 * k, 0, 0, TAU);
      ctx.fill();
    }
    box(ctx, 236, 324, 390, 446, 46, 60, '#2f6fb0', '#8a5a33', null);
    if (fp.quad(ctx, 240, 320, 392, 444, 61)) { ctx.fillStyle = '#d98a2b'; ctx.fill(); }
    bb(ctx, 324, 418, 60, (c, k) => { // fruit piled on the bed
      c.fillStyle = '#e89a33'; c.beginPath(); c.ellipse(-8, 0, 26, 18, 0, Math.PI, TAU); c.fill();
      c.fillStyle = '#6f9a3a'; c.beginPath(); c.ellipse(18, 0, 14, 12, 0, Math.PI, TAU); c.fill();
      if (k > 0.3) {
        c.strokeStyle = '#f2cf46'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath();
        for (let i = 0; i < 2; i++) { c.moveTo(-6 + i * 8 + 14 * Math.cos(0.2 * Math.PI), -30 + 14 * Math.sin(0.2 * Math.PI)); c.arc(-6 + i * 8, -30, 14, 0.2 * Math.PI, 0.55 * Math.PI); }
        c.stroke();
      }
    });
    bb(ctx, 214, 418, 8, (c) => { // front wheel, frame and seat
      c.fillStyle = '#1c1c1c'; c.beginPath(); c.ellipse(0, -20, 6, 20, 0, 0, TAU); c.fill();
      c.strokeStyle = '#2f3b4a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -20); c.lineTo(0, -72); c.moveTo(-20, -78); c.lineTo(20, -78); c.stroke();
      c.fillStyle = '#1f1f1f'; c.fillRect(-10, -66, 20, 6);
    });
    if (s > 0.25) bb(ctx, 326, 436, 60, (c, k) => { // price card
      c.fillStyle = '#6b4a2e'; c.fillRect(-1.5, -40, 3, 40);
      c.fillStyle = '#fbfaf3'; c.fillRect(-26, -64, 52, 24);
      if (k * 12 > 4) { c.fillStyle = '#b91c1c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 12px ${TH.FONT}`; c.fillText('তাজা ফল', 0, -52, 48); }
    });
  }

  function drawBanner(ctx, bn, d) {
    const s = F / d;
    // rope between the two poles
    ctx.beginPath();
    wirePath(ctx, { z0: bn.z, u0: RP, h0: 470, z1: bn.z, u1: LP, h1: 470, sag: 36 });
    ctx.strokeStyle = '#3b3532'; ctx.lineWidth = clamp(2 * s, 0.6, 3); ctx.stroke();
    const w = bn.u1 - bn.u0, h = 72, top = 470 - 36 - 12;
    const ropeAt = (u) => { const q = (RP - u) / (RP - LP); return 470 - 36 * 4 * q * (1 - q); };
    const p = fp.project(bn.z, bn.u0, top);
    if (!p) return;
    const k = Math.min(p.s, 12);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(k, k);
    ctx.strokeStyle = '#3b3532'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const x of [6, w * 0.5, w - 6]) { ctx.moveTo(x, 0); ctx.lineTo(x, top - ropeAt(bn.u0 + x)); }
    ctx.stroke();
    ctx.fillStyle = bn.bg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.quadraticCurveTo(w / 2, h - 8, 0, h); ctx.closePath(); ctx.fill();
    if (s > 0.12) {
      ctx.fillStyle = bn.band; ctx.fillRect(0, 4, w, 6); ctx.fillRect(0, h - 14, w, 5);
      if (k * 26 > 5) {
        ctx.fillStyle = bn.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 28px ${TH.FONT}`; ctx.fillText(bn.t1, w / 2, 30, w - 20);
        ctx.font = `500 13px ${TH.FONT}`; ctx.fillText(bn.t2, w / 2, 52, w - 30);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(w * 0.33, 0, 4, h); ctx.fillRect(w * 0.7, 0, 3, h);
    }
    ctx.restore();
  }

  function drawBusStop(ctx, d) {
    bb(ctx, -350, -712, 8, (c, k) => {
      c.fillStyle = '#6b7280'; c.fillRect(-3, -260, 6, 260);
      c.fillStyle = '#15803d'; c.fillRect(-46, -300, 92, 50);
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.strokeRect(-41, -295, 82, 40);
      if (k * 18 > 4) { c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 18px ${TH.FONT}`; c.fillText('বাস স্টপ', 0, -276, 76); }
    });
  }

  // ---------- sky ----------
  function skyGrad(ctx, s) {
    let o = s.grads && s.grads.get(ctx);
    if (o) return o;
    o = {};
    o.sky = ctx.createLinearGradient(0, -200, 0, HY + 14);
    o.sky.addColorStop(0, '#6fa3d3'); o.sky.addColorStop(0.35, '#95bddc'); o.sky.addColorStop(0.7, '#c1d3dc'); o.sky.addColorStop(0.9, '#d6d9d3'); o.sky.addColorStop(1, '#dcd9cd');
    o.glare = ctx.createRadialGradient(330, -140, 0, 330, -140, 520);
    o.glare.addColorStop(0, 'rgba(255,253,240,0.9)'); o.glare.addColorStop(0.35, 'rgba(255,250,232,0.35)'); o.glare.addColorStop(1, 'rgba(255,250,232,0)');
    o.haze = ctx.createLinearGradient(0, HY - 150, 0, HY + 70);
    o.haze.addColorStop(0, 'rgba(220,214,198,0)'); o.haze.addColorStop(0.7, 'rgba(220,214,198,0.16)'); o.haze.addColorStop(0.85, 'rgba(220,214,198,0.14)'); o.haze.addColorStop(1, 'rgba(220,214,198,0)');
    o.dust = ctx.createLinearGradient(0, HY - 150, 0, HY + 70); // drawn at ~0.3 alpha by the fog fade
    o.dust.addColorStop(0, 'rgba(222,215,198,0)'); o.dust.addColorStop(0.62, 'rgba(222,215,198,0.45)'); o.dust.addColorStop(0.8, 'rgba(222,215,198,0.4)'); o.dust.addColorStop(1, 'rgba(222,215,198,0)');
    if (!s.grads) s.grads = new WeakMap();
    s.grads.set(ctx, o);
    return o;
  }
  function paintClouds(st) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const t = mkTex(st.tex, 360, 120, 1);
      if (!t) return null;
      const g = t.g, R = TH.mulberry32(77 + i * 131);
      for (const pass of [0, 1]) for (let j = 0; j < 9; j++) {
        const u = j / 8, r = (22 + R() * 22) * (1 - Math.abs(u - 0.5) * 0.9);
        const x = 40 + u * 280 + (pass ? 3 : -4), y = 80 - r * 0.45 + (pass ? -4 : 6) + R() * 8;
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.5);
        const col = pass ? '255,255,252' : '196,206,216', a = pass ? 0.82 : 0.4;
        gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.55, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr; g.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
      }
      out.push(t);
    }
    return out;
  }
  function paintCrows(st) {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const t = mkTex(st.tex, 48, 32, 2);
      if (!t) return null;
      const g = t.g, dir = i < 2 ? 1 : -1, caw = i % 2;
      g.translate(24, 30); g.scale(dir, 1);
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-2, -6); g.lineTo(-3, 0); g.moveTo(2, -6); g.lineTo(2.5, 0); g.stroke();
      g.fillStyle = '#16151a';
      g.beginPath(); g.moveTo(-6, -11); g.lineTo(-21, -5 + caw * 2); g.lineTo(-19, -2 + caw * 2); g.lineTo(-4, -6); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(0, -12, 11, 7, -0.28, 0, TAU); g.fill();
      g.fillStyle = '#625e69'; g.beginPath(); g.ellipse(7, -17, 6, 5, -0.4, 0, TAU); g.fill();
      TH.circle(g, 10, -21 - caw * 2, 5.2, '#16151a');
      g.fillStyle = '#0c0b0e'; g.beginPath(); g.moveTo(14, -23 - caw * 2); g.lineTo(22, -21 - caw * 5); g.lineTo(14.5, -19.5 - caw * 2); g.closePath(); g.fill();
      if (caw) { g.beginPath(); g.moveTo(14, -19); g.lineTo(20, -15); g.lineTo(14, -18); g.closePath(); g.fill(); }
      TH.circle(g, 11.6, -22 - caw * 2, 1.1, '#d8d0c0');
      out.push(t);
    }
    return out;
  }

  function drawFarCity(ctx, s) { // hazy blocks, a minaret and a water tank around the vanishing point
    const fog = fp.fog.color;
    // background city beyond the end of the street
    ctx.beginPath();
    for (const b of s.city) {
      const d = cam.z - b.z, k = F / d, x = CX + (b.u - cam.u) * k, w = b.w * k;
      ctx.rect(x - w / 2, HY + (cam.h - b.h) * k, w, (b.h - cam.h) * k + 14);
    }
    ctx.fillStyle = hm(fog, '#8e8b86', 0.42); ctx.fill();
    // the street's own rows continuing past the last facades
    for (const row of s.farRows) {
      ctx.beginPath();
      let first = true;
      for (const b of row.blocks) {
        const pA = fp.project(b.z1, row.u, b.h), pB = fp.project(b.z0, row.u, b.h);
        if (!pA || !pB) continue;
        if (first) { const g0 = fp.project(b.z1, row.u, 0); if (!g0) continue; ctx.moveTo(g0.x, g0.y + 8); first = false; }
        ctx.lineTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
      }
      if (first) continue;
      const last = row.blocks[row.blocks.length - 1], gl = fp.project(last.z0, row.u, 0);
      if (gl) ctx.lineTo(gl.x, gl.y + 8);
      ctx.closePath();
      ctx.fillStyle = hm(fog, '#7d766c', 0.4); ctx.fill();
    }
    // mosque: dome and minaret
    const m = s.minaret, dm = cam.z - m.z, km = F / dm, mx = CX + (m.u - cam.u) * km, gy = HY + cam.h * km;
    const mc = hm(fog, '#f4ecdc', 0.62), mcs = hm(fog, '#6f675a', 0.55);
    ctx.fillStyle = mc;
    ctx.fillRect(mx - 380 * km, gy - 820 * km, 360 * km, 820 * km);
    ctx.fillStyle = hm(fog, '#4f8a62', 0.62);
    ctx.beginPath(); ctx.moveTo(mx - 360 * km, gy - 820 * km); ctx.quadraticCurveTo(mx - 360 * km, gy - 1100 * km, mx - 200 * km, gy - 1150 * km); ctx.quadraticCurveTo(mx - 40 * km, gy - 1100 * km, mx - 40 * km, gy - 820 * km); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mc;
    ctx.fillRect(mx - 36 * km, gy - 2350 * km, 72 * km, 2350 * km);
    ctx.fillStyle = mcs;
    ctx.fillRect(mx - 60 * km, gy - 1500 * km, 120 * km, 34 * km); ctx.fillRect(mx - 56 * km, gy - 2080 * km, 112 * km, 30 * km);
    ctx.fillRect(mx - 34 * km, gy - 2350 * km, 12 * km, 2350 * km);
    ctx.fillStyle = hm(fog, '#6f9a7c', 0.6);
    ctx.beginPath(); ctx.moveTo(mx - 44 * km, gy - 2350 * km); ctx.quadraticCurveTo(mx - 40 * km, gy - 2470 * km, mx, gy - 2530 * km); ctx.quadraticCurveTo(mx + 40 * km, gy - 2470 * km, mx + 44 * km, gy - 2350 * km); ctx.closePath(); ctx.fill();
    ctx.fillRect(mx - 3 * km, gy - 2620 * km, 6 * km, 90 * km);
    // WASA overhead water tank on its legs
    const w = s.tank, dw = cam.z - w.z, kw = F / dw, wx = CX + (w.u - cam.u) * kw, wy = HY + cam.h * kw;
    ctx.strokeStyle = hm(fog, '#5f5a52', 0.6); ctx.lineWidth = Math.max(0.8, 26 * kw);
    ctx.beginPath();
    for (const dx of [-150, -50, 50, 150]) { ctx.moveTo(wx + dx * kw, wy); ctx.lineTo(wx + dx * 0.7 * kw, wy - 1500 * kw); }
    ctx.moveTo(wx - 140 * kw, wy - 700 * kw); ctx.lineTo(wx + 140 * kw, wy - 700 * kw);
    ctx.stroke();
    ctx.fillStyle = hm(fog, '#8c857a', 0.62);
    ctx.beginPath(); ctx.moveTo(wx - 170 * kw, wy - 1500 * kw); ctx.lineTo(wx - 220 * kw, wy - 1780 * kw); ctx.lineTo(wx + 220 * kw, wy - 1780 * kw); ctx.lineTo(wx + 170 * kw, wy - 1500 * kw); ctx.closePath(); ctx.fill();
    ctx.fillRect(wx - 220 * kw, wy - 1900 * kw, 440 * kw, 120 * kw);
    ctx.fillStyle = mcs; ctx.fillRect(wx - 220 * kw, wy - 1790 * kw, 440 * kw, 14 * kw);
    // mobile phone tower
    const tw = s.mtower, dt = cam.z - tw.z, kt = F / dt, tx = CX + (tw.u - cam.u) * kt, ty = HY + cam.h * kt;
    ctx.strokeStyle = hm(fog, '#7e7469', 0.5); ctx.lineWidth = Math.max(0.6, 14 * kt);
    ctx.beginPath(); ctx.moveTo(tx - 90 * kt, ty); ctx.lineTo(tx - 14 * kt, ty - 2900 * kt); ctx.moveTo(tx + 90 * kt, ty); ctx.lineTo(tx + 14 * kt, ty - 2900 * kt);
    for (let h = 300; h < 2800; h += 300) { const a = 90 - (h / 2900) * 76, b2 = 90 - ((h + 300) / 2900) * 76; ctx.moveTo(tx - a * kt, ty - h * kt); ctx.lineTo(tx + b2 * kt, ty - (h + 300) * kt); }
    ctx.stroke();
  }

  function drawKite(ctx, s) {
    const k = s.kite, t = s.t;
    const kx = k.x + Math.sin(t * 0.7) * 10 + Math.sin(t * 1.9) * 3 - cam.u * 0.02, ky = k.y + Math.sin(t * 0.9 + 1) * 6;
    ctx.beginPath(); ctx.moveTo(kx, ky + 14); ctx.quadraticCurveTo(kx + 40, ky + 70, kx + 110, ky + 190);
    ctx.strokeStyle = 'rgba(70,60,60,0.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(t * 1.3) * 0.2);
    ctx.fillStyle = k.c1; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(10, 0); ctx.lineTo(0, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = k.c2; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-10, 0); ctx.lineTo(0, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = k.c1; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(4, 19); ctx.lineTo(-4, 19); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawFlock(ctx, s) {
    const f = s.flock;
    if (!f) return;
    ctx.beginPath();
    for (const b of f.birds) {
      const x = f.x + b.dx, y = f.y + b.dy + Math.sin(s.t * 1.3 + b.ph) * 2, fl = Math.sin(s.t * 10 + b.ph), z = b.sz;
      ctx.moveTo(x - z, y - fl * z * 0.7);
      ctx.quadraticCurveTo(x - z * 0.4, y - z * 0.5 * (fl + 0.3), x, y);
      ctx.quadraticCurveTo(x + z * 0.4, y - z * 0.5 * (fl + 0.3), x + z, y - fl * z * 0.7);
    }
    ctx.strokeStyle = 'rgba(40,36,40,0.75)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke();
  }

  function drawMotes(ctx, s) { // sunlit dust drifting close to the camera
    const a0 = ctx.globalAlpha;
    ctx.fillStyle = '#fff6e0';
    ctx.globalAlpha = a0 * (0.45 + 0.2 * Math.sin(s.t * 1.7));
    ctx.beginPath();
    for (const m of s.motes) {
      const z = cam.z - 160 - (((m.z - cam.z * 0.2 + s.t * m.vz) % 700) + 700) % 700;
      const u = cam.u + ((((m.u + s.t * m.vu) % 900) + 900) % 900) - 450;
      const p = fp.project(z, u, m.h + Math.sin(s.t * 0.8 + m.ph) * 8);
      if (!p || p.y < -5 || p.y > 605) continue;
      const r = clamp(1.3 * p.s, 0.4, 2.6);
      ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = a0;
  }

  // ---------- road definition ----------
  TH.fpRoads.push({
    id: 'badda',
    light: { tint: null, tintA: 1, glow: 0, fog: '#dcd9cd', fogNear: 1800, fogFar: 7400, fogMax: 0.72, lamps: false, headlights: false },
    street: {
      asphalt: '#4b4946', asphaltOpp: '#4e4c48', lane: '#d9d3c1', stop: '#ecebe4', sidewalk: '#a99f8d', sidewalkL: '#a49a88',
      curb: ['#dcd7ca', '#34332f'], median: '#8a8274', medianTop: '#6f8a4f', fence: '#2f6b4f', lampStyle: 'none', lampEvery: 700,
    },
    traffic: { bus: 4, cng: 4, car: 2, bike: 3, truck: 1 }, trafficDensity: 1.2,
    life: { walker: 5, woman: 3, kid: 2, hawker: 2, dog: 2 }, lifeDensity: 1.3,
    lifeSpots: [{ z: 890, u: 356, kind: 'teastall' }, { z: -350, u: -728, kind: 'busstop' }, { z: 255, u: 360, kind: 'crowd' }],

    init(rng) {
      const R = (a, b) => a + rng() * (b - a), rp = (a) => a[(rng() * a.length) | 0], ch = (p) => rng() < p;
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const s = { t: 0, tex: [], walls: null, built: false, rebuilt: false, age: 0, seedPaint: (rng() * 2147483647) | 0 };
      s.rnd = TH.mulberry32((rng() * 2147483647) | 0); // for runtime events (crow caws, flocks)

      // shops for the two ground-floor band textures (right side crisp, left side seen from farther away)
      const mkShop = (d) => {
        const st = rp(['open', 'open', 'open', 'half', 'half', 'closed']);
        const eat = ['hotel', 'biryani', 'sweets', 'pharmacy'].includes(d[1]);
        return {
          name: d[0], type: d[1], bg: d[2], fg: d[3], bd: d[4], sub: d[5], mini: d[6] || null, icon: d[1] === 'pharmacy' ? (d[2] === '#f8fafc' ? '#16a34a' : '#ffffff') : null,
          shadow: d[2] !== '#f8fafc', wall: rp(['#c9c0b0', '#bdb3a2', '#d2c8b6', '#b5ab9b']), pillar: rp(PILLAR), shutterC: rp(SHUT),
          state: eat && st === 'closed' ? 'open' : st, sy: R(150, 205), poster: ch(0.7) ? rp(['#fef3c7', '#fde68a', '#dbeafe', '#fce7f3', '#dcfce7']) : null,
        };
      };
      s.shops = shuffle(SHOPS.slice()).map(mkShop);
      s.shopsL = shuffle(SHOPS_L.slice()).map(mkShop);
      // flats above (7 designs, 3-8 floors over the shops = 4-9 storeys)
      const vinyl = shuffle(VINYL.slice());
      const specs = [
        { w: 600, floors: 5, style: 'paint' }, { w: 600, floors: 7, style: 'raw' }, { w: 800, floors: 6, style: 'paint' },
        { w: 400, floors: 4, style: 'brick' }, { w: 600, floors: 8, style: 'paint' }, { w: 800, floors: 3, style: 'paint' }, { w: 600, floors: 6, style: 'tile' },
      ];
      specs[0].banner = vinyl[0]; specs[2].banner = vinyl[1]; specs[5].banner = vinyl[2];
      s.designs = specs.map((o) => designUpper(rng, Object.assign({ paint: PAINT, raw: RAW }, o)));

      // both rows of buildings
      const mkRow = (side, u, z0, band) => layoutRow({ side, u, z0, z1: 2300, band, designs: s.designs, nShops: (band ? s.shopsL : s.shops).length, setbacks: [0, 0, 0, 0, 18, 36], rng, sideCols: SIDE });
      s.rows = [mkRow(1, fp.U.wallR, -6300, 0), mkRow(-1, fp.U.wallL, -6300 - R(0, 200), 1)];
      const ads = shuffle(ADS.slice());
      let ai = 0;
      for (const row of s.rows) for (let i = 0; i < row.length - 1; i++) if (row[i].top > row[i + 1].top + 450 && ch(0.5) && ai < ads.length) row[i].ad = ads[ai++];
      const pr = propsFor(s.rows, [s.shops, s.shopsL], rng, { signP: 0.55, awnP: 0.4, hang: HANG, awn: AWN });
      s.signs = pr.signs.filter((g) => g.side < 0 || !(g.z > STALL.z0 - 60 && g.z < STALL.z1 + 60) || g.h0 > 380);
      s.awnings = pr.awnings.filter((a) => a.side < 0 || a.zb < STALL.z0 - 20 || a.za > STALL.z1 + 20);

      // electric poles: right footpath at the curb, left footpath
      const poles = [];
      const mkPole = (z, u, side) => ({
        z, u, side, lampDir: side > 0 ? -1 : 1, trans: false,
        poster: ch(0.7) ? rp(['#fef3c7', '#fde68a', '#dbeafe', '#fce7f3', '#dcfce7']) : null,
        coils: Array.from({ length: 3 }, () => ({ dx: R(-22, 22), y: -R(380, 440), rx: R(12, 26), ry: R(7, 15), rot: R(-0.5, 0.5) })),
        boxes: Array.from({ length: ch(0.6) ? 2 : 1 }, (_, j) => ({ dx: j ? R(14, 22) : R(-22, -14), y: -R(320, 370), c: rp(['#e5e7eb', '#a3a8ae', '#3f4650']) })),
      });
      const right = [], left = [];
      for (let z = -6150; z < 2400; z += R(540, 660)) {
        let zz = z;
        if (zz > STALL.z0 - 70 && zz < STALL.z1 + 70) zz = STALL.z0 - 75; // clear of the tea stall
        if (zz > 1000 && zz < 2250) continue;                        // clear of the signal and the sergeant's beat
        right.push(mkPole(zz, RP, 1));
      }
      if (right[right.length - 1].z < 2250) right.push(mkPole(2330, RP, 1));
      for (let z = -5900; z < 2400; z += R(560, 680)) left.push(mkPole(z, LP, -1));
      // banner across the road, tied to a right pole near z ~ 60 and a left pole moved opposite it
      const bp = right.reduce((m, p) => (Math.abs(p.z - 60) < Math.abs(m.z - 60) ? p : m), right[0]);
      const lq = left.reduce((m, p) => (Math.abs(p.z - bp.z) < Math.abs(m.z - bp.z) ? p : m), left[0]);
      lq.z = bp.z;
      const bp2 = right.reduce((m, p) => (Math.abs(p.z + 2700) < Math.abs(m.z + 2700) ? p : m), right[0]);
      const lq2 = left.reduce((m, p) => (Math.abs(p.z - bp2.z) < Math.abs(m.z - bp2.z) ? p : m), left[0]);
      lq2.z = bp2.z;
      for (let i = 0; i < right.length; i += 4) right[(i + 2) % right.length].trans = true;
      left[(left.length / 2) | 0].trans = true;
      poles.push(...right, ...left);
      s.poles = poles.sort((a, b) => a.z - b.z);
      s.banners = [
        { z: bp.z, u0: -210, u1: 190, bg: '#fef9c3', fg: '#b91c1c', band: '#15803d', t1: 'ট্রাফিক আইন মেনে চলুন', t2: 'নিরাপদ সড়ক চাই · বাড্ডা ব্যবসায়ী সমিতি' },
        { z: bp2.z, u0: -160, u1: 170, bg: '#b91c1c', fg: '#ffffff', band: '#fde047', t1: 'শুভ নববর্ষ ১৪৩৩', t2: 'বাড্ডা যুব সংঘের পক্ষ থেকে শুভেচ্ছা' },
      ];

      // wires: along each pole line, across the road, and service drops into the flats
      // Each span has two groups: heavy lines (power, across the road) and the thin tangle (cable TV,
      // internet, drops). tier 0 wires always show, tier 1 from mid range, tier 2 only up close.
      const spans = [];
      const W = (z0, u0, h0, z1, u1, h1, sag, tier) => ({ z0, u0, h0, z1, u1, h1, sag, tier });
      const addSpan = (heavy, thin, along) => {
        let zf = Infinity, zn = -Infinity, uc = 0, n = 0, hLow = Infinity;
        for (const w of heavy.concat(thin)) { zf = Math.min(zf, w.z0, w.z1); zn = Math.max(zn, w.z0, w.z1); uc += w.u0 + w.u1; n += 2; hLow = Math.min(hLow, Math.min(w.h0, w.h1) - w.sag); }
        spans.push({ groups: [heavy, thin], along, zf, zn, zm: (zf + zn) / 2, uc: uc / n, hLow, crows: [] });
      };
      for (const line of [right, left]) {
        const wide = line[0].side > 0;
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i], b = line[i + 1];
          const heavy = [], thin = [];
          const pt = wide ? [1, 0, 1, 2] : [1, 0, 2, 2];
          [-60, -24, 24, 60].forEach((du, j) => heavy.push(W(a.z, a.u + du, 526, b.z, b.u + du, 526, R(18, 30), pt[j])));
          heavy.push(W(a.z, a.u - 36, 478, b.z, b.u - 36, 478, R(26, 40), 2));
          const tt = wide ? [0, 1, 1, 2, 2, 2] : [0, 1, 2];
          for (const tier of tt) thin.push(W(a.z, a.u + R(-18, 18), R(380, 450), b.z, b.u + R(-18, 18), R(380, 450), R(20, 110), tier));
          const y1 = R(390, 430), y2 = R(390, 430), sg = R(40, 80);
          for (let q = 0; q < (wide ? 3 : 2); q++) thin.push(W(a.z, a.u + 10, y1 + q * 4, b.z, b.u + 10, y2 + q * 3, sg + q * 3, q || !wide ? 2 : 1));
          addSpan(heavy, thin, true);
        }
      }
      for (const a of right) { // across the road to the opposite pole line
        if (!ch(0.75)) continue;
        const b = left.reduce((m, p) => (Math.abs(p.z - a.z) < Math.abs(m.z - a.z) ? p : m), left[0]);
        const n = 2 + ((rng() * 3) | 0), heavy = [];
        for (let j = 0; j < n; j++) heavy.push(W(a.z, a.u + R(-20, 20), R(400, 520), b.z, b.u + R(-20, 20), R(400, 520), R(40, 110), [0, 1, 2, 2][j]));
        addSpan(heavy, [], false);
      }
      for (const a of s.poles) { // service drops into the flats
        const n = a.side > 0 ? 2 : 1, thin = [], wall = a.side > 0 ? fp.U.wallR - 2 : fp.U.wallL + 2;
        for (let j = 0; j < n; j++) thin.push(W(a.z, a.u, R(390, 460), a.z + R(-320, 320), wall, R(330, 460), R(10, 40), j ? 2 : 1));
        addSpan([], thin, false);
      }
      s.spans = spans.sort((a, b) => a.zf - b.zf);
      // crows perched on the wires
      const perch = spans.filter((sp) => sp.groups[0].length);
      for (let i = 0; i < 18 && perch.length; i++) {
        const sp = rp(perch), g = sp.groups[0], w = g.find((q) => q.tier === 0) || g[0];
        sp.crows.push({ w, t: R(0.2, 0.8), dir: ch(0.5) ? 1 : -1, ph: R(0, TAU), caw: 0, next: R(1, 9) });
      }

      // far city at the vanishing point
      s.city = [];
      for (let i = 0; i < 16; i++) s.city.push({ z: -R(14000, 60000), u: R(-5000, 5000), w: R(500, 1600), h: R(900, 3200) });
      s.city.sort((a, b) => a.z - b.z);
      s.farRows = [fp.U.wallR + 60, fp.U.wallL - 60].map((u) => {
        const blocks = [];
        for (let z = -4600; z > -19000;) { const L = R(600, 1300) * (1 + (-5500 - z) / 5000); blocks.push({ z1: z, z0: z - L, h: R(700, 1700) }); z -= L; }
        return { u, blocks };
      });
      s.minaret = { z: -7600, u: 170 };
      s.tank = { z: -8600, u: -1000 };
      s.mtower = { z: -12000, u: 700 };
      s.kite = { x: R(380, 430), y: R(28, 50), c1: rp(['#e63946', '#7b2cbf', '#0077b6']), c2: rp(['#ffd166', '#f1faee', '#90e0ef']) };
      s.cloudPos = [[R(60, 200), R(20, 60), R(0.8, 1.1)], [R(380, 520), R(-10, 30), R(0.9, 1.2)], [R(700, 860), R(10, 55), R(0.7, 1)]];
      s.flock = null; s.flockT = R(2, 6);
      s.motes = Array.from({ length: 14 }, () => ({ z: R(0, 700), u: R(0, 900), h: R(30, 380), vz: R(-20, 20), vu: R(-15, 25), ph: R(0, TAU) }));
      s.jars = [rp(['#d9a45b', '#b5652f']), rp(['#f2d27a', '#e07a5f']), rp(['#d64545', '#c9a227'])];
      return s;
    },

    update(s, dt) {
      s.t += dt;
      if (s.built && !s.rebuilt && (s.age += dt) > 4) { // repaint the signboards once the Bangla web font has had time to load
        s.rebuilt = true;
        if (s.bands) s.bands.forEach((b, i) => b && repaintBand(b, i ? s.shopsL : s.shops, s.seedPaint + i));
      }
      const r = s.rnd;
      for (const sp of s.spans) for (const c of sp.crows) {
        c.caw = Math.max(0, c.caw - dt); c.next -= dt;
        if (c.next <= 0) { c.caw = 0.45; c.next = 3 + r() * 9; }
      }
      const f = s.flock;
      if (f) {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.x < -200 || f.x > 1200) { s.flock = null; s.flockT = 8 + r() * 12; }
      } else if ((s.flockT -= dt) <= 0) {
        const dir = r() < 0.5 ? 1 : -1, n = 4 + ((r() * 5) | 0), birds = [];
        for (let i = 0; i < n; i++) birds.push({ dx: -dir * (i * 14 + r() * 8), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 6 + r() * 4, ph: r() * TAU, sz: 3.5 + r() * 2.5 });
        s.flock = { x: dir > 0 ? -60 : 1060, y: 40 + r() * 70, vx: dir * (50 + r() * 30), vy: (r() - 0.5) * 6, birds };
      }
    },

    walls(s) {
      if (s.walls) return s.walls;
      s.bands = [paintBand(s.tex, s.shops, 1.2, s.seedPaint), paintBand(s.tex, s.shopsL, 0.7, s.seedPaint + 1)];
      s.ups = paintUppers(s.tex, s.designs, 0.6, s.seedPaint ^ 0x5bd1e995);
      s.walls = s.bands[0] ? wallsFor(s.rows, s.bands, s.ups) : [];
      s.clouds = paintClouds(s);
      s.crowImg = paintCrows(s);
      s.built = true;
      s.bytes = texBytes(s.tex);
      return s.walls;
    },

    drawSky(ctx, s) {
      const G = skyGrad(ctx, s);
      ctx.fillStyle = '#958c7d'; ctx.fillRect(-400, HY, 1800, 800); // ground beyond the building lines
      ctx.fillStyle = G.sky; ctx.fillRect(-400, -400, 1800, HY + 414);
      ctx.fillStyle = G.glare; ctx.fillRect(-200, -400, 1100, 800);
      if (s.clouds) {
        const a0 = ctx.globalAlpha;
        s.cloudPos.forEach(([x0, y, sc], i) => {
          const img = s.clouds[i], x = ((x0 + s.t * (3 + i) - cam.u * 0.03 + 200) % 1400) - 200;
          ctx.globalAlpha = a0 * 0.9;
          ctx.drawImage(img.cv, x, y, 360 * sc, 120 * sc * 0.7);
        });
        ctx.globalAlpha = a0;
      }
      drawFlock(ctx, s);
      drawKite(ctx, s);
      drawFarCity(ctx, s);
      ctx.fillStyle = G.haze; ctx.fillRect(-400, HY - 150, 1800, 220);
      if (s.built) drawCrossFaces(ctx, s.rows);
    },

    add(s, env, add) {
      const zF = cam.z - fp.FAR, zN = cam.z - NEAR - 10;
      // dust haze over the far street, drawn before the standing things out there
      add(cam.z - 6000, (c) => { c.fillStyle = skyGrad(c, s).dust; c.fillRect(-400, HY - 150, 1800, 220); });
      // wires: batched per depth band, each band drawn at its near edge (wires hang high, so only far
      // wires can overlap a near rickshaw on screen, and those always land in an earlier band)
      const bands = WB.map(() => []);
      for (const sp of s.spans) {
        const dFar = cam.z - sp.zf;
        if (sp.zf > cam.z - 60 || dFar > fp.FAR - 50) continue;
        if (HY + (cam.h - sp.hLow) * (F / Math.max(60, dFar)) < -10) continue; // all above the top of the screen
        let bi = 0;
        while (bi < WB.length - 1 && dFar > WB[bi + 1]) bi++;
        bands[bi].push(sp);
      }
      bands.forEach((list, i) => { if (list.length) add(cam.z - WB[i], (c) => drawWireBand(c, list, s, WB[i] + 400)); });
      // poles and signs: one item each up close, grouped per band farther out
      const far = [[], []];
      for (const pl of s.poles) {
        const d = cam.z - pl.z;
        if (d < NEAR + 10 || d > fp.FAR) continue;
        if (d < 2600) add(pl.z, (c, dd) => drawPole(c, pl, dd, s), pl.u, 160);
        else far[d < 4400 ? 0 : 1].push(pl);
      }
      const farS = [[], []];
      for (const sg of s.signs) {
        const d = cam.z - sg.z;
        if (d < NEAR + 10 || d > 5600) continue;
        if (d < 2600) add(sg.z, (c, dd) => drawSign(c, sg, dd), sg.wallU - sg.side * (sg.w / 2 + 16), sg.w);
        else farS[d < 4400 ? 0 : 1].push(sg);
      }
      [0, 1].forEach((i) => {
        if (!far[i].length && !farS[i].length) return;
        let zMin = Infinity;
        for (const q of far[i]) zMin = Math.min(zMin, q.z);
        for (const q of farS[i]) zMin = Math.min(zMin, q.z);
        add(zMin, (c) => { // at the group's far edge, each member faded at its own depth
          const a0 = c.globalAlpha;
          for (const sg of farS[i]) { c.globalAlpha = a0 * fp.fade(cam.z - sg.z); drawSignFar(c, sg, F / (cam.z - sg.z)); }
          for (const pl of far[i]) { c.globalAlpha = a0 * fp.fade(cam.z - pl.z); drawPole(c, pl, cam.z - pl.z, s); }
          c.globalAlpha = a0;
        }, undefined, undefined, { noFade: true });
      });
      for (const aw of s.awnings) {
        if (aw.zb < cam.z - 2700 || aw.za > zN) continue;
        add(aw.za, (c, d) => drawAwning(c, aw, d), aw.wallU - aw.side * 35, 140);
      }
      if (STALL.z1 < zN) add(STALL.z0, (c, d) => drawStall(c, s, d), 410, 150);
      if (VAN.z1 < zN) add(VAN.z0 + 40, (c, d) => drawVan(c, s, d), 418, 140);
      for (const bn of s.banners) if (bn.z > zF && bn.z < zN) add(bn.z, (c, d) => drawBanner(c, bn, d), (RP + LP) / 2, 600);
      if (-350 < zN) add(-350, (c, d) => drawBusStop(c, d), -712, 60);
      add(cam.z - 500, (c) => drawMotes(c, s));
    },

    dispose(s) {
      freeTex(s.tex);
      s.walls = null; s.bands = null; s.ups = null; s.clouds = null; s.crowImg = null; s.built = false;
    },
  });
})();
