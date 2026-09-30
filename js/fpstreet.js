// First-person street kit (TH.fpStreet): the ground and the street furniture every road shares.
// See js/FP_CONTRACT.md §7.
//
// drawGround(ctx, env) — the ground from the camera to the far clip:
//   * "mode-7" bands: the whole street cross-section (left sidewalk, opposite carriageway, median,
//     rickshaw carriageway, curb, right sidewalk) is painted once per palette into an offscreen
//     texture that tiles along z. Every frame the ground is drawn as thin horizontal screen bands;
//     each band samples the texture rows at its depth and is stretched over the u-range visible
//     there. Far bands sample z-averaged mip levels, so detail fades out instead of shimmering.
//   * crisp vector work on top: lane dashes (faint continuous lines far away), one-way arrows
//     pointing toward the camera, the stop line, "থামুন" (painted for the oncoming drivers), the
//     zebra, the raised curbs and median (faces + tops); at night, pools of lamp light (flattened
//     glows the engine adds after its lighting tint).
// add(env, add) — street furniture as depth-sorted items: the traffic signal (sidewalk pole and a
//   mast arm over the lanes, visored heads and 7-segment countdowns facing the camera), street
//   lamps on the right curb and the median, the "একমুখী রাস্তা" sign, and the median fence and
//   plants in segments (200 units near, longer and simpler far away).
//
// Palette: env.fr.street (keys in FP_CONTRACT.md §7, plus lampSkip and fill), else the Classic
// road.street keys (asphalt, footpath, curb, laneColor), else defaults close to the Classic street.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = TH.fp;
  const { CX, HY, F, NEAR, U } = fp;
  const cam = fp.cam;
  const CH = fp.CURB_H;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- layout (FP units) ----------
  const STOP_Z = TH.STOP_X * fp.DZ;               // 1280
  const ZEB0 = 1304, ZEB1 = 1420;                 // zebra crossing
  const CLEAR0 = STOP_Z - 44, CLEAR1 = ZEB1 + 18; // no lane dashes on the approach and the crossing
  const HM = 14;                                  // median kerb height
  const CW = 12;                                  // curb top width
  const FENCE_U = -250;                           // median railing line
  const SIG_Z = STOP_Z + 14, SIG_U = 252, HEAD_U = 62;
  const SIGN_Z = 1100, SIGN_U = 420, SIGN_TOP = 308; // high on the building side: clear of the signal from every lane
  const THAMUN_Z = 1182;
  const THAMUN_FOR_DRIVERS = false;               // true: paint it for the oncoming drivers (upside down to the player)
  const ARROW_Z = [1620, 900, 60, -800, -1660];
  const ARROW_PTS = [-72, -5.5, 22, -5.5, 22, -18, 72, 0, 22, 18, 22, 5.5, -72, 5.5]; // (dz, du), tip toward +z
  const ARROW_NEAR = 700; // nearer arrows are painted a little fainter so the foreground stays calm

  // ground texture: u from U0 to U1 across, TL units along z (1 texel per unit), TU texels per unit across
  const U0 = -820, U1 = 480, UW = U1 - U0;
  const TU = 1.6, TL = 640;
  const BLOCK = 64;                               // curb paint block (the period, 2 * BLOCK, divides TL)
  const DASH = 64, DASH_P = 128, DASH_W = 7;
  const DASH_LOD = 1000;                          // nearer: dashes; farther: a faint continuous line
  const CURB_LOD = 720;                           // nearer: painted curb blocks; farther: one blended colour

  const LAMPS = [
    { name: 'red', y: 21, on: [255, 59, 48], hot: '#ffe3dc', off: [61, 21, 18], hex: '#ff3b30' },
    { name: 'yellow', y: 50, on: [255, 196, 30], hot: '#fff6d2', off: [60, 46, 14], hex: '#ffc41e' },
    { name: 'green', y: 79, on: [34, 226, 110], hot: '#e4ffec', off: [15, 48, 30], hex: '#22e26e' },
  ];
  const SEVEN = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
  const SIGN_TEXT = 'একমুখী রাস্তা';

  // ---------- colour helpers ([r, g, b] arrays internally) ----------
  function parse(c, fb) {
    if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(isFinite)) return c.slice(0, 3);
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
    return fb !== undefined ? parse(fb) : [128, 128, 128];
  }
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const rgba = (c, a = 1) => (a >= 1 ? `rgb(${cl(c[0])},${cl(c[1])},${cl(c[2])})`
    : `rgba(${cl(c[0])},${cl(c[1])},${cl(c[2])},${Math.max(0, a).toFixed(3)})`);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, t) => mix(c, t < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(t));
  const hex = (c) => '#' + c.map((v) => cl(v).toString(16).padStart(2, '0')).join('');
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // ---------- palette ----------
  const DEF = {
    asphalt: '#4a4a50', lane: '#e5e5e5', stop: '#f2f2ee', sidewalk: '#c2b59b', curb: ['#facc15', '#161616'],
    median: '#a39e92', medianTop: '#5f7249', fence: '#d8d2c2', lampStyle: 'pole', lampEvery: 700,
  };
  let memo = { fs: null, cs: null, id: null, P: null };
  function palette(env) {
    const fs = (env && env.fr && env.fr.street) || null;
    const cs = (env && env.road && env.road.street) || null;
    const id = (env && env.road && env.road.id) || (env && env.fr && env.fr.id) || 'street';
    if (memo.P && memo.fs === fs && memo.cs === cs && memo.id === id) return memo.P;
    const f = fs || {}, c = cs || {};
    const has = (v) => v !== undefined && v !== null && v !== '';
    const asphalt = parse(has(f.asphalt) ? f.asphalt : c.asphalt, DEF.asphalt);
    const sidewalk = parse(has(f.sidewalk) ? f.sidewalk : c.footpath, DEF.sidewalk);
    const cb = Array.isArray(f.curb) ? f.curb : Array.isArray(c.curb) ? c.curb : DEF.curb;
    const style = ['pole', 'sodium', 'none'].includes(f.lampStyle) ? f.lampStyle : DEF.lampStyle;
    const every = Number(f.lampEvery);
    const P = {
      asphalt,
      asphaltOpp: has(f.asphaltOpp) ? parse(f.asphaltOpp, DEF.asphalt) : shade(asphalt, -0.045),
      lane: parse(has(f.lane) ? f.lane : c.laneColor, DEF.lane),
      stop: parse(f.stop, DEF.stop),
      sidewalk,
      sidewalkL: has(f.sidewalkL) ? parse(f.sidewalkL, DEF.sidewalk) : shade(sidewalk, -0.07),
      curb: [parse(cb[0], DEF.curb[0]), parse(cb[1], DEF.curb[1])],
      median: parse(f.median, DEF.median),
      medianTop: parse(f.medianTop, DEF.medianTop),
      fence: parse(f.fence, DEF.fence),
      lampStyle: style,
      lampEvery: clamp(every > 0 ? every : DEF.lampEvery, 240, 4000),
      lampSkip: skipRanges(f.lampSkip !== undefined ? f.lampSkip : c.lampSkip),
      fill: (f.fill || c.fill) === 'street' ? 'street' : 'all', // 'street': leave the ground beyond the building lines to drawSky
    };
    const cols = [P.asphalt, P.asphaltOpp, P.lane, P.stop, P.sidewalk, P.sidewalkL, P.curb[0], P.curb[1], P.median, P.medianTop];
    P.key = cols.map(hex).join('') + '|' + id;
    P.seed = hashStr(P.key);
    P.css = makeCss(P);
    memo = { fs, cs, id, P };
    return P;
  }
  // lampSkip: [[z0, z1], ...] — no curb or median lamp inside these z ranges (e.g. under a flyover).
  function skipRanges(v) {
    const out = [];
    if (Array.isArray(v)) {
      for (const r of v) {
        if (Array.isArray(r) && r.length >= 2 && Number.isFinite(+r[0]) && Number.isFinite(+r[1])) out.push([Math.min(+r[0], +r[1]), Math.max(+r[0], +r[1])]);
      }
    }
    return out;
  }
  function makeCss(P) {
    const leaf = mix(P.medianTop, [70, 120, 50], 0.55);
    return {
      base: rgba(shade(P.sidewalk, -0.1)), // beyond the texture (under or behind set-back buildings)
      asphalt: rgba(P.asphalt), asphaltOpp: rgba(P.asphaltOpp), sidewalk: rgba(P.sidewalk), sidewalkL: rgba(P.sidewalkL),
      lane: rgba(P.lane, 0.86), laneFar: rgba(P.lane, 0.34),
      stop: rgba(P.stop, 0.9), paint: rgba(P.stop, 0.8), paintNear: rgba(P.stop, 0.64), thamun: rgba(P.stop, 0.66),
      scrub: 'rgba(30,28,26,0.17)',
      curbA: rgba(shade(P.curb[0], 0.06)), curbB: rgba(shade(P.curb[1], 0.06)), curbMix: rgba(mix(P.curb[0], P.curb[1], 0.42)),
      faceShade: 'rgba(0,0,0,0.3)', concFace: rgba(shade(P.median, -0.14)),
      medFace: rgba(shade(P.median, -0.1)), medLip: rgba(shade(P.median, 0.14)), medTop: rgba(P.medianTop),
      fence: rgba(P.fence), fenceMesh: rgba(P.fence, 0.2), fenceMid: rgba(P.fence, 0.4),
      fenceFar: rgba(mix(P.fence, leaf, 0.55), 0.5),
      bushHi: rgba(shade(leaf, 0.2)), hedge: rgba(shade(leaf, -0.05), 0.8),
      bushLo: rgba(shade(leaf, -0.28)),
      trunk: '#5b4a36', canopy: rgba(shade(leaf, -0.22)), canopyHi: rgba(shade(leaf, 0.1)), bloom: '#e0532f', // krishnachura in flower
    };
  }

  // ---------- projection helpers (lean: no closePath, fill() closes subpaths) ----------
  const zNear = () => cam.z - NEAR - 0.5;
  // Flat quad z0..z1 × u0..u1 at height h, added to the current path. z is clamped to the near plane.
  function gq(ctx, z0, z1, u0, u1, h) {
    const zn = zNear();
    if (z1 > zn) z1 = zn;
    if (z1 <= z0) return false;
    const s0 = F / (cam.z - z0), s1 = F / (cam.z - z1), e = cam.h - h;
    const ya = HY + e * s0, yb = HY + e * s1;
    ctx.moveTo(CX + (u0 - cam.u) * s0, ya);
    ctx.lineTo(CX + (u1 - cam.u) * s0, ya);
    ctx.lineTo(CX + (u1 - cam.u) * s1, yb);
    ctx.lineTo(CX + (u0 - cam.u) * s1, yb);
    return true;
  }
  // Vertical quad along the road at lateral u, heights h0..h1.
  function wq(ctx, z0, z1, u, h0, h1) {
    const zn = zNear();
    if (z1 > zn) z1 = zn;
    if (z1 <= z0) return false;
    const s0 = F / (cam.z - z0), s1 = F / (cam.z - z1), du = u - cam.u;
    const x0 = CX + du * s0, x1 = CX + du * s1;
    ctx.moveTo(x0, HY + (cam.h - h0) * s0);
    ctx.lineTo(x0, HY + (cam.h - h1) * s0);
    ctx.lineTo(x1, HY + (cam.h - h1) * s1);
    ctx.lineTo(x1, HY + (cam.h - h0) * s1);
    return true;
  }
  // Curb block: face (u, 0..h) plus top (u..u+w at h) as one polygon.
  function blockPoly(ctx, z0, z1, u, w, h, face) {
    const zn = zNear();
    if (z1 > zn) z1 = zn;
    if (z1 <= z0) return;
    const s0 = F / (cam.z - z0), s1 = F / (cam.z - z1);
    const a0 = CX + (u - cam.u) * s0, a1 = CX + (u - cam.u) * s1;
    const b0 = CX + (u + w - cam.u) * s0, b1 = CX + (u + w - cam.u) * s1;
    const t0 = HY + (cam.h - h) * s0, t1 = HY + (cam.h - h) * s1;
    if (face) {
      ctx.moveTo(a0, HY + cam.h * s0); ctx.lineTo(a1, HY + cam.h * s1); ctx.lineTo(a1, t1);
    } else ctx.moveTo(a1, t1);
    ctx.lineTo(b1, t1); ctx.lineTo(b0, t0); ctx.lineTo(a0, t0);
  }
  // Camera-facing rectangle at depth z (one call).
  function rectAt(ctx, z, u0, u1, h0, h1) {
    const d = cam.z - z;
    if (!(d > NEAR)) return false;
    const s = F / d;
    ctx.rect(CX + (u0 - cam.u) * s, HY + (cam.h - h1) * s, (u1 - u0) * s, (h1 - h0) * s);
    return true;
  }

  // Visible region in world-layer logical px (the engine may roll the view about (CX, 300)).
  const CORNERS = [[0, 0], [1000, 0], [0, 600], [1000, 600]];
  function viewBox(ctx) {
    let x0 = -12, x1 = 1012, y1 = 612;
    if (typeof ctx.getTransform === 'function') {
      const m = ctx.getTransform();
      const th = m ? Math.atan2(m.b, m.a) : 0;
      if (Number.isFinite(th) && Math.abs(th) > 1e-3) {
        const c = Math.cos(th), s = Math.sin(th);
        x0 = Infinity; x1 = -Infinity; y1 = -Infinity;
        for (const [X, Y] of CORNERS) {
          const dx = X - CX, dy = Y - 300;
          const wx = CX + dx * c + dy * s, wy = 300 - dx * s + dy * c;
          x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
        }
        x0 -= 12; x1 += 12; y1 += 12;
      }
    }
    return { x0, x1, y1: Math.min(y1, 1400) };
  }

  // ---------- ground texture (painted in world units: x = u, y = z within the tile) ----------
  function fillW(g, u, z, w, h) { // fillRect that wraps along z
    g.fillRect(u, z, w, h);
    if (z < 0) g.fillRect(u, z + TL, w, h);
    if (z + h > TL) g.fillRect(u, z - TL, w, h);
  }
  function rectW(g, u, z, w, h) { // path rect that wraps along z
    g.rect(u, z, w, h);
    if (z < 0) g.rect(u, z + TL, w, h);
    if (z + h > TL) g.rect(u, z - TL, w, h);
  }
  // Soft radial smudge (radius r across, r * sz along the road), wrapping along z.
  function blob(g, u, z, r, c, a, sz = 1) {
    const one = (zz) => {
      g.save();
      g.translate(u, zz); g.scale(1, sz);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, rgba(c, a)); rg.addColorStop(1, rgba(c, 0));
      g.fillStyle = rg; g.fillRect(-r, -r, 2 * r, 2 * r);
      g.restore();
    };
    const ext = r * sz;
    one(z);
    if (z - ext < 0) one(z + TL);
    if (z + ext > TL) one(z - TL);
  }
  function specks(g, rng, u0, u1, n, color, s0, s1) {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const s = s0 + rng() * (s1 - s0);
      g.rect(u0 + rng() * (u1 - u0), rng() * TL, s, s * (0.6 + rng() * 0.7));
    }
    g.fillStyle = color; g.fill();
  }
  function crackWalk(rng, u, z, ang, n, out, depth) {
    const pts = [u, z];
    for (let i = 0; i < n; i++) {
      ang += (rng() - 0.5) * 1.1;
      const len = 4 + rng() * 10;
      u += Math.cos(ang) * len; z += Math.sin(ang) * len;
      pts.push(u, z);
      if (depth < 1 && rng() < 0.25) crackWalk(rng, u, z, ang + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.8), 2 + ((rng() * 3) | 0), out, depth + 1);
    }
    out.push(pts);
  }
  // Strokes polylines three times (z − TL, z, z + TL) so they wrap across the tile seam.
  function strokeW(g, list, color, width, dz = 0) {
    g.beginPath();
    for (const off of [-TL, 0, TL]) {
      for (const c of list) {
        g.moveTo(c[0], c[1] + off + dz);
        for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1] + off + dz);
      }
    }
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    g.stroke();
  }
  function polyW(g, pts, color, stroke) {
    for (const off of [-TL, 0, TL]) {
      g.beginPath();
      g.moveTo(pts[0], pts[1] + off);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1] + off);
      g.closePath();
      g.fillStyle = color; g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.9; g.stroke(); }
    }
  }
  // Hand-cut patch outline: a wobbly vertex every ~20 units.
  function handCut(rng, u, z, w, h) {
    const pts = [], j = (k) => (rng() - 0.5) * k;
    const nu = Math.max(2, Math.round(w / 20)), nz = Math.max(2, Math.round(h / 20));
    for (let i = 0; i < nu; i++) pts.push(u + (w * i) / nu + j(2), z + j(2.5));
    for (let i = 0; i < nz; i++) pts.push(u + w + j(2.5), z + (h * i) / nz + j(2));
    for (let i = nu; i > 0; i--) pts.push(u + (w * i) / nu + j(2), z + h + j(2.5));
    for (let i = nz; i > 0; i--) pts.push(u + j(2.5), z + (h * i) / nz + j(2));
    return pts;
  }

  // Paved sidewalk u0..u1. curbU: the edge at the road; wallU: the building line.
  function paintWalk(g, rng, base, u0, u1, curbU, wallU) {
    const grout = shade(base, -0.3);
    g.fillStyle = rgba(grout); g.fillRect(u0, 0, u1 - u0, TL);
    const dir = Math.abs(curbU - u0) < Math.abs(curbU - u1) ? 1 : -1; // tiles are laid from the curb
    // Courses run across the road, so the long joints lie flat on the screen; the short joints
    // between tiles (along the road) are staggered course to course.
    const RZ = 40, TW = 44, gap = 1.2;
    const tiles = [];
    for (let k = 0; k < TL / RZ; k++) {
      const off = (k % 2) * (TW / 2);
      for (let j = -1; j < 20; j++) {
        const a = curbU + dir * (j * TW + off), b = a + dir * TW;
        const ua = Math.max(u0, Math.min(a, b)), ub = Math.min(u1, Math.max(a, b));
        if (ub - ua < 1.5) continue;
        let c = shade(base, [0.025, 0, -0.018, 0.01][k % 4] + (rng() - 0.55) * 0.085);
        const q = rng();
        if (q < 0.1) c = mix(c, [176, 112, 86], 0.15); else if (q < 0.17) c = mix(c, [118, 122, 118], 0.14);
        tiles.push({ u: ua + gap * 0.3, w: ub - ua - gap * 0.6, z: k * RZ + gap / 2, h: RZ - gap, c, k });
      }
    }
    for (const t of tiles) { g.fillStyle = rgba(t.c); g.fillRect(t.u, t.z, t.w, t.h); }
    // bevels: a lit edge facing the camera (+z) and a shaded far edge, both flat on the screen
    g.beginPath(); for (const t of tiles) g.rect(t.u, t.z + t.h - 1.1, t.w, 1.1); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fill();
    g.beginPath(); for (const t of tiles) g.rect(t.u, t.z, t.w, 1); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fill();
    const area = (u1 - u0) * TL;
    specks(g, rng, u0, u1, area / 55, rgba(shade(base, 0.35), 0.35), 0.5, 1.1);
    specks(g, rng, u0, u1, area / 55, rgba(shade(base, -0.45), 0.25), 0.5, 1.1);

    // wear: cracked, sunken and missing tiles
    const vis = tiles.filter((t) => t.z >= 0 && t.z + t.h <= TL && Math.abs((t.u + t.w / 2) - wallU) > 24);
    const cracks = [];
    for (let i = 0; i < 9 && vis.length; i++) {
      const t = vis[(rng() * vis.length) | 0];
      if (i % 3 === 2) {
        g.fillStyle = 'rgba(30,22,14,0.13)'; g.fillRect(t.u, t.z, t.w, t.h);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(t.u, t.z, t.w, 1.6);
      } else {
        const za = t.z + t.h * (0.15 + rng() * 0.7), zb = t.z + t.h * (0.15 + rng() * 0.7);
        const mu = t.u + t.w * (0.35 + rng() * 0.3), mz = (za + zb) / 2 + (rng() - 0.5) * 10;
        cracks.push([t.u, za, mu, mz, t.u + t.w, zb]);
      }
    }
    strokeW(g, cracks, 'rgba(40,30,20,0.45)', 0.7);
    strokeW(g, cracks, 'rgba(255,255,255,0.14)', 0.5, 0.6);
    if (vis.length) {
      const t = vis[(rng() * vis.length) | 0];
      g.fillStyle = rgba(mix(grout, [88, 66, 46], 0.5)); g.fillRect(t.u, t.z, t.w, t.h);
      g.beginPath();
      for (let i = 0; i < 16; i++) { const s = 0.7 + rng() * 1.2; g.rect(t.u + rng() * t.w, t.z + rng() * t.h, s, s * 0.8); }
      g.fillStyle = rgba(shade(base, 0.1), 0.75); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(t.u, t.z, t.w, 2.2);
    }
    // paan stains, gum spots, grime
    for (let i = 0; i < 9; i++) {
      const u = u0 + 6 + rng() * (u1 - u0 - 12), z = rng() * TL;
      for (let j = 0; j < 3; j++) blob(g, u + (rng() - 0.5) * 7, z + (rng() - 0.5) * 7, 1.6 + rng() * 3, [128, 30, 24], 0.32);
    }
    g.beginPath();
    for (let i = 0; i < 60; i++) { const u = u0 + rng() * (u1 - u0), z = rng() * TL, r = 0.5 + rng() * 0.9; g.moveTo(u + r, z); g.ellipse(u, z, r, r, 0, 0, TAU); }
    g.fillStyle = 'rgba(30,26,22,0.35)'; g.fill();
    for (let i = 0; i < 14; i++) blob(g, u0 + rng() * (u1 - u0), rng() * TL, 12 + rng() * 30, [60, 45, 30], 0.05 + rng() * 0.07);
    // contact shade at the buildings, the dark ground under them, dust by the curb
    const wd = dir > 0 ? -1 : 1; // from the wall back toward the road
    let gr = g.createLinearGradient(wallU, 0, wallU + wd * 18, 0);
    gr.addColorStop(0, 'rgba(20,14,8,0.34)'); gr.addColorStop(1, 'rgba(20,14,8,0)');
    g.fillStyle = gr; g.fillRect(Math.min(wallU, wallU + wd * 18), 0, 18, TL);
    gr = g.createLinearGradient(curbU, 0, curbU + dir * 16, 0);
    gr.addColorStop(0, 'rgba(90,76,58,0.16)'); gr.addColorStop(1, 'rgba(90,76,58,0)');
    g.fillStyle = gr; g.fillRect(Math.min(curbU, curbU + dir * 16), 0, 16, TL);
    // weeds in the joints by the wall and the curb
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const u = i % 2 ? wallU + wd * (1.5 + rng() * 2) : curbU + dir * (1.2 + rng() * 2), z = rng() * TL;
      for (let j = 0; j < 4; j++) { const bz = z + j * 1.2; g.moveTo(u, bz); g.lineTo(u + (rng() - 0.5) * 4, bz + (rng() - 0.5) * 3); }
    }
    g.strokeStyle = '#5c7a2c'; g.lineWidth = 0.9; g.lineCap = 'round'; g.stroke();
  }

  function manhole(g, u, z, r, a) {
    for (const off of [0, z - r < 0 ? TL : z + r > TL ? -TL : null]) {
      if (off === null) continue;
      const zz = z + off;
      g.fillStyle = rgba(shade(a, -0.35), 0.45);
      g.beginPath(); g.ellipse(u, zz, r + 7, r + 7, 0, 0, TAU); g.fill();
      let gr = g.createLinearGradient(u + r, zz - r, u - r, zz + r);
      gr.addColorStop(0, '#9a968f'); gr.addColorStop(0.5, '#5d5a55'); gr.addColorStop(1, '#34322f');
      g.fillStyle = gr; g.beginPath(); g.ellipse(u, zz, r + 2.4, r + 2.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#141312'; g.beginPath(); g.ellipse(u, zz, r + 0.4, r + 0.4, 0, 0, TAU); g.fill();
      gr = g.createRadialGradient(u + r * 0.3, zz - r * 0.3, 1, u, zz, r);
      gr.addColorStop(0, '#6f6a62'); gr.addColorStop(1, '#383531');
      g.fillStyle = gr; g.beginPath(); g.ellipse(u, zz, r - 0.7, r - 0.7, 0, 0, TAU); g.fill();
      g.save();
      g.clip();
      g.beginPath();
      for (let i = -r; i <= r; i += 3.6) { g.moveTo(u + i - r, zz - r); g.lineTo(u + i + r, zz + r); g.moveTo(u + i + r, zz - r); g.lineTo(u + i - r, zz + r); }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.7; g.stroke();
      g.restore();
      g.beginPath(); g.ellipse(u, zz, r * 0.62, r * 0.62, 0, 0, TAU);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.stroke();
      g.save();
      g.translate(u, zz);
      g.font = `bold 5.4px ${TH.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillText('ঢাকা ওয়াসা', -0.4, 0.5, r * 1.1);
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillText('ঢাকা ওয়াসা', 0, 0, r * 1.1);
      g.restore();
      blob(g, u - r * 0.3, zz + r * 0.25, r * 0.5, [120, 70, 35], 0.2);
    }
  }

  function grate(g, u, z, w, h) { // gutter drain: bars run across (constant z)
    g.fillStyle = '#26262a'; fillW(g, u - 1, z - 1, w + 2, h + 2);
    g.fillStyle = '#050506'; fillW(g, u + 0.8, z + 0.8, w - 1.6, h - 1.6);
    g.beginPath();
    for (let bz = z + 2.2; bz < z + h - 1.5; bz += 3.4) rectW(g, u + 0.8, bz, w - 1.6, 1.4);
    g.fillStyle = '#50515a'; g.fill();
  }

  // Asphalt carriageway u0..u1 with its lanes; opp = the opposite carriageway (buses, CNGs).
  function paintAsphalt(g, rng, base, u0, u1, lanes, opp, gutters) {
    const W = u1 - u0;
    let gr = g.createLinearGradient(u0, 0, u1, 0);
    gr.addColorStop(0, rgba(shade(base, -0.1))); gr.addColorStop(0.1, rgba(base));
    gr.addColorStop(0.5, rgba(shade(base, 0.035))); gr.addColorStop(0.9, rgba(base)); gr.addColorStop(1, rgba(shade(base, -0.1)));
    g.fillStyle = gr; g.fillRect(u0, 0, W, TL);
    // broad mottling
    for (let i = 0; i < 24; i++) {
      const light = rng() < 0.5, u = u0 + rng() * W, z = rng() * TL, r = 30 + rng() * 90;
      blob(g, u, z, r, light ? [255, 255, 255] : [0, 0, 0], light ? 0.02 + rng() * 0.03 : 0.035 + rng() * 0.045, 1.7);
    }
    // patch repairs (the first is a long, badly refilled trench across the road)
    for (let i = 0; i < 6; i++) {
      const trench = i === 0;
      const w = trench ? W * (0.5 + rng() * 0.3) : 28 + rng() * 80, h = trench ? 9 + rng() * 5 : 40 + rng() * 150;
      const u = u0 + 6 + rng() * (W - 12 - w), z = rng() * TL;
      const col = rng() < 0.6 ? shade(base, -0.06) : shade(base, 0.05);
      polyW(g, handCut(rng, u, z, w, h), rgba(col), 'rgba(0,0,0,0.12)');
    }
    // polished wheel tracks, a dustier strip where nothing drives
    for (const lc of lanes) for (const o of opp ? [-52, 52] : [-38, 38]) {
      const u = lc + o, w = opp ? 14 : 9;
      gr = g.createLinearGradient(u - w, 0, u + w, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(u - w, 0, 2 * w, TL);
    }
    for (let i = 0; i + 1 < lanes.length; i++) {
      const u = (lanes[i] + lanes[i + 1]) / 2;
      gr = g.createLinearGradient(u - 16, 0, u + 16, 0);
      gr.addColorStop(0, 'rgba(230,215,190,0)'); gr.addColorStop(0.5, 'rgba(230,215,190,0.05)'); gr.addColorStop(1, 'rgba(230,215,190,0)');
      g.fillStyle = gr; g.fillRect(u - 16, 0, 32, TL);
    }
    // aggregate
    const area = W * TL;
    specks(g, rng, u0, u1, area / 26, rgba(shade(base, 0.32), 0.3), 0.5, 1.2);
    specks(g, rng, u0, u1, area / 26, rgba(shade(base, -0.45), 0.34), 0.5, 1.3);
    specks(g, rng, u0, u1, area / 110, rgba(mix(base, [150, 130, 105], 0.5), 0.32), 0.7, 1.5);
    // oil drips in the lanes (long smears along the road), with a faint sheen
    for (let i = 0; i < (opp ? 18 : 8); i++) {
      const lc = lanes[(rng() * lanes.length) | 0], u = lc + (rng() - 0.5) * (opp ? 30 : 20), z = rng() * TL, r = 5 + rng() * 12;
      blob(g, u, z, r, [8, 8, 10], 0.26 + rng() * 0.14, 1.8);
      blob(g, u + (rng() - 0.5) * r, z + (rng() - 0.5) * r, r * 0.6, [8, 8, 10], 0.2, 1.5);
      if (rng() < 0.5) blob(g, u, z, r * 1.2, [90, 150, 170], 0.04, 1.6);
    }
    // sealed and open cracks
    const tar = [];
    for (let i = 0; i < 3; i++) {
      let u = u0 + 10 + rng() * (W - 20), z = rng() * TL;
      const along = rng() < 0.6, pts = [u, z];
      for (let s = 0; s < 18; s++) { if (along) { z += 7; u += (rng() - 0.5) * 3; } else { u += 6; z += (rng() - 0.5) * 3; } pts.push(clamp(u, u0 + 2, u1 - 2), z); }
      tar.push(pts);
    }
    strokeW(g, tar, rgba(shade(base, -0.55), 0.8), 2.2);
    strokeW(g, tar, 'rgba(255,255,255,0.08)', 0.6, -0.8);
    const cracks = [];
    for (let i = 0; i < 12; i++) crackWalk(rng, u0 + 8 + rng() * (W - 16), rng() * TL, rng() * TAU, 5 + ((rng() * 6) | 0), cracks, 0);
    for (const c of cracks) for (let i = 0; i < c.length; i += 2) c[i] = clamp(c[i], u0 + 1, u1 - 1);
    strokeW(g, cracks, rgba(shade(base, -0.6), 0.55), 0.9);
    strokeW(g, cracks, 'rgba(255,255,255,0.07)', 0.5, 0.6);
    // manholes
    const mh = opp ? 1 : 2;
    for (let i = 0; i < mh; i++) {
      const lc = lanes[(rng() * lanes.length) | 0];
      manhole(g, lc + (rng() - 0.5) * 50, 40 + (i * TL) / mh + rng() * (TL / mh - 80), 19, base);
    }
    // gutters: shade and grime at the kerbs, drains, swept-up dust and litter
    for (const [gu, side] of gutters) {
      gr = g.createLinearGradient(gu, 0, gu - side * 26, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.34)'); gr.addColorStop(0.25, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(Math.min(gu, gu - side * 26), 0, 26, TL);
      g.beginPath();
      for (let i = 0; i < 700; i++) { const s = 0.5 + rng() * 0.9; g.rect(gu - side * (0.5 + rng() * rng() * 12), rng() * TL, s * 0.8, s); }
      g.fillStyle = 'rgba(200,182,146,0.3)'; g.fill();
      if (side > 0) for (let i = 0; i < 2; i++) grate(g, gu - 14, 60 + i * 320 + rng() * 200, 13, 34);
      const litter = ['rgba(236,232,220,0.7)', 'rgba(118,150,60,0.6)', 'rgba(190,120,70,0.6)'];
      for (let i = 0; i < 10; i++) {
        const u = gu - side * (2 + rng() * 7), z = rng() * TL, w = 3 + rng() * 3;
        g.save(); g.translate(u, z); g.rotate(rng() * TAU);
        g.fillStyle = litter[i % 3]; g.fillRect(-w / 2, -1.5, w, 3);
        g.restore();
      }
    }
  }

  function paintGround(g, P, rng) {
    g.fillStyle = rgba(shade(P.sidewalk, -0.3)); g.fillRect(U0, 0, UW, TL);
    paintWalk(g, rng, P.sidewalk, U.curbR + CW, U1, U.curbR + CW, U.wallR);
    paintWalk(g, rng, P.sidewalkL, U0, U.oppL - CW, U.oppL - CW, U.wallL);
    // curb tops (the vector curbs cover them; this keeps any sliver in step)
    for (let z = 0; z < TL; z += BLOCK) { g.fillStyle = rgba((z / BLOCK) % 2 ? P.curb[1] : P.curb[0]); g.fillRect(U.curbR, z, CW, BLOCK); }
    g.fillStyle = rgba(shade(P.median, 0.1)); g.fillRect(U.oppL - CW, 0, CW, TL);
    // median (the raised vector median covers it)
    g.fillStyle = rgba(P.medianTop); g.fillRect(U.medianL, 0, U.curbL - U.medianL, TL);
    paintAsphalt(g, rng, P.asphaltOpp, U.oppL, U.medianL, U.opp, true, [[U.medianL, 1], [U.oppL, -1]]);
    paintAsphalt(g, rng, P.asphalt, U.curbL, U.curbR, U.lanes, false, [[U.curbR, 1], [U.curbL, -1]]);
    // feather both ends into the base colour drawn beyond the texture, so its edge never shows
    for (const [ua, ub] of [[U1 - 22, U1], [U0 + 22, U0]]) {
      const gr = g.createLinearGradient(ua, 0, ub, 0), base = shade(P.sidewalk, -0.1);
      gr.addColorStop(0, rgba(base, 0)); gr.addColorStop(1, rgba(base, 1));
      g.fillStyle = gr; g.fillRect(Math.min(ua, ub), 0, 22, TL);
    }
  }

  // Texture + z-averaged mip levels. Level m has TL / 2^m rows (each the average of 2^m units of
  // road) and, from level 4 on, half the width per level. Level 1 is only a stepping stone.
  let TEX = null;
  function freeTex() {
    if (TEX) for (const c of TEX.canvases) c.width = 0;
    TEX = null;
  }
  function buildTex(P) {
    const W0 = Math.round(UW * TU);
    const c0 = fp.canvas(W0, TL);
    if (!c0) return null;
    const g = c0.ctx;
    g.setTransform(TU, 0, 0, 1, -U0 * TU, 0);
    paintGround(g, P, TH.mulberry32(P.seed));
    g.setTransform(1, 0, 0, 1, 0, 0);
    const lv = [{ c: c0.canvas, w: W0, h: TL, tu: TU, tz: 1 }], canvases = [c0.canvas];
    let prev = lv[0], tmp = null;
    for (let m = 1; m <= 7; m++) {
      const w = m <= 3 ? W0 : Math.max(8, Math.round(W0 / (1 << (m - 3))));
      const h = Math.max(2, Math.round(TL / (1 << m)));
      const c = fp.canvas(w, h);
      if (!c) break;
      c.ctx.imageSmoothingEnabled = true;
      c.ctx.imageSmoothingQuality = 'high';
      c.ctx.drawImage(prev.c, 0, 0, prev.w, prev.h, 0, 0, w, h);
      const L = { c: c.canvas, w, h, tu: w / UW, tz: h / TL };
      if (m === 1) { tmp = c.canvas; lv[1] = null; } else { lv[m] = L; canvases.push(c.canvas); }
      prev = L;
      if (m === 2 && tmp) { tmp.width = 0; tmp = null; }
    }
    if (tmp) tmp.width = 0;
    return { key: P.key, lv, canvases };
  }
  function texFor(P) {
    if (TEX && TEX.key === P.key) return TEX;
    freeTex();
    TEX = buildTex(P) || { key: P.key, lv: null, canvases: [] };
    return TEX;
  }
  function levelFor(lv, rho) {
    let m = 0, q = rho;
    while (q > 1.45 && m < 7) { q *= 0.5; m++; }
    if (m === 1) m = q > 1.05 ? 2 : 0;
    while (m > 0 && !lv[m]) m--;
    return lv[m];
  }
  // Band height in px by distance below the horizon: 1 px where the texture is sharp, a little
  // taller at the very horizon (only blurred far levels there) and near the bottom of the screen.
  const bandH = (r) => (r < 40 ? 2.4 : clamp(r * 0.017, 1, 4.6));

  function drawBands(ctx, lv, V, yF) {
    const k = cam.h * F;
    let y = yF, n = 0;
    while (y < V.y1 && n < 420) {
      const r = y - HY, hb = bandH(r), y2 = y + hb;
      const dT = k / r, dB = k / (y2 - HY), dC = k / (y + hb * 0.5 - HY);
      if (dC < NEAR) break;
      const span = dT - dB;
      const L = levelFor(lv, span / hb);
      let sh = span * L.tz;
      let sy = ((((cam.z - dT) * L.tz) % L.h) + L.h) % L.h;
      if (sh >= L.h) { sh = L.h; sy = 0; } else if (sy + sh > L.h) sy = L.h - sh; // straddles the tile seam
      const inv = dC / F;
      const uA = Math.max(U0, cam.u + (V.x0 - CX) * inv), uB = Math.min(U1, cam.u + (V.x1 - CX) * inv);
      if (uB > uA && sh > 1e-4) {
        const sx = Math.max(0, (uA - U0) * L.tu), sw = Math.min(L.w - sx, (uB - uA) * L.tu);
        if (sw > 0.01) ctx.drawImage(L.c, sx, sy, sw, sh, CX + (uA - cam.u) / inv, y, (uB - uA) / inv, hb + 0.6);
      }
      y = y2; n++;
    }
  }
  // Fallback when there is no offscreen canvas: flat colours.
  function flatGround(ctx, P) {
    const zF = cam.z - fp.FAR, zN = zNear(), c = P.css;
    for (const [u0, u1, col] of [[U0, U.oppL, c.sidewalkL], [U.oppL, U.medianL, c.asphaltOpp], [U.curbL, U.curbR, c.asphalt], [U.curbR, U1, c.sidewalk]]) {
      ctx.beginPath();
      if (gq(ctx, zF, zN, u0, u1, 0)) { ctx.fillStyle = col; ctx.fill(); }
    }
  }

  // ---------- vector ground work ----------
  function drawDashes(ctx, P) {
    const zN = zNear(), zF = cam.z - fp.FAR;
    ctx.beginPath();
    let any = false;
    for (const u of [70, -70, -465]) {
      const rick = u > U.medianL, zD = cam.z - (rick ? DASH_LOD : DASH_LOD * 0.82);
      const zVis = Math.min(zN, cam.z - (Math.abs(u - cam.u) - 6) * F / (CX + 30)); // nearer is off screen
      for (let z = Math.floor(zD / DASH_P) * DASH_P; z < zVis; z += DASH_P) {
        let a = z, b = z + DASH;
        if (rick && b > CLEAR0 && a < CLEAR1) continue;
        if (b <= zD) continue;
        if (a < zD) a = zD;
        if (b > zVis) b = zVis;
        if (b > a && gq(ctx, a, b, u - DASH_W / 2, u + DASH_W / 2, 0)) any = true;
      }
    }
    if (any) { ctx.fillStyle = P.css.lane; ctx.fill(); }
    ctx.beginPath();
    for (const u of [70, -70, -465]) gq(ctx, zF, cam.z - (u > U.medianL ? DASH_LOD : DASH_LOD * 0.82), u - DASH_W / 2, u + DASH_W / 2, 0);
    ctx.fillStyle = P.css.laneFar; ctx.fill();
  }

  // One-way arrows in every lane, pointing toward the camera (the way the rickshaws come).
  function drawArrows(ctx, P) {
    const pts = ARROW_PTS;
    for (const near of [false, true]) {
      ctx.beginPath();
      let any = false;
      for (const zc of ARROW_Z) {
        const d = cam.z - zc;
        if (d < -80 || d > 1750 || (d < ARROW_NEAR) !== near) continue;
        for (const lc of U.lanes) {
          if (d + 80 < (Math.abs(lc - cam.u) - 20) * F / (CX + 30)) continue; // off the screen edge
          if (zc + 72 > zNear()) { // crosses the near plane: let fpcore clip it
            const w = [];
            for (let i = 0; i < pts.length; i += 2) w.push(zc + pts[i], lc + pts[i + 1], 0);
            if (fp.subPath(ctx, w)) any = true;
            continue;
          }
          for (let i = 0; i < pts.length; i += 2) {
            const s = F / (cam.z - zc - pts[i]), x = CX + (lc + pts[i + 1] - cam.u) * s, y = HY + cam.h * s;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          any = true;
        }
      }
      if (any) { ctx.fillStyle = near ? P.css.paintNear : P.css.paint; ctx.fill(); }
    }
  }

  function drawCrossing(ctx, P) {
    ctx.beginPath();
    gq(ctx, STOP_Z - 7, STOP_Z + 7, U.curbL + 3, U.curbR - 3, 0);
    for (let k = 0; k < 10; k++) { const u = -199.5 + 42 * k; gq(ctx, ZEB0, ZEB1, u, u + 21, 0); }
    ctx.fillStyle = P.css.stop; ctx.fill();
    ctx.beginPath(); // tyres scrub the paint along the wheel tracks
    for (const lc of U.lanes) for (const o of [-38, 38]) gq(ctx, STOP_Z - 7, ZEB1, lc + o - 8, lc + o + 8, 0);
    ctx.fillStyle = P.css.scrub; ctx.fill();
  }

  // "থামুন" laid flat in each lane before the stop line, stretched along the road, reading upright
  // for the player (see THAMUN_FOR_DRIVERS). Affine approximation of the ground at the text centre.
  function drawThamun(ctx, P) {
    const d = cam.z - THAMUN_Z;
    if (d < 120 || d > 2600) return;
    const s = F / d, jy = (cam.h * F) / (d * d), K = 2.7;
    ctx.font = `bold 34px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = P.css.thamun;
    for (const lc of U.lanes) {
      const du = lc - cam.u, x = CX + du * s, y = HY + cam.h * s;
      if (x < -120 || x > 1120) continue;
      const jx = (du * F) / (d * d);
      ctx.save();
      const k = THAMUN_FOR_DRIVERS ? -1 : 1;
      ctx.transform(k * s, 0, k * K * jx, k * K * jy, x, y);
      ctx.fillText('থামুন', 0, 0, 104);
      ctx.restore();
    }
  }

  // Raised curbs and median: faces as wall quads, tops as flat quads.
  function drawRaised(ctx, P) {
    const c = P.css, zF = cam.z - fp.FAR, zN = zNear(), zB = cam.z - CURB_LOD;
    // median: face toward the rickshaw lanes, concrete lips, soil/grass between
    ctx.beginPath();
    if (wq(ctx, zF, zN, U.curbL, 0, HM)) { ctx.fillStyle = c.medFace; ctx.fill(); }
    ctx.beginPath();
    if (gq(ctx, zF, zN, U.medianL, U.curbL, HM)) { ctx.fillStyle = c.medLip; ctx.fill(); }
    ctx.beginPath();
    if (gq(ctx, zF, zN, U.medianL + 6, U.curbL - 6, HM)) { ctx.fillStyle = c.medTop; ctx.fill(); }
    if (cam.u < U.medianL) { // (never in play: the camera stays right of the median)
      ctx.beginPath(); if (wq(ctx, zF, zN, U.medianL, 0, HM)) { ctx.fillStyle = c.medFace; ctx.fill(); }
    }
    // left curb (the far side of the opposite carriageway): plain concrete
    ctx.beginPath();
    blockPoly(ctx, zF, zN, U.oppL, -CW, CH, true);
    ctx.fillStyle = c.concFace; ctx.fill();
    // right curb: painted blocks near, one blended colour far
    const face = cam.u < U.curbR;
    ctx.beginPath();
    blockPoly(ctx, zF, zB, U.curbR, CW, CH, face);
    ctx.fillStyle = c.curbMix; ctx.fill();
    ctx.beginPath();
    blockPoly(ctx, zB, zN, U.curbR, CW, CH, face);
    ctx.fillStyle = c.curbA; ctx.fill();
    ctx.beginPath();
    const P2 = BLOCK * 2;
    for (let z = Math.floor(zB / P2) * P2 + BLOCK; z < zN; z += P2) blockPoly(ctx, Math.max(z, zB), Math.min(z + BLOCK, zN), U.curbR, CW, CH, face);
    ctx.fillStyle = c.curbB; ctx.fill();
    if (face) {
      ctx.beginPath();
      if (wq(ctx, zF, zN, U.curbR, 0, CH)) { ctx.fillStyle = c.faceShade; ctx.fill(); }
    }
  }

  // Pools of light on the road under the lit lamps: flattened glows, drawn by the engine after the
  // lighting tint. A round pool of radius R at depth d spans R*s across and R*s*cam.h/d down.
  function queuePools(P, lamps) {
    const st = LSTYLE[P.lampStyle];
    for (const L of lamps) {
      const d = cam.z - L.z;
      if (d < 150 || d > 2400) continue;
      const s = F / d, sy = Math.min(0.95, (1.2 * cam.h) / d), a = 0.62 * clamp((2400 - d) / 700, 0, 1);
      const y = HY + cam.h * s;
      for (const side of L.arms) {
        const x = CX + (L.u + side * (st.reach + 12) - cam.u) * s, r = 130 * s;
        if (x + r < -20 || x - r > 1020) continue;
        fp.glow(x, y, r, st.pool, d, a, false, sy);
      }
    }
  }

  // ---------- street lamps ----------
  const LSTYLE = {
    pole: { top: 372, reach: 100, pole: '#8d949c', dark: '#5c636b', head: '#3b4046', lens: '#f4f1e6', lit: '#fff6dc', glow: '#ffe7b0', pool: '#ffe4b0', w: 7 },
    sodium: { top: 352, reach: 86, pole: '#a19b8f', dark: '#6f6a61', head: '#6b7078', lens: '#d9cdb5', lit: '#ffc070', glow: '#ffae45', pool: '#ffa447', w: 8 },
    none: { top: 0, reach: 0 },
  };
  function lampList(P) {
    const out = [];
    if (P.lampStyle === 'none') return out;
    const ev = P.lampEvery, zLo = cam.z - fp.FAR, zHi = cam.z - 30;
    for (let row = 0; row < 2; row++) {
      const ph = row ? 170 + ev / 2 : 170;
      for (let z = Math.ceil((zLo - ph) / ev) * ev + ph; z < zHi; z += ev) {
        if (Math.abs(z - SIG_Z) < 90 || (!row && Math.abs(z - SIGN_Z) < 70)) continue;
        if (P.lampSkip.some((r) => z >= r[0] && z <= r[1])) continue;
        out.push(row ? { z, u: FENCE_U, base: HM, arms: [-1, 1] } : { z, u: 238, base: CH, arms: [-1] });
      }
    }
    return out;
  }
  function drawLamp(ctx, d, L, P, lit) {
    const s = F / d;
    if (s > 10) return;
    const st = LSTYLE[P.lampStyle];
    const X = (u) => CX + (u - cam.u) * s, Y = (h) => HY + (cam.h - h) * s;
    const x = X(L.u), yb = Y(L.base), yt = Y(st.top), pw = Math.max(0.9, st.w * s);
    const lens = lit ? st.lit : st.lens;
    if (s < 0.3) { // far: poles and arms as plain bars
      ctx.fillStyle = st.dark;
      ctx.fillRect(x - pw / 2, yt, pw, yb - yt);
      const ua = L.u - st.reach - 30, ub = L.arms.length > 1 ? L.u + st.reach + 30 : L.u;
      ctx.fillRect(X(ua), Y(st.top + 12), (ub - ua) * s, Math.max(0.8, 6 * s));
      if (s >= 0.14 && lit) {
        ctx.fillStyle = st.lit;
        for (const side of L.arms) { const hu = L.u + side * (st.reach + 12); ctx.fillRect(X(hu - 16), Y(st.top + 7), 32 * s, Math.max(0.7, 2.6 * s)); }
      }
    } else {
      const near = s >= 0.6;
      ctx.fillStyle = near ? st.pole : st.dark;
      ctx.fillRect(x - pw / 2, yt, pw, yb - yt);
      if (near) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - pw / 2, yt, pw * 0.38, yb - yt);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + pw * 0.12, yt, pw * 0.16, yb - yt);
        ctx.fillStyle = st.dark; ctx.fillRect(x - pw * 0.8, Y(L.base + 26), pw * 1.6, 26 * s);
      }
      // arm(s)
      ctx.beginPath();
      for (const side of L.arms) {
        const r = st.reach * side;
        if (P.lampStyle === 'sodium') {
          ctx.moveTo(x, Y(st.top - 8)); ctx.quadraticCurveTo(X(L.u + r * 0.5), Y(st.top + 16), X(L.u + r), Y(st.top + 18));
        } else {
          ctx.moveTo(x, Y(st.top - 18)); ctx.quadraticCurveTo(x, Y(st.top + 14), X(L.u + r), Y(st.top + 10));
        }
      }
      ctx.strokeStyle = st.dark; ctx.lineWidth = Math.max(0.8, 3.4 * s); ctx.lineCap = 'round'; ctx.stroke();
      // heads and lenses
      if (near) {
        ctx.beginPath();
        for (const side of L.arms) {
          const hu = L.u + side * (st.reach + 12);
          if (P.lampStyle === 'sodium') { const hx = X(hu), hy = Y(st.top + 17), rx = 19 * s, ry = 6.5 * s; ctx.moveTo(hx + rx, hy); ctx.ellipse(hx, hy, rx, ry, 0, 0, TAU); }
          else ctx.rect(X(hu - 21), Y(st.top + 14), 42 * s, 7 * s);
        }
        ctx.fillStyle = st.head; ctx.fill();
      } else {
        ctx.fillStyle = st.head;
        for (const side of L.arms) { const hu = L.u + side * (st.reach + 12); ctx.fillRect(X(hu - 20), Y(st.top + 14), 40 * s, 7 * s); }
      }
      ctx.fillStyle = lens;
      for (const side of L.arms) {
        const hu = L.u + side * (st.reach + 12);
        const lw = P.lampStyle === 'sodium' ? 24 : 34, lh = P.lampStyle === 'sodium' ? 11.5 : 7.5;
        ctx.fillRect(X(hu - lw / 2), Y(st.top + lh), lw * s, Math.max(0.7, 2.6 * s));
      }
    }
    if (lit) {
      for (const side of L.arms) {
        const hu = L.u + side * (st.reach + 12);
        TH.fp.glow(X(hu), Y(st.top + 6), clamp(95 * s, 3, 170), st.glow, d, 0.85);
      }
    }
  }

  // ---------- traffic signal ----------
  const SPRS = 3; // sprite px per world unit
  const headSpr = {}, digitSpr = {};
  function roundRect(g, x, y, w, h, r) { TH.rr(g, x, y, w, h, r); }
  function housing(g, x, y, h, r, hw) {
    const gr = g.createLinearGradient(x - hw, 0, x + hw, 0);
    gr.addColorStop(0, '#0a0c0f'); gr.addColorStop(0.55, '#1f2329'); gr.addColorStop(0.86, '#3a4049'); gr.addColorStop(1, '#14171b');
    g.fillStyle = gr; roundRect(g, x - hw, y, hw * 2, h, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x - hw * 0.53, y + 0.5, hw * 1.06, 1.1);
  }
  // Head + countdown box, local units x −24..24, y −2..136 (y 0 = top of the backplate).
  function paintHead(g, lamp) {
    g.fillStyle = '#0e1013'; roundRect(g, -22, 0, 44, 100, 6); g.fill();
    g.strokeStyle = 'rgba(232,180,22,0.9)'; g.lineWidth = 2; roundRect(g, -20.3, 1.7, 40.6, 96.6, 4.6); g.stroke();
    housing(g, 0, 5, 90, 5, 16);
    for (const L of LAMPS) {
      const y = L.y, on = L === lamp;
      TH.circle(g, 0, y, 12.3, '#040506');
      const lg = g.createRadialGradient(2.3, y - 2, 0.6, 0, y, 10);
      if (on) { lg.addColorStop(0, L.hot); lg.addColorStop(0.4, rgba(L.on)); lg.addColorStop(1, rgba(shade(L.on, -0.35))); }
      else { lg.addColorStop(0, rgba(shade(L.off, 0.14))); lg.addColorStop(1, rgba(shade(L.off, -0.3))); }
      TH.circle(g, 0, y, 10, lg);
      g.beginPath(); g.arc(0, y, 6.8, 0, TAU); g.moveTo(3.4, y); g.arc(0, y, 3.4, 0, TAU);
      g.strokeStyle = on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.07)'; g.lineWidth = 0.8; g.stroke();
      const vs = g.createLinearGradient(0, y - 10, 0, y + 1.5);
      vs.addColorStop(0, on ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.55)'); vs.addColorStop(1, 'rgba(0,0,0,0)');
      TH.circle(g, 0, y, 10, vs);
      g.fillStyle = on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)';
      g.beginPath(); g.ellipse(5, y + 1.2, 1.6, 2.6, 0.5, 0, TAU); g.fill();
      // visor hood, seen from the front and a little from below
      g.beginPath(); g.arc(0, y, 14.8, Math.PI, TAU); g.arc(0, y + 2.8, 12, 0, Math.PI, true); g.closePath();
      g.fillStyle = '#060709'; g.fill();
      g.beginPath(); g.arc(0, y, 14.3, Math.PI * 1.52, Math.PI * 1.94);
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.1; g.stroke();
      if (on) {
        g.beginPath(); g.arc(0, y + 2.8, 11.7, Math.PI * 1.1, Math.PI * 1.9);
        g.strokeStyle = rgba(L.on, 0.6); g.lineWidth = 1.4; g.stroke();
      }
    }
    housing(g, 0, 104, 31, 4, 16);
    g.fillStyle = '#020303'; roundRect(g, -13.5, 107.5, 27, 23, 2); g.fill();
  }
  function headSprite(state) {
    if (headSpr[state] !== undefined) return headSpr[state];
    const c = fp.canvas(48 * SPRS, 138 * SPRS);
    if (c) { c.ctx.setTransform(SPRS, 0, 0, SPRS, 24 * SPRS, 2 * SPRS); paintHead(c.ctx, LAMPS.find((l) => l.name === state) || null); }
    headSpr[state] = c ? c.canvas : null;
    return headSpr[state];
  }
  // Adds to the current path the segments of digit n that are lit (on) or dark (!on).
  function seven(g, n, x, y, w, h, t, on) {
    const bits = SEVEN[n], k = t / 2, gp = 0.45;
    const xl = x + k, xr = x + w - k, yt = y + k, ym = y + h / 2, yb = y + h - k;
    const hz = (yc) => {
      g.moveTo(xl + gp, yc); g.lineTo(xl + gp + k, yc - k); g.lineTo(xr - gp - k, yc - k);
      g.lineTo(xr - gp, yc); g.lineTo(xr - gp - k, yc + k); g.lineTo(xl + gp + k, yc + k); g.closePath();
    };
    const vt = (xc, y0, y1) => {
      g.moveTo(xc, y0 + gp); g.lineTo(xc + k, y0 + gp + k); g.lineTo(xc + k, y1 - gp - k);
      g.lineTo(xc, y1 - gp); g.lineTo(xc - k, y1 - gp - k); g.lineTo(xc - k, y0 + gp + k); g.closePath();
    };
    for (let i = 0; i < 7; i++) {
      if (!!(bits & (1 << i)) !== on) continue;
      if (i === 0) hz(yt); else if (i === 1) vt(xr, yt, ym); else if (i === 2) vt(xr, ym, yb);
      else if (i === 3) hz(yb); else if (i === 4) vt(xl, ym, yb); else if (i === 5) vt(xl, yt, ym); else hz(ym);
    }
  }
  const DG = { w: 8.8, h: 14.6, t: 2.2, pad: 2.2 };
  const DCW = DG.w + DG.pad * 2, DCH = DG.h + DG.pad * 2;
  function digitSprite(state) {
    if (digitSpr[state] !== undefined) return digitSpr[state];
    const c = fp.canvas(DCW * 10 * 4, DCH * 4);
    if (c) {
      const g = c.ctx, L = LAMPS.find((l) => l.name === state), col = L ? L.on : [170, 170, 170];
      for (let n = 0; n < 10; n++) {
        const x = n * DCW + DG.pad, y = DG.pad;
        g.setTransform(4, 0, 0, 4, 0, 0);
        g.transform(1, 0, -0.1, 1, 0.1 * (y + DG.h / 2), 0); // italic lean about the digit's middle
        g.beginPath(); seven(g, n, x, y, DG.w, DG.h, DG.t, false);
        g.fillStyle = rgba(col, 0.1); g.shadowBlur = 0; g.fill();
        g.beginPath(); seven(g, n, x, y, DG.w, DG.h, DG.t, true);
        g.shadowColor = rgba(col, 0.9); g.shadowBlur = 6; g.fillStyle = rgba(mix(col, [255, 255, 255], 0.2)); g.fill();
      }
      g.shadowBlur = 0;
    }
    digitSpr[state] = c ? c.canvas : null;
    return digitSpr[state];
  }
  // One signal head with its countdown, x = centre, y = top of the backplate, at scale s.
  function drawHead(ctx, x, y, s, env, d) {
    const L = LAMPS.find((l) => l.name === (env && env.light)) || null, state = L ? L.name : 'off';
    const spr = headSprite(state);
    if (spr) ctx.drawImage(spr, x - 24 * s, y - 2 * s, 48 * s, 138 * s);
    const dsp = digitSprite(state);
    const lt = env && Number.isFinite(env.lightT) ? env.lightT : 0;
    const v = clamp(Math.ceil(lt), 0, 99), digits = [(v / 10) | 0, v % 10];
    if (dsp) {
      for (let i = 0; i < 2; i++) {
        const lx = -10.6 + i * 11.6 - DG.pad, ly = 111.7 - DG.pad;
        ctx.drawImage(dsp, digits[i] * DCW * 4, 0, DCW * 4, DCH * 4, x + lx * s, y + ly * s, DCW * s, DCH * s);
      }
    }
    if (L) {
      TH.fp.glow(x, y + L.y * s, clamp(34 * s, 5, 130), L.hex, d, 1, true);
      TH.fp.glow(x, y + 119 * s, clamp(18 * s, 3, 60), L.hex, d, 0.35, true);
    }
  }
  function drawSignal(ctx, d, env) {
    const s = F / d;
    if (s > 7) return;
    const X = (u) => CX + (u - cam.u) * s, Y = (h) => HY + (cam.h - h) * s;
    ctx.imageSmoothingQuality = 'high';
    // pole: dark steel lit from the right, black-yellow bands at the foot, bolted base plate
    const px = X(SIG_U), pw = 11 * s, yTop = Y(344), yBase = Y(CH);
    const steel = ctx.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
    steel.addColorStop(0, '#1a1d21'); steel.addColorStop(0.62, '#6a717a'); steel.addColorStop(1, '#22252a');
    ctx.fillStyle = steel;
    ctx.fillRect(px - pw / 2, yTop, pw, yBase - yTop);
    ctx.beginPath();
    for (let h = 22; h < 86; h += 16) ctx.rect(px - pw / 2, Y(h + 8), pw, 8 * s);
    ctx.fillStyle = '#e8b416'; ctx.fill();
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(px - 10 * s, Y(CH + 6), 20 * s, 6 * s);
    // mast arm over the lanes, with a diagonal brace and an end cap
    const arm0 = X(-76), armT = Y(334), armB = Y(325);
    const ag = ctx.createLinearGradient(0, armT, 0, armB);
    ag.addColorStop(0, '#6a717a'); ag.addColorStop(1, '#1d2025');
    ctx.fillStyle = ag;
    ctx.fillRect(arm0, armT, px - arm0, armB - armT);
    ctx.beginPath(); ctx.moveTo(px, Y(286)); ctx.lineTo(X(168), Y(327));
    ctx.strokeStyle = '#2a2e34'; ctx.lineWidth = Math.max(1, 3.4 * s); ctx.stroke();
    ctx.fillStyle = '#17191d'; ctx.fillRect(arm0 - 2 * s, Y(335.5), 4 * s, 12 * s);
    ctx.fillRect(px - 7 * s, Y(348), 14 * s, 5 * s);
    // hanger + mast head, then the head on the pole (in front of it)
    ctx.fillRect(X(HEAD_U - 4), armB, 8 * s, 4 * s);
    drawHead(ctx, X(HEAD_U), Y(321), s, env, d);
    drawHead(ctx, px, Y(206), s, env, d);
  }

  // ---------- one-way sign (board turned 45° toward the road and the camera) ----------
  const BW = 112, BH = 50, SGS = 4;
  const SIGN_FONT = `bold 14px ${TH.FONT}`;
  let signSpr = null, signFW = -1;
  function paintSign(g) {
    const poly = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
    g.fillStyle = '#0c2461'; roundRect(g, -1.4, 1.4, BW, BH, 7); g.fill();
    let gr = g.createLinearGradient(BW, 0, 12, BH);
    gr.addColorStop(0, '#3e7af2'); gr.addColorStop(0.5, '#1d4ed8'); gr.addColorStop(1, '#173ea6');
    g.fillStyle = gr; roundRect(g, 0, 0, BW, BH, 7); g.fill();
    gr = g.createLinearGradient(BW, 0, BW * 0.6, BH * 0.95);
    gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = '#f8fafc'; g.lineWidth = 2.2; roundRect(g, 3.4, 3.4, BW - 6.8, BH - 6.8, 4.6); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = SIGN_FONT;
    g.fillStyle = 'rgba(5,20,70,0.45)'; g.fillText(SIGN_TEXT, BW / 2 + 0.7, 15.8, BW - 20);
    g.fillStyle = '#fff'; g.fillText(SIGN_TEXT, BW / 2, 15, BW - 20);
    const arrow = (dx, dy) => poly([12 + dx, 31 + dy, 80 + dx, 31 + dy, 80 + dx, 27.4 + dy, 100 + dx, 35.6 + dy, 80 + dx, 43.8 + dy, 80 + dx, 40.2 + dy, 12 + dx, 40.2 + dy]);
    g.fillStyle = 'rgba(5,20,70,0.45)'; arrow(-0.7, 0.8); g.fill();
    g.fillStyle = '#fff'; arrow(0, 0); g.fill();
    g.fillStyle = '#1d4ed8'; g.font = `bold 6.8px ${TH.FONT}`;
    g.fillText('ONE WAY', 46, 35.8, 60);
  }
  function signSprite() {
    if (signSpr === null) {
      const c = fp.canvas((BW + 4) * SGS, (BH + 4) * SGS);
      signSpr = c ? { c: c.canvas, g: c.ctx } : false;
    }
    if (!signSpr) return null;
    const g = signSpr.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = SIGN_FONT;
    const fw = g.measureText(SIGN_TEXT).width; // changes once the web font arrives: repaint then
    if (Math.abs(fw - signFW) > 0.5) {
      signFW = fw;
      g.clearRect(0, 0, (BW + 4) * SGS, (BH + 4) * SGS);
      g.setTransform(SGS, 0, 0, SGS, 2 * SGS, 2 * SGS);
      paintSign(g);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    return signSpr.c;
  }
  function drawSign(ctx, d) {
    const s = F / d;
    if (s > 7) return;
    const X = (u) => CX + (u - cam.u) * s, Y = (h) => HY + (cam.h - h) * s;
    const hTop = SIGN_TOP, hBot = hTop - BH;
    // galvanised pole lit from the right, clamp bands, concrete footing
    const x = X(SIGN_U), pw = 5.4 * s, yb = Y(CH), yt = Y(hTop + 4);
    const gr = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    gr.addColorStop(0, '#5b6067'); gr.addColorStop(0.62, '#c9ced4'); gr.addColorStop(1, '#6f747b');
    ctx.fillStyle = gr; ctx.fillRect(x - pw / 2, yt, pw, yb - yt);
    ctx.fillStyle = '#3d4146';
    ctx.fillRect(x - pw * 0.7, Y(hTop - 8), pw * 1.4, 3 * s);
    ctx.fillRect(x - pw * 0.7, Y(hBot + 10), pw * 1.4, 3 * s);
    ctx.fillStyle = '#8f8b82'; ctx.fillRect(x - 6 * s, Y(CH + 6), 12 * s, 6 * s);
    const spr = signSprite();
    if (!spr) return;
    // affine map of the board around its centre (secants to the right edge and the bottom)
    const ax = Math.SQRT1_2, hw = BW / 2, hh = BH / 2, hc = hTop - hh;
    const pc = fp.project(SIGN_Z, SIGN_U, hc), pr = fp.project(SIGN_Z + hw * ax, SIGN_U + hw * ax, hc), pd = fp.project(SIGN_Z, SIGN_U, hc - hh);
    if (!pc || !pr || !pd) return;
    const a = (pr.x - pc.x) / hw, b = (pr.y - pc.y) / hw, c = (pd.x - pc.x) / hh, e = (pd.y - pc.y) / hh;
    if (!(Math.abs(a * e - b * c) > 1e-6)) return;
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.transform(a, b, c, e, pc.x - a * hw - c * hh, pc.y - b * hw - e * hh);
    ctx.drawImage(spr, -2, -2, BW + 4, BH + 4);
    ctx.restore();
  }

  // ---------- median fence and plants ----------
  const plantCache = new Map();
  function plantsOf(k) { // per 200-unit cell: a few bushes (camera side) and maybe a small tree
    let p = plantCache.get(k);
    if (p) return p;
    const rng = TH.mulberry32(Math.imul(k, 2654435761) ^ 0x5bd1e995);
    const bushes = [];
    const n = rng() < 0.16 ? 0 : 1 + ((rng() * 3) | 0);
    for (let i = 0; i < n; i++) bushes.push({ z: k * 200 + 12 + rng() * 176, u: -240 + rng() * 12, r: 11 + rng() * 10 });
    const tree = rng() < 0.22 ? { z: k * 200 + 50 + rng() * 100, u: -266, h: 140 + rng() * 60, r: 52 + rng() * 24, bloom: rng() < 0.35 } : null;
    p = { bushes, tree };
    if (plantCache.size > 400) plantCache.clear();
    plantCache.set(k, p);
    return p;
  }
  const LOBES = [[0, 0, 1, 0.6], [-0.64, 0.2, 0.62, 0.46], [0.68, 0.18, 0.58, 0.44], [-0.3, -0.36, 0.62, 0.44], [0.32, -0.4, 0.58, 0.42]];
  const LOBES_HI = [[0.3, -0.46, 0.46, 0.3], [0.66, -0.06, 0.36, 0.26], [-0.16, -0.56, 0.4, 0.26]];
  function lobes(ctx, x, y, r, list, n) {
    for (let i = 0; i < n; i++) {
      const l = list[i], cx = x + l[0] * r, cy = y + l[1] * r;
      ctx.moveTo(cx + l[2] * r, cy); ctx.ellipse(cx, cy, l[2] * r, l[3] * r, 0, 0, TAU);
    }
  }
  function drawTree(ctx, t, lod, c) {
    const p = fp.project(t.z, t.u, HM);
    if (!p || p.s > 8) return;
    const s = p.s, th = t.h * 0.62 * s;
    ctx.fillStyle = c.trunk;
    ctx.fillRect(p.x - 3.4 * s, p.y - th, 6.8 * s, th);
    if (lod === 0) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(p.x - 3.4 * s, p.y - th, 2.6 * s, th); }
    const cy = p.y - t.h * s, r = t.r * s;
    ctx.beginPath();
    lobes(ctx, p.x, cy, r, LOBES, lod === 0 ? 5 : 3);
    ctx.fillStyle = c.canopy; ctx.fill();
    if (lod === 0) {
      ctx.beginPath();
      lobes(ctx, p.x, cy, r, LOBES_HI, 3);
      ctx.fillStyle = t.bloom ? c.bloom : c.canopyHi; ctx.fill();
    }
  }
  function drawMedianSeg(ctx, z0, z1, lod, P) {
    const c = P.css;
    if (lod < 2) {
      for (let k = Math.floor(z0 / 200); k * 200 < z1; k++) {
        const t = plantsOf(k).tree;
        if (t && t.z >= z0 && t.z < z1) drawTree(ctx, t, lod, c);
      }
    }
    if (lod === 0) {
      ctx.beginPath();
      if (wq(ctx, z0, z1, FENCE_U, HM + 6, HM + 66)) { ctx.fillStyle = c.fenceMesh; ctx.fill(); }
      ctx.beginPath();
      wq(ctx, z0, z1, FENCE_U, HM + 62, HM + 67);
      wq(ctx, z0, z1, FENCE_U, HM + 5, HM + 9);
      for (let z = Math.ceil(z0 / 100) * 100; z < z1; z += 100) rectAt(ctx, z, FENCE_U - 2, FENCE_U + 2, HM, HM + 71);
      ctx.fillStyle = c.fence; ctx.fill();
      // bushes on the camera side of the railing
      ctx.beginPath();
      let nb = 0, yT = Infinity, yB = -Infinity;
      for (let k = Math.floor(z0 / 200); k * 200 < z1; k++) {
        for (const b of plantsOf(k).bushes) {
          if (b.z < z0 || b.z >= z1) continue;
          const p = fp.project(b.z, b.u, HM);
          if (!p || p.s > 8) continue;
          const r = b.r * p.s, y = p.y - r * 0.55;
          ctx.moveTo(p.x + r, y); ctx.ellipse(p.x, y, r, r * 0.75, 0, 0, TAU);
          if (y - r * 0.75 < yT) yT = y - r * 0.75;
          if (p.y > yB) yB = p.y;
          nb++;
        }
      }
      if (nb) {
        const bg = ctx.createLinearGradient(0, yT, 0, yB);
        bg.addColorStop(0, c.bushHi); bg.addColorStop(1, c.bushLo);
        ctx.fillStyle = bg; ctx.fill();
      }
    } else if (lod === 1) {
      ctx.beginPath();
      if (wq(ctx, z0, z1, FENCE_U, HM + 5, HM + 67)) { ctx.fillStyle = c.fenceMid; ctx.fill(); }
      ctx.beginPath();
      if (wq(ctx, z0, z1, -236, HM, HM + 22)) { ctx.fillStyle = c.hedge; ctx.fill(); }
    } else {
      ctx.beginPath();
      if (wq(ctx, z0, z1, FENCE_U, HM, HM + 62)) { ctx.fillStyle = c.fenceFar; ctx.fill(); }
    }
  }
  const MLOD = [[0, 620, 200, 0], [620, 2400, 600, 1], [2400, 7600, 1800, 2]];
  function addMedian(P, add) {
    const dVis = ((Math.abs(FENCE_U - cam.u) - 40) * F) / (CX + 40); // nearer than this it is off the left edge
    for (const [dA, dB, step, lod] of MLOD) {
      const zHi = cam.z - Math.max(dA, dVis, NEAR + 2), zLo = cam.z - Math.min(dB, fp.FAR);
      if (zHi <= zLo) continue;
      for (let z = Math.floor(zLo / step) * step; z < zHi; z += step) {
        const z0 = Math.max(z, zLo), z1 = Math.min(z + step, zHi);
        if (z1 - z0 < 1) continue;
        add((z0 + z1) / 2, (ctx) => drawMedianSeg(ctx, z0, z1, lod, P));
      }
    }
  }

  // ---------- public ----------
  TH.fpStreet = {
    drawGround(ctx, env) {
      const P = palette(env);
      const k = cam.h * F;
      if (!(k > 0)) return;
      const V = viewBox(ctx);
      const yF = HY + k / fp.FAR;
      // fill 'street': clip the textured ground to the street itself (building line to building
      // line, along the sidewalk tops) and leave the rest of the screen to the road's drawSky.
      const clipped = P.fill === 'street';
      if (clipped) {
        ctx.save();
        ctx.beginPath();
        gq(ctx, cam.z - fp.FAR, zNear(), U.wallL, U.wallR, CH);
        ctx.clip();
      }
      ctx.fillStyle = P.css.base;
      ctx.fillRect(V.x0, yF, V.x1 - V.x0, Math.max(1, V.y1 - yF));
      const T = texFor(P);
      if (T && T.lv) drawBands(ctx, T.lv, V, yF); else flatGround(ctx, P);
      if (clipped) ctx.restore();
      drawDashes(ctx, P);
      drawArrows(ctx, P);
      drawCrossing(ctx, P);
      drawThamun(ctx, P);
      drawRaised(ctx, P);
      if (env && env.lit && env.lit.lamps) queuePools(P, lampList(P));
    },

    add(env, add) {
      const P = palette(env);
      const lit = !!(env && env.lit && env.lit.lamps);
      add(SIG_Z, (ctx, d, e) => drawSignal(ctx, d, e || env), 100, 300);
      add(SIGN_Z, (ctx, d) => drawSign(ctx, d), SIGN_U - 20, 90);
      for (const L of lampList(P)) {
        const cu = L.arms.length > 1 ? L.u : L.u - LSTYLE[P.lampStyle].reach / 2;
        add(L.z, (ctx, d) => drawLamp(ctx, d, L, P, lit), cu, L.arms.length > 1 ? 150 : 90);
      }
      addMedian(P, add);
    },

    // Frees the ground texture (it is rebuilt on the next frame that needs it).
    dispose() { freeTex(); },
  };
})();
