// First-person camera, projection and drawing helpers shared by every first-person art file.
// See js/FP_CONTRACT.md for the units and the rules. Pure maths + canvas paths, no game logic.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = (TH.fp = {});
  TH.fpRoads = TH.fpRoads || [];

  // ---------- lens and world ----------
  const CX = (fp.CX = 500);   // vanishing point x (logical screen is 1000 × 600)
  const HY = (fp.HY = 245);   // horizon y
  const F = (fp.F = 520);     // focal length in logical px
  const NEAR = (fp.NEAR = 18); // nothing nearer than this depth is drawn
  fp.FAR = 7600;              // ... or farther
  fp.DZ = 2;                  // first-person units per game-logic x unit (depth z = x * DZ)
  fp.EYE = 95;                // standing eye height
  fp.CURB_H = 8;              // sidewalk surface height

  // Street cross-section, lateral u in FP units (+ = screen right). 1 unit ≈ 1.7 cm.
  fp.U = {
    lanes: [140, 0, -140],  // TH.LANES 430 / 510 / 590
    foot: 289,              // TH.FOOT_Y 345: footpath riders, on the right sidewalk
    curbR: 215,             // right curb face; right sidewalk 215..460
    wallR: 460,             // right building line
    curbL: -215,            // left curb face of the rickshaw carriageway
    medianL: -285,          // median -215..-285
    oppL: -645,             // opposite carriageway -285..-645 (traffic moving away, toward -z)
    opp: [-375, -555],      // its two lane centres
    wallL: -800,            // left sidewalk -645..-800, then the left building line
  };
  fp.laneU = (y) => (510 - y) * 1.75;
  fp.uToY = (u) => 510 - u / 1.75;
  fp.zOf = (x) => x * fp.DZ;
  fp.xOf = (z) => z / fp.DZ;

  // The camera looks toward -z. fpview.js moves it every frame; art only reads it.
  const cam = (fp.cam = { z: 1860, u: 0, h: fp.EYE });

  fp.depth = (z) => cam.z - z;
  // World point -> { x, y, s (px per world unit), d (depth) }, or null when nearer than NEAR.
  fp.project = function (z, u, h) {
    const d = cam.z - z;
    if (!(d >= NEAR)) return null;
    const s = F / d;
    return { x: CX + (u - cam.u) * s, y: HY + (cam.h - h) * s, s, d };
  };
  // Screen point back onto the plane at height h: { z, u, d }, or null at/above the horizon.
  fp.unproject = function (sx, sy, h = 0) {
    const dy = sy - HY;
    if (dy <= 0.5 || cam.h - h <= 0) return null;
    const d = ((cam.h - h) * F) / dy;
    return { z: cam.z - d, u: cam.u + ((sx - CX) * d) / F, d };
  };
  // Screen x of a far landmark at lateral u and depth d (for gentle sky parallax).
  fp.farX = (u, d) => CX + ((u - cam.u) * F) / d;

  // ---------- clipped paths ----------
  // Closed polygon from world points [z,u,h, z,u,h, ...], clipped to the near plane.
  // Starts a new path; returns true when something is left to fill/stroke.
  fp.path = function (ctx, pts) {
    const zMax = cam.z - NEAR, n = pts.length / 3;
    let count = 0;
    ctx.beginPath();
    const emit = (z, u, h) => {
      const s = F / (cam.z - z), x = CX + (u - cam.u) * s, y = HY + (cam.h - h) * s;
      if (count++ === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const az = pts[i * 3], au = pts[i * 3 + 1], ah = pts[i * 3 + 2];
      const bz = pts[j * 3], bu = pts[j * 3 + 1], bh = pts[j * 3 + 2];
      const ain = az <= zMax, bin = bz <= zMax;
      if (ain) emit(az, au, ah);
      if (ain !== bin) {
        const t = (zMax - az) / (bz - az);
        emit(zMax, au + (bu - au) * t, ah + (bh - ah) * t);
      }
    }
    if (count > 2) ctx.closePath();
    return count > 2;
  };
  // Adds a closed polygon to the current path (no beginPath) — for batching many shapes into one fill.
  fp.subPath = function (ctx, pts) {
    const zMax = cam.z - NEAR, n = pts.length / 3;
    let count = 0;
    const emit = (z, u, h) => {
      const s = F / (cam.z - z), x = CX + (u - cam.u) * s, y = HY + (cam.h - h) * s;
      if (count++ === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const az = pts[i * 3], au = pts[i * 3 + 1], ah = pts[i * 3 + 2];
      const bz = pts[j * 3], bu = pts[j * 3 + 1], bh = pts[j * 3 + 2];
      const ain = az <= zMax, bin = bz <= zMax;
      if (ain) emit(az, au, ah);
      if (ain !== bin) {
        const t = (zMax - az) / (bz - az);
        emit(zMax, au + (bu - au) * t, ah + (bh - ah) * t);
      }
    }
    if (count > 2) ctx.closePath();
    return count > 2;
  };
  // Flat rectangle on the ground (or at height h): z0..z1 along the road, u0..u1 across it.
  fp.quad = (ctx, z0, z1, u0, u1, h = 0) => fp.path(ctx, [z0, u0, h, z0, u1, h, z1, u1, h, z1, u0, h]);
  fp.subQuad = (ctx, z0, z1, u0, u1, h = 0) => fp.subPath(ctx, [z0, u0, h, z0, u1, h, z1, u1, h, z1, u0, h]);
  // Vertical plane running along the road at lateral u (a facade, fence, kerb face).
  fp.wallQuad = (ctx, z0, z1, u, h0, h1) => fp.path(ctx, [z0, u, h0, z1, u, h0, z1, u, h1, z0, u, h1]);
  // Vertical plane across the road at depth z, facing the camera (a gantry, a building front).
  fp.crossQuad = (ctx, z, u0, u1, h0, h1) => fp.path(ctx, [z, u0, h0, z, u1, h0, z, u1, h1, z, u0, h1]);
  // Open polyline through world points [z,u,h, ...], clipped per segment. Starts a new path.
  fp.polyline = function (ctx, pts) {
    const zMax = cam.z - NEAR, n = pts.length / 3;
    let drawn = false, pen = false;
    ctx.beginPath();
    const P = (z, u, h) => { const s = F / (cam.z - z); return [CX + (u - cam.u) * s, HY + (cam.h - h) * s]; };
    for (let i = 0; i < n - 1; i++) {
      let az = pts[i * 3], au = pts[i * 3 + 1], ah = pts[i * 3 + 2];
      let bz = pts[i * 3 + 3], bu = pts[i * 3 + 4], bh = pts[i * 3 + 5];
      const ain = az <= zMax, bin = bz <= zMax;
      if (!ain && !bin) { pen = false; continue; }
      if (!ain) { const t = (zMax - az) / (bz - az); az = zMax; au += (bu - au) * t; ah += (bh - ah) * t; pen = false; }
      if (!bin) { const t = (zMax - az) / (bz - az); bz = zMax; bu = au + (bu - au) * t; bh = ah + (bh - ah) * t; }
      const a = P(az, au, ah), b = P(bz, bu, bh);
      if (!pen) ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      pen = bin; drawn = true;
    }
    return drawn;
  };
  // Hanging wire (catenary) between two world points, sagging by `sag`, as a clipped polyline.
  fp.wire = function (ctx, z0, u0, h0, z1, u1, h1, sag, n = 10) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(z0 + (z1 - z0) * t, u0 + (u1 - u0) * t, h0 + (h1 - h0) * t - sag * 4 * t * (1 - t));
    }
    return fp.polyline(ctx, pts);
  };

  // ---------- fog ----------
  // fpview sets this from the road's light config each frame.
  fp.fog = { color: '#c9d3dc', near: 1600, far: 6500, max: 0.85 };
  fp.fogAt = function (d) {
    const f = fp.fog, t = (d - f.near) / Math.max(1, f.far - f.near);
    return t <= 0 ? 0 : t >= 1 ? f.max : f.max * t * (2 - t);
  };
  // Opacity to draw a billboard at depth d so it melts into the fog (1 near, 0 at FAR).
  fp.fade = (d) => Math.max(0, Math.min(1, 1 - fp.fogAt(d) * 0.9, (fp.FAR - d) / 900));

  // ---------- emissive glows and occluders (rebuilt every frame by fpview) ----------
  const glows = [], solids = [];
  fp._begin = () => { glows.length = 0; solids.length = 0; };
  fp._glows = glows;
  fp._solids = solids;
  // Soft light at screen (x, y), radius r, at depth d. Drawn additively after the lighting tint,
  // hidden when a nearer solid covers it. Only shows when the road's light.glow > 0 (dusk/night),
  // unless always = true (signal lamps, a Tesla headlight).
  // sy < 1 squashes it vertically: a pool of light lying on the road.
  fp.glow = function (x, y, r, color, d, a = 1, always = false, sy = 1) {
    if (glows.length < 400 && r > 0.5 && isFinite(x) && isFinite(y) && isFinite(r)) glows.push({ x, y, r, color, d, a, always, sy: sy > 0 && sy < 1 ? sy : 1 });
  };
  // A screen rectangle at depth d that hides glows (and lit windows) farther away behind it.
  fp.solid = function (x0, y0, x1, y1, d) {
    if (solids.length < 200 && isFinite(x0 + y0 + x1 + y1)) solids.push({ x0, y0, x1, y1, d });
  };
  fp.occluded = function (x, y, d) {
    for (const s of solids) if (s.d < d - 6 && x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return true;
    return false;
  };

  // ---------- small colour helpers ----------
  const memo = new Map();
  // '#rrggbb' mixed toward black (f < 0) or white (f > 0), optional alpha.
  fp.shade = function (hex, f, a) {
    const key = hex + '|' + f + '|' + a;
    let out = memo.get(key);
    if (out) return out;
    const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex);
    if (!m) return hex;
    const h6 = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    const n = parseInt(h6, 16), to = f < 0 ? 0 : 255, q = Math.min(1, Math.abs(f));
    const c = (v) => Math.round(v + (to - v) * q);
    const rgb = `${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)}`;
    out = a === undefined ? `rgb(${rgb})` : `rgba(${rgb},${a})`;
    if (memo.size > 1500) memo.clear();
    memo.set(key, out);
    return out;
  };
  // Linear mix of two '#rrggbb' colours.
  fp.mix = function (a, b, t) {
    const key = a + '>' + b + '|' + t;
    let out = memo.get(key);
    if (out) return out;
    const p = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const A = p(a), B = p(b), k = Math.max(0, Math.min(1, t));
    out = `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
    if (memo.size > 1500) memo.clear();
    memo.set(key, out);
    return out;
  };

  // Offscreen canvas (null where the environment has none).
  fp.canvas = function (w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext && c.getContext('2d');
    return g ? { canvas: c, ctx: g } : null;
  };
})();
