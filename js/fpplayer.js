// The traffic sergeant in third person (TH.fpPlayer), as the chase camera sees him: from behind
// and over his right shoulder, slightly from above (a 3/4 back view). See js/FP_CONTRACT.md §8b.
// Pure drawing, no game logic.
//
// He is a tiny 3D rig in body space (X = his right, Y = up from the feet, Z = forward, away from the
// camera), projected with the chase camera's real perspective, which we recover from `pr`. That keeps
// the arm reach, the foreshortening and the sliver of his right side honest, and it puts the slapping
// palm exactly on the screen target. Flat parts (vest, trouser seat) are drawn in 2D frames fitted to
// their plane, so the "ট্রাফিক" lettering and reflective bands turn with his torso.
(function () {
  'use strict';
  const TH = window.TH;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix3 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  const add3 = (A, B) => [A[0] + B[0], A[1] + B[1], A[2] + B[2]];
  const bez3 = (A, C, B, q) => {
    const u = 1 - q, a = u * u, b = 2 * u * q, c = q * q;
    return [a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1], a * A[2] + b * C[2] + c * B[2]];
  };
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  // ---------- palette (the Classic sergeant in sprites.js) ----------
  const SKIN = '#a36a45', SKIN_LT = '#b27852', SKIN_DK = '#7f5336', SKIN_SH = '#8f5c3c';
  const HAIR = '#17110d', MOUSTACHE = '#120c08';
  const NAVY = '#243157', NAVY_DK = '#1a2443', NAVY_SEAT = '#1f2a4c';
  const SHOE = '#0c0c0f', SOLE = '#3a3a42';
  const SHIRT = '#f3f5f8', SHIRT_DK = '#c9d0d9';
  const BELT = '#101216', CAP_BAND = '#15171c', VISOR = '#0b0c0f', GOLD = '#f1d27a';

  // Gradients live in local sprite space, so one of each is reused every frame.
  const grads = new Map();
  function grad(ctx, key, x0, y0, x1, y1, stops) {
    let g = grads.get(key);
    if (!g) {
      g = ctx.createLinearGradient(x0, y0, x1, y1);
      for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
      grads.set(key, g);
    }
    return g;
  }

  // ---------- chase-camera projection (body space -> local px/scale units, feet at 0,0) ----------
  const V = { dcu: -100, ch: 138, d0: 250 }; // his u − camera u, camera height over his feet, depth
  function P(p) {
    const k = V.d0 / (V.d0 + clamp(p[2], -120, 300));
    return [(V.dcu + p[0]) * k - V.dcu, (V.ch - p[1]) * k - V.ch];
  }
  // The body-space point at depth Z that projects onto local screen point (tx, ty).
  function onRay(tx, ty, Z) {
    const k = V.d0 / (V.d0 + Z);
    return [clamp((tx + V.dcu) / k - V.dcu, -600, 600), clamp(V.ch - (ty + V.ch) / k, -600, 600), Z];
  }
  // Where along the camera ray through the target the hand should be: about arm's length from the shoulder.
  function reachOnRay(tx, ty, sh, R) {
    let best = null, be = Infinity;
    for (let Z = -40; Z <= 120; Z += 4) {
      const p = onRay(tx, ty, Z);
      const dx = p[0] - sh[0], dy = p[1] - sh[1], dz = p[2] - sh[2];
      const err = Math.abs(Math.sqrt(dx * dx + dy * dy + dz * dz) - R) + (Z < 0 ? 6 : 0); // prefer reaching forward
      if (err < be) { be = err; best = p; }
    }
    return best;
  }

  // Two-bone IK in 3D: [elbow/knee, end]. `pole` says which way the joint bends; stretch > 1 lets a
  // cartoon arm stretch up to that factor to reach.
  function ik(S, T, a, b, pole, stretch) {
    let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(d > 1e-3)) { dx = 0; dy = -1; dz = 0; d = 1; }
    const ux = dx / d, uy = dy / d, uz = dz / d;
    let L = a + b;
    if (stretch > 1 && d > L * 0.97) { const f = Math.min(stretch, d / (L * 0.97)); a *= f; b *= f; L *= f; }
    const r = clamp(d, Math.abs(a - b) + 0.5, L * 0.995);
    const x = (a * a - b * b + r * r) / (2 * r), y = Math.sqrt(Math.max(0, a * a - x * x));
    const pd = pole[0] * ux + pole[1] * uy + pole[2] * uz;
    let px = pole[0] - ux * pd, py = pole[1] - uy * pd, pz = pole[2] - uz * pd;
    let pl = Math.sqrt(px * px + py * py + pz * pz);
    if (pl < 1e-3) { px = uy; py = -ux; pz = 0; pl = Math.sqrt(px * px + py * py); if (pl < 1e-3) { px = 1; py = 0; pl = 1; } }
    px /= pl; py /= pl; pz /= pl;
    return [[S[0] + ux * x + px * y, S[1] + uy * x + py * y, S[2] + uz * x + pz * y], [S[0] + ux * r, S[1] + uy * r, S[2] + uz * r]];
  }

  // Torso space (x right, y up from the waist, z forward) -> body space, with lean (roll) and twist (yaw).
  function bodyPt(B, x, y, z) {
    const X = x * B.cl + y * B.sl, Y = -x * B.sl + y * B.cl;
    return [B.x + X * B.cy - z * B.sy, B.y + Y, B.z + X * B.sy + z * B.cy];
  }
  // 2D frame (x right, y down) fitted to the torso plane at depth zb: [a, b, c, d, e, f] for ctx.transform.
  function frameOf(B, zb, yMid) {
    const o = P(bodyPt(B, 0, yMid, zb)), ax = P(bodyPt(B, 10, yMid, zb)), ay = P(bodyPt(B, 0, yMid - 10, zb));
    const a = (ax[0] - o[0]) / 10, b = (ax[1] - o[1]) / 10, c = (ay[0] - o[0]) / 10, d = (ay[1] - o[1]) / 10;
    return [a, b, c, d, o[0] + c * yMid, o[1] + d * yMid]; // origin moved back to the waist line (y = 0)
  }
  // His right side face, seen past the back plane: its width and slant in that frame's units.
  function sideOf(B, M, x, y, zb, zf) {
    const b0 = P(bodyPt(B, x, y, zb)), f0 = P(bodyPt(B, x, y, zf));
    const dx = f0[0] - b0[0], dy = f0[1] - b0[1];
    const det = M[0] * M[3] - M[2] * M[1] || 1;
    const sw = (M[3] * dx - M[2] * dy) / det;
    return sw > 0 ? [Math.min(sw, 12), clamp((-M[1] * dx + M[0] * dy) / det, -9, 9)] : [0, 0];
  }

  // ---------- parts ----------
  function limb(ctx, a, b, c, col, w) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }

  function drawLeg(ctx, L, near) {
    const h = P(L.hip), k = P(L.knee), a = P(L.ank);
    // shoe: heel toward the camera, toe pointing away down the road
    const heel = P([L.ank[0], L.ank[1] - 2 + L.heel, L.ank[2] - 3]);
    const toe = P([L.ank[0] + L.side * 0.6, L.ank[1] - 2.8, L.ank[2] + 9]);
    ctx.beginPath(); ctx.moveTo(heel[0], heel[1]); ctx.lineTo(toe[0], toe[1]);
    ctx.strokeStyle = SHOE; ctx.lineWidth = 6.6; ctx.stroke();
    const up = L.heel + L.lift;
    if (up > 1.5) { // the sole shows as the heel comes up
      ctx.beginPath(); ctx.ellipse(heel[0], heel[1] + 2.2, 3.2, Math.min(2, 0.4 + up * 0.25), 0, 0, TAU);
      ctx.fillStyle = SOLE; ctx.fill();
    }
    limb(ctx, h, k, [a[0], a[1] - 1.4], near ? NAVY : NAVY_DK, 10.6);
    if (near) { // pressed crease catching the light down the outside of the near leg
      ctx.beginPath(); ctx.moveTo(h[0] + 3.2, h[1] + 3); ctx.lineTo(k[0] + 3, k[1]); ctx.lineTo(a[0] + 2.6, a[1] - 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.3; ctx.stroke();
    }
  }

  function drawArm(ctx, sh, el, hd, far) {
    const s = P(sh), e = P(el), h = P(hd);
    limb(ctx, s, e, h, far ? SKIN_DK : SKIN, 5.2);
    ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[0] + (e[0] - s[0]) * 0.68, s[1] + (e[1] - s[1]) * 0.68);
    ctx.strokeStyle = far ? SHIRT_DK : SHIRT; ctx.lineWidth = 8.4; ctx.stroke();
    return [e, h];
  }
  function fist(ctx, e, h, col) {
    const a = Math.atan2(h[1] - e[1], h[0] - e[0]);
    ctx.beginPath(); ctx.ellipse(h[0] + Math.cos(a) * 1.3, h[1] + Math.sin(a) * 1.3, 3.5, 2.9, a, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
  }
  // Open hand: palm at (x, y), fingers along angle a; sx/sy squash it; thumb = ±1 picks its side.
  function openHand(ctx, x, y, a, spread, sx, sy, col, thumb) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a); ctx.scale(sx, sy);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const f = (i - 1.5) * spread, by = (i - 1.5) * 1.75, L = i === 1 || i === 2 ? 6.6 : 5.6;
      ctx.moveTo(2, by); ctx.lineTo(2 + Math.cos(f) * L, by + Math.sin(f) * L);
    }
    ctx.moveTo(-0.5, thumb * 2.6); ctx.lineTo(3.2, thumb * 6.4);
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.3, 0, 4.3, 3.9, 0, 0, TAU);
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = SKIN_DK; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  }

  // White peaked cap from behind, in head space (head centre at 0,0).
  function drawCap(ctx) {
    // tip of the glossy visor peeking out at the front right
    ctx.beginPath(); ctx.moveTo(8.6, -8.8); ctx.lineTo(16.4, -8.1); ctx.quadraticCurveTo(16.9, -6.5, 15.3, -5.7); ctx.lineTo(8.6, -4.8);
    ctx.fillStyle = VISOR; ctx.fill();
    // crown, flaring out over the band, the raised front showing over the top
    ctx.beginPath(); ctx.moveTo(-10.4, -9.2); ctx.quadraticCurveTo(-13.9, -11.6, -13.4, -15.4);
    ctx.quadraticCurveTo(0.2, -22.6, 13.6, -15.4); ctx.quadraticCurveTo(14, -11.6, 10.7, -9.2);
    ctx.fillStyle = grad(ctx, 'crown', 0, -21, 0, -9, [0, '#ffffff', 1, '#d3d9e1']); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13.4, -15.4); ctx.quadraticCurveTo(0.2, -12.9, 13.6, -15.4); ctx.quadraticCurveTo(0.2, -22.6, -13.4, -15.4);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    // black band (curving down at the back: we look at it from a little above) and the gold side button
    ctx.beginPath(); ctx.moveTo(-10.7, -9.9); ctx.quadraticCurveTo(0.2, -7.6, 10.9, -9.9); ctx.lineTo(10.9, -4.6);
    ctx.quadraticCurveTo(0.2, -2.2, -10.7, -4.6);
    ctx.fillStyle = CAP_BAND; ctx.fill();
    ctx.beginPath(); ctx.arc(10.1, -7.3, 1.35, 0, TAU); ctx.fillStyle = GOLD; ctx.fill();
  }

  // Back of the head: hair, ears, neck, and the tip of the big moustache past his right cheek.
  function drawHead(ctx, capOn) {
    ctx.beginPath(); ctx.ellipse(1.1, 0.6, 10.3, 11.3, 0, 0, TAU); ctx.fillStyle = SKIN; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10.2, -4.4); ctx.quadraticCurveTo(-10.7, 6.6, -4.6, 9.3); ctx.quadraticCurveTo(0.3, 7.7, 5.3, 8.9);
    ctx.quadraticCurveTo(7.3, 5.6, 6.8, 1); ctx.lineTo(8.5, -4.4);
    ctx.fillStyle = HAIR; ctx.fill();
    ctx.beginPath(); ctx.ellipse(8.7, 1.1, 2.5, 3.9, 0.14, 0, TAU);
    ctx.fillStyle = SKIN; ctx.fill(); ctx.strokeStyle = SKIN_DK; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-9.9, 1.3, 1.5, 3.3, -0.1, 0, TAU); ctx.fillStyle = SKIN_DK; ctx.fill();
    ctx.beginPath(); ctx.moveTo(8.8, 5.1); ctx.quadraticCurveTo(12.8, 3.5, 15.6, 6.2); ctx.quadraticCurveTo(12.2, 7.4, 8.6, 7.2);
    ctx.fillStyle = MOUSTACHE; ctx.fill();
    if (capOn) drawCap(ctx);
  }

  // ---------- slap timeline (seconds of pose.slap.t, as the first-person hands in §8) ----------
  // wind up · whip to the target (contact at 0.06) · palm on the cheek · follow through · recover
  const KT = [0, 0.018, 0.06, 0.12, 0.22, 0.42];
  const KYAW = [0, -0.42, 0.2, 0.26, 0.34, 0];      // shoulders twist: right one back, then through
  const KLEAN = [0, 0.07, -0.03, -0.05, -0.08, 0];
  const LK = [[-17, 76, 18], [-22, 62, 6], [-25, 56, -12]]; // the other arm reaches out, then flings back
  const POLE_R = [0.3, 0, -1], POLE_L = [-0.3, 0, -1], POLE_HIP = [1, 0.1, -0.2], POLE_BLOCK = [-1, -0.7, 0.1];
  const POLE_WIND = [0.3, -1, -0.4], POLE_HIT = [1, -0.25, 0], POLE_FOLLOW = [0.6, -1, 0.2];
  const L_BLOCK = [-33, 106, 15], R_HIP = [15.8, 56.5, -6];

  let blk = 0, lastT = -1;

  function drawSergeant(ctx, pr, pose, env) {
    if (!ctx || !pr || !pose || !isFinite(pr.x) || !isFinite(pr.y) || !(pr.s > 0)) return;
    // Faded (the engine does that when he would hide the driver's face): paint him on a layer and
    // fade the layer, so he turns see-through as one figure instead of showing every overlap.
    const a0 = ctx.globalAlpha;
    if (a0 > 0.01 && a0 < 0.97 && typeof ctx.getTransform === 'function' && TH.fp && TH.fp.canvas && layered(ctx, pr, pose)) return;
    // standing and solid: he hides the lamps and lit windows behind him
    if (a0 >= 0.97 && !(pose.fall > 0) && TH.fp && TH.fp.solid) {
      const S = clamp(pr.s, 0.05, 8);
      TH.fp.solid(pr.x - 19 * S, pr.y - 112 * S, pr.x + 21 * S, pr.y, num(pr.d));
    }
    paint(ctx, pr, pose);
  }

  let layer = null;
  function layered(ctx, pr, pose) {
    const m = ctx.getTransform();
    const S = clamp(pr.s, 0.05, 8), bx0 = num(pose.fall) > 0 ? -150 : -62;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const X = pr.x + (i & 1 ? 92 : bx0) * S, Y = pr.y + (i & 2 ? 16 : -142) * S;
      const dx = m.a * X + m.c * Y + m.e, dy = m.b * X + m.d * Y + m.f;
      x0 = Math.min(x0, dx); x1 = Math.max(x1, dx); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy);
    }
    x0 = Math.floor(Math.max(x0, -16)); y0 = Math.floor(Math.max(y0, -16));
    const w = Math.ceil(x1) - x0, h = Math.ceil(y1) - y0;
    if (!(w > 0 && h > 0) || w > 2600 || h > 2600) return false;
    if (!layer || layer.canvas.width < w || layer.canvas.height < h) {
      layer = TH.fp.canvas(Math.max(w, layer ? layer.canvas.width : 0), Math.max(h, layer ? layer.canvas.height : 0));
      if (!layer) return false;
    }
    const o = layer.ctx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    paint(o, pr, pose);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, 0, 0, w, h, x0, y0, w, h);
    ctx.restore();
    return true;
  }

  function paint(ctx, pr, pose) {
    const S = clamp(pr.s, 0.05, 8);
    const fp = TH.fp || {};
    V.dcu = clamp((pr.x - (fp.CX || 500)) / S, -260, 260);
    V.ch = clamp((pr.y - (fp.HY || 245)) / S, 40, 280);
    V.d0 = clamp(num(pr.d) || 520 / S, 150, 900);

    const t = num(pose.t), ph = num(pose.phase);
    const strafe = clamp(num(pose.strafe), -1, 1), fall = clamp(num(pose.fall), 0, 1);
    const sl = pose.slap && typeof pose.slap.t === 'number' && isFinite(pose.slap.t) && fall < 0.05 ? pose.slap : null;
    // the stop palm eases in and out; it snaps while time stands still (paused)
    const dt = t - lastT; lastT = t;
    const want = pose.block && !sl && fall <= 0 ? 1 : 0;
    blk = dt > 0 && dt < 0.1 ? blk + (want - blk) * Math.min(1, dt * 16) : want;

    // losing: dizzy wobble, knees buckle, topple over to his left, bounce
    const dizzy = sstep(0, 0.08, fall) * (1 - sstep(0.42, 0.62, fall));
    const drop = 13 * sstep(0.22, 0.5, fall);
    const topple = sstep(0.36, 0.74, fall);
    const land = fall > 0.74 ? Math.sin(clamp((fall - 0.74) / 0.14, 0, 1) * PI) * 0.07 : 0;
    const bodyAng = strafe * 0.1 * (1 - topple) + dizzy * Math.sin(t * 8.5) * 0.08 - topple * 1.42 + land;

    // walk cycle
    const w = clamp(num(pose.walk), 0, 1) * (1 - sstep(0, 0.25, fall));
    const sph = Math.sin(ph), cph = Math.cos(ph);
    const breathe = Math.sin(t * 2.2) * 0.45 * (1 - w);
    const hipY = 51 - 1.8 * w * sph * sph - drop; // lowest when both feet are down
    const sway = -1.2 * w * cph;                   // weight over the planted foot

    // slap phase
    let seg = -1, q = 0, e = 0, yaw = 0, lean = 0;
    if (sl) {
      const T = clamp(sl.t, 0, 0.42);
      seg = 0; while (seg < 4 && T >= KT[seg + 1]) seg++;
      e = clamp((T - KT[seg]) / (KT[seg + 1] - KT[seg]), 0, 1);
      q = seg === 1 ? Math.pow(e, 1.6) : seg === 4 ? e * e * (3 - 2 * e) : seg === 2 ? e : easeOut(e);
      yaw = lerp(KYAW[seg], KYAW[seg + 1], q) + (sl.hit === false && seg >= 2 && seg < 4 ? 0.08 : 0);
      lean = lerp(KLEAN[seg], KLEAN[seg + 1], q);
    }

    const B = { x: sway * 0.6, y: hipY + 4 + breathe * 0.3, z: 0, cl: Math.cos(lean), sl: Math.sin(lean), cy: Math.cos(yaw), sy: Math.sin(yaw) };
    const Bp = { x: sway, y: hipY + 4, z: 0, cl: 1, sl: 0, cy: Math.cos(yaw * 0.35), sy: Math.sin(yaw * 0.35) };
    const shR = bodyPt(B, 16.3, 32.5 + breathe, 0), shL = bodyPt(B, -16.3, 32.5 + breathe, 0);

    // arms at rest: swinging opposite the legs; blocking: left palm up, right fist on the hip
    const swing = 10 * w;
    // (from behind the swing is mostly depth, so the hand also lifts and tucks in as it goes forward)
    const fwdR = Math.max(0, -sph) * w, fwdL = Math.max(0, sph) * w;
    let rT = [20.4 - 3 * fwdR, 49.5 + 4 * fwdR, -1 - swing * sph];
    let lT = [-20.4 + 3 * fwdL, 49.5 + 4 * fwdL, -1 + swing * sph];
    if (fall > 0) {
      const fl = Math.sin(t * 8.5) * 4;
      rT = mix3(mix3(rT, [27, 56 + fl, 2], sstep(0, 0.12, fall)), [34, 98, -4], topple);
      lT = mix3(mix3(lT, [-27, 56 - fl, 2], sstep(0, 0.12, fall)), [-30, 104, 6], topple);
    }
    let rPole = mix3(POLE_R, POLE_HIP, blk), lPole = mix3(POLE_L, POLE_BLOCK, blk);
    rT = mix3(rT, R_HIP, blk); lT = mix3(lT, L_BLOCK, blk);

    let rStr = 1, openR = false, squash = 0, smear = null, W = null, Cc = null, Hc = null, FT = null;
    if (sl) {
      const hit = sl.hit !== false;
      W = add3(shR, [44, 12, -18]); // flung out to the right at head height and back (a cartoon stretch)
      if (hit) {
        // screen target -> local units, undoing the body lean/fall rotation
        const tx = (num(sl.x) - pr.x) / S, ty = (num(sl.y) - pr.y) / S, ca = Math.cos(bodyAng), sa = Math.sin(bodyAng);
        Hc = reachOnRay(tx * ca + ty * sa, -tx * sa + ty * ca, shR, 30);
      } else Hc = [6, 96, 32]; // a swing through the empty air in front of him
      const mid = mix3(W, Hc, 0.5);
      Cc = [mid[0] + 15, mid[1] - 1, mid[2] + 4]; // bulges out to his right: a flat, round-house arc
      FT = [-28, 94, 30]; // follow through right across: the palm swings out past the left of his head
      const rest = rT, str = hit ? 1.9 : 1.05;
      if (seg === 0) { rT = mix3(rest, W, q); rPole = mix3(rPole, POLE_WIND, q); rStr = lerp(1, 1.25, q); }
      else if (seg === 1) {
        rT = bez3(W, Cc, Hc, q); rPole = mix3(POLE_WIND, POLE_HIT, q); rStr = lerp(1.25, str, q);
        smear = { bez: true, a: Math.max(0, q - 0.6), b: q, A: 0.45 + 0.55 * q };
      } else if (seg === 2) {
        rT = Hc; rPole = POLE_HIT; rStr = str; squash = hit ? Math.pow(1 - e, 1.5) : 0;
        smear = { bez: true, a: 0.3 + 0.55 * e, b: 1, A: 1 - e };
      } else if (seg === 3) {
        rT = mix3(Hc, FT, q); rPole = mix3(POLE_HIT, POLE_FOLLOW, q); rStr = lerp(str, 1.35, q);
        smear = { bez: false, a: Math.max(0, q - 0.6), b: q, A: 0.7 * (1 - e) };
      } else { rT = mix3(FT, rest, q); rPole = mix3(POLE_FOLLOW, POLE_R, q); rStr = lerp(1.35, 1, q); }
      openR = seg >= 1 ? seg <= 3 : e > 0.3;
      lT = seg === 0 ? mix3(lT, LK[0], q) : seg === 1 ? mix3(LK[0], LK[1], q) : seg === 2 ? mix3(LK[1], LK[2], q)
        : seg === 3 ? LK[2] : mix3(LK[2], lT, q);
    }
    const [rE, rH] = ik(shR, rT, 19, 21, rPole, rStr);
    const [lE, lH] = ik(shL, lT, 19, 21, lPole, 1);
    // the right arm is in front of him, beside his head, or (following through) hidden behind his back
    const rHs = P(rH);
    const rMode = rH[2] > 12 ? (rHs[0] < 12 ? 0 : 1) : 2;

    // legs: the planted one slides back, the other swings through with the foot lifted
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1, lq = ph + (i ? PI : 0), sq = Math.sin(lq), up = Math.max(0, Math.cos(lq));
      const Z = 12 * w * sq, lift = 6.5 * w * up * up, heel = 4 * w * Math.max(0, -sq) * up;
      const hip = bodyPt(Bp, side * 6.8, -4, 0);
      const [knee, ank] = ik(hip, [side * (6.4 + drop * 0.3), 4.5 + lift, Z], 24.5, 24, [side * (0.12 + drop * 0.06), 0, 1], 1);
      legs.push({ side, hip, knee, ank, lift, heel, d: Z * 0.93 - side * 2.4 });
    }
    if (legs[1].d < legs[0].d) legs.reverse(); // farther leg first

    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.scale(S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // soft shadow on the ground (it stretches out as he goes down)
    ctx.beginPath(); ctx.ellipse(-44 * topple, 0.8, 24 + 36 * topple, 6.2 + 1.6 * topple, 0, 0, TAU);
    ctx.fillStyle = 'rgba(20,12,6,0.28)'; ctx.fill();

    ctx.save();
    ctx.rotate(bodyAng);

    // far (left) arm, partly behind the torso
    const lP = drawArm(ctx, shL, lE, lH, true);
    if (blk > 0.5 && !sl) {
      const k = V.d0 / (V.d0 + lH[2]);
      openHand(ctx, lP[1][0], lP[1][1] - 1.2, -PI / 2 - 0.12, 0.13, k, k, SKIN, 1); // palm forward: stop!
    } else fist(ctx, lP[0], lP[1], SKIN_DK);

    // motion smear trailing the slapping hand (plus a gold speed line further out)
    const drawSmear = () => {
      if (!smear || smear.A <= 0.02) return;
      const s0 = P(shR), pts = [];
      for (let i = 0; i <= 5; i++) {
        const u = lerp(smear.a, smear.b, i / 5);
        pts.push(P(smear.bez ? bez3(W, Cc, Hc, u) : mix3(Hc, FT, u)));
      }
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= 5; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = `rgba(255,255,255,${(0.55 * smear.A).toFixed(3)})`; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pts[2][0], pts[2][1]);
      for (let i = 3; i <= 5; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = `rgba(255,255,255,${(0.32 * smear.A).toFixed(3)})`; ctx.lineWidth = 12; ctx.stroke();
      ctx.beginPath();
      for (let i = 1; i <= 5; i++) {
        const x = s0[0] + (pts[i][0] - s0[0]) * 1.32, y = s0[1] + (pts[i][1] - s0[1]) * 1.32;
        if (i > 1) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(255,214,102,${(0.8 * smear.A).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.stroke();
    };
    const rightArm = () => {
      drawSmear();
      const rP = drawArm(ctx, shR, rE, rH, false);
      if (openR) { // a big cartoon palm, squashed flat against the cheek at contact
        const a = Math.atan2(rP[1][1] - rP[0][1], rP[1][0] - rP[0][0]), k = (1.3 * V.d0) / (V.d0 + rH[2]);
        openHand(ctx, rP[1][0], rP[1][1], a, 0.07 + 0.16 * squash, k * (1 - 0.32 * squash), k * (1 + 0.45 * squash), SKIN_LT, -1);
      } else fist(ctx, rP[0], rP[1], SKIN);
    };
    if (rMode === 0) rightArm();

    drawLeg(ctx, legs[0], legs[0].side > 0);
    drawLeg(ctx, legs[1], legs[1].side > 0);

    // hips: trouser seat and belt, turning with a third of the shoulders' twist
    const Mp = frameOf(Bp, -5.5, 0), [swP, sdP] = sideOf(Bp, Mp, 13.2, -2, -5.5, 7);
    ctx.save();
    ctx.transform(Mp[0], Mp[1], Mp[2], Mp[3], Mp[4], Mp[5]);
    ctx.beginPath(); ctx.moveTo(-13.2, 0.5); ctx.lineTo(13.2, 0.5); ctx.lineTo(13.2 + swP, 0.5 + sdP);
    ctx.lineTo(12.6 + swP, 11 + sdP); ctx.quadraticCurveTo(7, 17.6, 0.4, 13.6); ctx.quadraticCurveTo(-6.6, 17.6, -12.8, 11.4);
    ctx.fillStyle = NAVY_SEAT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.3, 4.4); ctx.lineTo(0.4, 13.3); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(-13.4, 2.6); ctx.lineTo(13.4, 2.6); ctx.lineTo(13.4 + swP, 2.6 + sdP);
    ctx.strokeStyle = BELT; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();

    // torso: white shirt, neon vest with silver bands and "ট্রাফিক", walkie-talkie, whistle cord, collar
    const Mc = frameOf(B, -6.5, 16), [sw, sd] = sideOf(B, Mc, 15, 16, -6.5, 7);
    ctx.save();
    ctx.transform(Mc[0], Mc[1], Mc[2], Mc[3], Mc[4], Mc[5]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-13.4, 1.5); ctx.lineTo(-15.4, -21); ctx.quadraticCurveTo(-18.4, -26, -17.6, -30);
    ctx.quadraticCurveTo(-16.8, -34.6, -11, -35); ctx.lineTo(11, -35);
    ctx.quadraticCurveTo(16.8 + sw * 0.6, -34.6 + sd * 0.6, 17.6 + sw, -30 + sd);
    ctx.quadraticCurveTo(18.4 + sw, -26 + sd, 15.4 + sw, -21 + sd); ctx.lineTo(13.4 + sw, 1.5 + sd);
    ctx.fillStyle = SHIRT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-13.9, 2); ctx.lineTo(-15.3, -20.5); ctx.quadraticCurveTo(-12.3, -23.5, -11.7, -34.2);
    ctx.lineTo(-6.4, -35); ctx.quadraticCurveTo(0, -31.6, 6.4, -35); ctx.lineTo(11.7 + sw * 0.35, -34.2 + sd * 0.35);
    ctx.quadraticCurveTo(12.3 + sw * 0.8, -23.5 + sd * 0.8, 15.3 + sw, -20.5 + sd); ctx.lineTo(13.9 + sw, 2 + sd);
    ctx.fillStyle = grad(ctx, 'vest', -15, 0, 15, 0, [0, '#a9d418', 0.55, '#cdf532', 1, '#e0ff4d']); ctx.fill();
    ctx.strokeStyle = 'rgba(60,80,0,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
    // silver reflective bands: two round the body (carrying on round his side), two up over the shoulders
    const band = grad(ctx, 'band', -15, 0, 15, 0, [0, '#8e98a3', 0.55, '#eef2f6', 1, '#c9d0d8']);
    ctx.fillStyle = band; ctx.fillRect(-11.1, -34.4, 2.8, 17.4); ctx.fillRect(8.3, -34.4, 2.8, 17.4);
    ctx.beginPath();
    ctx.moveTo(-14.6, -16); ctx.lineTo(14.6, -16); ctx.lineTo(14.6 + sw, -16 + sd);
    ctx.moveTo(-14.1, -7.4); ctx.lineTo(14.1, -7.4); ctx.lineTo(14.1 + sw, -7.4 + sd);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.strokeStyle = band; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // his right side, turned a little away from the light
    ctx.beginPath(); ctx.moveTo(13.9, 2); ctx.lineTo(15.3, -20.5); ctx.lineTo(17.2, -29.5); ctx.lineTo(17.6 + sw, -30 + sd);
    ctx.lineTo(15.3 + sw, -20.5 + sd); ctx.lineTo(13.9 + sw, 2 + sd);
    ctx.fillStyle = 'rgba(30,50,0,0.2)'; ctx.fill();
    ctx.font = `bold 8px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1b2748'; ctx.fillText('ট্রাফিক', 0, -24.6, 15.4);
    // walkie-talkie clipped on the belt at his right hip, LED blinking
    const wx = 9.2 + sw * 0.5, wy = sd * 0.5;
    ctx.fillStyle = '#15171c'; ctx.fillRect(wx, wy - 3.6, 5.2, 12.6);
    ctx.fillStyle = '#3b424e'; ctx.fillRect(wx + 0.9, wy - 2, 3.4, 4.4);
    ctx.fillStyle = '#0d0e11'; ctx.fillRect(wx + 1.1, wy - 11.6, 1.2, 8.4);
    ctx.fillStyle = Math.sin(t * 4) > 0.3 ? '#4ade80' : '#14532d'; ctx.fillRect(wx + 3.5, wy - 3, 1.1, 1.1);
    // whistle cord over the right shoulder, the whistle just showing at his front
    ctx.beginPath(); ctx.moveTo(8.9, -34.8); ctx.quadraticCurveTo(15.8 + sw * 0.5, -33 + sd * 0.5, 15.8 + sw, -21.6 + sd);
    ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#d5dbe2'; ctx.fillRect(15 + sw, -21.9 + sd, 3.2, 2.3);
    // neck and shirt collar
    ctx.fillStyle = SKIN_SH; ctx.fillRect(-5.2, -42, 10.6, 9);
    ctx.beginPath(); ctx.moveTo(-7.2, -33.3); ctx.lineTo(-6.3, -37.6); ctx.quadraticCurveTo(0.2, -36.3, 6.6, -37.6);
    ctx.lineTo(7.8 + sw * 0.3, -33.3 + sd * 0.3); ctx.quadraticCurveTo(0.2, -31.8, -7.2, -33.3);
    ctx.fillStyle = SHIRT; ctx.fill(); ctx.strokeStyle = SHIRT_DK; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.restore();

    if (rMode === 1) rightArm();

    // head (wobbles when dizzy, lolls as he goes down)
    const hc = P(bodyPt(B, 0, 46.5 + breathe, 0.5));
    const wob = Math.sin(t * 7);
    ctx.save();
    ctx.translate(hc[0] + dizzy * 2.4 * wob, hc[1] + dizzy * 1.2 * Math.cos(t * 7));
    ctx.rotate(lean * 0.7 + dizzy * 0.16 * Math.sin(t * 7 + 0.6) + topple * 0.3);
    drawHead(ctx, fall < 0.34);
    ctx.restore();

    if (rMode === 2) rightArm();

    ctx.restore(); // body rotation

    // the cap tumbles off and lands beside him
    if (fall >= 0.34) {
      const u = clamp((fall - 0.34) / 0.4, 0, 1), rest = sstep(0.74, 1, fall);
      const x = 2 + 46 * u + 5 * rest, y = -108 - 105 * u + 205 * u * u;
      const rot = -u * (TAU + 0.55) + 0.14 * Math.sin((fall - 0.74) * 34) * (fall > 0.74 ? 1 - rest : 0);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot); ctx.translate(0, 11.5);
      drawCap(ctx);
      ctx.restore();
    }
    // dizzy stars circling his head
    if (fall > 0.04) {
      const ca = Math.cos(bodyAng), sa = Math.sin(bodyAng);
      const cx = hc[0] * ca - hc[1] * sa, cy = hc[0] * sa + hc[1] * ca - 22 + 8 * topple;
      ctx.beginPath(); ctx.ellipse(cx, cy, 13, 4, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.font = `bold 9px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * TAU) / 3;
        ctx.fillText('★', cx + Math.cos(a) * 13, cy + Math.sin(a) * 4);
      }
    }
    ctx.restore();
  }

  TH.fpPlayer = { drawSergeant };
})();
