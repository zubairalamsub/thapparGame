// First-person scenery: Kuril Bishwa Road (কুড়িল বিশ্বরোড) at dusk.
// The Kuril flyover loops over the road on round pillars, a ramp curls up out of the open ground on
// the left into the loop, an upper deck sweeps across higher up, a steel foot-overbridge with people
// on it, a train crossing on its embankment at the horizon, billboards, shop-lined facades whose
// windows light up as the sun goes down, and flyover lamps flickering on. See js/FP_CONTRACT.md §4–§6.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = TH.fp;
  if (!fp || !TH.fpRoads) return;
  const cam = fp.cam;
  const { CX, HY, F } = fp;
  const TAU = Math.PI * 2;
  const FONT = TH.FONT;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- colour ----------
  const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const hexOf = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const TINT = '#f0c7a8';
  const TK = rgbOf(TINT);
  const preM = new Map();
  // The colour to paint so that it reads as `hex` after the dusk tint multiplies the world.
  function pre(hex) {
    let v = preM.get(hex);
    if (!v) { const c = rgbOf(hex); v = hexOf([(c[0] * 255) / TK[0], (c[1] * 255) / TK[1], (c[2] * 255) / TK[2]]); preM.set(hex, v); }
    return v;
  }
  const rgba = (hex, a) => { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${Math.round(clamp(a, 0, 1) * 1000) / 1000})`; };
  const FOG = pre('#f4c9a2');       // horizon haze (after the tint: warm peach)
  const FOG_MAX = 0.75;

  // ---------- layout (FP world units, see §1) ----------
  const RING = { zc: -1000, uc: -900, R: 700, h: 500, rise: 0, th: 110 };   // the loop, straddling the opposite carriageway (rise > 0 makes it climb)
  const Z_D1 = RING.zc - RING.R;                           // lower deck crossing the road, leaving the loop at its far side
  const Z_D2 = -2500;                                      // upper deck, higher and farther
  const GAP_R = [-2020, -1380];                          // cross street under D1 on the right
  const OPEN_L = [-3600, 1000];                            // boundary wall on the left, the loops behind it
  const FOB = { z: 1100, hw: 72, u0: -806, u1: 466, hB: 292, hW: 322, hT: 408 };
  const DT = 7200, KT = F / DT;                            // depth of the railway embankment at the horizon
  const SUN = { x: 170, y: 182, r: 15 };

  // ---------- small geometry helpers ----------
  // Transform so local (u, -h) maps onto the vertical plane across the road at depth z. Returns px/unit.
  function planeAt(ctx, z) {
    const d = cam.z - z;
    if (!(d > 20)) return 0;
    const k = F / d;
    ctx.translate(CX - cam.u * k, HY + cam.h * k);
    ctx.scale(k, k);
    return k;
  }
  // Billboard transform at a ground point; local units, y up = negative. Returns the projection.
  function bbAt(ctx, z, u, h, kMax) {
    const p = fp.project(z, u, h);
    if (!p) return null;
    const k = Math.min(p.s, kMax || 30);
    ctx.translate(p.x, p.y);
    ctx.scale(k, k);
    return p;
  }
  // Screen y above which something standing behind the building line on `side` shows at column x
  // (the nearer wall blocks hide everything below their roofline).
  function occY(s, x, side) {
    let y = 1e4;
    for (const b of s.blocks) {
      if (b.side !== side) continue;
      const du = b.u - cam.u;
      if (du * side <= 2) continue;
      const k = (x - CX) / du;
      if (!(k > 0)) continue;
      const z = cam.z - F / k;
      if (z < b.z0 || z > b.z1) continue;
      y = Math.min(y, HY + (cam.h - b.base - b.hs) * k);
    }
    return y;
  }
  // Clip away the parts of an item beyond the building line on `side` that nearer wall blocks cover.
  function clipBehind(ctx, s, z, side, xLim) {
    const lim = xLim === undefined ? (side > 0 ? 1200 : -200) : xLim;
    ctx.beginPath();
    ctx.rect(-300, -300, 1600, 1200);
    const zc = cam.z - 24;
    for (const b of s.spans) {
      if (b.side !== side || b.z1 <= z) continue;
      const za = Math.max(b.z0, z), zb = Math.min(b.z1, zc);
      if (zb <= za + 1) continue;
      const du = b.u - cam.u;
      if (du * side <= 2) continue;
      const sa = F / (cam.z - za), sb = F / (cam.z - zb);
      const xa = CX + du * sa, xb = CX + du * sb;
      if (side > 0 ? xa > lim : xa < lim) continue;
      const hb = b.base, ht = b.base + b.hs;
      ctx.moveTo(xa, HY + (cam.h - ht) * sa); ctx.lineTo(xb, HY + (cam.h - ht) * sb);
      ctx.lineTo(xb, HY + (cam.h - hb) * sb); ctx.lineTo(xa, HY + (cam.h - hb) * sa);
      ctx.closePath();
    }
    ctx.clip('evenodd');
  }
  // Screen x of the far end of an item at depth z reaching lateral u (limits the clip wedges needed).
  const xAt = (z, u) => CX + ((u - cam.u) * F) / Math.max(30, cam.z - z);
  // Contiguous blocks with the same line and roof height merge into one clip wedge.
  function mergeSpans(blocks) {
    const out = [];
    for (const side of [1, -1]) {
      const bs = blocks.filter((b) => b.side === side).sort((a, b) => a.z0 - b.z0);
      for (const b of bs) {
        const l = out[out.length - 1];
        if (l && l.side === side && Math.abs(l.z1 - b.z0) < 2 && Math.abs(l.u - b.u) < 1 && Math.abs(l.hs - b.hs) < 1) l.z1 = b.z1;
        else out.push({ side, z0: b.z0, z1: b.z1, u: b.u, hs: b.hs, base: b.base });
      }
    }
    return out;
  }
  // True when a screen point in the sky is hidden by one of our facades.
  function wallCovers(s, x, y) {
    for (const b of s.blocks) {
      const du = b.u - cam.u;
      if (du * b.side <= 2) continue;
      const k = (x - CX) / du;
      if (!(k > 0)) continue;
      const z = cam.z - F / k;
      if (z < b.z0 || z > Math.min(b.z1, cam.z - 24)) continue;
      if (y > HY + (cam.h - b.base - b.hs) * k && y < HY + (cam.h - b.base) * k) return true;
    }
    return false;
  }
  // Glow for things in the sky layer: skipped behind our facades, and not dimmed by the fog.
  function skyGlow(s, x, y, r, col, a) {
    if (!wallCovers(s, x, y)) fp.glow(x, y, r, col, 1e5, a / (1 - FOG_MAX * 0.7));
  }

  // ---------- facade textures ----------
  const D = 0.9;     // atlas density, px per world unit
  const HU = 860;    // atlas height in world units (walls using it get h = HU * hk)
  const EK = 4;      // the emissive map is EK times shorter than the facade atlas
  const SIGNS = [['#d62828', '#ffffff'], ['#1d4ed8', '#ffffff'], ['#15803d', '#ffffff'], ['#facc15', '#b91c1c'], ['#f97316', '#ffffff'],
    ['#ffffff', '#c1121f'], ['#7e22ce', '#fde047'], ['#0f766e', '#ffffff'], ['#be123c', '#fef08a']];
  const SHOPS = ['মায়ের দোয়া স্টোর', 'নিউ ফার্মেসী', 'কুড়িল টেলিকম', 'হোটেল ও রেস্টুরেন্ট', 'মিষ্টি মুখ', 'বিসমিল্লাহ ট্রেডার্স',
    'ফ্যাশন হাউস', 'সেলুন', 'চা-নাস্তা', 'মোবাইল সার্ভিসিং', 'হার্ডওয়্যার', 'কাপড়ের দোকান', 'বিরিয়ানি হাউস', 'ইলেকট্রনিক্স',
    'ডেন্টাল কেয়ার', 'কোচিং সেন্টার', 'জুতার দোকান', 'ফটোকপি', 'মুদি দোকান', 'ফলের দোকান', 'কুড়িল স্টোর', 'লন্ড্রি'];
  const pickR = (r, a) => a[(r() * a.length) | 0];

  function text(g, str, x, y, size, col, maxW, weight) {
    g.font = `${weight || 'bold'} ${size}px ${FONT}`;
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(str, x, y, maxW);
  }
  // A window: dark glass reflecting the dusk, or lit (warm bulb / cool tube light) with a glow in e.
  function win(g, e, x, y, w, h, lit, warm, r) {
    if (lit) {
      g.fillStyle = warm ? '#f7d38c' : '#e6efe2'; g.fillRect(x, y, w, h);
      g.fillStyle = pickR(r, ['rgba(150,40,50,0.45)', 'rgba(40,90,120,0.4)', 'rgba(200,120,40,0.4)', 'rgba(60,110,60,0.35)']);
      g.fillRect(x, y, w * (0.22 + r() * 0.3), h);
      e.fillStyle = warm ? 'rgba(255,190,105,0.95)' : 'rgba(205,232,255,0.8)'; e.fillRect(x, y, w, h);
    } else {
      g.fillStyle = '#3a404b'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,196,160,0.2)'; g.fillRect(x, y, w, h * 0.35);
    }
    g.fillStyle = 'rgba(38,34,32,0.7)'; g.fillRect(x + w / 2 - 1.5, y, 3, h);
  }
  // Ground-floor shops: flex signboards, rolling shutters, open fronts lit from inside.
  function shopFront(g, e, x0, w, H, r) {
    g.fillStyle = '#6d655c'; g.fillRect(x0, -H, w, H);
    let x = x0;
    while (x < x0 + w - 24) {
      const sw = Math.min(x0 + w - x, 78 + r() * 58);
      const [bg, fg] = pickR(r, SIGNS), sh = 36;
      g.fillStyle = bg; g.fillRect(x + 3, -H + 4, sw - 6, sh);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, -H + 4, sw - 6, 5);
      text(g, pickR(r, SHOPS), x + sw / 2, -H + 4 + sh / 2 + 1, 19, fg, sw - 14);
      e.fillStyle = rgba(bg, 0.32); e.fillRect(x + 3, -H + 4, sw - 6, sh);
      const y0 = -H + sh + 10, hh = H - sh - 10;
      if (r() < 0.62) {
        g.fillStyle = '#c99250'; g.fillRect(x + 5, y0, sw - 10, hh);
        for (let k = 0; k < 3; k++) {       // shelves of goods
          g.fillStyle = pickR(r, ['#b83b3b', '#3b6fb8', '#e2c044', '#6a9a3a', '#f0f0e8', '#9a4fb8']);
          g.fillRect(x + 8, y0 + 8 + k * (hh / 3.4), sw - 16, hh / 6);
        }
        if (r() < 0.6) { g.fillStyle = '#2b2522'; g.fillRect(x + sw * 0.4, y0 + hh * 0.35, 16, hh * 0.65); g.beginPath(); g.arc(x + sw * 0.4 + 8, y0 + hh * 0.3, 8, 0, TAU); g.fill(); }
        e.fillStyle = 'rgba(255,196,120,0.5)'; e.fillRect(x + 5, y0, sw - 10, hh);
        g.fillStyle = '#8d9096'; g.fillRect(x + 5, y0, sw - 10, 8);  // rolled-up shutter
      } else {
        g.fillStyle = '#8f9398'; g.fillRect(x + 5, y0, sw - 10, hh);
        g.fillStyle = 'rgba(40,40,44,0.35)';
        for (let yy = y0 + 5; yy < y0 + hh; yy += 7) g.fillRect(x + 5, yy, sw - 10, 1.6);
        if (r() < 0.5) { g.fillStyle = pickR(r, ['#f4efe4', '#fde68a', '#fca5a5']); g.fillRect(x + 12 + r() * (sw - 44), y0 + 12, 22, 28); }
        g.fillStyle = 'rgba(30,30,34,0.5)'; g.fillRect(x + sw / 2 - 6, y0 + hh - 10, 12, 4);
      }
      g.fillStyle = '#595148'; g.fillRect(x, -H, 4, H);
      x += sw;
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, -8, w, 8);
  }
  // Rooftop clutter: black water tanks, antennas, a dish, laundry.
  function roofJunk(g, w, top, r) {
    for (let i = 0; i < 2; i++) {
      if (r() < 0.25) continue;
      const x = 20 + r() * (w - 70);
      g.fillStyle = '#1f1f24'; g.fillRect(x, top - 46, 40, 40); g.fillRect(x + 4, top - 6, 4, 6); g.fillRect(x + 32, top - 6, 4, 6);
      g.fillStyle = 'rgba(255,210,170,0.25)'; g.fillRect(x + 32, top - 46, 6, 40);
    }
    g.strokeStyle = '#3a3a3e'; g.lineWidth = 2.5; g.beginPath();
    const ax = 30 + r() * (w - 60);
    g.moveTo(ax, top); g.lineTo(ax, top - 90); g.moveTo(ax - 18, top - 70); g.lineTo(ax + 18, top - 70); g.moveTo(ax - 12, top - 82); g.lineTo(ax + 12, top - 82);
    g.stroke();
    if (r() < 0.6) { g.fillStyle = '#d9d6d0'; g.beginPath(); g.ellipse(w - 40, top - 22, 16, 12, -0.4, 0, TAU); g.fill(); }
  }
  // A Dhaka mid-rise: shops below, windows with iron grills or balconies with plants and laundry above.
  function apartment(g, e, w, h, r, o) {
    const gf = 150, top = -h + (o.par || 22), fl = o.floors, fh = (h - (o.par || 22) - gf) / fl;
    g.fillStyle = o.wall; g.fillRect(0, -h, w, h - gf);
    g.fillStyle = o.trim; g.fillRect(-2, -h, w + 4, o.par || 22);
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(70,56,44,${0.08 + r() * 0.1})`; g.fillRect(r() * w, top, 5 + r() * 18, (0.2 + r() * 0.7) * (h - gf)); }
    const bays = Math.max(2, Math.round(w / (o.bay || 88))), bw = w / bays;
    for (let f = 0; f < fl; f++) {
      const yb = -gf - f * fh;
      g.fillStyle = o.trim; g.fillRect(-3, yb - 9, w + 6, 9);
      for (let b = 0; b < bays; b++) {
        const x = b * bw, wx = x + bw * 0.17, ww = bw * 0.66, wy = yb - fh + 16, wh = fh - 44;
        const lit = r() < (o.lit || 0.45), warm = r() < 0.55;
        win(g, e, wx, wy, ww, wh, lit, warm, r);
        const balc = o.bal && ((b + f) % 2 === 0 || r() < 0.2);
        if (balc) {
          g.fillStyle = o.rail || '#5d6a64'; g.fillRect(wx - 8, yb - 44, ww + 16, 34);
          g.fillStyle = o.wall; for (let k = 0; k < 7; k++) g.fillRect(wx - 4 + k * ((ww + 8) / 7), yb - 40, 4, 26);
          if (r() < 0.5) {   // laundry
            for (let k = 0; k < 3; k++) { g.fillStyle = pickR(r, ['#d62828', '#f4f1ea', '#2b6cb0', '#f59e0b', '#16a34a', '#db2777']); g.fillRect(wx + 4 + k * (ww / 3.2), yb - 70, ww / 4.4, 26 + r() * 10); }
          }
          if (r() < 0.5) { g.fillStyle = '#3f7a3a'; g.beginPath(); g.arc(wx + ww - 10, yb - 48, 12, 0, TAU); g.fill(); }
        } else {
          g.fillStyle = 'rgba(40,40,44,0.7)';
          for (let k = 1; k < 6; k++) g.fillRect(wx + (k * ww) / 6 - 1, wy, 2.2, wh);
          g.fillRect(wx, wy + wh / 2 - 1, ww, 2.2);
          g.fillStyle = o.trim; g.fillRect(wx - 6, wy - 8, ww + 12, 6);
        }
        if (r() < 0.22) { g.fillStyle = '#e8e6e0'; g.fillRect(wx + ww - 34, yb - 34, 34, 24); g.fillStyle = '#9a9a9a'; g.fillRect(wx + ww - 30, yb - 30, 20, 16); }
      }
    }
    roofJunk(g, w, -h, r);
    shopFront(g, e, 0, w, gf, r);
    if (o.bill) rooftopBill(g, e, w, h, o.bill, r);
  }
  // Steel-framed billboard on the roof, lit by flood lamps.
  function rooftopBill(g, e, w, h, top, r) {
    const bx = 20, bw = w - 40, by = -top, bh = (top - h) * 0.72;
    g.strokeStyle = '#3a3638'; g.lineWidth = 5; g.beginPath();
    for (let x = bx + 20; x < bx + bw; x += 70) { g.moveTo(x, -h); g.lineTo(x, by + bh); g.moveTo(x, -h); g.lineTo(x + 35, by + bh); }
    g.stroke();
    g.fillStyle = '#2c2a2c'; g.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
    g.fillStyle = '#fff5e2'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#e63946'; g.fillRect(bx, by, 14, bh);
    g.fillStyle = '#2a9d8f'; g.fillRect(bx + bw - 64, by + 12, 48, bh - 24);
    g.fillStyle = '#ffe9a8'; for (let i = 0; i < 5; i++) g.fillRect(bx + bw - 56, by + 20 + i * ((bh - 40) / 5), 30, 9);
    text(g, 'স্বপ্নের ফ্ল্যাট', bx + (bw - 64) / 2 + 8, by + bh * 0.36, 44, '#b3122b', bw - 100);
    text(g, 'বুকিং চলছে!', bx + (bw - 64) / 2 + 8, by + bh * 0.72, 30, '#1d3a6e', bw - 110);
    e.fillStyle = 'rgba(255,236,190,0.55)'; e.fillRect(bx, by, bw, bh);
  }
  function lowrow(g, e, w, h, r) {
    // two storeys: shops, then a floor of offices behind a big signboard band, under a tin roof
    g.fillStyle = '#cdbfa7'; g.fillRect(0, -h + 30, w, h - 30);
    g.fillStyle = '#7d8790'; g.beginPath(); g.moveTo(-6, -h + 34); g.lineTo(w + 6, -h + 34); g.lineTo(w - 10, -h); g.lineTo(10, -h); g.closePath(); g.fill();
    g.fillStyle = 'rgba(40,44,50,0.4)'; for (let x = 4; x < w; x += 14) g.fillRect(x, -h + 2, 3, 30);
    let x = 0;
    while (x < w - 30) {
      const sw = Math.min(w - x, 130 + r() * 90), [bg, fg] = pickR(r, SIGNS);
      g.fillStyle = bg; g.fillRect(x + 4, -h + 44, sw - 8, 54);
      text(g, pickR(r, SHOPS), x + sw / 2, -h + 72, 30, fg, sw - 20);
      e.fillStyle = rgba(bg, 0.5); e.fillRect(x + 4, -h + 44, sw - 8, 54);
      x += sw;
    }
    for (let k = 0; k < 4; k++) win(g, e, 18 + k * (w / 4), -h + 106, w / 4 - 36, 38, r() < 0.5, r() < 0.6, r);
    shopFront(g, e, 0, w, 140, r);
  }
  function pinkOld(g, e, w, h, r) {
    apartment(g, e, w, h, r, { wall: '#dcae9c', trim: '#c08d7b', floors: 3, bay: 75, lit: 0.5, rail: '#3f6b58' });
    g.fillStyle = 'rgba(60,40,30,0.18)';
    for (let i = 0; i < 5; i++) g.fillRect(r() * w, -h + 22, 8 + r() * 10, 120 + r() * 160);
    g.fillStyle = '#8a8f96'; g.fillRect(w * 0.55, -h - 60, w * 0.35, 60);   // tin shed on the roof
    g.fillStyle = '#6b7078'; g.beginPath(); g.moveTo(w * 0.52, -h - 56); g.lineTo(w * 0.93, -h - 56); g.lineTo(w * 0.9, -h - 72); g.lineTo(w * 0.55, -h - 72); g.fill();
  }
  function tower(g, e, w, h, r) {
    const gr = g.createLinearGradient(0, -h, 0, -150);
    gr.addColorStop(0, '#9c8fb0'); gr.addColorStop(0.35, '#6e86a8'); gr.addColorStop(1, '#3f5877');
    g.fillStyle = gr; g.fillRect(8, -h + 40, w - 16, h - 190);
    g.fillStyle = 'rgba(255,190,160,0.22)';
    g.beginPath(); g.moveTo(w * 0.3, -h + 40); g.lineTo(w * 0.5, -h + 40); g.lineTo(w * 0.2, -h + 400); g.lineTo(8, -h + 400); g.fill();
    const cols = Math.round((w - 16) / 38), cw = (w - 16) / cols;
    for (let y = -150 - 56; y > -h + 50; y -= 56) {
      for (let c = 0; c < cols; c++) {
        if (r() < 0.32) { const warm = r() < 0.35; g.fillStyle = warm ? 'rgba(255,220,160,0.7)' : 'rgba(225,240,255,0.65)'; g.fillRect(8 + c * cw + 2, y + 4, cw - 4, 46); e.fillStyle = warm ? 'rgba(255,205,140,0.85)' : 'rgba(200,228,255,0.8)'; e.fillRect(8 + c * cw + 2, y + 4, cw - 4, 46); }
      }
      g.fillStyle = 'rgba(30,36,50,0.55)'; g.fillRect(8, y, w - 16, 5);
    }
    g.fillStyle = 'rgba(30,36,50,0.45)'; for (let c = 0; c <= cols; c++) g.fillRect(8 + c * cw - 1.5, -h + 40, 3, h - 190);
    g.fillStyle = '#cfd4da'; g.fillRect(0, -h, w, 44);
    g.fillStyle = '#157347'; g.fillRect(w * 0.12, -h + 6, w * 0.76, 32);
    text(g, 'বিশ্বরোড টাওয়ার', w / 2, -h + 23, 24, '#ffffff', w * 0.7);
    e.fillStyle = 'rgba(120,255,170,0.6)'; e.fillRect(w * 0.12, -h + 6, w * 0.76, 32);
    g.fillStyle = '#b9bec4'; g.fillRect(0, -150, w, 150);
    g.fillStyle = '#e8d5a8'; g.fillRect(24, -130, w - 48, 110);
    g.fillStyle = 'rgba(40,50,60,0.5)'; for (let x = 24; x < w - 24; x += 46) g.fillRect(x, -130, 3, 110);
    e.fillStyle = 'rgba(255,220,160,0.7)'; e.fillRect(24, -130, w - 48, 110);
    g.fillStyle = '#0f4c81'; g.fillRect(w * 0.2, -148, w * 0.6, 20);
    text(g, 'ব্যাংক', w / 2, -138, 16, '#ffffff', w * 0.5);
  }
  function site(g, e, w, h, r) {
    const fl = 7, fh = (h - 60) / fl;
    g.fillStyle = '#34302c'; g.fillRect(0, -h + 60, w, h - 60);
    g.fillStyle = '#a19b90';
    for (let f = 0; f <= fl; f++) g.fillRect(-4, -60 - f * fh - 12, w + 8, 14);
    for (let x = 0; x <= w; x += w / 4) g.fillRect(x - 10, -h + 60, 20, h - 60);
    g.fillStyle = 'rgba(40,120,70,0.62)'; g.fillRect(w * 0.45, -h + 40, w * 0.55 + 6, h - 100);
    g.fillStyle = 'rgba(20,70,40,0.4)'; for (let y = -h + 50; y < -60; y += 12) g.fillRect(w * 0.45, y, w * 0.55 + 6, 3);
    g.strokeStyle = '#c9a86a'; g.lineWidth = 3; g.beginPath();
    for (let x = 6; x < w * 0.5; x += 34) { g.moveTo(x, -60); g.lineTo(x + 3, -h + 30); }
    for (let y = -90; y > -h + 30; y -= 50) { g.moveTo(0, y); g.lineTo(w * 0.52, y + 4); }
    for (let y = -90; y > -h + 80; y -= 100) { g.moveTo(4, y); g.lineTo(w * 0.5, y - 96); }
    g.stroke();
    g.fillStyle = '#facc15'; g.fillRect(w * 0.08, -h * 0.55, w * 0.84, 46);
    g.fillStyle = '#111'; for (let x = w * 0.08; x < w * 0.92; x += 30) { g.beginPath(); g.moveTo(x, -h * 0.55); g.lineTo(x + 14, -h * 0.55); g.lineTo(x + 4, -h * 0.55 + 10); g.lineTo(x - 10, -h * 0.55 + 10); g.fill(); }
    text(g, 'নির্মাণাধীন ভবন', w / 2, -h * 0.55 + 28, 24, '#b91c1c', w * 0.8);
    for (let i = 0; i < 6; i++) { const x = 20 + r() * (w - 40), y = -80 - r() * (h - 160); g.fillStyle = '#fff6d0'; g.fillRect(x, y, 6, 6); e.fillStyle = 'rgba(255,240,200,1)'; e.fillRect(x - 6, y - 6, 18, 18); }
    for (let x = 0; x < w; x += 60) { g.fillStyle = x % 120 ? '#1d4ed8' : '#b91c1c'; g.fillRect(x, -60, 60, 60); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; for (let x = 0; x < w; x += 8) g.fillRect(x, -60, 2, 60);
    g.fillStyle = '#f4efe4'; g.fillRect(w * 0.3, -50, w * 0.4, 22);
    text(g, 'সাবধান', w * 0.5, -39, 16, '#b91c1c', w * 0.36);
  }
  function mall(g, e, w, h, r) {
    g.fillStyle = '#bdb4b2'; g.fillRect(0, -h, w, h);
    const gf = 170, fl = 5, fh = (h - gf - 50) / fl;
    for (let f = 0; f < fl; f++) {
      const y = -gf - (f + 1) * fh;
      const gr = g.createLinearGradient(0, y, 0, y + fh);
      gr.addColorStop(0, '#4c4a78'); gr.addColorStop(0.55, '#8a6d88'); gr.addColorStop(1, '#c98e7a');
      g.fillStyle = gr; g.fillRect(10, y + 10, w - 20, fh - 16);
      g.fillStyle = 'rgba(40,34,70,0.45)'; for (let x = 10; x < w - 10; x += 38) g.fillRect(x, y + 10, 2.5, fh - 16);
      if (f % 2 === 0) { e.fillStyle = 'rgba(255,200,140,0.12)'; e.fillRect(10, y + 10, w - 20, fh - 16); }
      for (let k = 0; k < 6; k++) { const x = 12 + r() * (w - 60); e.fillStyle = 'rgba(255,226,180,0.6)'; e.fillRect(x, y + 14, 34, fh - 26); }
      g.fillStyle = '#a8f7ff'; g.fillRect(0, y + fh - 6, w, 4);
      e.fillStyle = 'rgba(110,230,255,0.75)'; e.fillRect(0, y + fh - 7, w, 5);
    }
    g.fillStyle = '#d7cfcd'; g.fillRect(0, -h, w, 50);
    g.fillStyle = '#3a2242'; g.fillRect(w * 0.28, -h + 60, w * 0.44, 96);
    g.strokeStyle = '#f0c27e'; g.lineWidth = 4; g.strokeRect(w * 0.28 + 6, -h + 66, w * 0.44 - 12, 84);
    text(g, 'শপিং মল', w / 2, -h + 100, 54, '#ffeccc', w * 0.4);
    text(g, 'SHOPPING MALL', w / 2, -h + 138, 18, '#f3c89f', w * 0.36);
    e.fillStyle = 'rgba(255,190,120,0.9)'; e.fillRect(w * 0.3, -h + 70, w * 0.4, 76);
    g.fillStyle = '#e63946'; g.fillRect(w * 0.06, -gf - fh * 2 + 20, 90, fh * 1.6);
    text(g, 'মেগা', w * 0.06 + 45, -gf - fh * 1.3, 26, '#fff', 80); text(g, 'সেল', w * 0.06 + 45, -gf - fh * 0.95, 26, '#fff', 80); text(g, '৫০%', w * 0.06 + 45, -gf - fh * 0.62, 30, '#ffe066', 80);
    e.fillStyle = 'rgba(255,90,90,0.6)'; e.fillRect(w * 0.06, -gf - fh * 2 + 20, 90, fh * 1.6);
    g.fillStyle = '#ece6e2'; g.fillRect(0, -gf, w, 24);
    g.fillStyle = '#e0bd84'; g.fillRect(30, -gf + 34, w - 60, gf - 40);
    g.fillStyle = 'rgba(40,40,60,0.45)'; for (let x = 30; x < w - 30; x += 52) g.fillRect(x, -gf + 34, 3, gf - 40);
    e.fillStyle = 'rgba(255,214,150,0.55)'; e.fillRect(30, -gf + 34, w - 60, gf - 40);
    for (let i = 0; i < 9; i++) { const x = 60 + r() * (w - 120); g.fillStyle = '#3a2e36'; g.fillRect(x, -70, 14, 58); g.beginPath(); g.arc(x + 7, -78, 8, 0, TAU); g.fill(); }
  }
  const BLD = {
    lowrow: { w: 440, h: 300, roof: 270, ret: '#9c8f7d', paint: lowrow },
    apt1: { w: 360, h: 700, roof: 690, ret: '#b7a88c', paint: (g, e, w, h, r) => apartment(g, e, w, h, r, { wall: '#e4d6b8', trim: '#c7b48e', floors: 5, bal: true }) },
    apt2: { w: 340, h: 640, roof: 620, ret: '#9db09a', paint: (g, e, w, h, r) => apartment(g, e, w, h, r, { wall: '#c3d3bf', trim: '#9fb49a', floors: 5, bal: true, rail: '#7a4a3a', lit: 0.5 }) },
    pink: { w: 300, h: 480, roof: 470, ret: '#b98b7a', paint: pinkOld },
    tower: { w: 380, h: 850, roof: 845, ret: '#5a6b80', paint: tower },
    site: { w: 330, h: 740, roof: 700, ret: '#6d675e', paint: site },
    mall: { w: 760, h: 800, roof: 795, ret: '#9e9593', paint: mall },
    bbapt: { w: 330, h: 560, roof: 560, ret: '#a99c88', paint: (g, e, w, h, r) => apartment(g, e, w, h, r, { wall: '#d8cfc2', trim: '#b3a898', floors: 4, bal: true, bill: 840, lit: 0.5 }) },
  };
  const FENCE = { w: 420, h: 150, solid: 112 };
  function paintFence(g, w, r) {
    const H = FENCE.solid;
    g.fillStyle = '#d6c9b1'; g.fillRect(0, -H, w, H);
    g.fillStyle = 'rgba(80,64,48,0.22)'; g.fillRect(0, -30, w, 30);
    for (let x = 0; x <= w; x += 105) { g.fillStyle = '#c4b59a'; g.fillRect(x - 8, -H - 6, 16, H + 6); }
    for (let i = 0; i < 16; i++) {
      const pw = 26 + r() * 30, ph = 30 + r() * 26, x = r() * (w - pw), y = -H + 12 + r() * (H - ph - 30);
      const [bg, fg] = pickR(r, [['#f4efe4', '#b91c1c'], ['#fde68a', '#1d4ed8'], ['#fca5a5', '#111'], ['#bae6fd', '#b91c1c'], ['#ffffff', '#15803d']]);
      g.fillStyle = bg; g.fillRect(x, y, pw, ph);
      g.fillStyle = fg; g.fillRect(x + 4, y + 5, pw - 8, 4); g.fillRect(x + 4, y + 13, pw * 0.6, 3); g.fillRect(x + 4, y + 19, pw * 0.7, 3);
    }
    text(g, 'এখানে ময়লা ফেলবেন না', w * 0.3, -H + 18, 15, '#9b1c1c', w * 0.5);
    g.fillStyle = '#f4efe4'; g.fillRect(w * 0.66, -H + 40, 70, 34);
    text(g, 'টু-লেট', w * 0.66 + 35, -H + 57, 16, '#111', 64);
    g.fillStyle = 'rgba(60,50,40,0.15)'; for (let i = 0; i < 10; i++) g.fillRect(r() * w, -H, 4 + r() * 10, 30 + r() * 60);
    g.fillStyle = '#b8a98e'; g.fillRect(0, -H - 4, w, 8);
    g.strokeStyle = '#3e4a44'; g.lineWidth = 3; g.beginPath();
    for (let x = 4; x < w; x += 14) { g.moveTo(x, -H - 4); g.lineTo(x, -FENCE.h + 4); }
    g.moveTo(0, -FENCE.h + 12); g.lineTo(w, -FENCE.h + 12); g.moveTo(0, -H - 14); g.lineTo(w, -H - 14);
    g.stroke();
  }
  // Painted panels used by add items: unipole ads, the direction sign, the overbridge boards.
  function paintBoard(g, w, h, kind) {
    g.fillStyle = '#2a262a'; g.fillRect(0, 0, w, h);
    const x = 8, y = 8, bw = w - 16, bh = h - 16;
    if (kind === 0) {
      const gr = g.createLinearGradient(0, y, 0, y + bh); gr.addColorStop(0, '#fff8ea'); gr.addColorStop(1, '#f3d2b0');
      g.fillStyle = gr; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#e63946'; g.fillRect(x, y, 16, bh);
      g.fillStyle = '#2a9d8f'; g.fillRect(x + bw - 110, y + 16, 40, bh - 32); g.fillRect(x + bw - 64, y + 40, 44, bh - 56);
      g.fillStyle = '#ffe9a8'; for (let i = 0; i < 6; i++) { g.fillRect(x + bw - 102, y + 26 + i * 26, 24, 12); if (i < 5) g.fillRect(x + bw - 56, y + 50 + i * 26, 28, 12); }
      text(g, 'স্বপ্নের ঠিকানা', x + (bw - 120) / 2 + 12, y + bh * 0.36, 56, '#b3122b', bw - 150);
      text(g, 'ফ্ল্যাট বুকিং চলছে!', x + (bw - 120) / 2 + 12, y + bh * 0.72, 36, '#1d3a6e', bw - 160);
    } else if (kind === 1) {
      const gr = g.createLinearGradient(x, 0, x + bw, 0); gr.addColorStop(0, '#6d28d9'); gr.addColorStop(1, '#db2777');
      g.fillStyle = gr; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#111827'; g.fillRect(x + bw - 120, y + 18, 70, bh - 36); g.fillStyle = '#93c5fd'; g.fillRect(x + bw - 112, y + 28, 54, bh - 64);
      text(g, 'দ্রুত ইন্টারনেট', x + (bw - 130) / 2, y + bh * 0.36, 50, '#ffffff', bw - 150);
      text(g, '৫জি এখন সবার', x + (bw - 130) / 2, y + bh * 0.72, 36, '#fde047', bw - 150);
    } else {
      g.fillStyle = '#fde047'; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#15803d'; g.fillRect(x, y + bh - 40, bw, 40);
      g.fillStyle = '#ca8a04'; g.fillRect(x + 30, y + 30, 60, bh - 90); g.fillStyle = '#facc15'; g.fillRect(x + 40, y + 50, 40, bh - 120);
      text(g, 'খাঁটি সরিষার তেল', x + bw / 2 + 50, y + bh * 0.4, 52, '#991b1b', bw - 150);
      text(g, 'ঝাঁঝে ভরা স্বাদ', x + bw / 2, y + bh - 20, 28, '#ffffff', bw - 40);
    }
  }
  function paintDirSign(g, w, h) {
    g.fillStyle = '#0d6a3e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f2f2f2'; g.fillRect(w / 3 - 2, 14, 4, h - 28); g.fillRect((2 * w) / 3 - 2, 14, 4, h - 28);
    const arrow = (x, y, dir) => {
      g.beginPath();
      if (dir === 0) { g.moveTo(x, y - 26); g.lineTo(x + 18, y - 4); g.lineTo(x + 6, y - 4); g.lineTo(x + 6, y + 22); g.lineTo(x - 6, y + 22); g.lineTo(x - 6, y - 4); g.lineTo(x - 18, y - 4); }
      else { const d = dir; g.moveTo(x + d * 26, y); g.lineTo(x + d * 4, y - 18); g.lineTo(x + d * 4, y - 6); g.lineTo(x - d * 22, y - 6); g.lineTo(x - d * 22, y + 6); g.lineTo(x + d * 4, y + 6); g.lineTo(x + d * 4, y + 18); }
      g.closePath(); g.fillStyle = '#ffffff'; g.fill();
    };
    const cy = h / 2;
    arrow(34, cy, -1); text(g, 'বাড্ডা', w / 6 + 16, cy - 10, 30, '#fff', w / 3 - 80); text(g, 'Badda', w / 6 + 16, cy + 22, 16, '#cfeedd', w / 3 - 80, '600');
    arrow(w / 2 - 80, cy, 0); text(g, 'বিমানবন্দর', w / 2 + 18, cy - 10, 30, '#fff', w / 3 - 90); text(g, 'Airport', w / 2 + 18, cy + 22, 16, '#cfeedd', w / 3 - 90, '600');
    arrow(w - 34, cy, 1); text(g, 'পূর্বাচল', (5 * w) / 6 - 16, cy - 10, 30, '#fff', w / 3 - 80); text(g, 'Purbachal', (5 * w) / 6 - 16, cy + 22, 16, '#cfeedd', w / 3 - 80, '600');
  }
  function paintFobBoard(g, w, h) {
    g.fillStyle = '#0d6a3e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
    text(g, 'কুড়িল বিশ্বরোড', w / 2, h * 0.4, h * 0.42, '#ffffff', w - 30);
    text(g, 'KURIL BISHWA ROAD', w / 2, h * 0.78, h * 0.18, '#cfeedd', w - 60, '600');
  }
  function paintBanner(g, w, h) {
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b91c1c'; g.fillRect(0, 0, w * 0.3, h);
    text(g, '৯৯৯', w * 0.15, h / 2, h * 0.55, '#fff', w * 0.26);
    text(g, 'জরুরি সেবা', w * 0.65, h * 0.38, h * 0.36, '#b91c1c', w * 0.6);
    text(g, 'পুলিশ • ফায়ার • অ্যাম্বুলেন্স', w * 0.65, h * 0.74, h * 0.2, '#1f2937', w * 0.62, '600');
  }
  function paintRailSign(g, w, h) {
    g.fillStyle = '#facc15'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#111'; g.fillRect(w * 0.2, h * 0.18, w * 0.6, h * 0.26); g.fillRect(w * 0.14, h * 0.44, w * 0.72, 5);
    g.fillStyle = '#facc15'; for (let i = 0; i < 4; i++) g.fillRect(w * 0.24 + i * w * 0.14, h * 0.22, w * 0.08, h * 0.08);
    text(g, 'সামনে', w / 2, h * 0.6, h * 0.14, '#111', w - 20); text(g, 'রেলক্রসিং', w / 2, h * 0.8, h * 0.16, '#b91c1c', w - 16);
  }
  // Far skyline strip for the sky (static; drawn with a little parallax). Covers screen x -200..1200.
  const SKYL = { w: 1400, h: 120, x0: -200, y0: HY - 110, D: 10000 };
  function paintSkyline(g, r) {
    const base = SKYL.h - 6;
    const far = pre('#b98a98'), mid = pre('#8c6282'), win = pre('#ffd98e');
    for (let x = 0; x < SKYL.w;) { const bw = 16 + r() * 40, bh = 10 + r() * 42; g.fillStyle = rgba(far, 0.75); g.fillRect(x, base - bh, bw, bh + 6); x += bw + r() * 6; }
    // a far loop of another flyover and its pillars, far right
    g.strokeStyle = rgba(far, 0.9); g.lineWidth = 3;
    g.beginPath(); g.ellipse(1080, base - 26, 90, 12, 0, 0, TAU); g.stroke();
    g.fillStyle = rgba(far, 0.9); for (const px of [1010, 1060, 1110, 1150]) g.fillRect(px, base - 18, 3, 18);
    // mosque with two minarets, a mobile tower
    const mx = 420;
    g.fillStyle = mid; g.fillRect(mx - 34, base - 20, 68, 26);
    g.beginPath(); g.ellipse(mx, base - 20, 15, 15, 0, Math.PI, TAU); g.fill();
    g.fillRect(mx - 1.5, base - 44, 3, 10);
    for (const x of [mx - 40, mx + 36]) { g.fillRect(x, base - 52, 5, 58); g.beginPath(); g.moveTo(x - 1, base - 52); g.lineTo(x + 2.5, base - 62); g.lineTo(x + 6, base - 52); g.fill(); }
    g.strokeStyle = mid; g.lineWidth = 1.2; g.beginPath();
    const tx = 860; g.moveTo(tx, base - 96); g.lineTo(tx - 7, base); g.moveTo(tx, base - 96); g.lineTo(tx + 7, base);
    for (let y = base - 88; y < base; y += 10) { g.moveTo(tx - 6 * ((y - base + 96) / 96), y); g.lineTo(tx + 6 * ((y + 10 - base + 96) / 96), y + 10); }
    g.stroke();
    for (let x = 0; x < SKYL.w;) {
      const bw = 20 + r() * 46, bh = 8 + r() * 36;
      if (Math.abs(x - mx) < 60) { x += 60; continue; }
      g.fillStyle = mid; g.fillRect(x, base - bh, bw, bh + 6);
      g.fillStyle = rgba(pre('#ffc39a'), 0.35); g.fillRect(x + bw - 2, base - bh, 2, bh);
      if (r() < 0.4) { g.fillStyle = mid; g.fillRect(x + 4, base - bh - 5, 8, 5); }
      g.fillStyle = win; for (let i = 0; i < 3; i++) if (r() < 0.5) g.fillRect(x + 3 + r() * (bw - 7), base - bh + 3 + r() * (bh - 4), 2.4, 2);
      x += bw + 1 + r() * 8;
    }
  }

  // Build the facade atlas, emissive map and the small panels (lazily, on the first walls() call).
  function buildTextures(s) {
    const r = TH.mulberry32(s.seed);
    const keys = Object.keys(BLD), pad = 10;
    let x = 0;
    const slot = {};
    for (const k of keys) { slot[k] = { x0: x }; x += BLD[k].w + pad; }
    const W = Math.ceil(x * D), H = Math.ceil(HU * D), HE = Math.ceil(H / EK);
    const T = fp.canvas(W, H), E = fp.canvas(W, HE);
    if (!T || !E) return null;
    E.ctx.fillStyle = '#000'; E.ctx.fillRect(0, 0, W, HE);
    for (const k of keys) {
      const b = BLD[k], sl = slot[k];
      T.ctx.save(); T.ctx.translate(sl.x0 * D, H); T.ctx.scale(D, D);
      E.ctx.save(); E.ctx.translate(sl.x0 * D, HE); E.ctx.scale(D, HE / HU);
      b.paint(T.ctx, E.ctx, b.w, b.h, r);
      T.ctx.restore(); E.ctx.restore();
      sl.sx0 = sl.x0 * D; sl.sx1 = (sl.x0 + b.w) * D;
    }
    const tex = { T, E, slot, W, H, HE, bytes: (W * H + W * HE) * 4 };
    const mk = (w, h, k, fn) => { const c = fp.canvas(w * k, h * k); if (c) { c.ctx.scale(k, k); fn(c.ctx, w, h); tex.bytes += c.canvas.width * c.canvas.height * 4; } return c; };
    tex.fence = mk(FENCE.w, FENCE.h, D, (g, w, h) => { g.translate(0, h); paintFence(g, w, r); });
    tex.boards = [0, 1, 2].map((i) => mk(600, 260, 0.8, (g, w, h) => paintBoard(g, w, h, i)));
    tex.dir = mk(660, 120, 1.1, paintDirSign);
    tex.fob = mk(340, 84, 1.2, paintFobBoard);
    tex.banner = mk(260, 70, 1, paintBanner);
    tex.rail = mk(120, 150, 1, paintRailSign);
    tex.sky = mk(SKYL.w, SKYL.h, 1, (g) => paintSkyline(g, r));
    return tex;
  }

  // ---------- flyover decks ----------
  function lineDeck(z0, u0, h0, z1, u1, h1, n, ease) {
    const c = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, e = ease ? t * t * (3 - 2 * t) : t;
      c.push(z0 + (z1 - z0) * t, u0 + (u1 - u0) * t, h0 + (h1 - h0) * e);
    }
    return c;
  }
  function arcDeck(zc, uc, R, a0, a1, n, hOf) {
    const c = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; c.push(zc + R * Math.cos(a), uc + R * Math.sin(a), hOf(a)); }
    return c;
  }
  // The loop climbs from the lower deck (where it meets D1, nearest the camera) to the upper level at its far side.
  const ringH = (a) => RING.h + RING.rise * (1 - Math.cos(a)) * 0.5;
  function mkDeck(key, c, o) {
    const n = c.length / 3, L = [], R = [], cum = [0];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tz = c[b * 3] - c[a * 3], tu = c[b * 3 + 1] - c[a * 3 + 1];
      const l = Math.hypot(tz, tu) || 1;
      tz /= l; tu /= l;
      const hw = o.w / 2;
      L.push(c[i * 3] - tu * hw, c[i * 3 + 1] + tz * hw, c[i * 3 + 2]);
      R.push(c[i * 3] + tu * hw, c[i * 3 + 1] - tz * hw, c[i * 3 + 2]);
      if (i) cum.push(cum[i - 1] + Math.hypot(c[i * 3] - c[i * 3 - 3], c[i * 3 + 1] - c[i * 3 - 2]));
    }
    let umin = 1e9, umax = -1e9;
    for (let i = 0; i < n; i++) { umin = Math.min(umin, c[i * 3 + 1]); umax = Math.max(umax, c[i * 3 + 1]); }
    return Object.assign({ key, c, n, L, R, cum, len: cum[n - 1], uMin: umin, uMax: umax }, o);
  }
  const DPAL = { soffit: '#3a3546', face: '#5b5566', par: '#9c93a0', lip: '#fff0d6', drip: '#2c2836', joint: 'rgba(30,26,40,0.55)' };
  const tmp = [];
  function edgeStrip(E, i, j, dA, dB) {
    tmp.length = 0;
    for (let k = i; k <= j; k++) tmp.push(E[k * 3], E[k * 3 + 1], Math.max(0, E[k * 3 + 2] + dA));
    for (let k = j; k >= i; k--) tmp.push(E[k * 3], E[k * 3 + 1], Math.max(0, E[k * 3 + 2] + dB));
    return tmp;
  }
  function edgeLine(E, i, j, dh) {
    tmp.length = 0;
    for (let k = i; k <= j; k++) tmp.push(E[k * 3], E[k * 3 + 1], Math.max(0, E[k * 3 + 2] + dh));
    return tmp;
  }
  function drawDeck(ctx, s, Dk, env) {
    const c = Dk.c, runs = [];
    for (let i = 0; i < Dk.n - 1; i++) {
      const j = i + 1;
      const mz = (c[i * 3] + c[j * 3]) / 2, mu = (c[i * 3 + 1] + c[j * 3 + 1]) / 2;
      if (cam.z - Math.max(c[i * 3], c[j * 3]) < 30) continue;
      const tz = c[j * 3] - c[i * 3], tu = c[j * 3 + 1] - c[i * 3 + 1];
      const side = (cam.z - mz) * -tu + (cam.u - mu) * tz > 0 ? 1 : -1;
      const dist = Math.hypot(cam.z - mz, cam.u - mu);
      const last = runs[runs.length - 1];
      if (last && last.side === side && last.j === i) { last.j = j; if (dist > last.dist) last.dist = dist; } else runs.push({ i, j, side, dist });
    }
    runs.sort((a, b) => b.dist - a.dist);
    for (const r of runs) {
      const E = r.side > 0 ? Dk.L : Dk.R;
      const k = F / Math.max(60, r.dist);
      // soffit (only where the deck is above the eye), riders, lamps, then the girder face and parapet
      tmp.length = 0;
      for (let q = r.i; q <= r.j; q++) tmp.push(Dk.L[q * 3], Dk.L[q * 3 + 1], Math.max(cam.h + 1, Dk.L[q * 3 + 2] - Dk.th));
      for (let q = r.j; q >= r.i; q--) tmp.push(Dk.R[q * 3], Dk.R[q * 3 + 1], Math.max(cam.h + 1, Dk.R[q * 3 + 2] - Dk.th));
      if (fp.path(ctx, tmp)) { ctx.fillStyle = DPAL.soffit; ctx.fill(); }
      if (k > 0.06) drawFly(ctx, s, Dk, r, env);
      if (Dk.lampEvery && k > 0.1) drawDeckLamps(ctx, s, Dk, r, k);
      if (fp.path(ctx, edgeStrip(E, r.i, r.j, -Dk.th, 0))) { ctx.fillStyle = DPAL.face; ctx.fill(); }
      if (k > 0.16) {
        ctx.beginPath();
        const step = 520, c0 = Dk.cum[r.i], c1 = Dk.cum[r.j];
        for (let dd = Math.ceil(c0 / step) * step + 1; dd < c1; dd += step) {
          const P = deckAt(Dk, dd), nz = r.side > 0 ? -P.tu : P.tu, nu = r.side > 0 ? P.tz : -P.tz, hw = Dk.w / 2;
          const a = fp.project(P.z + nz * hw, P.u + nu * hw, P.h), b = fp.project(P.z + nz * hw, P.u + nu * hw, P.h - Dk.th);
          if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        }
        ctx.strokeStyle = DPAL.joint; ctx.lineWidth = clamp(k * 8, 0.6, 3); ctx.stroke();
      }
      if (fp.path(ctx, edgeStrip(E, r.i, r.j, 0, Dk.par))) { ctx.fillStyle = DPAL.par; ctx.fill(); }
      if (fp.polyline(ctx, edgeLine(E, r.i, r.j, Dk.par))) { ctx.strokeStyle = DPAL.lip; ctx.lineWidth = clamp(k * 7, 0.6, 3); ctx.stroke(); }
      if (Dk.drip && k > 0.14 && fp.polyline(ctx, edgeLine(E, r.i, r.j, -Dk.th + 4))) { ctx.strokeStyle = DPAL.drip; ctx.lineWidth = clamp(k * 9, 0.6, 3); ctx.stroke(); }
    }
  }
  // Point and heading along a deck centreline at distance d.
  const PT = { z: 0, u: 0, h: 0, tz: 1, tu: 0, i: 0 };
  function deckAt(Dk, d) {
    const cum = Dk.cum, c = Dk.c;
    let i = 1;
    while (i < Dk.n - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, f = clamp((d - cum[i - 1]) / seg, 0, 1);
    PT.z = c[i * 3 - 3] + (c[i * 3] - c[i * 3 - 3]) * f;
    PT.u = c[i * 3 - 2] + (c[i * 3 + 1] - c[i * 3 - 2]) * f;
    PT.h = c[i * 3 - 1] + (c[i * 3 + 2] - c[i * 3 - 1]) * f;
    PT.tz = (c[i * 3] - c[i * 3 - 3]) / seg; PT.tu = (c[i * 3 + 1] - c[i * 3 - 2]) / seg; PT.i = i - 1;
    return PT;
  }
  // Buses, trucks and cars riding the decks: only their upper bodies clear the parapet from down here.
  const FLY_KIND = { bus: { L: 640, H: 205, W: 150 }, truck: { L: 460, H: 230, W: 150 }, car: { L: 270, H: 95, W: 110 } };
  function drawFly(ctx, s, Dk, r, env) {
    const gk = env.lit.glow || 0;
    for (const v of s.fly) {
      if (v.deck !== Dk.key) continue;
      const P = deckAt(Dk, v.d);
      if (P.i < r.i || P.i >= r.j) continue;
      const off = v.lane * Dk.w * 0.22;
      const p = fp.project(P.z - P.tu * off, P.u + P.tz * off, P.h);
      if (!p || p.d > 7000) continue;
      const K = FLY_KIND[v.kind], k = p.s;
      const w = (K.L * Math.abs(P.tu) + K.W * Math.abs(P.tz)) * k, hh = K.H * k;
      if (w < 0.8) continue;
      ctx.fillStyle = v.col; ctx.fillRect(p.x - w / 2, p.y - hh, w, hh);
      if (v.kind === 'bus') { ctx.fillStyle = '#ffe3a1'; ctx.fillRect(p.x - w / 2 + 12 * k, p.y - hh * 0.86, w - 24 * k, hh * 0.3); }
      else if (v.kind === 'car') { ctx.fillStyle = '#6f7690'; ctx.fillRect(p.x - w * 0.3, p.y - hh, w * 0.55, hh * 0.45); }
      if (gk > 0) {
        const dirU = Math.sign(P.tu * v.dir) || 1, toward = P.tz * v.dir > 0.5;
        if (toward) fp.glow(p.x, p.y - hh * 0.3, clamp(50 * k, 3, 20), '#fff1c8', p.d, 0.8);
        else fp.glow(p.x - (dirU * w) / 2, p.y - hh * 0.3, clamp(34 * k, 2, 14), '#ff4a3a', p.d, 0.8);
      }
    }
  }
  // Flyover lamps down the middle of the deck; each flickers on at its own moment as dusk falls.
  function lampLevel(s, on) {
    const t = s.t - on;
    if (t < 0) return 0;
    if (t < 0.9) return Math.random() < 0.55 ? 0.15 : 1;
    return 1;
  }
  function drawDeckLamps(ctx, s, Dk, r, k) {
    const c0 = Dk.cum[r.i], c1 = Dk.cum[r.j], step = Dk.lampEvery;
    const heads = [];
    ctx.beginPath();
    for (let dd = Math.ceil((c0 + 1) / step) * step - step * 0.5; dd < c1; dd += step) {
      if (dd < c0) continue;
      const P = deckAt(Dk, dd);
      const a = fp.project(P.z, P.u, P.h), b = fp.project(P.z, P.u, P.h + 150);
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      heads.push(b, dd);
    }
    if (!heads.length) return;
    ctx.strokeStyle = '#4e4652'; ctx.lineWidth = clamp(k * 14, 0.8, 5); ctx.stroke();
    for (let i = 0; i < heads.length; i += 2) {
      const b = heads[i], lv = lampLevel(s, ((heads[i + 1] * 0.0137 + Dk.seed) % 9) + 1.2);
      const w = clamp(34 * b.s, 1.5, 16);
      ctx.fillStyle = lv > 0.5 ? '#fff3cf' : '#5d5560'; ctx.fillRect(b.x - w, b.y - w * 0.25, w * 2, w * 0.5);
      if (lv > 0) fp.glow(b.x, b.y + w * 0.3, clamp(80 * b.s, 4, 28), '#ffd89a', b.d, 0.7 * lv);
    }
  }
  // Green direction board on the lower deck's fascia, over the rickshaw lanes.
  function drawDirSign(ctx, s, d) {
    const z = Z_D1 + 202, k = F / d;
    ctx.save();
    if (planeAt(ctx, z)) {
      const w = 900, h = 164, x0 = -450, y0 = -(RING.h - RING.th) + 6;
      ctx.fillStyle = '#3a3440'; ctx.fillRect(x0 + 60, y0 - 14, 16, 20); ctx.fillRect(x0 + w - 76, y0 - 14, 16, 20);
      if (s.tex && s.tex.dir && k > 0.06) ctx.drawImage(s.tex.dir.canvas, x0, y0, w, h); else { ctx.fillStyle = '#0d6a3e'; ctx.fillRect(x0, y0, w, h); }
    }
    ctx.restore();
  }
  function drawPillar(ctx, s, P, d) {
    const b = fp.project(P.z, P.u, 0), t = fp.project(P.z, P.u, P.h);
    if (!b || !t) return;
    const k = b.s, r = P.r * k;
    if (b.x + r < -40 || b.x - r > 1040) return;
    let yb = b.y;
    if (P.side) yb = Math.min(yb, occY(s, b.x, P.side));
    if (yb <= t.y + 1) return;
    ctx.fillStyle = '#a1968e'; ctx.fillRect(b.x - r, t.y, 2 * r, yb - t.y);
    if (k > 0.2) {
      ctx.fillStyle = '#7b716e'; ctx.fillRect(b.x - r, t.y, r * 0.75, yb - t.y);
      ctx.fillStyle = '#e9c7a6'; ctx.fillRect(b.x + r * 0.62, t.y, r * 0.38, yb - t.y);
      const cw = r * 1.7, ch = Math.min(yb - t.y, 70 * k);
      ctx.fillStyle = '#8b817c';
      ctx.beginPath(); ctx.moveTo(b.x - cw, t.y); ctx.lineTo(b.x + cw, t.y); ctx.lineTo(b.x + r, t.y + ch); ctx.lineTo(b.x - r, t.y + ch); ctx.closePath(); ctx.fill();
      if (P.poster && k > 0.25 && yb >= b.y - 1) {
        const ph = 60 * k, py = b.y - 150 * k;
        ctx.fillStyle = '#f4efe4'; ctx.fillRect(b.x - r * 0.7, py, r * 1.2, ph);
        ctx.fillStyle = '#c1121f'; ctx.fillRect(b.x - r * 0.6, py + ph * 0.12, r * 1.0, ph * 0.28);
        ctx.fillStyle = '#ffd166'; ctx.fillRect(b.x - r * 0.2, py + ph * 1.1, r * 0.9, ph * 0.8);
      }
    }
  }

  // ---------- other structures ----------
  function drawFOB(ctx, s, d, env) {
    const zf = FOB.z - FOB.hw, zn = FOB.z + FOB.hw, { u0, u1, hB, hW, hT } = FOB;
    const k = F / d, gk = env.lit.glow || 0;
    ctx.lineCap = 'butt';
    // columns and the walkway underside
    for (const u of [-752, -250, 442]) {
      const b = fp.project(FOB.z, u, u === -752 ? 8 : u > 0 ? 8 : 12), t = fp.project(FOB.z, u, hB);
      if (b && t) { const w = 12 * b.s; ctx.fillStyle = '#34494d'; ctx.fillRect(b.x - w, t.y, w * 2, b.y - t.y); ctx.fillStyle = '#e0a57a'; ctx.fillRect(b.x + w * 0.4, t.y, w * 0.5, b.y - t.y); }
    }
    if (fp.quad(ctx, zf, zn, u0, u1, hB)) { ctx.fillStyle = '#3b4c50'; ctx.fill(); }
    // far truss
    ctx.save();
    if (planeAt(ctx, zf)) {
      ctx.fillStyle = 'rgba(52,78,82,0.35)'; ctx.fillRect(u0, -hT, u1 - u0, hT - hW);
      ctx.fillStyle = '#2f4145'; ctx.fillRect(u0, -hT, u1 - u0, 6);
    }
    ctx.restore();
    // people crossing
    ctx.save();
    if (planeAt(ctx, FOB.z)) {
      for (const w of s.walkers) {
        const bob = Math.abs(Math.sin(w.ph * 6)) * 3, sw = Math.sin(w.ph * 6) * 8;
        ctx.fillStyle = '#2d2a35'; ctx.fillRect(w.u - 7 + sw * 0.3, -hW - 44, 6, 44); ctx.fillRect(w.u + 1 - sw * 0.3, -hW - 44, 6, 44);
        ctx.fillStyle = w.shirt; ctx.fillRect(w.u - 10, -hW - 86 - bob, 20, 44);
        if (w.sari) { ctx.fillStyle = w.sari; ctx.fillRect(w.u - 11, -hW - 50, 22, 40); }
        ctx.fillStyle = '#6e4630'; ctx.fillRect(w.u - 8, -hW - 104 - bob, 16, 18);
        if (k > 0.4) { ctx.fillStyle = '#1b1414'; ctx.fillRect(w.u - 8, -hW - 106 - bob, 16, 6); }
      }
    }
    ctx.restore();
    // near side: fascia, truss, roof edge, name board, banner, lamps
    ctx.save();
    if (planeAt(ctx, zn)) {
      ctx.fillStyle = '#4d6669'; ctx.fillRect(u0 - 6, -hW, u1 - u0 + 12, hW - hB);
      ctx.fillStyle = '#e8ad80'; ctx.fillRect(u0 - 6, -hW, u1 - u0 + 12, 4);
      ctx.fillStyle = '#243538'; ctx.fillRect(u0 - 6, -hB - 4, u1 - u0 + 12, 4);
      ctx.strokeStyle = '#3f5c60'; ctx.lineWidth = 6; ctx.beginPath();
      for (let u = u0, i = 0; u < u1; u += 126, i++) {
        ctx.moveTo(u, -hW); ctx.lineTo(u, -hT);
        ctx.moveTo(u, i % 2 ? -hT : -hW); ctx.lineTo(Math.min(u1, u + 126), i % 2 ? -hW : -hT);
      }
      ctx.moveTo(u1, -hW); ctx.lineTo(u1, -hT);
      ctx.stroke();
      ctx.fillStyle = '#34494d'; ctx.fillRect(u0 - 4, -hT - 6, u1 - u0 + 8, 10);
      ctx.fillStyle = '#f0b284'; ctx.fillRect(u0 - 4, -hT - 6, u1 - u0 + 8, 2.5);
      const tx = s.tex;
      if (tx && tx.fob) ctx.drawImage(tx.fob.canvas, -170, -hT + 2, 340, hT - hW - 4);
      if (tx && tx.banner && k > 0.2) ctx.drawImage(tx.banner.canvas, 200, -hT + 12, 200, hT - hW - 24);
      for (const u of [-470, 60]) {
        const lv = lampLevel(s, u < 0 ? 2.2 : 3.4);
        ctx.fillStyle = '#34494d'; ctx.fillRect(u - 3, -hT - 40, 6, 36);
        ctx.fillStyle = lv > 0.5 ? '#fff4d0' : '#5a5f64'; ctx.fillRect(u - 16, -hT - 46, 32, 9);
        if (lv > 0 && gk > 0) { const p = fp.project(zn, u, hT + 38); if (p) fp.glow(p.x, p.y, clamp(150 * p.s, 10, 70), '#ffe2a8', p.d, 0.9 * lv); }
      }
    }
    ctx.restore();
  }
  // Stair flights down to the footpaths, running away from the camera along the sidewalk.
  function drawStair(ctx, uIn, uOut, d) {
    const zt = FOB.z - FOB.hw, zb = zt - 520, { hW } = FOB, k = F / d;
    if (fp.path(ctx, [zt, uIn, hW, zb, uIn, 8, zb, uOut, 8, zt, uOut, hW])) { ctx.fillStyle = '#56666a'; ctx.fill(); }
    if (fp.path(ctx, [zt, uIn, hW - 34, zb, uIn, 0, zb, uIn, 22, zt, uIn, hW + 8])) { ctx.fillStyle = '#3a5559'; ctx.fill(); }
    ctx.beginPath();
    const n = k > 0.3 ? 5 : 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = zt + (zb - zt) * t, h = hW + (8 - hW) * t;
      if (k > 0.3) { const a = fp.project(z, uIn, h + 100), b = fp.project(z, uIn, h + 8); if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
      const c = fp.project(z, uIn, h + 4), e = fp.project(z, uOut, h + 4);
      if (c && e) { ctx.moveTo(c.x, c.y); ctx.lineTo(e.x, e.y); }
    }
    ctx.strokeStyle = '#2c4245'; ctx.lineWidth = clamp(k * 5, 0.6, 3); ctx.stroke();
    if (fp.polyline(ctx, [zt, uIn, hW + 100, zb, uIn, 108])) { ctx.strokeStyle = '#8fa3a3'; ctx.lineWidth = clamp(k * 7, 0.8, 4); ctx.stroke(); }
  }
  // Unipole billboard facing the road, lit by flood lamps from below.
  function drawUnipole(ctx, s, B, d, env) {
    const k = F / d, gk = env.lit.glow || 0;
    const base = fp.project(B.z, B.u, 0), top = fp.project(B.z, B.u, B.h0);
    if (!base || !top) return;
    const yb = B.side ? Math.min(base.y, occY(s, base.x, B.side)) : base.y;
    const w = 22 * k;
    if (yb > top.y) { ctx.fillStyle = '#3b3440'; ctx.fillRect(base.x - w, top.y, 2 * w, yb - top.y); ctx.fillStyle = '#d9a37e'; ctx.fillRect(base.x + w * 0.4, top.y, w * 0.5, yb - top.y); }
    ctx.save();
    if (planeAt(ctx, B.z)) {
      const bw = B.w, bh = B.hh, x0 = B.u - bw / 2, y0 = -B.h0 - bh;
      ctx.fillStyle = '#2c2630'; ctx.fillRect(x0 - 10, y0 - 10, bw + 20, bh + 20);
      const tx = s.tex && s.tex.boards[B.ad];
      if (tx && k > 0.05) ctx.drawImage(tx.canvas, x0, y0, bw, bh); else { ctx.fillStyle = ['#f6e3c8', '#8b3fc4', '#f3d34a'][B.ad]; ctx.fillRect(x0, y0, bw, bh); }
      ctx.fillStyle = '#2c2630'; ctx.fillRect(x0 - 14, -B.h0 + 4, bw + 28, 10);
      if (k > 0.14) for (let i = 0; i < 3; i++) { const lx = x0 + bw * (0.2 + i * 0.3); ctx.fillRect(lx - 10, -B.h0 - 12, 20, 22); }
    }
    ctx.restore();
    if (gk > 0) {
      for (let i = 0; i < 3; i++) {
        const lv = lampLevel(s, B.on + i * 0.4);
        if (!lv) continue;
        const p = fp.project(B.z, B.u - B.w / 2 + B.w * (0.2 + i * 0.3), B.h0 + 30);
        if (p && (!B.side || p.y < occY(s, p.x, B.side))) fp.glow(p.x, p.y, clamp(B.w * 0.4 * p.s, 8, 90), '#fff0c8', p.d, 0.7 * lv);
      }
    }
  }
  function drawTree(ctx, s, T, d) {
    const b = fp.project(T.z, T.u, 0);
    if (!b) return;
    const k = b.s;
    const cut = T.side ? Math.min(b.y, occY(s, b.x, T.side)) : b.y;
    const yt = b.y - T.h * 0.55 * k;
    if (cut > yt) { ctx.fillStyle = '#4a3a30'; ctx.fillRect(b.x - 12 * k, yt, 24 * k, cut - yt); }
    ctx.translate(b.x, b.y); ctx.scale(k, k);
    const bl = T.blobs, n = k > 0.16 ? bl.length : 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const q = bl[i]; ctx.moveTo(q[0] + q[2], -T.h + q[1]); ctx.ellipse(q[0], -T.h + q[1], q[2], q[2] * 0.72, 0, 0, TAU); }
    ctx.fillStyle = T.col; ctx.fill();
    if (k > 0.18) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const q = bl[i]; ctx.moveTo(q[0] + q[2] * 0.7, -T.h + q[1] + q[2] * 0.32); ctx.ellipse(q[0], -T.h + q[1] + q[2] * 0.32, q[2] * 0.7, q[2] * 0.38, 0, 0, TAU); }
      ctx.fillStyle = T.dark; ctx.fill();
      if (T.flowers && k > 0.25) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const q = bl[i]; ctx.moveTo(q[0] + q[2] * 0.25, -T.h + q[1] - q[2] * 0.3); ctx.ellipse(q[0] - q[2] * 0.2, -T.h + q[1] - q[2] * 0.3, q[2] * 0.45, q[2] * 0.3, 0, 0, TAU); }
        ctx.fillStyle = T.flowers; ctx.fill();
      }
    }
  }
  // Wooden tea stall against the right facade (the life spot seats its customers in front of it).
  function drawTeaStall(ctx, s, z, d, env) {
    const k = F / d, gk = env.lit.glow || 0, u0 = 396, u1 = 456, z0 = z - 55, z1 = z + 55;
    // plank box: its end facing us, then the counter side facing the road
    if (fp.path(ctx, [z1, u0, 8, z1, u1, 8, z1, u1, 104, z1, u0, 104])) { ctx.fillStyle = '#5c3a22'; ctx.fill(); }
    if (fp.path(ctx, [z1, u0, 8, z0, u0, 8, z0, u0, 100, z1, u0, 100])) { ctx.fillStyle = '#7a4a2a'; ctx.fill(); }
    if (k > 0.6) {
      ctx.beginPath();
      for (let hh = 28; hh < 100; hh += 18) { const a = fp.project(z1, u0, hh), b = fp.project(z0, u0, hh); if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
      ctx.strokeStyle = 'rgba(40,24,14,0.6)'; ctx.lineWidth = clamp(k * 2, 0.5, 2); ctx.stroke();
    }
    if (fp.path(ctx, [z1 + 6, u0 - 10, 100, z0 - 6, u0 - 10, 100, z0 - 6, u0 + 20, 108, z1 + 6, u0 + 20, 108])) { ctx.fillStyle = '#b07a48'; ctx.fill(); }
    // bamboo posts and the sloping tin awning
    ctx.beginPath();
    for (const zz of [z0 - 4, z1 + 4]) { const a = fp.project(zz, u0 - 8, 100), b = fp.project(zz, u0 - 8, 196); if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
    ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = clamp(k * 5, 0.6, 5); ctx.stroke();
    if (fp.path(ctx, [z1 + 22, u0 - 70, 186, z0 - 22, u0 - 70, 186, z0 - 22, u1, 214, z1 + 22, u1, 214])) { ctx.fillStyle = '#2d6aa3'; ctx.fill(); }
    if (fp.path(ctx, [z1 + 22, u0 - 70, 186, z1 + 22, u1, 214, z1 + 22, u1, 224, z1 + 22, u0 - 70, 196])) { ctx.fillStyle = '#1f4f7c'; ctx.fill(); }
    ctx.save();
    const p = bbAt(ctx, z + 20, u0 - 4, 108, 9);
    if (p && k > 0.12) {
      // jars of biscuits, a bunch of bananas, the kettle on its stove and the tea-maker himself
      ctx.fillStyle = 'rgba(210,230,235,0.8)'; ctx.fillRect(-26, -22, 14, 20); ctx.fillRect(-8, -22, 14, 20);
      ctx.fillStyle = '#d9822b'; ctx.fillRect(-24, -16, 10, 12); ctx.fillStyle = '#c14f3a'; ctx.fillRect(-6, -16, 10, 12);
      ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.ellipse(-40, -58, 6, 15, 0.3, 0, TAU); ctx.ellipse(-30, -56, 6, 15, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9e3d6'; ctx.fillRect(14, -58, 24, 40);
      ctx.fillStyle = '#8d5a3b'; ctx.beginPath(); ctx.arc(26, -68, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b1414'; ctx.fillRect(16, -80, 20, 7);
      ctx.fillStyle = '#3a3a3f'; ctx.beginPath(); ctx.ellipse(48, -10, 13, 10, 0, 0, TAU); ctx.fill(); ctx.fillRect(58, -16, 10, 4);
      if (k > 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
        const ph = s.t * 1.4;
        ctx.moveTo(46, -22); ctx.quadraticCurveTo(40 + Math.sin(ph) * 4, -36, 47 + Math.sin(ph + 1) * 4, -52);
        ctx.stroke();
      }
      ctx.fillStyle = '#c1121f'; ctx.fillRect(-50, -104, 100, 26);
      text(ctx, 'চা-বিস্কুট', 0, -91, 17, '#fff', 92);
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(0, -66, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (gk > 0) { const q = fp.project(z + 20, u0 - 4, 175); if (q) fp.glow(q.x, q.y, clamp(140 * q.s, 6, 70), '#ffd890', q.d, 1); }
  }
  function drawBusShelter(ctx, s, z, d) {
    const k = F / d, u0 = -792, u1 = -676, z0 = z - 110, z1 = z + 110;
    if (fp.path(ctx, [z0, u0 + 4, 8, z1, u0 + 4, 8, z1, u0 + 4, 200, z0, u0 + 4, 200])) { ctx.fillStyle = 'rgba(160,190,200,0.35)'; ctx.fill(); }
    ctx.beginPath();
    for (const zz of [z0 + 8, z1 - 8]) for (const u of [u0 + 8, u1 - 6]) { const a = fp.project(zz, u, 8), b = fp.project(zz, u, 212); if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
    ctx.strokeStyle = '#48525c'; ctx.lineWidth = clamp(k * 8, 0.8, 5); ctx.stroke();
    if (fp.path(ctx, [z0 - 10, u0, 212, z1 + 10, u0, 212, z1 + 10, u1 + 14, 222, z0 - 10, u1 + 14, 222])) { ctx.fillStyle = '#56636c'; ctx.fill(); }
    if (fp.path(ctx, [z1 + 10, u0, 222, z1 + 10, u1 + 14, 222, z1 + 10, u1 + 14, 232, z1 + 10, u0, 232])) { ctx.fillStyle = '#f5c79c'; ctx.fill(); }
    ctx.save();
    if (planeAt(ctx, z1 + 12) && k > 0.12) {
      ctx.fillStyle = '#1d4f91'; ctx.fillRect(u0 + 10, -262, 100, 30);
      text(ctx, 'বাস স্টপ', u0 + 60, -247, 18, '#fff', 92);
    }
    ctx.restore();
  }
  function drawRailSign(ctx, s, z, u, d) {
    const k = F / d;
    const a = fp.project(z, u, 8), b = fp.project(z, u, 250);
    if (!a || !b) return;
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = clamp(k * 7, 0.7, 4);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.save();
    if (planeAt(ctx, z + 2)) { if (s.tex && s.tex.rail && k > 0.08) ctx.drawImage(s.tex.rail.canvas, u - 45, -330, 90, 112); else { ctx.fillStyle = '#facc15'; ctx.fillRect(u - 45, -330, 90, 112); } }
    ctx.restore();
  }
  // Concrete utility poles along the right footpath with the famous Dhaka tangle of wires.
  function drawPoleSpan(ctx, s, i, d) {
    const P = s.poles, z = P[i], k = F / d, u = 452, H = 690;
    const a = fp.project(z, u, 8), b = fp.project(z, u, H);
    if (!a || !b) return;
    const w = clamp(9 * k, 0.6, 20);
    ctx.fillStyle = '#8a8580'; ctx.fillRect(a.x - w, b.y, 2 * w, a.y - b.y);
    if (k > 0.12) {
      ctx.fillStyle = '#5f5a56'; ctx.fillRect(a.x - w, b.y, w * 0.7, a.y - b.y);
      const c = fp.project(z, u, H - 60), e = fp.project(z, u - 70, H - 60);
      if (c && e) { ctx.fillStyle = '#4b4845'; ctx.fillRect(e.x, c.y - 4 * k, c.x - e.x, 8 * k); }
      if (i % 3 === 1 && k > 0.2) { const t = fp.project(z, u - 20, H - 150); if (t) { ctx.fillStyle = '#6b7178'; ctx.fillRect(t.x - 30 * k, t.y - 50 * k, 44 * k, 70 * k); ctx.fillStyle = '#9aa1a8'; ctx.fillRect(t.x - 30 * k, t.y - 50 * k, 44 * k, 8 * k); } }
      if (k > 0.3) { ctx.fillStyle = '#f4efe4'; ctx.fillRect(a.x - w * 1.2, a.y - 170 * k, w * 2.4, 40 * k); ctx.fillStyle = '#c1121f'; ctx.fillRect(a.x - w, a.y - 164 * k, w * 2, 8 * k); }
    }
    if (i + 1 >= P.length || k < 0.1) return;
    const z2 = P[i + 1], wires = k > 0.3 ? 4 : 2;
    ctx.beginPath();
    for (let wi = 0; wi < wires; wi++) {
      const uu = u - 8 - (wi % 3) * 22, h0 = H - 50 - wi * 16, sag = 40 + wi * 14 + (i % 2) * 20;
      sagWire(ctx, z, z2, uu, h0, sag);
    }
    ctx.strokeStyle = '#27242a'; ctx.lineWidth = clamp(k * 3, 0.5, 2.2); ctx.stroke();
  }
  // A sagging cable between (z0,u,h) and (z1,u,h) as one projected quadratic curve (cut at the near plane).
  function sagWire(ctx, z0, z1, u, h, sag) {
    const za = Math.min(z0, z1), span = Math.abs(z1 - z0), zb = Math.min(Math.max(z0, z1), cam.z - 30);
    if (!(span > 0) || zb <= za + 10) return;
    const hAt = (z) => { const t = (z - za) / span; return h - sag * 4 * t * (1 - t); };
    const zm = (za + zb) / 2;
    const a = fp.project(za, u, h), b = fp.project(zb, u, hAt(zb)), m = fp.project(zm, u, hAt(zm));
    if (!a || !b || !m) return;
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(2 * m.x - (a.x + b.x) / 2, 2 * m.y - (a.y + b.y) / 2, b.x, b.y);
  }
  // A bundle of cables slung across the road between the footpath poles.
  function drawCrossWires(ctx, z, d) {
    const k = F / d;
    ctx.beginPath();
    for (let wi = 0; wi < 4; wi++) {
      let pen = false;
      for (let j = 0; j <= 10; j++) {
        const t = j / 10, u = 440 + (-780 - 440) * t, h = 610 - wi * 18 - (150 + wi * 30) * 4 * t * (1 - t);
        const q = fp.project(z + wi * 6, u, h);
        if (!q) { pen = false; continue; }
        if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; }
      }
    }
    ctx.strokeStyle = '#26232a'; ctx.lineWidth = clamp(k * 3, 0.5, 2); ctx.stroke();
  }
  // What shows through the cross-street gap on the right: its asphalt, the far building's end wall, a pier.
  function drawRightGap(ctx, s, d) {
    clipBehind(ctx, s, GAP_R[0], 1, xAt(GAP_R[1], 2600));
    if (fp.quad(ctx, GAP_R[0], GAP_R[1], 460, 2600)) { ctx.fillStyle = '#4a474e'; ctx.fill(); }
    if (fp.quad(ctx, GAP_R[1] - 60, GAP_R[1], 460, 2600, 8)) { ctx.fillStyle = '#b3a38f'; ctx.fill(); }
    const tx = s.tex;
    const p0 = fp.project(GAP_R[0], 460, 8), p1 = fp.project(GAP_R[0], 1500, 8 + HU);
    if (p0 && p1) {
      if (tx) { const sl = tx.slot.apt2; ctx.drawImage(tx.T.canvas, sl.sx0, 0, sl.sx1 - sl.sx0, tx.H, p0.x, p1.y, p1.x - p0.x, p0.y - p1.y); } else { ctx.fillStyle = '#b8a890'; ctx.fillRect(p0.x, p1.y, p1.x - p0.x, p0.y - p1.y); }
    }
  }

  // ---------- sky ----------
  function skyGrads(ctx, s) {
    if (s.gCtx === ctx && s.G) return s.G;
    s.gCtx = ctx;
    const G = {};
    G.sky = ctx.createLinearGradient(0, -60, 0, HY);
    [[0, '#1f1d4a'], [0.3, '#4b3a78'], [0.56, '#9c5584'], [0.76, '#dc7b6c'], [0.9, '#f3a56f']].forEach(([o, c]) => G.sky.addColorStop(o, pre(c)));
    G.sky.addColorStop(1, FOG);
    G.sun = ctx.createRadialGradient(SUN.x, SUN.y, 4, SUN.x, SUN.y, 420);
    G.sun.addColorStop(0, rgba(pre('#fff0c8'), 0.95)); G.sun.addColorStop(0.12, rgba(pre('#ffd09a'), 0.6));
    G.sun.addColorStop(0.45, rgba(pre('#f59a78'), 0.22)); G.sun.addColorStop(1, rgba(pre('#e88070'), 0));
    G.ground = ctx.createLinearGradient(0, HY, 0, 600);
    G.ground.addColorStop(0, FOG); G.ground.addColorStop(0.12, pre('#c9a88f')); G.ground.addColorStop(1, '#8d7c6c');
    G.disc = ctx.createRadialGradient(SUN.x - 4, SUN.y - 4, 1, SUN.x, SUN.y, SUN.r);
    G.disc.addColorStop(0, '#ffffff'); G.disc.addColorStop(0.7, pre('#fff0c4')); G.disc.addColorStop(1, pre('#ffc27e'));
    return (s.G = G);
  }
  function drawTrain(ctx, s) {
    const tr = s.train;
    if (!tr.on) return;
    const k = KT, x0 = CX - cam.u * k;
    const yR = HY + (cam.h - 175) * k, yT = HY + (cam.h - 430) * k, hb = yR - yT;
    const COACH = 1300, GAP = 70, LOCO = 1250, P = (COACH + GAP) * k;
    const back = tr.u - tr.dir * tr.len;           // trailing end in u
    const ua = Math.min(tr.u, back), ub = Math.max(tr.u, back);
    const xa = x0 + ua * k, xb = x0 + ub * k;
    if (xb < -150 || xa > 1150) return;
    const locoA = tr.dir > 0 ? tr.u - LOCO : tr.u, rakeA = tr.dir > 0 ? ua : tr.u + LOCO + GAP;
    const rx0 = x0 + rakeA * k, rx1 = rx0 + tr.n * P - GAP * k;
    const dl = (off, y, w, col, dash) => { ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(rx0 + off, y); ctx.lineTo(rx1, y); ctx.stroke(); };
    ctx.lineCap = 'butt';
    dl(0, yT + hb * 0.5, hb, pre('#3e7a58'), [COACH * k, GAP * k]);
    dl(0, yT + hb * 0.1, hb * 0.2, pre('#7a8c80'), [COACH * k, GAP * k]);
    dl(0, yT + hb * 0.62, hb * 0.07, pre('#f2c230'), [COACH * k, GAP * k]);
    const wn = [], ww = 60 * k, wg = 45 * k;
    for (let i = 0; i < 12; i++) wn.push(ww, wg);
    wn[wn.length - 1] = wg + (COACH - 12 * 105) * k + GAP * k;
    dl(40 * k, yT + hb * 0.36, hb * 0.2, pre('#ffe39c'), wn);
    dl(0, yR - hb * 0.08, hb * 0.1, '#26262b', [COACH * k, GAP * k]);
    ctx.setLineDash([]);
    const lx = x0 + locoA * k, lw = LOCO * k;
    ctx.fillStyle = pre('#2f6a4a'); ctx.fillRect(lx, yT + hb * 0.12, lw, hb * 0.86);
    ctx.fillStyle = pre('#c0392b'); ctx.fillRect(lx, yT + hb * 0.66, lw, hb * 0.1);
    ctx.fillStyle = pre('#f4c542'); ctx.fillRect(tr.dir > 0 ? lx + lw - 90 * k : lx, yT + hb * 0.2, 90 * k, hb * 0.78);
    const nose = tr.dir > 0 ? lx + lw : lx;
    // headlight beam into the haze
    ctx.fillStyle = rgba(pre('#fff4c8'), 0.28);
    ctx.beginPath(); ctx.moveTo(nose, yT + hb * 0.45); ctx.lineTo(nose + tr.dir * 160, yT - hb * 0.3); ctx.lineTo(nose + tr.dir * 160, yR + hb * 0.2); ctx.closePath(); ctx.fill();
    const gy = yT + hb * 0.4;
    skyGlow(s, nose, yT + hb * 0.45, 26, '#fff2c0', 1);
    for (let i = 0; i < tr.n; i += 2) { const x = rx0 + (i + 0.5) * P; if (x > -50 && x < 1050) skyGlow(s, x, gy, 34, '#ffcf80', 0.35); }
  }

  // ---------- module ----------
  TH.fpRoads.push({
    id: 'kuril',
    light: { tint: TINT, tintA: 1, glow: 0.6, fog: FOG, fogNear: 2000, fogFar: 8000, fogMax: FOG_MAX, lamps: true, headlights: false },
    street: {
      asphalt: '#47454e', asphaltOpp: '#4a474f', lane: '#ebe4d6', stop: '#f4f0e6', sidewalk: '#bcaa95', sidewalkL: '#b3a08b',
      curb: ['#d8d0c0', '#57534e'], median: '#8a8472', medianTop: '#6f8752', fence: '#d4b43c', lampStyle: 'pole', lampEvery: 520,
      lampSkip: [[-1930, -440], [-2720, -2280], [FOB.z - 110, FOB.z + 110]],
    },
    traffic: { bus: 4, cng: 3, car: 3, bike: 2, truck: 1 }, trafficDensity: 1.1,
    life: { walker: 4, woman: 3, kid: 1, hawker: 2, dog: 1 }, lifeDensity: 1,
    lifeSpots: [{ z: 1250, u: 400, kind: 'teastall' }, { z: 250, u: -726, kind: 'busstop' }, { z: 420, u: 320, kind: 'crowd' }],

    init(rng) {
      const s = { seed: (rng() * 1e9) | 0, t: 0, walls: null, tex: null, G: null, gCtx: null };
      s.rng = TH.mulberry32((rng() * 1e9) | 0);
      // --- facade blocks, far to near on each side ---
      const B = (s.blocks = []);
      const fill = (side, z0, z1, pool) => {
        let z = z0, last = null;
        while (z < z1 - 80) {
          let key = pickR(rng, pool);
          if (key === last) key = pool[(pool.indexOf(key) + 1) % pool.length];
          const b = BLD[key], hk = 0.92 + rng() * 0.16;
          let len = b.w * hk, f1 = 1;
          if (z + len > z1) { f1 = (z1 - z) / len; len = z1 - z; }
          const back = rng() < 0.25 ? 12 + rng() * 26 : 0;
          B.push({ side, kind: 'bld', key, z0: z, z1: z + len, u: side > 0 ? 460 + back : -800 - back, hk, f0: 0, f1, base: 8, hs: b.roof * hk, on: 1 + rng() * 22 });
          z += len; last = key;
        }
      };
      fill(1, -6200, GAP_R[0], ['apt1', 'tower', 'apt2', 'pink', 'site', 'bbapt', 'lowrow']);
      B.push({ side: 1, kind: 'bld', key: 'mall', z0: GAP_R[1], z1: GAP_R[1] + BLD.mall.w, u: 470, hk: 1, f0: 0, f1: 1, base: 8, hs: BLD.mall.roof, on: 0 });
      fill(1, GAP_R[1] + BLD.mall.w, 2300, ['lowrow', 'apt1', 'pink', 'bbapt', 'apt2', 'site', 'lowrow']);
      fill(-1, -6200, OPEN_L[0], ['apt2', 'tower', 'apt1', 'pink', 'lowrow', 'bbapt']);
      for (let z = OPEN_L[0]; z < OPEN_L[1] - 1; z += FENCE.w) {
        const len = Math.min(FENCE.w, OPEN_L[1] - z);
        B.push({ side: -1, kind: 'fence', z0: z, z1: z + len, u: -800, hk: 1, f0: 0, f1: len / FENCE.w, base: 8, hs: FENCE.solid });
      }
      fill(-1, OPEN_L[1], 2300, ['apt1', 'lowrow', 'pink', 'apt2']);
      s.spans = mergeSpans(B);
      // --- flyover ---
      const { zc, uc, R, h } = RING;
      s.decks = {
        d1: mkDeck('d1', lineDeck(Z_D1, 1700, h, Z_D1, uc, h, 1), { w: 400, th: RING.th, par: 58, lampEvery: 420, seed: 1, zSort: Z_D1, drip: true }),
        ringN: mkDeck('ringN', arcDeck(zc, uc, R, -Math.PI / 2, Math.PI / 2, 7, ringH), { w: 380, th: RING.th, par: 58, lampEvery: 560, seed: 3, zSort: zc + 520 }),
        ringF: mkDeck('ringF', arcDeck(zc, uc, R, Math.PI / 2, (3 * Math.PI) / 2, 6, ringH), { w: 380, th: RING.th, par: 58, lampEvery: 700, seed: 5, zSort: zc - 560 }),
        r1: mkDeck('r1', lineDeck(-2800, uc - R, 0, zc, uc - R, ringH(-Math.PI / 2), 5, true), { w: 360, th: RING.th, par: 58, lampEvery: 700, seed: 2, zSort: -1500 }),
        d2: mkDeck('d2', (() => {
          const c = [];
          for (let i = 0; i <= 4; i++) { const t = i / 4, a = (1 - t) * (1 - t), b2 = 2 * (1 - t) * t, e = t * t; c.push(a * -3100 + b2 * Z_D2 + e * Z_D2, a * -3400 + b2 * -3000 + e * -1500, 880 + 210 * t); }
          c.push(Z_D2, 1700, 1100);
          return c;
        })(), { w: 380, th: 120, par: 58, lampEvery: 1000, seed: 7, zSort: Z_D2 + 60 }),
      };
      const dk = s.decks;
      s.pillars = [];
      const pil = (z, u, hh, side, poster) => s.pillars.push({ z, u, h: hh, r: 46, side, poster });
      const hs = h - RING.th;
      const side = (u) => (u < -800 ? -1 : u > 460 ? 1 : 0);
      for (const u of [-250, 700]) pil(Z_D1, u, hs, side(u), u === -250);
      // loop piers only where there is no traffic lane: the median, the left footpath, the open ground
      for (const deg of [68, 112, 15, 165, -40, -90, -140]) {
        const a = (deg * Math.PI) / 180, u = uc + R * Math.sin(a);
        pil(zc + R * Math.cos(a), u, ringH(a) - RING.th, side(u), deg === 68 || deg === 112);
      }
      pil(-1600, uc - R, 360, -1, false); pil(-1300, uc - R, 470, -1, false);
      for (const u of [-250, -1000]) pil(Z_D2, u, 974, side(u), false);
      pil(-1937, -2725, 865, -1, false);
      // --- flyover traffic ---
      const COLS = { bus: [['#c0392b'], ['#1f6fb2'], ['#2e8b57'], ['#e67e22'], ['#7d3c98']], truck: [['#d97706'], ['#65a30d']], car: [['#ece7e1'], ['#30303a'], ['#8e2b34']] };
      s.fly = [];
      const flyOn = (deck, n, v) => {
        for (let i = 0; i < n; i++) {
          const u = rng(), kind = u < 0.55 ? 'bus' : u < 0.75 ? 'truck' : 'car';
          s.fly.push({ deck, d: ((i + rng() * 0.5) / n) * dk[deck].len, v: v * (0.85 + rng() * 0.3), kind, col: pickR(rng, COLS[kind])[0], lane: rng() < 0.5 ? -1 : 1, dir: 1 });
        }
      };
      flyOn('d1', 3, 150); flyOn('ringN', 2, 120); flyOn('ringF', 2, 120); flyOn('d2', 3, 170); flyOn('r1', 1, 110);
      for (const v of s.fly) v.dir = v.lane > 0 ? 1 : -1;
      // --- props ---
      s.poles = [];
      for (let z = -1400; z < 2300; z += 380 + rng() * 60) s.poles.push(z);
      s.trees = [];
      for (const [z, u, hh, fl] of [[880, -900, 260, 0], [-60, -905, 250, 1], [-1400, -870, 230, 0], [-2150, -900, 280, 1], [-2900, -890, 240, 0], [-3400, -930, 300, 1]]) {
        const blobs = [];
        for (let q = 0; q < 4; q++) { const a = (q / 4) * Math.PI + (rng() - 0.5) * 0.4; blobs.push([Math.cos(a) * hh * 0.42, -Math.sin(a) * hh * 0.18 + hh * 0.08, hh * (0.2 + rng() * 0.08)]); }
        s.trees.push({ z, u, h: hh, side: -1, blobs, col: fl ? '#4b7336' : '#3d6634', dark: '#2b4a28', flowers: fl ? '#e2542a' : null });
      }
      s.boards = [
        { z: 520, u: -1060, h0: 390, w: 600, hh: 260, ad: 0, side: -1, on: 3 },
        { z: -2700, u: -1000, h0: 470, w: 600, hh: 260, ad: 1, side: -1, on: 6 },
        { z: -1850, u: 1250, h0: 470, w: 600, hh: 260, ad: 2, side: 1, on: 4.5 },
      ];
      // --- life on the overbridge ---
      s.walkers = [];
      const SH = ['#e63946', '#f1f1f1', '#2a9d8f', '#ffd166', '#9b5de5', '#457b9d', '#f4a261'];
      for (let i = 0; i < 5; i++) s.walkers.push({ u: FOB.u0 + 60 + rng() * (FOB.u1 - FOB.u0 - 120), dir: rng() < 0.5 ? 1 : -1, v: 55 + rng() * 30, ph: rng() * 10, shirt: pickR(rng, SH), sari: rng() < 0.3 ? pickR(rng, ['#c2185b', '#f6c945', '#1b998b']) : null });
      // --- sky ---
      s.clouds = [];
      for (let i = 0; i < 7; i++) s.clouds.push({ x: rng() * 1200 - 100, y: 40 + rng() * 120, w: 50 + rng() * 120, h: 3 + rng() * 5, v: 2 + rng() * 3 });
      s.birds = [];
      for (let i = 0; i < 7; i++) s.birds.push({ x: 120 + i * 24 + rng() * 16, y: 70 + rng() * 22 + (i % 2) * 8, ph: rng() * TAU, sz: 3.4 + rng() * 1.6 });
      s.train = { on: false, u: 0, dir: 1, v: 1150, n: 7, len: 0, next: 1.5 + rng() * 2 };
      return s;
    },

    update(s, dt) {
      dt = Math.min(dt || 0, 0.1);
      s.t += dt;
      const r = s.rng;
      if (s.walls) for (const w of s.walls) if (w.on !== undefined) w.emis = s.t >= w.on ? w.emisSrc : null;
      for (const w of s.walkers) {
        w.u += w.dir * w.v * dt; w.ph += dt;
        if (w.u > FOB.u1 - 20 || w.u < FOB.u0 + 20) w.dir = w.u > 0 ? -1 : 1;
      }
      for (const v of s.fly) {
        const Dk = s.decks[v.deck];
        v.d += v.dir * v.v * dt;
        if (v.d > Dk.len) v.d -= Dk.len; else if (v.d < 0) v.d += Dk.len;
      }
      for (const c of s.clouds) { c.x += c.v * dt; if (c.x - c.w > 1150) c.x = -150 - c.w; }
      for (const b of s.birds) { b.x += 14 * dt; b.ph += dt * 7; if (b.x > 1080) b.x = -60; }
      const tr = s.train;
      if (!tr.on) {
        tr.next -= dt;
        if (tr.next <= 0) {
          tr.on = true; tr.dir = r() < 0.5 ? 1 : -1; tr.n = 6 + ((r() * 4) | 0);
          tr.len = 1250 + 70 + tr.n * 1370; tr.v = 1000 + r() * 400;
          tr.u = -tr.dir * (9000 + cam.u);
        }
      } else {
        tr.u += tr.dir * tr.v * dt;
        const back = tr.u - tr.dir * tr.len;
        if (tr.dir > 0 ? back > 9000 : back < -9000) { tr.on = false; tr.next = 6 + r() * 10; }
      }
    },

    drawSky(ctx, s, env) {
      const G = skyGrads(ctx, s);
      ctx.fillStyle = G.sky; ctx.fillRect(-150, -150, 1300, HY + 150);
      ctx.fillStyle = G.sun; ctx.fillRect(-150, -150, 1300, HY + 150);
      ctx.fillStyle = G.ground; ctx.fillRect(-150, HY, 1300, 480);
      // thin cloud streaks, their undersides lit by the low sun
      ctx.beginPath();
      for (const c of s.clouds) { ctx.moveTo(c.x + c.w, c.y); ctx.ellipse(c.x, c.y, c.w, c.h, 0, 0, TAU); }
      ctx.fillStyle = rgba(pre('#6c4f7e'), 0.45); ctx.fill();
      ctx.beginPath();
      for (const c of s.clouds) { ctx.moveTo(c.x + c.w * 0.9, c.y + c.h * 0.55); ctx.ellipse(c.x + c.w * 0.1, c.y + c.h * 0.55, c.w * 0.8, c.h * 0.42, 0, 0, TAU); }
      ctx.fillStyle = rgba(pre('#ffb48c'), 0.6); ctx.fill();
      // the low sun with haze bands across it
      ctx.fillStyle = G.disc; ctx.beginPath(); ctx.arc(SUN.x, SUN.y, SUN.r, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(pre('#ee8e7a'), 0.4);
      ctx.beginPath(); ctx.ellipse(SUN.x - 8, SUN.y + 6, 60, 2.2, 0, 0, TAU); ctx.ellipse(SUN.x + 12, SUN.y + 12, 46, 1.6, 0, 0, TAU); ctx.fill();
      // far skyline (static strip, a touch of parallax)
      const tx = s.tex;
      if (tx && tx.sky) ctx.drawImage(tx.sky.canvas, SKYL.x0 - (cam.u * F) / SKYL.D, SKYL.y0, SKYL.w, SKYL.h);
      // railway embankment on the horizon and the train crossing it
      const k = KT, yTop = HY + (cam.h - 160) * k, yRail = HY + (cam.h - 175) * k;
      ctx.fillStyle = pre('#b08c7c'); ctx.fillRect(-150, yTop, 1300, HY + 8 - yTop);
      ctx.fillStyle = pre('#6d6260'); ctx.fillRect(-150, yRail - 0.6, 1300, 1.2);
      drawTrain(ctx, s);
      const tr = s.train;
      if (tr.on && Math.abs(tr.u) < tr.len + 5000 && Math.floor(s.t * 2.6) % 2) {
        const x0 = CX - cam.u * k;
        skyGlow(s, x0 - 380 * k, yTop - 6, 7, '#ff3b30', 1); skyGlow(s, x0 + 330 * k, yTop - 6, 7, '#ff3b30', 1);
      }
      // birds flying home
      ctx.beginPath();
      for (const b of s.birds) {
        const f = Math.sin(b.ph) * b.sz * 0.7;
        ctx.moveTo(b.x - b.sz, b.y - f); ctx.quadraticCurveTo(b.x - b.sz * 0.4, b.y - 1, b.x, b.y);
        ctx.quadraticCurveTo(b.x + b.sz * 0.4, b.y - 1, b.x + b.sz, b.y - f);
      }
      ctx.strokeStyle = rgba(pre('#3a2340'), 0.85); ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
      skyGlow(s, SUN.x, SUN.y, 150, '#ffb070', 0.55);
      skyGlow(s, SUN.x, SUN.y, 36, '#fff0c8', 0.8);
    },

    walls(s) {
      if (s.walls) return s.walls;
      s.walls = [];
      const tx = (s.tex = buildTextures(s));
      if (!tx) return s.walls;
      for (const b of s.blocks) {
        if (b.kind === 'fence') {
          if (!tx.fence) continue;
          const W = tx.fence.canvas.width;
          s.walls.push({ u: b.u, z0: b.z0, z1: b.z1, h: FENCE.h, tex: tx.fence.canvas, sx0: 0, sx1: W * b.f1, ret: '#b8a98e' });
          continue;
        }
        const sl = tx.slot[b.key], span = sl.sx1 - sl.sx0;
        s.walls.push({ u: b.u, z0: b.z0, z1: b.z1, h: HU * b.hk, tex: tx.T.canvas, sx0: sl.sx0 + span * b.f0, sx1: sl.sx0 + span * b.f1,
          emis: null, emisSrc: tx.E.canvas, on: b.on, ret: BLD[b.key].ret });
      }
      return s.walls;
    },

    add(s, env, add) {
      const zFar = cam.z - fp.FAR;
      const dk = s.decks;
      // flyover: far pieces first; each deck is one item at its own depth
      const deckItem = (Dk, side) => {
        const z = clamp(Dk.zSort, zFar + 10, cam.z - 40);
        add(z, (c, d, e) => { if (side) clipBehind(c, s, Dk.zSort - 400, side, xAt(Dk.zSort + 250, side > 0 ? Dk.uMax + 100 : Dk.uMin - 100)); drawDeck(c, s, Dk, e); });
      };
      deckItem(dk.ringF); deckItem(dk.d2, 1); deckItem(dk.r1, -1); deckItem(dk.ringN); deckItem(dk.d1, 1);
      add(Z_D1 + 150, (c, d) => drawDirSign(c, s, d), 0, 400);
      for (const P of s.pillars) add(P.z, (c, d) => drawPillar(c, s, P, d), P.u, 80);
      for (const T of s.trees) add(T.z, (c, d) => drawTree(c, s, T, d), T.u, T.h);
      for (const B of s.boards) add(B.z, (c, d, e) => { if (B.side > 0) clipBehind(c, s, B.z, 1); drawUnipole(c, s, B, d, e); }, B.u, B.w);
      add(GAP_R[0], (c, d) => drawRightGap(c, s, d), 1200, 900);
      // the foot-overbridge, its stairs, and the rest of the street furniture
      add(FOB.z, (c, d, e) => drawFOB(c, s, d, e), -170, 700);
      const zs = FOB.z - FOB.hw - 260;
      add(zs, (c, d) => drawStair(c, 362, 432, d), 400, 300);
      add(zs, (c, d) => drawStair(c, -722, -792, d), -760, 300);
      add(1250, (c, d, e) => drawTeaStall(c, s, 1250, d, e), 420, 200);
      add(250, (c, d) => drawBusShelter(c, s, 250, d), -740, 260);
      add(-2600, (c, d) => drawRailSign(c, s, -2600, -760, d), -760, 100);
      for (let i = 0; i < s.poles.length; i++) {
        const z = s.poles[i];
        if (z < zFar || z > cam.z - 20) continue;
        add(z, (c, d) => drawPoleSpan(c, s, i, d), 452, 400);
      }
      add(1080, (c, d) => drawCrossWires(c, 1080, d));
    },

    dispose(s) {
      const tx = s.tex;
      if (tx) {
        for (const c of [tx.T, tx.E, tx.fence, tx.dir, tx.fob, tx.banner, tx.rail, tx.sky, ...(tx.boards || [])]) if (c && c.canvas) c.canvas.width = 0;
      }
      s.tex = null; s.walls = null; s.G = null; s.gCtx = null;
    },
  });
})();
