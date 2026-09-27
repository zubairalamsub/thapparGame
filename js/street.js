// The street itself (shared by every road): footpath, curb, asphalt, lane markings,
// stop line + zebra crossing, one-way sign, and the traffic light.
//
// Optional palette keys in road.street (anything missing falls back to the default):
//   asphalt:   '#4a4a50'            road surface
//   footpath:  '#c2b59b'            paving tiles
//   curb:      ['#facc15', '#111']  alternating curb paint [a, b]
//   laneColor: '#e5e5e5'            lane dashes (stop line, zebra and "থামুন" stay white)
//   wet:       false                true = rain-darkened road with puddles that mirror the signal
// Colours may be '#rgb', '#rrggbb' or 'rgb()/rgba()' strings.
//
// Everything static is painted once per palette into an offscreen canvas at 2x-4x and blitted
// each frame. The traffic light body is cached per light state; only its glow and countdown
// (and, when wet, the lamp's reflection) are drawn live.
(function () {
  'use strict';
  const TH = window.TH;
  const { W, H, STOP_X, LANES } = TH;

  const DEF = { asphalt: '#4a4a50', footpath: '#c2b59b', curb: ['#facc15', '#111'], laneColor: '#e5e5e5' };
  const TOP = 200;                           // the cache covers y 200..600 (the sign board starts at 206)
  const DASH_Y = [445, 525];
  const ZEBRA_X = 652, ZEBRA_W = 58;
  const SIG_X = STOP_X + 26;                 // traffic light pole
  const SIGN_X = 250.5;                      // one-way sign pole
  const CLEAR_X0 = 596, CLEAR_X1 = 724;      // stop line + crossing: no cracks, patches or lane dashes here
  const FP_ROWS = [300, 314.3, 329.2, 345];  // paving rows, a touch taller toward the viewer
  const TAU = Math.PI * 2;
  const WHITE_PAINT = [242, 242, 238];
  const SIGN_TEXT = 'একমুখী রাস্তা', SIGN_FONT = `bold 11px ${TH.FONT}`;

  const LAMPS = [
    { name: 'red', y: 178, on: [255, 59, 48], hot: '#ffe3dc', off: [61, 21, 18] },
    { name: 'yellow', y: 198, on: [255, 196, 30], hot: '#fff6d2', off: [60, 46, 14] },
    { name: 'green', y: 218, on: [34, 226, 110], hot: '#e4ffec', off: [15, 48, 30] },
  ];
  const SEVEN = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]; // segments a..g per digit

  // ---------- colour helpers (colours are [r, g, b] arrays internally) ----------
  function parse(c, fb) {
    if (typeof c === 'string') {
      const s = c.trim();
      let m = /^#([0-9a-f]{3})$/i.exec(s);
      if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
      m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
      if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
      m = /^rgba?\(([^)]+)\)$/i.exec(s);
      if (m) {
        const v = m[1].trim().split(/[\s,/]+/).map(parseFloat);
        if (v.length >= 3 && v.slice(0, 3).every(isFinite)) return v.slice(0, 3);
      }
    }
    return fb ? parse(fb) : [128, 128, 128];
  }
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const rgba = (c, a = 1) => `rgba(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, t) => mix(c, t < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(t));
  const lerp = (a, b, t) => a + (b - a) * t;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function palette(road) {
    const o = (road && road.street) || {};
    const curb = Array.isArray(o.curb) ? o.curb : [];
    return {
      asphalt: parse(o.asphalt, DEF.asphalt),
      footpath: parse(o.footpath, DEF.footpath),
      curb: [parse(curb[0], DEF.curb[0]), parse(curb[1], DEF.curb[1])],
      lane: parse(o.laneColor, DEF.laneColor),
      wet: !!o.wet,
      seed: hash(String((road && road.id) || 'street')),
    };
  }

  // ---------- small drawing helpers ----------
  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }

  // n tiny squares in one path, one fill.
  function specks(g, rng, x, y, w, h, n, color, s0, s1) {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const s = s0 + rng() * (s1 - s0);
      g.rect(x + rng() * w, y + rng() * h, s, s);
    }
    g.fillStyle = color;
    g.fill();
  }

  // Soft radial smudge squashed to the ground plane (sy < 1).
  function blob(g, x, y, r, sy, c, a) {
    g.save();
    g.translate(x, y);
    g.scale(1, sy);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
    rg.addColorStop(0, rgba(c, a));
    rg.addColorStop(1, rgba(c, 0));
    g.fillStyle = rg;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }

  function strokePaths(g, list, dx, dy, color, width) {
    g.beginPath();
    for (const c of list) {
      g.moveTo(c[0] + dx, c[1] + dy);
      for (let i = 2; i < c.length; i += 2) g.lineTo(c[i] + dx, c[i + 1] + dy);
    }
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
  }

  // Random-walk crack lying on the ground (y foreshortened), with the odd branch.
  function crackWalk(rng, x, y, ang, n, out, depth) {
    const pts = [x, y];
    for (let i = 0; i < n; i++) {
      ang += (rng() - 0.5) * 1.2;
      const len = 4 + rng() * 9;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len * 0.45;
      pts.push(x, y);
      if (depth < 1 && rng() < 0.25) crackWalk(rng, x, y, ang + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.8), 2 + ((rng() * 3) | 0), out, depth + 1);
    }
    out.push(pts);
  }

  // ---------- static layers (painted once into the cache) ----------
  function layout(rng) {
    return {
      grates: [110 + rng() * 60, 420 + rng() * 120, 790 + rng() * 120], // gutter drains, clear of the crossing
      holes: [
        { x: 95 + rng() * 290, y: 393 + rng() * 9, rx: 21 },
        { x: 775 + rng() * 150, y: 553 + rng() * 7, rx: 23 },
      ],
    };
  }

  function paintFootpath(g, p, rng, lite) {
    const base = p.footpath, grout = shade(base, -0.34);
    g.fillStyle = rgba(grout);
    g.fillRect(0, 300, W, 45);

    // tiles in running bond; joints lean slightly toward a vanishing point at x 500
    const px = (X, y) => 500 + (X - 500) * (1 - (345 - y) * 0.0012);
    const tiles = [], gap = 0.55, rowTone = [0.03, 0, -0.025];
    for (let r = 0; r < 3; r++) {
      const y0 = FP_ROWS[r] + gap, y1 = FP_ROWS[r + 1] - gap;
      for (let X = -63 + (r % 2) * 21; X < W + 63; X += 42) {
        const q = [px(X, y0) + gap, y0, px(X + 42, y0) - gap, y0, px(X + 42, y1) - gap, y1, px(X, y1) + gap, y1];
        if (Math.max(q[2], q[4]) < 0 || Math.min(q[0], q[6]) > W) continue;
        tiles.push({ q, r });
      }
    }
    for (const t of tiles) {
      let c = shade(base, rowTone[t.r] + (rng() - 0.55) * 0.09);
      if (rng() < 0.12) c = mix(c, [176, 112, 86], 0.14);      // odd reddish paver
      else if (rng() < 0.1) c = mix(c, [120, 124, 120], 0.12); // grey replacement tile
      g.fillStyle = rgba(c);
      poly(g, t.q);
      g.fill();
    }
    // bevels: lit top/right edges, shaded bottom/left edges (sun from the upper right)
    const bevel = (a, b, dx, dy, color) => {
      g.beginPath();
      for (const { q } of tiles) { g.moveTo(q[a] + dx, q[a + 1] + dy); g.lineTo(q[b] + dx, q[b + 1] + dy); }
      g.strokeStyle = color; g.lineWidth = 0.8; g.stroke();
    };
    bevel(0, 2, 0, 0.5, 'rgba(255,255,255,0.3)');
    bevel(2, 4, -0.5, 0, 'rgba(255,255,255,0.14)');
    bevel(6, 4, 0, -0.5, 'rgba(0,0,0,0.2)');
    bevel(0, 6, 0.5, 0, 'rgba(0,0,0,0.12)');
    if (!lite) {
      specks(g, rng, 0, 300, W, 45, 900, rgba(shade(base, 0.4), 0.35), 0.4, 0.9);
      specks(g, rng, 0, 300, W, 45, 900, rgba(shade(base, -0.5), 0.22), 0.4, 0.9);
    }

    // wear and tear: cracked, chipped and sunken tiles, and one missing
    const vis = tiles.filter((t) => t.q[0] > 8 && t.q[2] < W - 8);
    const cracks = [];
    for (let i = 0; i < 10; i++) {
      const q = vis[(rng() * vis.length) | 0].q, kind = i % 4;
      if (kind === 0 || kind === 3) {
        const ax = lerp(q[0], q[2], 0.15 + rng() * 0.7), bx = lerp(q[6], q[4], 0.15 + rng() * 0.7);
        const mx = (ax + bx) / 2 + (rng() - 0.5) * 10, my = (q[1] + q[7]) / 2 + (rng() - 0.5) * 4;
        cracks.push([ax, q[1], mx, my, bx, q[7]]);
        if (rng() < 0.6) cracks.push([mx, my, mx + (rng() < 0.5 ? -1 : 1) * (6 + rng() * 8), Math.max(q[1], Math.min(q[7], my + (rng() - 0.5) * 7))]);
      } else if (kind === 1) {
        const ci = (rng() * 4) | 0, nx = ((ci + 1) % 4) * 2, pv = ((ci + 3) % 4) * 2;
        const [hz, vt] = ci % 2 === 0 ? [nx, pv] : [pv, nx];   // neighbour corners along the horizontal / slanted edge
        const cx = q[ci * 2], cy = q[ci * 2 + 1], fh = 0.1 + rng() * 0.15, fv = 0.4 + rng() * 0.45;
        const A = [lerp(cx, q[hz], fh), lerp(cy, q[hz + 1], fh)], B = [lerp(cx, q[vt], fv), lerp(cy, q[vt + 1], fv)];
        const M = [(A[0] + B[0]) / 2 + (rng() - 0.5) * 2, (A[1] + B[1]) / 2 + (rng() - 0.5) * 2];
        poly(g, [cx, cy, A[0], A[1], M[0], M[1], B[0], B[1]]);
        g.fillStyle = rgba(shade(grout, -0.3)); g.fill();
        g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(M[0], M[1]); g.lineTo(B[0], B[1]);
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.6; g.stroke();
      } else {
        poly(g, q); g.fillStyle = 'rgba(30,22,14,0.12)'; g.fill();
        g.beginPath(); g.moveTo(q[0], q[1] + 0.8); g.lineTo(q[2], q[3] + 0.8);
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.4; g.stroke();
      }
    }
    strokePaths(g, cracks, 0, 0, 'rgba(40,30,20,0.45)', 0.7);
    strokePaths(g, cracks, 0.55, 0.3, 'rgba(255,255,255,0.16)', 0.5);
    {
      const q = vis[(rng() * vis.length) | 0].q;
      poly(g, q); g.fillStyle = rgba(mix(grout, [88, 66, 46], 0.5)); g.fill();
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const u = rng(), v = 0.25 + rng() * 0.7, s = 0.6 + rng() * 1.1;
        g.rect(lerp(lerp(q[0], q[2], u), lerp(q[6], q[4], u), v), lerp(q[1], q[7], v), s, s * 0.6);
      }
      g.fillStyle = rgba(shade(base, 0.1), 0.75); g.fill();
      g.beginPath(); g.moveTo(q[0], q[1] + 1.2); g.lineTo(q[2], q[3] + 1.2);
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.moveTo(q[6], q[7] - 0.3); g.lineTo(q[4], q[5] - 0.3);
      g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 0.6; g.stroke();
    }

    // paan stains and gum spots
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = 20 + rng() * (W - 40), y = 304 + rng() * 37;
      for (let j = 0; j < 3; j++) {
        const ex = x + (rng() - 0.5) * 7, ey = y + (rng() - 0.5) * 2, rx = 1.2 + rng() * 3;
        g.moveTo(ex + rx, ey); g.ellipse(ex, ey, rx, rx * 0.4, 0, 0, TAU);
      }
    }
    g.fillStyle = 'rgba(128,30,24,0.2)'; g.fill();
    if (!lite) specks(g, rng, 0, 303, W, 40, 40, 'rgba(30,26,22,0.35)', 0.8, 1.5);
    for (let i = 0; i < 12; i++) blob(g, rng() * W, 302 + rng() * 42, 10 + rng() * 25, 0.35, [60, 45, 30], 0.05 + rng() * 0.06); // grime

    // weeds in the joints by the wall and the curb
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = 10 + rng() * (W - 20), y = i % 2 ? 301.4 : 344.6;
      for (let j = 0; j < 4; j++) { const bx = x + j * 1.1; g.moveTo(bx, y); g.lineTo(bx + (rng() - 0.5) * 3.5, y - 2 - rng() * 3.2); }
    }
    g.strokeStyle = '#5c7a2c'; g.lineWidth = 0.8; g.lineCap = 'round'; g.stroke();

    // contact shade where the paving meets the buildings; road dust near the curb
    let gr = g.createLinearGradient(0, 300, 0, 308);
    gr.addColorStop(0, 'rgba(20,14,8,0.34)'); gr.addColorStop(1, 'rgba(20,14,8,0)');
    g.fillStyle = gr; g.fillRect(0, 300, W, 8);
    gr = g.createLinearGradient(0, 335, 0, 345);
    gr.addColorStop(0, 'rgba(70,58,44,0)'); gr.addColorStop(1, 'rgba(70,58,44,0.13)');
    g.fillStyle = gr; g.fillRect(0, 335, W, 10);
    if (p.wet) { g.fillStyle = 'rgba(20,26,36,0.15)'; g.fillRect(0, 300, W, 45); }
  }

  function paintCurb(g, p, rng, L) {
    // blocks of 24 px: a lit top face (345..347.6) and a shaded front face (347.6..352)
    p.curb.forEach((c, k) => {
      const side = g.createLinearGradient(0, 347.6, 0, 352);
      side.addColorStop(0, rgba(shade(c, -0.03)));
      side.addColorStop(1, rgba(shade(c, -0.5)));
      g.beginPath();
      for (let x = k * 24; x < W; x += 48) g.rect(x, 345, 24, 2.6);
      g.fillStyle = rgba(shade(c, 0.24)); g.fill();
      g.beginPath();
      for (let x = k * 24; x < W; x += 48) g.rect(x, 347.6, 24, 4.4);
      g.fillStyle = side; g.fill();
    });
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(0, 344.5, W, 0.7);        // joint with the paving
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 345.2, W, 0.6);   // sunlit lip
    g.fillStyle = 'rgba(255,255,255,0.26)'; g.fillRect(0, 347.3, W, 0.5);  // rounded arris
    g.beginPath();
    for (let x = 24; x < W; x += 24) g.rect(x - 0.45, 345, 0.9, 7);
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fill();
    // paint chipped off the arris by a thousand wheels
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const x = rng() * W, w = 1.5 + rng() * 4.5, y = 346.6 + rng() * 1.8;
      g.moveTo(x, y); g.lineTo(x + w * 0.4, y - 0.7 - rng()); g.lineTo(x + w, y - 0.2);
      g.lineTo(x + w * 0.7, y + 1 + rng() * 1.6); g.lineTo(x + w * 0.2, y + 0.9); g.closePath();
    }
    g.fillStyle = 'rgb(156,151,140)'; g.fill();
    const gr = g.createLinearGradient(0, 349.4, 0, 352);
    gr.addColorStop(0, 'rgba(40,32,24,0)'); gr.addColorStop(1, 'rgba(40,32,24,0.38)');
    g.fillStyle = gr; g.fillRect(0, 349.4, W, 2.6);
    // drain inlets in the curb face above each grate
    for (const x of L.grates) {
      g.fillStyle = '#070707'; g.fillRect(x + 2, 348.5, 26, 3.1);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 2, 348.1, 26, 0.4);
    }
  }

  // Shadows of the two poles, thrown left by the sun from the upper right.
  function paintPoleShadows(g) {
    for (const [x, len] of [[SIGN_X, 58], [SIG_X, 72]]) {
      const sg = g.createLinearGradient(x, 0, x - len, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg;
      poly(g, [x + 2, 345.6, x + 2, 348.2, x - len, 348.2 - len * 0.13, x - len, 345.2 - len * 0.13]);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.ellipse(x - 1.5, 347.6, 8, 1.8, 0, 0, TAU); g.fill();
    }
  }

  function manhole(g, h, a) {
    const { x, y, rx } = h, ry = rx * 0.38;
    blob(g, x, y + 1, rx + 10, 0.42, shade(a, -0.5), 0.35);    // settled ring of asphalt
    let gr = g.createLinearGradient(x + rx, y - ry, x - rx, y + ry);
    gr.addColorStop(0, '#9a968f'); gr.addColorStop(0.5, '#5d5a55'); gr.addColorStop(1, '#34322f');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, rx + 2, ry + 1.1, 0, 0, TAU); g.fill();   // steel frame
    g.fillStyle = '#141312';
    g.beginPath(); g.ellipse(x, y, rx + 0.3, ry + 0.25, 0, 0, TAU); g.fill();
    gr = g.createRadialGradient(x + rx * 0.35, y - ry * 0.5, 1, x, y, rx);
    gr.addColorStop(0, '#6f6a62'); gr.addColorStop(1, '#383531');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, rx - 0.6, ry - 0.4, 0, 0, TAU); g.fill();  // cast-iron lid
    g.save();
    g.clip();
    g.beginPath();
    for (let i = -rx; i <= rx; i += 3.2) {
      g.moveTo(x + i - 4, y - ry); g.lineTo(x + i + 4, y + ry);
      g.moveTo(x + i + 4, y - ry); g.lineTo(x + i - 4, y + ry);
    }
    g.strokeStyle = 'rgba(0,0,0,0.26)'; g.lineWidth = 0.6; g.stroke();
    g.restore();
    g.beginPath(); g.ellipse(x, y, rx * 0.62, ry * 0.62, 0, 0, TAU);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.1; g.stroke();
    g.beginPath(); g.ellipse(x, y - 0.5, rx * 0.62, ry * 0.62, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.6; g.stroke();
    blob(g, x - rx * 0.3, y + ry * 0.2, rx * 0.5, 0.4, [120, 70, 35], 0.2);    // rust
    g.save();
    g.translate(x, y); g.scale(1, 0.42);
    g.font = `bold 6px ${TH.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillText('ঢাকা ওয়াসা', -0.4, 1, rx * 1.1);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillText('ঢাকা ওয়াসা', 0, 0, rx * 1.1);
    g.restore();
    g.beginPath(); g.ellipse(x, y, rx + 1.6, ry + 0.8, 0, Math.PI * 1.15, Math.PI * 1.85);
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 0.6; g.stroke();  // sunlit far rim
  }

  function grate(g, x) {
    const w = 30;
    g.fillStyle = '#26262a'; g.fillRect(x - 1, 352.2, w + 2, 9.4);
    g.fillStyle = '#050506'; g.fillRect(x + 0.8, 353.6, w - 1.6, 6.6);
    g.beginPath();
    for (let bx = x + 2.4; bx < x + w - 1.5; bx += 3.3) g.rect(bx, 353.6, 1.3, 6.6);
    g.fillStyle = '#505157'; g.fill();
    g.beginPath();
    for (let bx = x + 2.4; bx < x + w - 1.5; bx += 3.3) g.rect(bx + 0.9, 353.6, 0.4, 6.6);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x - 1, 361.2, w + 2, 0.5);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 1, 352.2, w + 2, 1.8);    // curb shadow
  }

  function paintAsphalt(g, p, rng, L, lite) {
    const a = p.wet ? shade(p.asphalt, -0.2) : p.asphalt;
    g.save();
    g.beginPath(); g.rect(0, 352, W, H - 352); g.clip();
    let gr = g.createLinearGradient(0, 352, 0, H);
    gr.addColorStop(0, rgba(shade(a, 0.06))); gr.addColorStop(0.45, rgba(a)); gr.addColorStop(1, rgba(shade(a, -0.1)));
    g.fillStyle = gr; g.fillRect(0, 352, W, H - 352);

    // broad mottling so the surface is not one flat slab
    for (let i = 0; i < 26; i++) {
      const light = rng() < 0.5;
      blob(g, rng() * W, 352 + rng() * 248, 40 + rng() * 90, 0.35, light ? [255, 255, 255] : [0, 0, 0], light ? 0.025 + rng() * 0.03 : 0.04 + rng() * 0.04);
    }

    // patch repairs (the first is a long, badly refilled utility trench), clear of the crossing
    const boxes = L.holes.map((h) => [h.x - h.rx - 8, h.y - 14, h.x + h.rx + 8, h.y + 14]);
    const patches = [];
    for (let tries = 0; patches.length < 6 && tries < 80; tries++) {
      const long = patches.length === 0;
      const w = long ? 220 + rng() * 60 : 40 + rng() * 90, h = long ? 7 + rng() * 3 : 14 + rng() * 26;
      const x = rng() * (W - w), y = 362 + rng() * (228 - h);
      if (x < CLEAR_X1 && x + w > CLEAR_X0) continue;
      if (y + h > 540 && x < 724 && x + w > 530) continue;  // keep the "থামুন" clean
      if (boxes.some((b) => x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1])) continue;
      boxes.push([x - 6, y - 6, x + w + 6, y + h + 6]);
      patches.push({ x, y, w, h });
    }
    for (const q of patches) {
      // hand-cut outline: a wobbly vertex every ~20 px
      const pts = [], j = (k) => (rng() - 0.5) * k;
      const nx = Math.max(2, Math.round(q.w / 20)), ny = Math.max(1, Math.round(q.h / 12));
      for (let i = 0; i < nx; i++) pts.push(q.x + (q.w * i) / nx + j(2), q.y + j(2.4));
      for (let i = 0; i < ny; i++) pts.push(q.x + q.w + j(2.4), q.y + (q.h * i) / ny + j(2));
      for (let i = nx; i > 0; i--) pts.push(q.x + (q.w * i) / nx + j(2), q.y + q.h + j(2.4));
      for (let i = ny; i > 0; i--) pts.push(q.x + j(2.4), q.y + (q.h * i) / ny + j(2));
      poly(g, pts);
      g.fillStyle = rgba(rng() < 0.6 ? shade(a, -0.055) : shade(a, 0.04)); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.11)'; g.lineWidth = 0.8; g.stroke();
      g.beginPath();                                 // sunlit seam along the top edge
      g.moveTo(pts[0], pts[1] + 0.7);
      for (let i = 1; i <= nx; i++) g.lineTo(pts[2 * i], pts[2 * i + 1] + 0.7);
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 0.7; g.stroke();
    }

    // aggregate: light stones, dark pits, warm grit
    if (!lite) {
      specks(g, rng, 0, 352, W, 248, 1800, rgba(shade(a, 0.34), 0.32), 0.45, 1.1);
      specks(g, rng, 0, 352, W, 248, 1800, rgba(shade(a, -0.45), 0.35), 0.45, 1.2);
      specks(g, rng, 0, 352, W, 248, 450, rgba(mix(a, [150, 130, 105], 0.5), 0.3), 0.6, 1.4);
    }

    // tar-sealed cracks (glossy) and open hairline cracks
    for (let i = 0; i < 3; i++) {
      const len = 70 + rng() * 120, right = rng() < 0.5;          // left of the stop area, or right of the crossing
      let x = right ? CLEAR_X1 + 6 + rng() * (W - CLEAR_X1 - 12 - len) : 6 + rng() * (CLEAR_X0 - 70 - len);
      let y = 372 + rng() * (right ? 212 : 150);                     // left side stays above the "থামুন"
      const pts = [x, y];
      for (let s = 0; s < len; s += 6) { x += 6; y += (rng() - 0.5) * 3; pts.push(x, y); }
      TH.line(g, pts, rgba(shade(a, -0.55), 0.8), 2.2);
      strokePaths(g, [pts], 0, -0.7, 'rgba(255,255,255,0.1)', 0.6);
    }
    const cracks = [];
    for (let i = 0; i < 8; i++) {
      let x = 30 + rng() * 670;                                         // 30..520 or 790..970
      if (x > 520) x += 270;                                            // hop over the stop area and crossing
      crackWalk(rng, x, 366 + rng() * 224, rng() * TAU, 5 + ((rng() * 6) | 0), cracks, 0);
    }
    for (const h of L.holes) for (let i = 0; i < 3; i++) crackWalk(rng, h.x + (rng() - 0.5) * h.rx * 2, h.y + (rng() < 0.5 ? -1 : 1) * h.rx * 0.4, rng() * TAU, 3, cracks, 1);
    strokePaths(g, cracks, 0, 0, rgba(shade(a, -0.6), 0.55), 0.8);
    strokePaths(g, cracks, 0.4, 0.6, 'rgba(255,255,255,0.08)', 0.5);

    // polished wheel tracks along each lane, a dustier strip by the dashes
    for (const gy of LANES) {
      gr = g.createLinearGradient(0, gy - 18, 0, gy + 3);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.075)');
      gr.addColorStop(0.8, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, gy - 18, W, 21);
    }
    for (const dy of DASH_Y) {
      gr = g.createLinearGradient(0, dy - 9, 0, dy + 13);
      gr.addColorStop(0, 'rgba(230,215,190,0)'); gr.addColorStop(0.5, 'rgba(230,215,190,0.035)'); gr.addColorStop(1, 'rgba(230,215,190,0)');
      g.fillStyle = gr; g.fillRect(0, dy - 9, W, 22);
    }

    // braking skid marks on the approach to the stop line
    for (let i = 0; i < 4; i++) {
      const gy = LANES[i % 3] - 3 - rng() * 8, x1 = 560 + rng() * 60, x0 = x1 - 50 - rng() * 90;
      const sg = g.createLinearGradient(x0, 0, x1, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.7, 'rgba(0,0,0,0.16)'); sg.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.strokeStyle = sg; g.lineWidth = 1.6; g.lineCap = 'round';
      const bend = (rng() - 0.5) * 3;
      g.beginPath();
      g.moveTo(x0, gy + bend); g.quadraticCurveTo((x0 + x1) / 2, gy - bend, x1, gy);
      g.moveTo(x0 + 8, gy + bend + 2.6); g.quadraticCurveTo((x0 + x1) / 2 + 4, gy - bend + 2.6, x1 - 2, gy + 2.6);
      g.stroke();
    }

    // oil drips where engines idle at the light, plus a few strays
    for (let i = 0; i < 8; i++) {
      const x = i < 5 ? 470 + rng() * 150 : rng() * W, y = LANES[(rng() * 3) | 0] - 22 - rng() * 30, r = 7 + rng() * 12;
      blob(g, x, y, r, 0.38, [8, 8, 10], 0.28 + rng() * 0.12);
      blob(g, x + (rng() - 0.5) * r, y + (rng() - 0.5) * r * 0.3, r * 0.6, 0.4, [8, 8, 10], 0.2);
      g.save();
      g.translate(x, y); g.scale(1, 0.38);
      const sh = g.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.05);
      sh.addColorStop(0, 'rgba(120,90,170,0)'); sh.addColorStop(0.5, 'rgba(90,150,170,0.07)');
      sh.addColorStop(0.8, 'rgba(170,130,80,0.05)'); sh.addColorStop(1, 'rgba(170,130,80,0)');
      g.fillStyle = sh; g.fillRect(-r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
      g.restore();
    }

    for (const h of L.holes) manhole(g, h, a);

    // the curb's shadow and gutter grime, then the drains and swept-up dust
    gr = g.createLinearGradient(0, 352, 0, 380);
    gr.addColorStop(0, 'rgba(0,0,0,0.36)'); gr.addColorStop(0.22, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 352, W, 28);
    for (const x of L.grates) grate(g, x);
    if (!lite) {
      g.beginPath();
      for (let i = 0; i < 520; i++) { const s = 0.4 + rng() * 0.8; g.rect(rng() * W, 352.6 + rng() * rng() * 9, s, s * 0.7); }
      g.fillStyle = 'rgba(200,182,146,0.3)'; g.fill();
    }
    const litter = ['rgba(236,232,220,0.7)', 'rgba(118,150,60,0.6)', 'rgba(190,120,70,0.6)'];
    for (let i = 0; i < 8; i++) {
      const x = rng() * W, y = 354.5 + rng() * 5, ang = (rng() - 0.5) * 1.4, w = 3 + rng() * 2.5;
      if (x > 600 && x < 725) continue;
      g.save();
      g.translate(x, y); g.rotate(ang); g.scale(1, 0.5);
      g.fillStyle = litter[i % 3];
      g.fillRect(-w / 2, -1.6, w, 3.2);
      g.restore();
    }
    g.restore();
  }

  function paintMarkings(g, p, rng, s, lite) {
    // paint goes on its own layer so wear can erase it without touching the asphalt
    const layer = lite ? null : makeCanvas(W * s, (H - TOP) * s);
    const m = layer ? layer.ctx : g;
    if (layer) m.setTransform(s, 0, 0, s, 0, -TOP * s);
    const rects = [];
    for (const y of DASH_Y) for (let x = 10; x < W; x += 60) if (x + 30 < STOP_X - 8 || x > ZEBRA_X + ZEBRA_W + 8) rects.push([x, y, 30, 4]);
    rects.push([STOP_X - 3, 354, 6, H - 354]);
    for (let y = 358; y < H; y += 24) rects.push([ZEBRA_X, y, ZEBRA_W, 12]);

    m.beginPath();                                   // lane dashes in the road's lane colour
    for (const r of rects) if (r[3] === 4) m.rect(r[0], r[1], r[2], r[3]);
    m.fillStyle = rgba(p.lane, 0.9); m.fill();
    m.beginPath();                                   // stop line and zebra always white
    for (const r of rects) if (r[3] !== 4) m.rect(r[0], r[1], r[2], r[3]);
    m.fillStyle = rgba(WHITE_PAINT, 0.9); m.fill();
    m.beginPath();                                   // paint thickness: hairline shade on the lower-left
    for (const r of rects) { m.rect(r[0], r[1] + r[3] - 0.6, r[2], 0.6); m.rect(r[0], r[1], 0.5, r[3]); }
    m.fillStyle = 'rgba(0,0,0,0.2)'; m.fill();
    m.beginPath();
    for (const r of rects) m.rect(r[0], r[1], r[2], 0.5);
    m.fillStyle = 'rgba(255,255,255,0.3)'; m.fill();

    // "থামুন" laid flat on lane 3, just before the stop line
    m.save();
    m.translate(586, 561); m.scale(1, 0.5);
    m.font = `bold 34px ${TH.FONT}`; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillStyle = rgba(WHITE_PAINT, 0.42);
    m.fillText('থামুন', 0, 0, 86);
    m.restore();

    if (layer) {
      m.globalCompositeOperation = 'destination-out';
      m.beginPath();
      const chip = (x, y, r) => { m.moveTo(x + r, y); m.ellipse(x, y, r, r * (0.45 + rng() * 0.35), 0, 0, TAU); };
      for (const r of rects) {
        const per = 2 * (r[2] + r[3]), thin = r[3] < 6 || r[2] < 7, k = thin ? 0.6 : 1;
        for (let i = 0, n = Math.ceil(per / 9); i < n; i++) {        // nibbled edges
          let u = rng() * per, ex, ey;
          if (u < r[2]) { ex = r[0] + u; ey = r[1]; }
          else if ((u -= r[2]) < r[3]) { ex = r[0] + r[2]; ey = r[1] + u; }
          else if ((u -= r[3]) < r[2]) { ex = r[0] + u; ey = r[1] + r[3]; }
          else { ex = r[0]; ey = r[1] + u - r[2]; }
          chip(ex, ey, (0.35 + rng() * 0.7) * k);
        }
        for (let i = 0, n = Math.ceil((r[2] * r[3]) / 90); i < n; i++) { // flaked chips, a few in small clusters
          const cx = r[0] + rng() * r[2], cy = r[1] + rng() * r[3];
          for (let j = rng() < 0.3 ? 3 : 1; j > 0; j--) chip(cx + (rng() - 0.5) * 3, cy + (rng() - 0.5) * 1.5, (0.3 + rng() * 0.6) * k);
        }
      }
      for (let i = 0; i < 55; i++) chip(542 + rng() * 88, 550 + rng() * 22, 0.3 + rng() * 0.6);
      m.fillStyle = 'rgba(0,0,0,0.9)'; m.fill();
      // patchy fading: whole dashes to different degrees, soft worn spots on the big stripes
      for (const r of rects) {
        if (r[3] === 4) {
          m.fillStyle = `rgba(0,0,0,${(rng() * 0.4).toFixed(3)})`;
          m.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2);
        } else if (r[2] === ZEBRA_W) {
          for (let i = 0; i < 2; i++) blob(m, r[0] + rng() * r[2], r[1] + rng() * r[3], 6 + rng() * 10, 0.5, [0, 0, 0], 0.2 + rng() * 0.3);
        } else {
          for (let y = r[1] + rng() * 20; y < H; y += 18 + rng() * 30) blob(m, r[0] + 3, y, 4 + rng() * 6, 1, [0, 0, 0], 0.2 + rng() * 0.35);
        }
      }
      for (const gy of LANES) blob(m, 676, gy - 7, 52, 0.22, [0, 0, 0], 0.5); // tyres scrub the crossing
      m.globalCompositeOperation = 'source-over';
      g.drawImage(layer.canvas, 0, TOP, W, H - TOP);
      layer.canvas.width = 0;
    }
    for (const gy of LANES) blob(g, 676, gy - 6, 56, 0.2, [16, 16, 16], 0.16);  // tyre grime on the paint
  }

  function paintPuddles(g, p, rng) {
    const list = [{ x: 676, y: 367, rx: 44, ry: 8.5 }];   // by the signal: it mirrors the lit lamp
    for (let i = 0; i < 5; i++) {
      const rx = 26 + rng() * 40;
      list.push({ x: 40 + rng() * 920, y: 385 + rng() * 200, rx, ry: rx * (0.18 + rng() * 0.08) });
    }
    for (const q of list) {
      blob(g, q.x, q.y, q.rx * 1.3, (q.ry * 1.9) / (q.rx * 1.3), [0, 0, 0], 0.2);  // damp halo
      g.beginPath();
      g.moveTo(q.x + q.rx, q.y); g.ellipse(q.x, q.y, q.rx, q.ry, 0, 0, TAU);
      const lobes = [[0.45, 0.35, 0.55, 0.8], [-0.5, -0.2, 0.45, 0.7]];
      for (const [ox, oy, sx, sy] of lobes) {
        const cx = q.x + q.rx * ox, cy = q.y + q.ry * oy;
        g.moveTo(cx + q.rx * sx, cy); g.ellipse(cx, cy, q.rx * sx, q.ry * sy, 0, 0, TAU);
      }
      const pg = g.createLinearGradient(0, q.y - q.ry, 0, q.y + q.ry);
      // mirrored scene: building bases at the far edge, bright sky at the near edge
      pg.addColorStop(0, 'rgba(22,22,28,0.34)'); pg.addColorStop(0.55, 'rgba(70,72,82,0.22)'); pg.addColorStop(1, 'rgba(226,218,204,0.26)');
      g.fillStyle = pg; g.fill();
      g.beginPath(); g.ellipse(q.x, q.y, q.rx, q.ry, 0, Math.PI * 1.08, Math.PI * 1.92);
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 0.6; g.stroke();
      blob(g, q.x + q.rx * 0.25, q.y + q.ry * 0.45, q.rx * 0.45, 0.2, [255, 250, 240], 0.12);   // sky glint
    }
    // the signal pole's dark, wavering reflection
    const pts = [];
    for (let y = 359.5; y <= 375; y += 0.8) pts.push(SIG_X + Math.sin(y * 0.9) * 0.5, y);
    strokePaths(g, [pts], 0, 0, 'rgba(12,14,20,0.32)', 2.6);
    // wet sheen on the whole road
    const sg = g.createLinearGradient(0, 352, 0, 480);
    sg.addColorStop(0, 'rgba(200,212,230,0.08)'); sg.addColorStop(1, 'rgba(200,212,230,0)');
    g.fillStyle = sg; g.fillRect(0, 352, W, 128);
  }

  function paintSign(g) {
    const x = SIGN_X;
    // galvanised pole lit from the right, rust at the foot, the board's shadow at the top
    let gr = g.createLinearGradient(x - 2.6, 0, x + 2.6, 0);
    gr.addColorStop(0, '#5b6067'); gr.addColorStop(0.62, '#c9ced4'); gr.addColorStop(1, '#6f747b');
    g.fillStyle = gr; g.fillRect(x - 2.6, 240, 5.2, 104);
    gr = g.createLinearGradient(0, 318, 0, 344);
    gr.addColorStop(0, 'rgba(120,70,35,0)'); gr.addColorStop(1, 'rgba(120,70,35,0.45)');
    g.fillStyle = gr; g.fillRect(x - 2.6, 318, 5.2, 26);
    gr = g.createLinearGradient(0, 245, 0, 258);
    gr.addColorStop(0, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 2.6, 245, 5.2, 13);
    g.fillStyle = '#3d4146'; g.fillRect(x - 3.4, 247.5, 6.8, 2.6);          // clamp band
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + 0.8, 247.8, 1.6, 2);

    // a "টু-লেট" notice and a torn older poster pasted on the pole
    g.save();
    g.translate(x, 296); g.rotate(-0.05);
    g.fillStyle = '#f3efe2'; g.fillRect(-4.8, -7, 9.6, 14);
    gr = g.createLinearGradient(-4.8, 0, 4.8, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(-4.8, -7, 9.6, 14);
    g.fillStyle = '#c62828'; g.font = `bold 3.8px ${TH.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('টু-লেট', 0, -3, 8.8);
    g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(-3.5, 0.6, 7, 0.6); g.fillRect(-3.5, 2.6, 5.2, 0.6);
    g.restore();
    poly(g, [x - 2.6, 316, x + 2.6, 315.4, x + 2.6, 321, x + 1.2, 322.6, x - 0.4, 320.8, x - 1.6, 323.4, x - 2.6, 321.6]);
    g.fillStyle = 'rgba(214,190,90,0.8)'; g.fill();

    // concrete footing
    g.fillStyle = '#8f8b82'; TH.rr(g, x - 6, 342, 12, 6, 1.5); g.fill();
    g.fillStyle = '#b5b1a7'; g.fillRect(x - 5.4, 342.3, 10.8, 1.3);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - 6, 346.5, 12, 1.5);

    // board: edge thickness, blue face with a sunlit sheen, white border
    g.fillStyle = '#0c2461'; TH.rr(g, 206, 207.4, 88.8, 38, 6); g.fill();
    gr = g.createLinearGradient(296, 206, 216, 250);
    gr.addColorStop(0, '#3e7af2'); gr.addColorStop(0.5, '#1d4ed8'); gr.addColorStop(1, '#173ea6');
    g.fillStyle = gr; TH.rr(g, 207.2, 206, 88.8, 38, 6); g.fill();
    gr = g.createLinearGradient(296, 206, 262, 242);
    gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = '#f8fafc'; g.lineWidth = 1.8; TH.rr(g, 210, 208.8, 83.2, 32.4, 4); g.stroke();

    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = SIGN_FONT;
    g.fillStyle = 'rgba(5,20,70,0.45)'; g.fillText(SIGN_TEXT, 251, 218.7, 72);
    g.fillStyle = '#fff'; g.fillText(SIGN_TEXT, 251.6, 218, 72);
    const arrow = (dx, dy) => poly(g, [217 + dx, 229.6 + dy, 271 + dx, 229.6 + dy, 271 + dx, 227 + dy, 287 + dx, 233.3 + dy,
      271 + dx, 239.6 + dy, 271 + dx, 237 + dy, 217 + dx, 237 + dy]);
    g.fillStyle = 'rgba(5,20,70,0.45)'; arrow(-0.6, 0.7); g.fill();
    g.fillStyle = '#fff'; arrow(0, 0); g.fill();
    g.fillStyle = '#1d4ed8'; g.font = `bold 5.4px ${TH.FONT}`;
    g.fillText('ONE WAY', 244, 233.5, 48);
  }

  function paintStatic(g, p, s, lite) {
    const rng = TH.mulberry32(p.seed);
    const L = layout(rng);
    paintFootpath(g, p, rng, lite);
    paintCurb(g, p, rng, L);
    paintPoleShadows(g);
    paintAsphalt(g, p, rng, L, lite);
    paintMarkings(g, p, rng, s, lite);
    if (p.wet) paintPuddles(g, p, rng);
    paintSign(g);
  }

  // ---------- offscreen cache ----------
  const cache = new Map();

  function makeCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w); canvas.height = Math.ceil(h);
    const ctx = canvas.getContext && canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }

  // Cache resolution: device px per world px rounded up, 2x at least and 4x at most.
  function cacheScale(ctx) {
    if (typeof ctx.getTransform !== 'function') return 2;
    const m = ctx.getTransform(), k = Math.hypot(m.a, m.b);
    return Number.isFinite(k) ? Math.max(2, Math.min(4, Math.ceil(k - 0.15))) : 2;
  }

  function dropCache(key) {
    const c = cache.get(key);
    if (c) c.canvas.width = 0;
    cache.delete(key);
  }

  // One texture per palette (the scale lives inside it), and only the last few palettes are kept:
  // at 4x each one is ~26 MB.
  function build(key, road, s, fw) {
    const c = makeCanvas(W * s, (H - TOP) * s);
    if (!c) return null;
    c.ctx.setTransform(s, 0, 0, s, 0, -TOP * s);
    paintStatic(c.ctx, palette(road), s, false);
    c.fw = fw; c.s = s;
    cache.set(key, c);
    while (cache.size > 3) dropCache(cache.keys().next().value);
    return c;
  }

  // Live reflection of the lit lamp in the wet road below the signal.
  function wetGlint(ctx, env) {
    const L = LAMPS.find((l) => l.name === env.light);
    if (!L) return;
    const a = 0.3 + 0.06 * Math.sin(((env && env.t) || 0) * 2.1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [y, sx, r, k] of [[368, 0.45, 12, 1], [410, 0.2, 56, 0.25]]) {
      ctx.save();
      ctx.translate(SIG_X + 1, y); ctx.scale(sx, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(L.on, a * k)); g.addColorStop(1, rgba(L.on, 0));
      ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.restore();
    }
    ctx.restore();
  }

  // Adds to the current path the segments of digit n that are lit (on) or dark (!on).
  function seven(ctx, n, x, y, w, h, t, on) {
    const bits = SEVEN[n], k = t / 2, gp = 0.4;
    const xl = x + k, xr = x + w - k, yt = y + k, ym = y + h / 2, yb = y + h - k;
    const hz = (yc) => {
      ctx.moveTo(xl + gp, yc); ctx.lineTo(xl + gp + k, yc - k); ctx.lineTo(xr - gp - k, yc - k);
      ctx.lineTo(xr - gp, yc); ctx.lineTo(xr - gp - k, yc + k); ctx.lineTo(xl + gp + k, yc + k); ctx.closePath();
    };
    const vt = (xc, y0, y1) => {
      ctx.moveTo(xc, y0 + gp); ctx.lineTo(xc + k, y0 + gp + k); ctx.lineTo(xc + k, y1 - gp - k);
      ctx.lineTo(xc, y1 - gp); ctx.lineTo(xc - k, y1 - gp - k); ctx.lineTo(xc - k, y0 + gp + k); ctx.closePath();
    };
    for (let i = 0; i < 7; i++) {
      if (!!(bits & (1 << i)) !== on) continue;
      if (i === 0) hz(yt); else if (i === 1) vt(xr, yt, ym); else if (i === 2) vt(xr, ym, yb);
      else if (i === 3) hz(yb); else if (i === 4) vt(xl, ym, yb); else if (i === 5) vt(xl, yt, ym); else hz(ym);
    }
  }

  // Dark signal housing (also used for the countdown box), lit along its right side.
  function housing(ctx, x, y, h, r) {
    const g = ctx.createLinearGradient(x - 15, 0, x + 15, 0);
    g.addColorStop(0, '#0a0c0f'); g.addColorStop(0.55, '#1f2329'); g.addColorStop(0.86, '#3a4049'); g.addColorStop(1, '#14171b');
    ctx.fillStyle = g;
    TH.rr(ctx, x - 15, y, 30, h, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(x - 8, y + 0.4, 16, 0.9);
  }

  // Traffic light body (pole, housing, lamps with the lit one, countdown face): static per light state.
  function paintLightBody(ctx, lamp) {
    const x = SIG_X;
    // pole: dark steel lit from the right, black-yellow safety bands, flared foot, bolted plate
    const steel = ctx.createLinearGradient(x - 3.5, 0, x + 3.5, 0);
    steel.addColorStop(0, '#1a1d21'); steel.addColorStop(0.62, '#6a717a'); steel.addColorStop(1, '#22252a');
    ctx.fillStyle = steel;
    ctx.fillRect(x - 3.5, 232, 7, 108);
    ctx.beginPath();
    ctx.moveTo(x - 3.5, 339); ctx.lineTo(x + 3.5, 339); ctx.lineTo(x + 5.5, 346); ctx.lineTo(x - 5.5, 346); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (let y = 312; y < 338; y += 8) ctx.rect(x - 3.5, y, 7, 4);
    ctx.fillStyle = '#e8b416'; ctx.fill();
    const tube = ctx.createLinearGradient(x - 3.5, 0, x + 3.5, 0);
    tube.addColorStop(0, 'rgba(0,0,0,0.5)'); tube.addColorStop(0.62, 'rgba(255,255,255,0.2)'); tube.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = tube; ctx.fill();
    ctx.fillStyle = '#2b2e33'; TH.rr(ctx, x - 9, 345.5, 18, 4.5, 1.2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x - 8.2, 345.7, 16.4, 0.8);
    TH.circle(ctx, x - 6.3, 348, 0.95, '#9aa1aa');
    TH.circle(ctx, x + 6.3, 348, 0.95, '#9aa1aa');

    // housing with a yellow retro-reflective border
    housing(ctx, x, 160, 76, 6);
    ctx.strokeStyle = 'rgba(232,180,22,0.85)'; ctx.lineWidth = 1.2;
    TH.rr(ctx, x - 13.5, 161.5, 27, 73, 4.8); ctx.stroke();

    for (const L of LAMPS) {
      const y = L.y, on = L === lamp;
      TH.circle(ctx, x, y, 8.6, '#040506');                                   // recess
      const lg = ctx.createRadialGradient(x + 1.6, y - 1.4, 0.4, x, y, 7);
      if (on) { lg.addColorStop(0, L.hot); lg.addColorStop(0.4, rgba(L.on)); lg.addColorStop(1, rgba(shade(L.on, -0.35))); }
      else { lg.addColorStop(0, rgba(shade(L.off, 0.14))); lg.addColorStop(1, rgba(shade(L.off, -0.3))); }
      TH.circle(ctx, x, y, 7, lg);
      ctx.beginPath(); ctx.arc(x, y, 4.7, 0, TAU); ctx.moveTo(x + 2.4, y); ctx.arc(x, y, 2.4, 0, TAU);
      ctx.strokeStyle = on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.6; ctx.stroke();
      const vs = ctx.createLinearGradient(0, y - 7, 0, y + 1);                // visor shades the lens top
      vs.addColorStop(0, on ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.55)'); vs.addColorStop(1, 'rgba(0,0,0,0)');
      TH.circle(ctx, x, y, 7, vs);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(x + 3.5, y + 0.8, 1.1, 1.8, 0.5, 0, TAU); ctx.fill();
      // visor hood, seen from the front
      ctx.beginPath(); ctx.arc(x, y, 10.3, Math.PI, TAU); ctx.arc(x, y + 1.9, 8.3, 0, Math.PI, true); ctx.closePath();
      ctx.fillStyle = '#060709'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 9.9, Math.PI * 1.52, Math.PI * 1.94);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8; ctx.stroke();
      if (on) {
        ctx.beginPath(); ctx.arc(x, y + 1.9, 8.1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.strokeStyle = rgba(L.on, 0.55); ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // countdown box below the lamps
    housing(ctx, x, 239, 24, 4);
    ctx.fillStyle = '#020303'; TH.rr(ctx, x - 12.5, 241.5, 25, 19, 2); ctx.fill();
  }

  // Gradients for the live parts, made once per context (they are in world coordinates).
  const liveGrads = new WeakMap();
  function lightGrads(ctx) {
    let o = liveGrads.get(ctx);
    if (o) return o;
    o = { glow: {} };
    for (const L of LAMPS) {
      const gg = ctx.createRadialGradient(SIG_X, L.y, 2, SIG_X, L.y, 34);
      gg.addColorStop(0, rgba(L.on, 0.55)); gg.addColorStop(0.28, rgba(L.on, 0.2)); gg.addColorStop(1, rgba(L.on, 0));
      o.glow[L.name] = gg;
    }
    o.gloss = ctx.createLinearGradient(SIG_X + 12, 241.5, SIG_X - 2, 256);
    o.gloss.addColorStop(0, 'rgba(255,255,255,0.1)'); o.gloss.addColorStop(1, 'rgba(255,255,255,0)');
    liveGrads.set(ctx, o);
    return o;
  }

  const LB = { x: SIG_X - 22, y: 156, w: 44, h: 196 };   // body cache box (world units)
  const lightCache = new Map();
  let lightScale = 0;

  TH.street = {
    // env: { t, light, lightT, road }   road.street may carry palette overrides (see the top of this file)
    draw(ctx, env) {
      const road = env && env.road, o = (road && road.street) || {};
      const s = cacheScale(ctx);
      const key = [road && road.id, o.asphalt, o.footpath, o.curb, o.laneColor, !!o.wet].join('|');
      ctx.save();
      ctx.font = SIGN_FONT;
      const fw = ctx.measureText(SIGN_TEXT).width;  // changes once the web font arrives: repaint then
      let c = cache.get(key);
      if (c && (c.s !== s || Math.abs(c.fw - fw) > 0.5)) { dropCache(key); c = null; }
      if (c) { cache.delete(key); cache.set(key, c); }   // most recently used goes last
      else c = build(key, road, s, fw);
      if (c) ctx.drawImage(c.canvas, 0, TOP, W, H - TOP);
      else paintStatic(ctx, palette(road), 1, true);
      if (o.wet) wetGlint(ctx, env);
      ctx.restore();
    },

    drawTrafficLight(ctx, env) {
      const x = SIG_X, lamp = LAMPS.find((l) => l.name === (env && env.light));
      const col = lamp ? lamp.on : [170, 170, 170];
      const gr = lightGrads(ctx);

      const s = cacheScale(ctx), key = lamp ? lamp.name : 'off';
      if (s !== lightScale) { for (const c of lightCache.values()) c.canvas.width = 0; lightCache.clear(); lightScale = s; }
      let c = lightCache.get(key);
      if (!c) {
        c = makeCanvas(LB.w * s, LB.h * s);
        if (c) { c.ctx.setTransform(s, 0, 0, s, -LB.x * s, -LB.y * s); paintLightBody(c.ctx, lamp); lightCache.set(key, c); }
      }
      if (c) ctx.drawImage(c.canvas, LB.x, LB.y, LB.w, LB.h);
      else paintLightBody(ctx, lamp);

      if (lamp) {                                                               // glow on the lit lamp
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gr.glow[lamp.name]; ctx.fillRect(x - 34, lamp.y - 34, 68, 68);
        ctx.restore();
      }

      // 7-segment countdown
      const lt = env && Number.isFinite(env.lightT) ? env.lightT : 0;
      const v = Math.max(0, Math.min(99, Math.ceil(lt)));
      const digits = [(v / 10) | 0, v % 10];
      ctx.save();
      ctx.transform(1, 0, -0.1, 1, 25.1, 0);                                    // italic lean about y 251
      for (const on of [false, true]) {
        ctx.beginPath();
        digits.forEach((d, i) => seven(ctx, d, x - 10 + i * 11.6, 244, 8.4, 14, 2, on));
        if (on) { ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = 5; ctx.fillStyle = rgba(mix(col, [255, 255, 255], 0.2)); }
        else ctx.fillStyle = rgba(col, 0.1);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = gr.gloss; TH.rr(ctx, x - 12.5, 241.5, 25, 19, 2); ctx.fill();
    },
  };
})();
