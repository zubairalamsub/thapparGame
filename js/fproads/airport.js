// First-person scenery: Airport Road (এয়ারপোর্ট রোড) at night.
// The Dhaka Elevated Expressway runs along the left on tall piers with its own stream of vehicle lights,
// the lit terminal of Hazrat Shahjalal International Airport glows at the vanishing point, planes descend
// over the road with blinking navigation and landing lights, a big lit "ঢাকায় স্বাগতম" gate spans the road,
// royal palms and a manicured median, glowing billboards, orange sodium lamps. See js/FP_CONTRACT.md §4–§6.
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
  const TINT = '#6d78b3';
  const TK = rgbOf(TINT);
  const preM = new Map();
  // The colour to paint so that it reads as `hex` after the night tint multiplies the world.
  function pre(hex) {
    let v = preM.get(hex);
    if (!v) { const c = rgbOf(hex); v = hexOf([(c[0] * 255) / TK[0], (c[1] * 255) / TK[1], (c[2] * 255) / TK[2]]); preM.set(hex, v); }
    return v;
  }
  const rgba = (hex, a) => { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${Math.round(clamp(a, 0, 1) * 1000) / 1000})`; };
  const FOG = pre('#34406a');       // horizon haze: city light under a night sky
  const FOG_MAX = 0.7;

  // ---------- layout (FP world units, see §1) ----------
  const XW = { u0: -1150, u1: -430, hS: 600, hT: 735, hP: 792, pu: -722, pr: 64, every: 1100 };  // the elevated expressway
  const GATE = { z: -200, u0: -312, u1: 452, h: 600 };            // "ঢাকায় স্বাগতম" gate over our carriageway (median to footpath)
  const AIR = [-3400, 680];                                       // airport boundary wall on the right
  const DV = 9000, KV = F / DV;                                   // virtual depth of the terminal at the vanishing point
  const MOON = { x: 612, y: 40, r: 13 };

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
  const SHOPS = ['ট্রাভেল এজেন্সি', 'মানি এক্সচেঞ্জ', 'রেন্ট-এ-কার', 'হোটেল ও রেস্টুরেন্ট', 'এয়ার টিকেটিং', 'নিউ ফার্মেসী',
    'কাওলা স্টোর', 'মোবাইল সেন্টার', 'বিরিয়ানি হাউস', 'লাগেজ হাউস', 'কুরিয়ার সার্ভিস', 'মিষ্টি মুখ', 'চা-নাস্তা',
    'গিফট শপ', 'ফাস্ট ফুড', 'ইলেকট্রনিক্স', 'ভিসা প্রসেসিং', 'ফটোকপি'];
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
      e.fillStyle = warm ? 'rgba(255,186,100,0.72)' : 'rgba(200,226,255,0.55)'; e.fillRect(x, y, w, h);
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
  function hotel(g, e, w, h, r) {
    const gf = 170, fl = 7, fh = (h - gf - 60) / fl;
    g.fillStyle = '#d9d2c4'; g.fillRect(0, -h + 40, w, h - 40);
    g.fillStyle = '#b8ad9a'; for (let x = 0; x <= w; x += w / 5) g.fillRect(x - 7, -h + 40, 14, h - 40 - gf);
    for (let f = 0; f < fl; f++) {
      const yb = -gf - f * fh;
      g.fillStyle = '#c4b9a6'; g.fillRect(0, yb - 8, w, 8);
      for (let b = 0; b < 5; b++) {
        const x = (b * w) / 5 + 14, ww = w / 5 - 28, wy = yb - fh + 14, wh = fh - 36;
        win(g, e, x, wy, ww, wh, r() < 0.62, r() < 0.75, r);
        g.fillStyle = 'rgba(60,54,48,0.65)'; g.fillRect(x - 4, yb - 30, ww + 8, 6);
      }
    }
    // crown with the lit name, and a vertical sign down one corner
    g.fillStyle = '#3b3a48'; g.fillRect(0, -h, w, 44);
    text(g, 'হোটেল এয়ারপোর্ট ইন', w / 2, -h + 22, 30, '#ffd166', w * 0.9);
    e.fillStyle = 'rgba(255,200,90,0.95)'; e.fillRect(w * 0.06, -h + 6, w * 0.88, 32);
    g.fillStyle = '#7f1d1d'; g.fillRect(w - 58, -h + 80, 44, 300);
    for (let i = 0; i < 5; i++) text(g, 'হোটেল'[i], w - 36, -h + 110 + i * 56, 38, '#ffe8a8', 40);
    e.fillStyle = 'rgba(255,120,90,0.8)'; e.fillRect(w - 58, -h + 80, 44, 300);
    g.fillStyle = '#e9d7b0'; g.fillRect(20, -gf + 30, w - 40, gf - 36);
    g.fillStyle = 'rgba(50,40,40,0.5)'; for (let x = 20; x < w - 20; x += 44) g.fillRect(x, -gf + 30, 3, gf - 36);
    e.fillStyle = 'rgba(255,214,150,0.5)'; e.fillRect(20, -gf + 30, w - 40, gf - 36);
    g.fillStyle = '#5b4636'; g.fillRect(-4, -gf, w + 8, 30);
    text(g, 'HOTEL · হোটেল', w / 2, -gf + 15, 18, '#f3dfb4', w * 0.6, '600');
    e.fillStyle = 'rgba(255,220,160,0.6)'; e.fillRect(0, -gf, w, 30);
  }
  function officeBank(g, e, w, h, r) {
    const gr = g.createLinearGradient(0, -h, 0, -150);
    gr.addColorStop(0, '#5d6f93'); gr.addColorStop(1, '#2e3f5c');
    g.fillStyle = gr; g.fillRect(6, -h + 44, w - 12, h - 194);
    const cols = Math.round((w - 12) / 40), cw = (w - 12) / cols;
    for (let y = -150 - 58; y > -h + 50; y -= 58) {
      for (let c = 0; c < cols; c++) if (r() < 0.4) { g.fillStyle = 'rgba(220,236,255,0.6)'; g.fillRect(6 + c * cw + 2, y + 4, cw - 4, 48); e.fillStyle = 'rgba(190,220,255,0.75)'; e.fillRect(6 + c * cw + 2, y + 4, cw - 4, 48); }
      g.fillStyle = 'rgba(20,26,40,0.6)'; g.fillRect(6, y, w - 12, 5);
    }
    g.fillStyle = 'rgba(20,26,40,0.5)'; for (let c = 0; c <= cols; c++) g.fillRect(6 + c * cw - 1.5, -h + 44, 3, h - 194);
    g.fillStyle = '#c9ced6'; g.fillRect(0, -h, w, 46);
    g.fillStyle = '#0f4c81'; g.fillRect(w * 0.1, -h + 6, w * 0.8, 34);
    text(g, 'এয়ারপোর্ট ব্যাংক টাওয়ার', w / 2, -h + 23, 22, '#ffffff', w * 0.74);
    e.fillStyle = 'rgba(120,190,255,0.9)'; e.fillRect(w * 0.1, -h + 6, w * 0.8, 34);
    g.fillStyle = '#b3b8c0'; g.fillRect(0, -150, w, 150);
    g.fillStyle = '#e6dcc0'; g.fillRect(22, -128, w - 44, 108);
    e.fillStyle = 'rgba(255,226,170,0.42)'; e.fillRect(22, -128, w - 44, 108);
    g.fillStyle = 'rgba(40,50,60,0.5)'; for (let x = 22; x < w - 22; x += 46) g.fillRect(x, -128, 3, 108);
    g.fillStyle = '#b91c1c'; g.fillRect(w * 0.25, -148, w * 0.5, 20);
    text(g, 'এটিএম বুথ', w / 2, -138, 15, '#fff', w * 0.46);
    e.fillStyle = 'rgba(255,80,80,0.8)'; e.fillRect(w * 0.25, -148, w * 0.5, 20);
  }
  function resto(g, e, w, h, r) {
    apartment(g, e, w, h, r, { wall: '#e8d9bd', trim: '#c9b48c', floors: 2, bal: false, lit: 0.7 });
    // big lit signboard across the first floor, with strings of fairy lights
    g.fillStyle = '#7f1d1d'; g.fillRect(8, -h + 30, w - 16, 70);
    text(g, 'রেস্তোরাঁ ও কাবাব ঘর', w / 2, -h + 66, 34, '#ffe08a', w - 40);
    e.fillStyle = 'rgba(255,170,80,0.9)'; e.fillRect(8, -h + 30, w - 16, 70);
    const lw = w - 60, lh = lw * 0.44, lx = 30, ly = -h - lh - 70;
    g.strokeStyle = '#2a2c36'; g.lineWidth = 6; g.beginPath();
    for (let x = lx + 30; x < lx + lw; x += 80) { g.moveTo(x, -h); g.lineTo(x, ly + lh); g.moveTo(x, -h); g.lineTo(x + 40, ly + lh); }
    g.stroke();
    g.save(); g.translate(lx, ly); g.scale(lw / 640, lh / 280); paintLED(g, 640, 280, 1); g.restore();
    e.fillStyle = 'rgba(120,255,190,0.55)'; e.fillRect(lx + 6, ly + 6, lw - 12, lh - 12);
    e.fillStyle = 'rgba(255,90,110,0.7)'; e.fillRect(lx + 30, ly + lh * 0.25, lh * 0.5, lh * 0.5);
    for (let x = 12; x < w - 8; x += 18) { const y = -h + 110 + Math.sin(x * 0.07) * 6; g.fillStyle = '#fff2b0'; g.fillRect(x, y, 5, 5); e.fillStyle = pickR(r, ['rgba(255,230,120,1)', 'rgba(120,255,160,1)', 'rgba(255,120,160,1)']); e.fillRect(x - 3, y - 3, 11, 11); }
  }
  function petrol(g, e, w, h, r) {
    // filling-station canopy on columns, pumps and the cashier's kiosk under it
    g.fillStyle = '#e5e7eb'; g.fillRect(0, -h, w, 60);
    g.fillStyle = '#15803d'; g.fillRect(0, -h + 40, w, 20);
    text(g, 'ফিলিং স্টেশন', w / 2, -h + 22, 30, '#15803d', w * 0.8);
    e.fillStyle = 'rgba(200,255,220,0.9)'; e.fillRect(0, -h, w, 60);
    g.fillStyle = '#9ca3af'; for (const x of [w * 0.15, w * 0.5, w * 0.85]) g.fillRect(x - 10, -h + 60, 20, h - 60);
    g.fillStyle = '#1f2937'; g.fillRect(0, -h + 60, w, 16);
    e.fillStyle = 'rgba(230,240,255,0.7)'; e.fillRect(0, -h + 64, w, 10);
    for (const x of [w * 0.32, w * 0.68]) { g.fillStyle = '#dc2626'; g.fillRect(x - 18, -110, 36, 110); g.fillStyle = '#111'; g.fillRect(x - 12, -96, 24, 20); g.fillStyle = '#86efac'; g.fillRect(x - 10, -94, 20, 8); e.fillStyle = 'rgba(140,255,170,1)'; e.fillRect(x - 10, -94, 20, 8); }
    g.fillStyle = '#d6d3d1'; g.fillRect(w * 0.82, -150, w * 0.16, 150);
    g.fillStyle = '#fde68a'; g.fillRect(w * 0.84, -130, w * 0.12, 60); e.fillStyle = 'rgba(255,220,140,0.9)'; e.fillRect(w * 0.84, -130, w * 0.12, 60);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, -8, w, 8);
  }
  const BLD = {
    hotel: { w: 520, h: 860, roof: 856, ret: '#a69d8e', paint: hotel },
    bank: { w: 380, h: 700, roof: 698, ret: '#687690', paint: officeBank },
    shops: { w: 440, h: 300, roof: 270, ret: '#9c8f7d', paint: lowrow },
    low3: { w: 360, h: 420, roof: 410, ret: '#b09a86', paint: (g, e, w, h, r) => apartment(g, e, w, h, r, { wall: '#d8c3aa', trim: '#b7a084', floors: 2, bal: true, lit: 0.6 }) },
    low3b: { w: 330, h: 410, roof: 400, ret: '#9aa89a', paint: (g, e, w, h, r) => apartment(g, e, w, h, r, { wall: '#c5d0c0', trim: '#a4b09c', floors: 2, bal: true, lit: 0.55, rail: '#7a4a3a' }) },
    resto: { w: 380, h: 380, roof: 372, ret: '#b49e80', paint: resto },  // with a rooftop LED screen
    petrol: { w: 500, h: 250, roof: 250, ret: '#9ca3af', paint: petrol },
  };
  // Airport boundary wall: cream panels with a green grille, little wall lamps and a plaque.
  const AWALL = { w: 480, h: 176, solid: 124 };
  function paintAirWall(g, e, w, r) {
    const H = AWALL.solid;
    g.fillStyle = '#e2dccd'; g.fillRect(0, -H, w, H);
    g.fillStyle = '#c9c0ac'; for (let x = 0; x <= w; x += 120) g.fillRect(x - 10, -H - 8, 20, H + 8);
    g.fillStyle = 'rgba(80,70,50,0.12)'; g.fillRect(0, -26, w, 26);
    g.fillStyle = '#b9ae96'; g.fillRect(0, -H - 4, w, 8);
    g.fillStyle = '#9d2b2b'; g.fillRect(0, -44, w, 8);
    g.fillStyle = '#1f6f4a'; g.fillRect(0, -36, w, 6);
    for (let x = 60; x < w; x += 120) { g.fillStyle = '#fff4d0'; g.fillRect(x - 6, -H + 20, 12, 10); e.fillStyle = 'rgba(255,230,170,1)'; e.fillRect(x - 12, -H + 14, 24, 22); }
    g.fillStyle = '#f4efe2'; g.fillRect(w * 0.3, -H + 44, w * 0.4, 36);
    text(g, 'বিমানবন্দর এলাকা', w / 2, -H + 62, 20, '#1f4f3a', w * 0.38);
    g.strokeStyle = '#2e5e46'; g.lineWidth = 3.5; g.beginPath();
    for (let x = 5; x < w; x += 12) { g.moveTo(x, -H - 4); g.lineTo(x, -AWALL.h + 6); }
    g.moveTo(0, -AWALL.h + 10); g.lineTo(w, -AWALL.h + 10); g.moveTo(0, -H - 16); g.lineTo(w, -H - 16);
    g.stroke();
  }
  // Glowing LED billboards.
  function paintLED(g, w, h, kind) {
    g.fillStyle = '#101018'; g.fillRect(0, 0, w, h);
    const x = 8, y = 8, bw = w - 16, bh = h - 16;
    let gr;
    if (kind === 0) {
      gr = g.createLinearGradient(0, y, 0, y + bh); gr.addColorStop(0, '#1e3a8a'); gr.addColorStop(1, '#38bdf8');
      g.fillStyle = gr; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(x + bw - 200, y + 120); g.lineTo(x + bw - 40, y + 70); g.lineTo(x + bw - 30, y + 84); g.lineTo(x + bw - 150, y + 124); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x + bw - 120, y + 96); g.lineTo(x + bw - 90, y + 40); g.lineTo(x + bw - 74, y + 44); g.lineTo(x + bw - 90, y + 104); g.closePath(); g.fill();
      text(g, 'আকাশে উড়ুন', x + (bw - 200) / 2 + 10, y + bh * 0.38, 58, '#ffffff', bw - 230);
      text(g, 'প্রতিদিন নতুন গন্তব্যে', x + (bw - 200) / 2 + 10, y + bh * 0.74, 30, '#fde047', bw - 230);
    } else if (kind === 1) {
      g.fillStyle = '#006a4e'; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#f42a41'; g.beginPath(); g.arc(x + 110, y + bh / 2, bh * 0.3, 0, TAU); g.fill();
      text(g, 'ঢাকা', x + bw / 2 + 60, y + bh * 0.36, 64, '#ffffff', bw - 260);
      text(g, 'প্রাণের শহর', x + bw / 2 + 60, y + bh * 0.74, 38, '#fde68a', bw - 260);
    } else {
      gr = g.createLinearGradient(x, 0, x + bw, 0); gr.addColorStop(0, '#be185d'); gr.addColorStop(1, '#7e22ce');
      g.fillStyle = gr; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#0b1020'; g.fillRect(x + 30, y + 22, 76, bh - 44); g.fillStyle = '#f9a8d4'; g.fillRect(x + 38, y + 34, 60, bh - 80);
      text(g, 'মোবাইল ব্যাংকিং', x + bw / 2 + 50, y + bh * 0.38, 50, '#ffffff', bw - 170);
      text(g, 'সহজ লেনদেন, সবখানে', x + bw / 2 + 50, y + bh * 0.74, 30, '#fbcfe8', bw - 170);
    }
  }
  function paintGateSign(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b7a52'); gr.addColorStop(1, '#064e36');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c14e'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#f42a41'; g.beginPath(); g.arc(h * 0.62, h / 2, h * 0.28, 0, TAU); g.fill();
    g.fillStyle = '#f42a41'; g.beginPath(); g.arc(w - h * 0.62, h / 2, h * 0.28, 0, TAU); g.fill();
    text(g, 'ঢাকায় স্বাগতম', w / 2, h * 0.43, h * 0.46, '#fff6d8', w - h * 2.2);
    text(g, 'WELCOME TO DHAKA', w / 2, h * 0.8, h * 0.16, '#f2d98a', w - h * 2.4, '600');
  }
  function paintXwSign(g, w, h) {
    g.fillStyle = '#0d5c3a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    text(g, 'ঢাকা এলিভেটেড এক্সপ্রেসওয়ে', w / 2, h * 0.4, h * 0.3, '#ffffff', w - 30);
    text(g, 'DHAKA ELEVATED EXPRESSWAY', w / 2, h * 0.76, h * 0.15, '#cfeedd', w - 40, '600');
  }
  // The terminal at the vanishing point: long white arched roof, glowing glass hall, the name sign.
  const TERM = { u0: -8600, u1: 8600, h: 132 };             // cached strip covering u -8600..8600 at depth DV
  TERM.w = Math.round((TERM.u1 - TERM.u0) * KV);
  function paintTerminal(g, r) {
    const k = TERM.w / (TERM.u1 - TERM.u0), X = (u) => (u - TERM.u0) * k, Y = (h) => TERM.h - 4 - h * k;
    // forecourt and apron lights
    g.fillStyle = pre('#1b2238'); g.fillRect(0, Y(0), TERM.w, 8);
    // glass hall with the lit interior
    const gl = g.createLinearGradient(0, Y(520), 0, Y(0));
    gl.addColorStop(0, pre('#6b5a64')); gl.addColorStop(0.4, pre('#d99a58')); gl.addColorStop(1, pre('#ffd08a'));
    g.fillStyle = gl; g.fillRect(X(-4400), Y(520), X(4400) - X(-4400), Y(0) - Y(520));
    g.fillStyle = rgba(pre('#1b1a2c'), 0.55); for (let u = -4400; u < 4400; u += 260) g.fillRect(X(u), Y(520), 1.2, Y(0) - Y(520));
    g.fillRect(X(-4400), Y(260), X(4400) - X(-4400), 1.4);
    // the long curved roof with its scalloped eaves
    g.fillStyle = pre('#f3efe8');
    g.beginPath(); g.moveTo(X(-4800), Y(560));
    for (let u = -4800; u <= 4800; u += 200) g.lineTo(X(u), Y(700 + 380 * (1 - (u / 4800) ** 2)));
    g.lineTo(X(4800), Y(560));
    for (let u = 4800; u >= -4800; u -= 600) g.quadraticCurveTo(X(u - 300), Y(620), X(u - 600), Y(540));
    g.closePath(); g.fill();
    g.fillStyle = rgba(pre('#8a8fb4'), 0.6); g.fillRect(X(-4800), Y(575), X(4800) - X(-4800), 2);
    // name sign panel over the entrance (lettering drawn crisp in the live pass)
    g.fillStyle = pre('#0e5a3c'); g.fillRect(X(-2900), Y(1000), X(2900) - X(-2900), Y(700) - Y(1000));
    g.strokeStyle = pre('#e8c88c'); g.lineWidth = 1; g.strokeRect(X(-2900) + 1.5, Y(1000) + 1.5, X(2900) - X(-2900) - 3, Y(700) - Y(1000) - 3);
    // control tower on the airport side
    const tx = X(2300);
    g.fillStyle = pre('#8c8aa0'); g.beginPath(); g.moveTo(tx - 3, Y(0)); g.lineTo(tx - 1.8, Y(1500)); g.lineTo(tx + 1.8, Y(1500)); g.lineTo(tx + 3, Y(0)); g.closePath(); g.fill();
    g.fillStyle = pre('#3a5a78'); g.beginPath(); g.moveTo(tx - 7, Y(1600)); g.lineTo(tx - 9, Y(1760)); g.lineTo(tx + 9, Y(1760)); g.lineTo(tx + 7, Y(1600)); g.closePath(); g.fill();
    g.fillStyle = pre('#ffdca0'); g.fillRect(tx - 7, Y(1640), 14, 2);
    g.fillStyle = pre('#e6e2ea'); g.fillRect(tx - 10, Y(1800), 20, Y(1760) - Y(1800)); g.fillRect(tx - 0.6, Y(1960), 1.2, Y(1800) - Y(1960));
    // apron masts and a couple of parked tails peeking over the roof
    for (const u of [-6200, 5200]) { g.fillStyle = pre('#5a5d78'); g.fillRect(X(u) - 0.8, Y(1300), 1.6, Y(0) - Y(1300)); g.fillStyle = pre('#fff2cc'); g.fillRect(X(u) - 5, Y(1300), 10, 2.2); }
    for (const [u, c] of [[-3300, '#a33a4a'], [3500, '#2f5a8c'], [-5600, '#1e7a55']]) {
      g.fillStyle = pre(c); g.beginPath(); g.moveTo(X(u) - 6, Y(640)); g.lineTo(X(u) + 2, Y(1080)); g.lineTo(X(u) + 7, Y(1080)); g.lineTo(X(u) + 6, Y(640)); g.closePath(); g.fill();
    }
    // wings of the terminal: low blocks and the car park
    g.fillStyle = pre('#4a4f6a'); g.fillRect(X(-8400), Y(380), X(-4800) - X(-8400), Y(0) - Y(380)); g.fillRect(X(4800), Y(420), X(8400) - X(4800), Y(0) - Y(420));
    g.fillStyle = pre('#ffd89a'); for (let i = 0; i < 40; i++) { const u = r() < 0.5 ? -8200 + r() * 3300 : 5000 + r() * 3300; g.fillRect(X(u), Y(60 + r() * 280), 2, 1.4); }
  }
  // Far skyline strip for the sky (static; a touch of parallax). Covers screen x -200..1200.
  const SKYL = { w: 1400, h: 110, x0: -200, y0: HY - 100, D: 10000 };
  function paintSkyline(g, r) {
    const base = SKYL.h - 4, far = pre('#232c4a'), mid = pre('#1a2138'), win = pre('#ffcf7a');
    for (let x = 0; x < SKYL.w;) {
      const bw = 14 + r() * 40, tall = x < 560 && r() < 0.5, bh = tall ? 30 + r() * 60 : 8 + r() * 26;
      g.fillStyle = tall ? mid : far; g.fillRect(x, base - bh, bw, bh + 4);
      g.fillStyle = win; for (let i = 0; i < (tall ? 6 : 2); i++) if (r() < 0.55) g.fillRect(x + 2 + r() * (bw - 5), base - bh + 3 + r() * (bh - 5), 2, 1.6);
      if (tall && r() < 0.4) { g.fillStyle = mid; g.fillRect(x + bw / 2, base - bh - 10, 1, 10); }
      x += bw + r() * 5;
    }
    g.fillStyle = pre('#141a2c');
    g.beginPath(); g.moveTo(0, base + 4);
    for (let x = 0; x <= SKYL.w; x += 16) g.lineTo(x, base - 3 - ((x * 7919) % 5));
    g.lineTo(SKYL.w, base + 4); g.closePath(); g.fill();
  }

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
    // the boundary wall and its lamps share one canvas pair
    tex.wall = fp.canvas(AWALL.w * D, AWALL.h * D);
    tex.wallE = fp.canvas(AWALL.w * D, (AWALL.h * D) / EK);
    if (tex.wall && tex.wallE) {
      const g = tex.wall.ctx, e = tex.wallE.ctx, WH = tex.wall.canvas.height, EH = tex.wallE.canvas.height;
      e.fillStyle = '#000'; e.fillRect(0, 0, tex.wallE.canvas.width, EH);
      g.translate(0, WH); g.scale(D, D); e.translate(0, EH); e.scale(D, EH / AWALL.h);
      paintAirWall(g, e, AWALL.w, r);
      tex.bytes += (tex.wall.canvas.width * WH + tex.wallE.canvas.width * EH) * 4;
    }
    tex.led = [0, 1, 2].map((i) => mk(640, 280, 0.8, (g, w, h) => paintLED(g, w, h, i)));
    tex.gate = mk(900, 150, 1, paintGateSign);
    tex.xw = mk(560, 110, 1, paintXwSign);
    tex.term = mk(TERM.w, TERM.h, 1.5, (g) => paintTerminal(g, r));
    tex.sky = mk(SKYL.w, SKYL.h, 1, (g) => paintSkyline(g, r));
    return tex;
  }

  // ---------- the elevated expressway ----------
  // A long straight deck along the left, drawn span by span (each span is an item at its own depth, so
  // the fog fades it and everything passing under it sorts correctly).
  function drawXwSpan(ctx, s, za, zb, d) {
    const { u0, u1, hS, hT, hP } = XW, k = F / d;
    // underside lit warm by the sodium lamps below, girder face and parapet catching the light
    if (fp.quad(ctx, za, zb, u0, u1, hS)) { ctx.fillStyle = '#9a7a68'; ctx.fill(); }
    if (k > 0.12) {
      ctx.beginPath();
      const zm = (za + zb) / 2;
      if (fp.subQuad(ctx, zm - 260, zm + 260, u1 - 300, u1, hS)) { ctx.fillStyle = 'rgba(255,200,140,0.35)'; ctx.fill(); }
    }
    if (fp.wallQuad(ctx, za, zb, u1, hS, hT)) { ctx.fillStyle = '#b8bccc'; ctx.fill(); }
    if (k > 0.1 && fp.wallQuad(ctx, za, zb, u1, hS, hS + 34)) { ctx.fillStyle = '#8a8ea2'; ctx.fill(); }
    if (fp.wallQuad(ctx, za, zb, u1 - 6, hT, hP)) { ctx.fillStyle = '#e4e6ef'; ctx.fill(); }
    if (fp.polyline(ctx, [za, u1 - 6, hP, zb, u1 - 6, hP])) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = clamp(k * 5, 0.6, 2.5); ctx.stroke(); }
    if (fp.polyline(ctx, [za, u1, hT - 20, zb, u1, hT - 20])) { ctx.strokeStyle = pre('#46c8ff'); ctx.lineWidth = clamp(k * 7, 0.6, 3); ctx.stroke(); }
    { const p = fp.project((za + zb) / 2, u1 - 160, hS); if (p) fp.glow(p.x, p.y, clamp(420 * p.s, 8, 160), '#ffb060', p.d, 0.3, false, 0.45); }
    if (k > 0.1) {
      const a = fp.project(zb - 2, u1, hS), b = fp.project(zb - 2, u1, hP);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = 'rgba(20,24,36,0.7)'; ctx.lineWidth = clamp(k * 6, 0.6, 3); ctx.stroke(); }
    }
    // lamp poles on the parapet, heads leaning out over the road
    const heads = [];
    ctx.beginPath();
    for (let z = Math.ceil(za / 550) * 550 + 275; z < zb; z += 550) {
      const a = fp.project(z, u1 - 20, hP), b = fp.project(z, u1 - 20, hP + 230), c = fp.project(z, u1 + 40, hP + 240);
      if (!a || !b || !c) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
      heads.push(c);
    }
    if (heads.length) {
      ctx.strokeStyle = '#3c4152'; ctx.lineWidth = clamp(k * 5, 0.6, 3); ctx.stroke();
      for (const c of heads) {
        const w = clamp(34 * c.s, 1.2, 14);
        ctx.fillStyle = '#ffc46a'; ctx.fillRect(c.x - w, c.y, w * 2, w * 0.45);
        fp.glow(c.x, c.y + w * 0.5, clamp(110 * c.s, 4, 50), '#ffab45', c.d, 0.55);
      }
    }
    // the vehicles up there: only their lights glow over the parapet, and the roofs of buses clear it
    for (const v of s.xveh) {
      if (v.z < za || v.z >= zb) continue;
      // from down here only the halo over the parapet shows (brighter for the lanes nearer to us)
      const p = fp.project(v.z, u1 - 12, hP + 18);
      if (!p) continue;
      if (v.bus && p.s > 0.1) { ctx.fillStyle = v.col; ctx.fillRect(p.x - 90 * p.s, p.y - 16 * p.s, 180 * p.s, 18 * p.s); }
      fp.glow(p.x, p.y, clamp((v.toward ? 110 : 60) * p.s, 2.5, 34), v.toward ? '#fff2d0' : '#ff3a2a', p.d, v.toward ? 0.85 : 0.6, false, 0.55);
    }
  }
  function drawXwPillar(ctx, s, z, d) {
    const b = fp.project(z, XW.pu, 8), t = fp.project(z, XW.pu, XW.hS);
    if (!b || !t) return;
    const k = b.s, r = XW.pr * k;
    ctx.fillStyle = '#8a8fa3'; ctx.fillRect(b.x - r, t.y, 2 * r, b.y - t.y);
    if (k > 0.1) {
      ctx.fillStyle = '#5d6275'; ctx.fillRect(b.x - r, t.y, r * 0.8, b.y - t.y);
      ctx.fillStyle = '#c7c3c9'; ctx.fillRect(b.x + r * 0.55, t.y, r * 0.45, b.y - t.y);
      const cw = r * 3.2, ch = 90 * k;
      ctx.fillStyle = '#7d8296'; ctx.beginPath(); ctx.moveTo(b.x - cw, t.y); ctx.lineTo(b.x + cw * 0.8, t.y); ctx.lineTo(b.x + r, t.y + ch); ctx.lineTo(b.x - r, t.y + ch); ctx.closePath(); ctx.fill();
    }
    fp.glow(b.x, b.y - 4 * k, clamp(180 * k, 6, 90), '#ffb35a', d, 0.5, false, 0.35);
  }
  function drawXwSign(ctx, s, d) {
    ctx.save();
    if (planeAt(ctx, -620)) {
      ctx.fillStyle = '#34384a'; ctx.fillRect(-900, -XW.hS - 4, 14, 40); ctx.fillRect(-620, -XW.hS - 4, 14, 40);
      if (s.tex && s.tex.xw) ctx.drawImage(s.tex.xw.canvas, -1050, -XW.hS + 30, 560, 110); else { ctx.fillStyle = '#0d5c3a'; ctx.fillRect(-1050, -XW.hS + 30, 560, 110); }
    }
    ctx.restore();
    const p = fp.project(-620, -770, XW.hS - 90);
    if (p) fp.glow(p.x, p.y, clamp(300 * p.s, 10, 110), '#b8ffd8', p.d, 0.35);
  }

  // ---------- the welcome gate ----------
  function drawGate(ctx, s, d, env) {
    const { z, u0, u1, h } = GATE, zf = z + 40, k = F / d;
    // pylons: the face toward the road, then the front
    for (const [ua, ub] of [[u0, u0 + 80], [u1 - 80, u1]]) {
      const inner = ua < 0 ? ub : ua;
      if (fp.path(ctx, [zf, inner, 0, z - 40, inner, 0, z - 40, inner, h, zf, inner, h])) { ctx.fillStyle = '#b9b2a4'; ctx.fill(); }
    }
    ctx.save();
    const kk = planeAt(ctx, zf);
    if (kk) {
      ctx.fillStyle = '#e8e1d0'; ctx.fillRect(u0, -h, 80, h); ctx.fillRect(u1 - 80, -h, 80, h);
      ctx.fillStyle = '#c9bfa9'; ctx.fillRect(u0 + 54, -h, 26, h); ctx.fillRect(u1 - 80, -h, 26, h);
      ctx.fillStyle = '#9d2b2b'; ctx.fillRect(u0, -150, 80, 22); ctx.fillRect(u1 - 80, -150, 80, 22);
      ctx.fillStyle = '#006a4e'; ctx.fillRect(u0, -128, 80, 14); ctx.fillRect(u1 - 80, -128, 80, 14);
      // the arch under the lintel
      const span = u1 - u0 - 160, cxm = (u0 + u1) / 2;
      ctx.beginPath();
      ctx.moveTo(u0 + 80, -h + 170); ctx.lineTo(u0 + 80, -300);
      ctx.bezierCurveTo(u0 + 80, -300 - span * 0.1, cxm - span * 0.25, -h + 186, cxm, -h + 170);
      ctx.bezierCurveTo(cxm + span * 0.25, -h + 186, u1 - 80, -300 - span * 0.1, u1 - 80, -300);
      ctx.lineTo(u1 - 80, -h + 170); ctx.closePath();
      ctx.fillStyle = '#ddd5c2'; ctx.fill();
      ctx.fillStyle = '#e8e1d0'; ctx.fillRect(u0 - 24, -h, u1 - u0 + 48, 180);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(u0 - 24, -h + 170, u1 - u0 + 48, 9); ctx.fillRect(u0 - 24, -h, u1 - u0 + 48, 7);
      const tx = s.tex;
      if (tx && tx.gate && k > 0.05) ctx.drawImage(tx.gate.canvas, cxm - 340, -h + 12, 680, 150); else { ctx.fillStyle = '#0b7a52'; ctx.fillRect(cxm - 340, -h + 12, 680, 150); }
      // shapla (water lily) crest on top
      ctx.fillStyle = '#f3f0e8';
      ctx.beginPath(); ctx.moveTo(cxm - 90, -h); ctx.quadraticCurveTo(cxm - 78, -h - 64, cxm, -h - 104); ctx.quadraticCurveTo(cxm + 78, -h - 64, cxm + 90, -h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#006a4e'; ctx.beginPath(); ctx.arc(cxm, -h - 44, 22, 0, TAU); ctx.fill();
      for (const x of [u0 + 40, u1 - 40]) { ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 14, -h - 44, 28, 44); }
    }
    ctx.restore();
    // bulbs along the arch and the lintel, and light washing the sign
    const bulbs = k > 0.15 ? 11 : 5;
    for (let i = 0; i <= bulbs; i++) {
      const t = i / bulbs, u = u0 - 10 + (u1 - u0 + 20) * t;
      const p = fp.project(zf + 2, u, h - 174);
      if (p) fp.glow(p.x, p.y, clamp(40 * p.s, 3, 16), i % 2 ? '#ffe39a' : '#fff6e0', p.d, 0.85);
    }
    for (const t of [0.36, 0.64]) { const p = fp.project(zf + 4, u0 + (u1 - u0) * t, h - 88); if (p) fp.glow(p.x, p.y, clamp(190 * p.s, 8, 80), '#fff0c0', p.d, 0.28); }
    for (const x of [u0 + 40, u1 - 40]) { const p = fp.project(zf, x, h + 26); if (p) fp.glow(p.x, p.y, clamp(120 * p.s, 5, 50), '#ffd27a', p.d, 0.8); }
  }

  // ---------- palms, the manicured median, LED boards ----------
  function drawPalm(ctx, s, P, d) {
    const b = fp.project(P.z, P.u, P.base);
    if (!b) return;
    const k = b.s;
    if (b.x < -120 || b.x > 1120) return;
    let yb = b.y;
    if (P.side) yb = Math.min(yb, occY(s, b.x, P.side));
    const top = b.y - P.h * k, w0 = 16 * k, w1 = 10 * k, lean = P.lean * k;
    if (yb > top) {
      ctx.fillStyle = '#9d9aa2';
      ctx.beginPath(); ctx.moveTo(b.x - w0, yb); ctx.lineTo(b.x - w1 + lean, top); ctx.lineTo(b.x + w1 + lean, top); ctx.lineTo(b.x + w0, yb); ctx.closePath(); ctx.fill();
    }
    const cx = b.x + lean, cy = top;
    if (k < 0.12) {
      // far: a star of drooping strokes
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const f = P.fronds[P.fronds.length - 1 - i]; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(f.a) * f.L * k, cy + (Math.sin(f.a) * f.L + f.droop) * k); }
      ctx.strokeStyle = '#2f5a3a'; ctx.lineWidth = clamp(24 * k, 0.8, 3); ctx.stroke();
      return;
    }
    ctx.fillStyle = '#3f6b3f'; ctx.fillRect(cx - w1 * 1.2, cy, w1 * 2.4, 40 * k);
    // fronds: arching leaf blades out of the crown, back ones darker
    const fr = P.fronds, n = fr.length, mid = k < 0.17;
    for (const layer of mid ? [1] : [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const f = fr[i];
        if (!mid && f.back !== !layer) continue;
        if (mid && f.back) continue;
        const ex = cx + Math.cos(f.a) * f.L * k, ey = cy + (Math.sin(f.a) * f.L + f.droop) * k;
        const mx = cx + Math.cos(f.a) * f.L * 0.5 * k, my = cy + (Math.sin(f.a) * f.L * 0.5 - f.L * 0.22) * k;
        const nx = -Math.sin(f.a) * f.w * k, ny = Math.cos(f.a) * f.w * k;
        ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx + nx, my + ny, ex, ey); ctx.quadraticCurveTo(mx - nx, my - ny, cx, cy);
      }
      ctx.fillStyle = layer ? '#4f8a4a' : '#26492e'; ctx.fill();
    }
    // uplight at the foot (a pool on the ground) and on the crown
    if (P.lit) {
      fp.glow(b.x, b.y, clamp(120 * k, 6, 70), '#ffd08a', d, 0.35, false, 0.3);
      if (k > 0.2) fp.glow(cx, cy + 30 * k, clamp(120 * k, 6, 60), '#ffe0a0', d, 0.22);
    }
  }
  // Clipped hedge boxes and flowering bougainvillea along the median, batched per stretch.
  function drawMedianGarden(ctx, s, z0, z1, d) {
    const k = F / d;
    ctx.beginPath();
    let any = false;
    for (const t of s.topiary) {
      if (t.z < z0 || t.z >= z1) continue;
      const p = fp.project(t.z, -250, 12 + t.r);
      if (!p) continue;
      const r = t.r * p.s;
      ctx.moveTo(p.x + r, p.y); ctx.ellipse(p.x, p.y, r, r * 0.85, 0, 0, TAU); any = true;
    }
    if (any) { ctx.fillStyle = '#2f6b3a'; ctx.fill(); }
    if (k < 0.15) return;
    ctx.beginPath(); any = false;
    for (const t of s.topiary) {
      if (t.z < z0 || t.z >= z1 || !t.bloom) continue;
      const p = fp.project(t.z, -250, 12 + t.r * 1.5);
      if (!p) continue;
      const r = t.r * 0.5 * p.s;
      ctx.moveTo(p.x + r - t.r * 0.4 * p.s, p.y); ctx.ellipse(p.x - t.r * 0.4 * p.s, p.y, r, r * 0.8, 0, 0, TAU); any = true;
    }
    if (any) { ctx.fillStyle = '#d6337f'; ctx.fill(); }
  }
  function drawLED(ctx, s, B, d) {
    const k = F / d;
    const base = fp.project(B.z, B.u, 0), top = fp.project(B.z, B.u, B.h0);
    if (!base || !top) return;
    const yb = B.side ? Math.min(base.y, occY(s, base.x, B.side)) : base.y;
    const w = 26 * k;
    if (yb > top.y) { ctx.fillStyle = '#34384a'; ctx.fillRect(base.x - w, top.y, 2 * w, yb - top.y); }
    ctx.save();
    if (planeAt(ctx, B.z)) {
      const x0 = B.u - B.w / 2, y0 = -B.h0 - B.hh;
      ctx.fillStyle = '#1b1c26'; ctx.fillRect(x0 - 12, y0 - 12, B.w + 24, B.hh + 24);
      const tx = s.tex && s.tex.led[B.ad];
      if (tx && k > 0.05) ctx.drawImage(tx.canvas, x0, y0, B.w, B.hh); else { ctx.fillStyle = ['#2563eb', '#006a4e', '#be185d'][B.ad]; ctx.fillRect(x0, y0, B.w, B.hh); }
    }
    ctx.restore();
    const col = ['#8cc8ff', '#7dffc0', '#ff8cc8'][B.ad];
    for (const f of [0.25, 0.75]) {
      const p = fp.project(B.z + 4, B.u - B.w / 2 + B.w * f, B.h0 + B.hh / 2);
      if (p && (!B.side || p.y < occY(s, p.x, B.side))) fp.glow(p.x, p.y, clamp(B.w * 0.45 * p.s, 8, 150), col, p.d, 0.6);
    }
  }
  // A small metal bus shelter on the right footpath.
  function drawBusShelter(ctx, s, z, d) {
    const k = F / d, u0 = 300, u1 = 452, z0 = z - 110, z1 = z + 110;
    if (fp.path(ctx, [z0, u1 - 4, 8, z1, u1 - 4, 8, z1, u1 - 4, 200, z0, u1 - 4, 200])) { ctx.fillStyle = 'rgba(160,190,210,0.35)'; ctx.fill(); }
    ctx.beginPath();
    for (const zz of [z0 + 8, z1 - 8]) for (const u of [u0 + 8, u1 - 8]) { const a = fp.project(zz, u, 8), b = fp.project(zz, u, 212); if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
    ctx.strokeStyle = '#48525c'; ctx.lineWidth = clamp(k * 8, 0.8, 5); ctx.stroke();
    if (fp.path(ctx, [z0 - 10, u0 - 14, 222, z1 + 10, u0 - 14, 222, z1 + 10, u1, 212, z0 - 10, u1, 212])) { ctx.fillStyle = '#56636c'; ctx.fill(); }
    ctx.save();
    if (planeAt(ctx, z1 + 12) && k > 0.12) { ctx.fillStyle = '#1d4f91'; ctx.fillRect(u0 + 20, -262, 110, 30); text(ctx, 'বাস স্টপ', u0 + 75, -247, 18, '#fff', 100); }
    ctx.restore();
    const p = fp.project(z, u0 + 60, 205);
    if (p) fp.glow(p.x, p.y, clamp(140 * p.s, 6, 70), '#e8f4ff', d, 0.35);
  }

  // ---------- planes ----------
  // Arrivals come over our heads and glide down toward the terminal (seen from behind: red/green wingtips,
  // white tail light, red beacons, double-flash strobes, landing lights washing the haze ahead).
  // Departures climb out toward us, landing lights blazing.
  function planePos(p, t) {
    const f = clamp(t / p.dur, 0, 1);
    return { z: p.z0 + (p.z1 - p.z0) * f, u: p.u0 + (p.u1 - p.u0) * f, h: p.h0 + (p.h1 - p.h0) * (p.arr ? f * (2 - f) : f * f) };
  }
  function drawPlane(ctx, s, p) {
    const q = planePos(p, p.t), d = cam.z - q.z;
    if (d < 300) return;
    const k = F / d, x = CX + (q.u - cam.u) * k, y = HY + (cam.h - q.h) * k;
    if (x < -300 || x > 1300 || y < -200 || y > HY + 10) return;
    const sc = Math.min(k, 1.2), bank = p.bank;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(bank); ctx.scale(sc, sc);
    if (k > 0.012) {
      ctx.fillStyle = '#c4c6d6';
      ctx.beginPath(); ctx.moveTo(-1050, -70); ctx.lineTo(-160, 10); ctx.lineTo(-160, 50); ctx.lineTo(-1050, -40); ctx.closePath();
      ctx.moveTo(1050, -70); ctx.lineTo(160, 10); ctx.lineTo(160, 50); ctx.lineTo(1050, -40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7d839c';
      ctx.beginPath(); ctx.moveTo(-420, -190); ctx.lineTo(-40, -160); ctx.lineTo(-40, -130); ctx.lineTo(-420, -170); ctx.closePath();
      ctx.moveTo(420, -190); ctx.lineTo(40, -160); ctx.lineTo(40, -130); ctx.lineTo(420, -170); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e4e2ea'; ctx.beginPath(); ctx.ellipse(0, 0, 175, 185, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.tail; ctx.beginPath(); ctx.moveTo(-26, -150); ctx.lineTo(-14, -640); ctx.lineTo(14, -640); ctx.lineTo(26, -150); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5c6078'; ctx.beginPath(); ctx.arc(-440, 70, 75, 0, TAU); ctx.arc(440, 70, 75, 0, TAU); ctx.fill();
      if (!p.arr && k > 0.05) { ctx.fillStyle = '#2a2f44'; ctx.fillRect(-90, -70, 180, 40); }
    }
    ctx.restore();
    // lights (additive, after the tint) at their rotated positions
    const L = (lx, ly) => { const c = Math.cos(bank), sn = Math.sin(bank); return [x + (lx * c - ly * sn) * sc, y + (lx * sn + ly * c) * sc]; };
    const R = (r) => clamp(r * sc, 3.5, 60);
    const tt = s.t + p.ph;
    const left = p.arr ? '#ff3030' : '#30ff80', right = p.arr ? '#30ff80' : '#ff3030';
    let pt = L(-1050, -55); skyGlow(s, pt[0], pt[1], R(120), left, 1);
    pt = L(1050, -55); skyGlow(s, pt[0], pt[1], R(120), right, 1);
    pt = L(0, p.arr ? 175 : -150); skyGlow(s, pt[0], pt[1], R(90), '#ffffff', 0.7);
    if (tt % 1.2 < 0.12) { pt = L(0, -190); skyGlow(s, pt[0], pt[1], R(160), '#ff2020', 1); pt = L(0, 185); skyGlow(s, pt[0], pt[1], R(130), '#ff2020', 0.9); }
    const sp = tt % 1.5;
    if (sp < 0.05 || (sp > 0.14 && sp < 0.19)) { for (const lx of [-1060, 1060]) { pt = L(lx, -55); skyGlow(s, pt[0], pt[1], R(260), '#ffffff', 1); } }
    if (p.arr) {
      // landing-light beams ahead of it into the haze
      pt = L(0, 60); skyGlow(s, pt[0], pt[1] + R(80), R(420), '#fff6e0', 0.35);
    } else {
      for (const lx of [-260, 260]) { pt = L(lx, 40); skyGlow(s, pt[0], pt[1], R(300), '#ffffff', 1); }
      pt = L(0, 20); skyGlow(s, pt[0], pt[1], R(700), '#fff4d8', 0.35);
    }
  }
  function newPlane(s, arr) {
    const r = s.rng, TAILS = ['#0f7a5a', '#c8102e', '#1e3a8a', '#e07a1f', '#7c3aed', '#0b6e4f'];
    const p = arr
      ? { arr: true, z0: cam.z + 900, z1: -16000, u0: 1100 + r() * 1400, u1: -300 + r() * 400, h0: 3600, h1: 650, dur: 17 + r() * 4 }
      : { arr: false, z0: -16000, z1: cam.z + 1200, u0: 200 + r() * 400, u1: 2600 + r() * 1400, h0: 500, h1: 4800, dur: 16 + r() * 4 };
    p.t = 0; p.ph = r() * 5; p.tail = TAILS[(r() * TAILS.length) | 0];
    p.bank = arr ? -0.03 - r() * 0.04 : 0.05 + r() * 0.05;
    return p;
  }

  // ---------- sky ----------
  function skyGrads(ctx, s) {
    if (s.gCtx === ctx && s.G) return s.G;
    s.gCtx = ctx;
    const G = {};
    G.sky = ctx.createLinearGradient(0, -60, 0, HY);
    [[0, '#03050f'], [0.35, '#070d24'], [0.68, '#101c3e'], [0.88, '#1f2c52']].forEach(([o, c]) => G.sky.addColorStop(o, pre(c)));
    G.sky.addColorStop(1, FOG);
    G.city = ctx.createRadialGradient(CX, HY + 40, 10, CX, HY + 40, 520);
    G.city.addColorStop(0, rgba(pre('#6a4a3e'), 0.7)); G.city.addColorStop(0.4, rgba(pre('#4a3a44'), 0.3)); G.city.addColorStop(1, rgba(pre('#2a2a4a'), 0));
    G.ground = ctx.createLinearGradient(0, HY, 0, 600);
    G.ground.addColorStop(0, FOG); G.ground.addColorStop(0.1, pre('#2a3050')); G.ground.addColorStop(1, '#3a3d4a');
    return (s.G = G);
  }

  // ---------- module ----------
  TH.fpRoads.push({
    id: 'airport',
    light: { tint: TINT, tintA: 1, glow: 1, fog: FOG, fogNear: 2200, fogFar: 8500, fogMax: FOG_MAX, lamps: true, headlights: true },
    street: {
      asphalt: '#2c2d34', asphaltOpp: '#2e2f36', lane: '#f2f2f0', stop: '#f4f4f0', sidewalk: '#b1b4bd', sidewalkL: '#a9acb5',
      curb: ['#c8102e', '#f1f1f1'], median: '#6d8a6a', medianTop: '#3f8a45', fence: '#d9dde3', lampStyle: 'sodium', lampEvery: 420,
      lampSkip: [[GATE.z - 130, GATE.z + 130]],
    },
    traffic: { bus: 2, cng: 2, car: 5, bike: 1, truck: 1 }, trafficDensity: 0.9,
    life: { walker: 3, woman: 2, kid: 1, hawker: 1, dog: 1 }, lifeDensity: 0.7,
    lifeSpots: [{ z: 820, u: 360, kind: 'busstop' }, { z: -300, u: -730, kind: 'crowd' }, { z: 1650, u: 400, kind: 'crowd' }],

    init(rng) {
      const s = { seed: (rng() * 1e9) | 0, t: 0, walls: null, tex: null, G: null, gCtx: null };
      s.rng = TH.mulberry32((rng() * 1e9) | 0);
      const B = (s.blocks = []);
      const fill = (side, z0, z1, pool) => {
        let z = z0, last = null;
        while (z < z1 - 80) {
          let key = pickR(rng, pool);
          if (key === last) key = pool[(pool.indexOf(key) + 1) % pool.length];
          const b = BLD[key], hk = 0.94 + rng() * 0.12;
          let len = b.w * hk, f1 = 1;
          if (z + len > z1) { f1 = (z1 - z) / len; len = z1 - z; }
          const back = rng() < 0.2 ? 12 + rng() * 24 : 0;
          B.push({ side, kind: 'bld', key, z0: z, z1: z + len, u: side > 0 ? 460 + back : -800 - back, hk, f0: 0, f1, base: 8, hs: b.roof * hk, on: 0 });
          z += len; last = key;
        }
      };
      fill(1, -6200, AIR[0], ['shops', 'petrol', 'low3', 'resto', 'low3b']);
      for (let z = AIR[0]; z < AIR[1] - 1; z += AWALL.w) {
        const len = Math.min(AWALL.w, AIR[1] - z);
        B.push({ side: 1, kind: 'wall', z0: z, z1: z + len, u: 460, hk: 1, f0: 0, f1: len / AWALL.w, base: 8, hs: AWALL.solid });
      }
      B.push({ side: 1, kind: 'bld', key: 'bank', z0: AIR[1], z1: AIR[1] + BLD.bank.w, u: 468, hk: 1, f0: 0, f1: 1, base: 8, hs: BLD.bank.roof });
      B.push({ side: 1, kind: 'bld', key: 'resto', z0: AIR[1] + BLD.bank.w, z1: AIR[1] + BLD.bank.w + BLD.resto.w, u: 460, hk: 1, f0: 0, f1: 1, base: 8, hs: BLD.resto.roof });
      const zh = AIR[1] + BLD.bank.w + BLD.resto.w;
      B.push({ side: 1, kind: 'bld', key: 'hotel', z0: zh, z1: zh + BLD.hotel.w, u: 480, hk: 1, f0: 0, f1: 1, base: 8, hs: BLD.hotel.roof });
      fill(1, zh + BLD.hotel.w, 2300, ['shops', 'low3', 'low3b']);
      fill(-1, -6200, 2300, ['shops', 'low3', 'shops', 'low3b', 'petrol']);  // all under the expressway deck (<= 430 tall)
      s.spans = mergeSpans(B);
      // the expressway: piers, and the stream of vehicles on it
      s.piers = [];
      for (let z = 2300; z > -6300; z -= XW.every) s.piers.push(z);
      s.xveh = [];
      const COL = ['#b91c1c', '#1d4ed8', '#15803d', '#f59e0b', '#7c3aed'];
      for (let i = 0; i < 18; i++) {
        const toward = i % 2 === 0;
        s.xveh.push({ z: -6000 + rng() * 8300, u: toward ? -560 - rng() * 120 : -880 - rng() * 160, v: (toward ? 1 : -1) * (700 + rng() * 500), toward, bus: rng() < 0.25, col: pickR(rng, COL) });
      }
      // palms: down the median and in the airport lawn behind the boundary wall
      s.palms = [];
      const mkPalm = (z, u, h, side, lit) => {
        const fronds = [];
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (Math.PI * (i + 0.5)) / 9 + (rng() - 0.5) * 0.3, L = 190 + rng() * 60;
          fronds.push({ a, L, droop: L * (0.3 + 0.5 * Math.abs(Math.cos(a))) + rng() * 20, w: 26 + rng() * 8, back: rng() < 0.35 });
        }
        for (const a of [0.5, Math.PI - 0.5]) fronds.push({ a, L: 170, droop: 90, w: 22, back: true });
        fronds.sort((p, q) => (q.back ? 1 : 0) - (p.back ? 1 : 0));
        s.palms.push({ z, u, h, base: side ? 0 : 12, side, lit, lean: (rng() - 0.5) * 40, fronds });
      };
      for (let z = 2100; z > -5200; z -= 680) mkPalm(z + rng() * 80, -250, 580 + rng() * 120, 0, true);
      for (let z = 150; z > -3300; z -= 620) mkPalm(z, 560 + rng() * 260, 620 + rng() * 180, 1, false);
      s.topiary = [];
      for (let z = 2200; z > -3000; z -= 190 + rng() * 80) s.topiary.push({ z, r: 16 + rng() * 10, bloom: rng() < 0.45 });
      s.leds = [
        { z: 470, u: 660, h0: 300, w: 600, hh: 262, ad: 0, side: 1 },
      ];
      s.planes = [];
      const p0 = newPlane(s, true); p0.t = p0.dur * 0.42; s.planes.push(p0);
      s.planeT = 6 + rng() * 3; s.nextArr = false;
      s.stars = [];
      for (let i = 0; i < 90; i++) {
        const y = 6 + Math.pow(rng(), 1.4) * 170;
        s.stars.push({ x: rng() * 1100 - 50, y, a: clamp(0.35 + rng() * 0.65 - y / 400, 0.15, 1), r: rng() < 0.1 ? 2 : rng() < 0.4 ? 1.5 : 1, ph: rng() * TAU, sp: 1 + rng() * 3, big: rng() < 0.12 });
      }
      return s;
    },

    update(s, dt) {
      dt = Math.min(dt || 0, 0.1);
      s.t += dt;
      for (const v of s.xveh) { v.z += v.v * dt; if (v.z > cam.z + 600) v.z -= 8400; else if (v.z < cam.z - 7800) v.z += 8400; }
      for (const p of s.planes) p.t += dt;
      for (let i = s.planes.length - 1; i >= 0; i--) if (s.planes[i].t > s.planes[i].dur) s.planes.splice(i, 1);
      s.planeT -= dt;
      if (s.planeT <= 0 && s.planes.length < 2) {
        s.planes.push(newPlane(s, !s.nextArr ? true : s.rng() < 0.4));
        s.nextArr = !s.nextArr;
        s.planeT = 7 + s.rng() * 5;
      }
    },

    drawSky(ctx, s, env) {
      const G = skyGrads(ctx, s);
      ctx.fillStyle = G.sky; ctx.fillRect(-150, -150, 1300, HY + 150);
      ctx.fillStyle = G.city; ctx.fillRect(-150, HY - 520, 1300, 560);
      ctx.fillStyle = G.ground; ctx.fillRect(-150, HY, 1300, 480);
      // stars, twinkling; the brightest get a real glow
      ctx.fillStyle = '#ffffff';
      const a0 = ctx.globalAlpha;
      for (const st of s.stars) {
        ctx.globalAlpha = a0 * st.a * (0.6 + 0.4 * Math.sin(s.t * st.sp + st.ph));
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
      ctx.globalAlpha = a0;
      for (const st of s.stars) if (st.big && Math.sin(s.t * st.sp + st.ph) > -0.3) skyGlow(s, st.x + st.r / 2, st.y + st.r / 2, 4, '#dfe8ff', 0.8);
      // crescent moon with earthshine
      ctx.fillStyle = rgba(pre('#c8d0f0'), 0.25); ctx.beginPath(); ctx.arc(MOON.x, MOON.y, MOON.r, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(MOON.x, MOON.y, MOON.r, -Math.PI / 2 - 0.35, Math.PI / 2 - 0.35);
      ctx.arc(MOON.x - MOON.r * 0.55, MOON.y - MOON.r * 0.2, MOON.r * 0.95, Math.PI / 2 - 0.2, -Math.PI / 2 - 0.5, true);
      ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
      skyGlow(s, MOON.x + 3, MOON.y, 70, '#c8d4ff', 0.45);
      skyGlow(s, MOON.x + 4, MOON.y, 18, '#fff6e0', 0.9);
      // far skyline and the terminal at the end of the road
      const tx = s.tex;
      if (tx && tx.sky) ctx.drawImage(tx.sky.canvas, SKYL.x0 - (cam.u * F) / SKYL.D, SKYL.y0, SKYL.w, SKYL.h);
      const tk = KV, tx0 = CX + (TERM.u0 - cam.u) * tk, ty0 = HY + (cam.h * tk) - TERM.h + 4;
      if (tx && tx.term) ctx.drawImage(tx.term.canvas, tx0, ty0, TERM.w, TERM.h);
      const X = (u) => CX + (u - cam.u) * tk, Y = (h) => HY + (cam.h - h) * tk;
      // the name sign, drawn live so the lettering is crisp
      ctx.fillStyle = pre('#fff4dc'); ctx.font = `bold ${Math.round(260 * tk)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর', X(0), Y(850), (5600 * tk) | 0);
      for (const u of [-3200, 0, 3200]) skyGlow(s, X(u), Y(220), 34, '#ffc070', 0.42);
      for (const u of [-1600, 1600]) skyGlow(s, X(u), Y(850), 22, '#9dffc8', 0.3);
      for (const u of [-6200, 5200]) skyGlow(s, X(u), Y(1300), 16, '#fff0c0', 0.9);
      const b = s.t % 2.4;
      if (b < 0.18 || (b > 1.2 && b < 1.38)) skyGlow(s, X(2300), Y(1970), 9, b < 1 ? '#80ffb0' : '#ffffff', 1);
      if (s.t % 1.6 < 0.8) skyGlow(s, X(2300), Y(1970), 4, '#ff3030', 1);
      // planes, drawn far to near
      const ps = s.planes.slice().sort((p, q) => planePos(p, p.t).z - planePos(q, q.t).z);
      for (const p of ps) drawPlane(ctx, s, p);
    },

    walls(s) {
      if (s.walls) return s.walls;
      s.walls = [];
      const tx = (s.tex = buildTextures(s));
      if (!tx) return s.walls;
      for (const b of s.blocks) {
        if (b.kind === 'wall') {
          if (!tx.wall) continue;
          const W = tx.wall.canvas.width;
          s.walls.push({ u: b.u, z0: b.z0, z1: b.z1, h: AWALL.h, tex: tx.wall.canvas, sx0: 0, sx1: W * b.f1, emis: tx.wallE ? tx.wallE.canvas : null, ret: '#c9c0ac' });
          continue;
        }
        const sl = tx.slot[b.key], span = sl.sx1 - sl.sx0;
        s.walls.push({ u: b.u, z0: b.z0, z1: b.z1, h: HU * b.hk, tex: tx.T.canvas, sx0: sl.sx0 + span * b.f0, sx1: sl.sx0 + span * b.f1, emis: tx.E.canvas, ret: BLD[b.key].ret });
      }
      return s.walls;
    },

    add(s, env, add) {
      const zFar = cam.z - fp.FAR;
      // expressway spans: 1100 long near, merged into longer ones far away
      for (let zb = cam.z - 30; zb > zFar + 20;) {
        const d = cam.z - zb, len = d > 3000 ? 2200 : 1100;
        const za = Math.max(zFar + 20, zb - len), z0 = za, z1 = zb;
        add((za + zb) / 2, (c, dd) => drawXwSpan(c, s, z0, z1, dd), (XW.u0 + XW.u1) / 2, 900);
        zb = za;
      }
      for (const z of s.piers) if (z > zFar && z < cam.z - 20) add(z, (c, d) => drawXwPillar(c, s, z, d), XW.pu, 200);
      add(-620, (c, d) => drawXwSign(c, s, d), -770, 400);
      add(GATE.z, (c, d, e) => drawGate(c, s, d, e), (GATE.u0 + GATE.u1) / 2, 520);
      for (const P of s.palms) if (P.z > zFar && P.z < cam.z - 20) add(P.z, (c, d) => drawPalm(c, s, P, d), P.u, 300);
      for (let z = Math.floor((cam.z - 30) / 600) * 600; z > Math.max(zFar, -3000, cam.z - 4200); z -= 600) {
        const z0 = z, z1 = z + 600;
        add(z + 300, (c, d) => drawMedianGarden(c, s, z0, z1, d), -250, 400);
      }
      for (const B of s.leds) add(B.z, (c, d) => { if (B.side > 0) clipBehind(c, s, B.z, 1, xAt(B.z, B.u + B.w)); drawLED(c, s, B, d); }, B.u, B.w);
      add(820, (c, d) => drawBusShelter(c, s, 820, d), 380, 250);
    },

    dispose(s) {
      const tx = s.tex;
      if (tx) for (const c of [tx.T, tx.E, tx.wall, tx.wallE, tx.gate, tx.xw, tx.term, tx.sky, ...(tx.led || [])]) if (c && c.canvas) c.canvas.width = 0;
      s.tex = null; s.walls = null; s.G = null; s.gCtx = null;
    },
  });
})();
