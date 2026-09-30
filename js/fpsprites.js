// First-person sprites: rickshaws seen from the front (oncoming) and from behind (wrong-way riders),
// and the sergeant's own hands. See js/FP_CONTRACT.md §8. Pure drawing, no game logic.
// Styled after the Classic art in js/sprites.js (same palettes and per-rickshaw choices from k.seed).
// A rickshaw is drawn on several planes between the engine's `far` and `near` projections (depth is
// interpolated, so perspective stays right): hood, passengers, carriage and driver keep their parallax.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = TH.fp;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const shade = fp.shade;

  // ---------- palette (shared with the Classic sprites) ----------
  const ART = ['#ff2e88', '#ffd23f', '#18c29c', '#3a86ff', '#ff7b25', '#a855f7', '#7ed957', '#fdfdfd'];
  const CUSHIONS = ['#b5172f', '#11897a', '#3d348b', '#d9480f', '#1f7a3a'];
  const SLOGANS = ['মায়ের দোয়া', 'মায়ের দোয়া', 'বাবার দোয়া', 'সোনার বাংলা', 'ভাই ভাই', 'রূপসী বাংলা', 'দুই বন্ধু'];
  const GAMCHAS = [['#d62828', '#fbe3c4'], ['#2b9348', '#f25c54'], ['#1d4e89', '#fbe3c4'], ['#e36414', '#fff3b0']];
  const SHIRTS = ['#4a90c2', '#c2553b', '#6a8e3a', '#8e5aa8', '#d4a017', '#5b6770'];
  const PANTS = ['#2f3a4f', '#3d405b', '#5c4033', '#22223b', '#57606f'];
  const SCARVES = ['#1d3557', '#6d597a', '#2a9d8f', '#b56576', '#264653', '#e5989b'];
  const SANDALS = ['#1e3a8a', '#b91c1c', '#111827', '#15803d'];
  const CAPS = ['#f5f5ee', '#f5f5ee', '#2f3e46', '#7a1e1e'];
  const LININGS = [null, '#2b1d3a', '#15151b'];
  const INK = 'rgba(40,20,10,0.5)';
  const CHROME = '#e4e9ee';
  const HAIR = '#17110d', GREY = '#8f8b86';
  const DIGITS = '০১২৩৪৫৬৭৮৯';

  // ---------- helpers ----------
  // Gradients are built in plane-local space, so one per (colours, part) is reused every frame.
  const grads = new Map();
  function grad(ctx, key, x0, y0, x1, y1, stops, r0, r1) {
    let g = grads.get(key);
    if (!g) {
      g = r0 === undefined ? ctx.createLinearGradient(x0, y0, x1, y1) : ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
      const s = stops();
      for (let i = 0; i < s.length; i += 2) g.addColorStop(s[i], s[i + 1]);
      if (grads.size > 400) grads.clear();
      grads.set(key, g);
    }
    return g;
  }
  function ell(ctx, x, y, rx, ry, rot, c) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fillStyle = c; ctx.fill(); }
  function circ(ctx, x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = c; ctx.fill(); }
  function line(ctx, p, c, w) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
  }
  function fillPoly(ctx, p, c) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.fillStyle = c; ctx.fill();
  }
  // Six-petal flower: round-capped dashes around a ring, optional centre.
  function flower(ctx, x, y, r, petal, core) {
    ctx.setLineDash([0.01, r * 1.04]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.strokeStyle = petal; ctx.lineWidth = r * 1.3; ctx.stroke();
    ctx.setLineDash([]);
    if (core) circ(ctx, x, y, r * 0.55, core);
  }
  // Two-bone IK: the joint between (ax, ay) and (bx, by); side picks which way it bends.
  function ik(ax, ay, bx, by, l1, l2, side) {
    const dx = bx - ax, dy = by - ay;
    const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01));
    const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const ang = Math.atan2(dy, dx) - side * Math.acos(clamp(c, -1, 1));
    return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
  }

  // ---------- planes ----------
  // Plane between A (t = 0) and B (t = 1). Depth is interpolated, so screen x/y stay linear in scale.
  function lerpPlane(A, B, t) {
    const ia = 1 / A.s, ib = 1 / B.s;
    const s = 1 / Math.max(1e-4, ia + (ib - ia) * t);
    const ds = B.s - A.s;
    const w = Math.abs(ds) > 1e-6 ? (s - A.s) / ds : t;
    return { x: A.x + (B.x - A.x) * w, y: A.y + (B.y - A.y) * w, s, d: A.d + (B.d - A.d) * t };
  }
  function enter(ctx, P) { ctx.save(); ctx.translate(P.x, P.y); ctx.scale(P.s, P.s); }
  const SX = (P, x) => P.x + x * P.s, SY = (P, y) => P.y + y * P.s;
  // A point given in Q-local units, expressed in P-local units.
  const inX = (P, Q, x) => (Q.x + x * Q.s - P.x) / P.s, inY = (P, Q, y) => (Q.y + y * Q.s - P.y) / P.s;
  // |sin| of the angle between the line of sight and the road axis, at local x on plane P:
  // 0 = a wheel seen exactly edge-on, larger = more of its side shows.
  function sideOf(P, lx) {
    const ux = (P.x - fp.CX) / P.s + lx, dz = fp.F / P.s;
    return Math.abs(ux) / Math.sqrt(ux * ux + dz * dz);
  }

  // ---------- per-rickshaw look (same choices as the Classic sprite, plus first-person extras) ----------
  const looks = new WeakMap();
  function lookOf(k) {
    let L = looks.get(k);
    if (L && L.seed === k.seed) return L;
    const rnd = TH.mulberry32((k.seed | 0) + 40503);
    const ai = (rnd() * 8) | 0, art = [];
    for (let i = 0; i < 8; i++) art.push(ART[(ai + i) % 8]);
    const motif = (rnd() * 3) | 0, scene = (rnd() * 3) | 0;
    const cushion = CUSHIONS[(rnd() * CUSHIONS.length) | 0], slogan = SLOGANS[(rnd() * SLOGANS.length) | 0];
    const gam = GAMCHAS[(rnd() * GAMCHAS.length) | 0], gamHead = rnd() < 0.5, shirtOn = rnd() < 0.4;
    const moustache = rnd() < 0.55, shirtCol = SHIRTS[(rnd() * SHIRTS.length) | 0], sandal = SANDALS[(rnd() * SANDALS.length) | 0];
    const checkLight = rnd() < 0.5;
    const r = TH.mulberry32((k.seed | 0) + 90731);
    let plate = '';
    for (let n = 1000 + ((r() * 9000) | 0); n > 0; n = (n / 10) | 0) plate = DIGITS[n % 10] + plate;
    L = {
      seed: k.seed, art, motif, scene, cushion, slogan, gam, gamHead, shirtOn, moustache, shirtCol, sandal,
      check: checkLight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.28)',
      plate: 'ঢাকা ' + plate,
      cap: !gamHead && r() < 0.35, capCol: CAPS[(r() * CAPS.length) | 0],
      grey: r() < 0.2, beard: r() < 0.3, stubble: 0.12 + r() * 0.18,
      brow: (r() - 0.5) * 0.9, faceW: 8.5 + r() * 1.1, spiral: r() < 0.5,
      lining: LININGS[(r() * LININGS.length) | 0], soloR: r() < 0.5, smile: r() - 0.3,
      blink: r() * 5, ears: 1.9 + r() * 0.6,
    };
    looks.set(k, L);
    return L;
  }

  // Passenger look: the Classic type choice (shirt, panjabi, saree, salwar, school kid) plus face extras.
  const paxLooks = new WeakMap();
  function paxLook(p, kid) {
    let q = paxLooks.get(p);
    if (q && q.kid === kid && q.seed === p.seed) return q;
    const r = TH.mulberry32((p.seed | 0) + 101);
    const u = r();
    const type = kid ? 4 : u < 0.28 ? 0 : u < 0.46 ? 1 : u < 0.73 ? 2 : 3;
    const main = p.shirt || '#e63946', acc = ART[(r() * 8) | 0];
    const top = type === 1 ? shade(main, 0.55) : kid ? '#eef2f8' : main;
    const low = type === 2 ? main : type === 3 ? shade(acc, 0.4) : kid ? '#27407a' : PANTS[(r() * PANTS.length) | 0];
    const hijab = type === 3 && r() < 0.55, cap = type === 1 && r() < 0.45;
    const r2 = TH.mulberry32((p.seed | 0) + 9173);
    const scarf = SCARVES[(r2() * SCARVES.length) | 0], ghomta = type === 2 && r2() < 0.35;
    q = {
      kid, seed: p.seed, type, main, acc, top, low, hijab, cap, scarf, ghomta, skin: p.skin || '#8d5a3b',
      teep: type === 2 && r2() < 0.4, smile: r2() < 0.5, specs: !kid && r2() < 0.14,
      hair: hijab || ghomta ? 2 : cap ? 3 : type === 2 || type === 3 ? 1 : 0,
    };
    paxLooks.set(p, q);
    return q;
  }

  // Slap reaction. slapT is frozen at 0 through the hit-stop while the hand is still flying in,
  // so the head only snaps once the hand has landed.
  function slapOf(k) {
    if (!k.slapped) return null;
    const st = Math.max(0, k.slapT || 0);
    const hit = clamp(st / 0.012, 0, 1);
    const e = Math.max(0, st - 0.012);
    return {
      st, hit,
      snap: hit * Math.exp(-e * 2.4) * (0.72 + 0.28 * Math.cos(e * 26)), // head flung toward screen-left, springing back
      daze: hit * clamp(1.6 - st, 0, 1),                                  // goofy wobble while dazed
      mark: hit * Math.max(0.3, 1 - st / 3),                              // handprint fades
      fly: hit * clamp(1 - st / 1.4, 0, 1),                               // headwear, sweat, phone in the air
    };
  }

  // ---------- passengers ----------
  // Seated passenger facing the camera, plane-local: hip centre (x, y), scale s (< 0.9 = child).
  // `full` adds arms and clothing details. Heads are queued in H (x, y, s, look) and hands in HH
  // (x, y, r); paxFaces() finishes them all together in a few batched paths.
  function paxFront(ctx, q, x, y, s, full, gasp, H, HH) {
    const X = (v) => x + v * s, Y = (v) => y + v * s;
    const t = q.type, skin = q.skin;
    ctx.beginPath(); ctx.moveTo(X(-7.8), Y(t === 1 ? 3 : 1.5));
    ctx.quadraticCurveTo(X(-9.8), Y(-12), X(-8.9), Y(-19.5));
    ctx.quadraticCurveTo(X(-8.2), Y(-22.8), X(-3), Y(-23)); ctx.lineTo(X(3), Y(-23));
    ctx.quadraticCurveTo(X(8.2), Y(-22.8), X(8.9), Y(-19.5));
    ctx.quadraticCurveTo(X(9.8), Y(-12), X(7.8), Y(t === 1 ? 3 : 1.5)); ctx.closePath();
    ctx.fillStyle = q.top; ctx.fill();
    if (full) {
      if (t === 0) fillPoly(ctx, [X(-3.2), Y(-23), X(0), Y(-18.2), X(3.2), Y(-23)], skin);          // open collar
      else if (t === 1) line(ctx, [X(0), Y(-22.4), X(0), Y(-11)], 'rgba(0,0,0,0.22)', 0.8 * s);     // panjabi placket
      else if (t === 2) line(ctx, [X(-7.4), Y(-21.5), X(-1), Y(-12), X(8.6), Y(-2)], q.acc, 4.4 * s); // saree anchal
      else if (t === 3) line(ctx, [X(-7.8), Y(-20.5), X(-3.6), Y(-12.5), X(3.6), Y(-12.5), X(7.8), Y(-20.5)], q.acc, 3.4 * s); // orna
      else line(ctx, [X(-4.8), Y(-22.6), X(-5.2), Y(-9), X(5.2), Y(-9), X(4.8), Y(-22.6)], q.main, 2.2 * s); // bag straps
      // arms: hands on the lap, or flung up beside the face in shock
      ctx.beginPath();
      for (let g = -1; g <= 1; g += 2) {
        ctx.moveTo(X(8.4 * g), Y(-19.5));
        if (gasp) { ctx.lineTo(X(11.8 * g), Y(-14)); ctx.lineTo(X(9.8 * g), Y(-27.6)); }
        else { ctx.lineTo(X(10 * g), Y(-8.5)); ctx.lineTo(X(4.6 * g), Y(-1.8)); }
      }
      ctx.strokeStyle = t === 2 ? skin : q.top; ctx.lineWidth = 3.7 * s; ctx.stroke();
      if (gasp) HH.push(X(-9.8), Y(-28.4), 1.9 * s, X(9.8), Y(-28.4), 1.9 * s);
    }
    ctx.fillStyle = shade(skin, -0.22); ctx.fillRect(X(-2.2), Y(-26.5), 4.4 * s, 4.5 * s); // neck
    const hx = X(0), hy = Y(-29.5);
    if (q.hijab) {
      fillPoly(ctx, [X(-7.4), Y(-26), X(7.4), Y(-26), X(9.4), Y(-18.5), X(-9.4), Y(-18.5)], q.scarf);
      ell(ctx, hx, hy + 0.5 * s, 9 * s, 10.2 * s, 0, q.scarf);
      ell(ctx, hx, hy - 0.2 * s, 5.8 * s, 6.8 * s, 0, skin);
    } else {
      circ(ctx, hx, hy, 7 * s, skin);
      if (q.ghomta) { // the saree's end drawn over the head
        ctx.beginPath(); ctx.moveTo(hx - 7.9 * s, hy + 3 * s); ctx.arc(hx, hy + 0.3 * s, 8.3 * s, PI * 0.9, PI * 2.1);
        ctx.quadraticCurveTo(hx, hy - 11 * s, hx - 7.9 * s, hy + 3 * s);
        ctx.fillStyle = q.main; ctx.fill();
      }
    }
    H.push(hx, hy, s, q);
  }

  // Hands, hair, caps, eyes, brows and mouths of all queued front-facing passengers.
  // det = px per unit on the plane (small features drop out when far).
  function paxFaces(ctx, H, HH, det, gasp) {
    if (!H.length) return;
    if (HH.length) {
      ctx.beginPath();
      for (let i = 0; i < HH.length; i += 3) { ctx.moveTo(HH[i] + HH[i + 2], HH[i + 1]); ctx.arc(HH[i], HH[i + 1], HH[i + 2], 0, TAU); }
      ctx.fillStyle = H[3].skin; ctx.fill();
    }
    let caps = false, teep = false;
    ctx.beginPath();
    for (let i = 0; i < H.length; i += 4) {
      const x = H[i], y = H[i + 1], s = H[i + 2], q = H[i + 3];
      if (q.hair === 3) caps = true;
      if (q.teep) teep = true;
      if (q.hair > 1) continue;
      ctx.moveTo(x - 7.3 * s, y + 0.4 * s);
      ctx.arc(x, y - 0.3 * s, 7.45 * s, PI * 0.98, PI * 2.02);
      ctx.quadraticCurveTo(x + s, y - 11.2 * s, x - 7.3 * s, y + 0.4 * s);
      if (q.hair === 1) { // long hair falling to the shoulders
        ctx.moveTo(x - 4.9 * s, y + 4.6 * s); ctx.ellipse(x - 7.2 * s, y + 4.6 * s, 2.3 * s, 6.6 * s, 0, 0, TAU);
        ctx.moveTo(x + 9.5 * s, y + 4.6 * s); ctx.ellipse(x + 7.2 * s, y + 4.6 * s, 2.3 * s, 6.6 * s, 0, 0, TAU);
      }
    }
    ctx.fillStyle = HAIR; ctx.fill();
    if (caps) { // white tupi caps
      ctx.beginPath();
      for (let i = 0; i < H.length; i += 4) {
        if (H[i + 3].hair !== 3) continue;
        const x = H[i], y = H[i + 1], s = H[i + 2];
        ctx.moveTo(x + 7.5 * s, y - 1.8 * s); ctx.arc(x, y - 1.8 * s, 7.5 * s, 0, PI, true);
      }
      ctx.fillStyle = '#f5f5ee'; ctx.fill();
    }
    // eyes (a white ring round them when they gasp)
    ctx.beginPath();
    for (let i = 0; i < H.length; i += 4) {
      const x = H[i], s = H[i + 2], y = H[i + 1] - 0.8 * s, r = 0.95 * s;
      ctx.moveTo(x - 2.6 * s + r, y); ctx.arc(x - 2.6 * s, y, r, 0, TAU);
      ctx.moveTo(x + 2.6 * s + r, y); ctx.arc(x + 2.6 * s, y, r, 0, TAU);
    }
    ctx.fillStyle = '#1a100a'; ctx.fill();
    if (gasp && det > 1.1) { ctx.strokeStyle = '#fbf7f0'; ctx.lineWidth = 0.8; ctx.stroke(); }
    if (det < 1.1) return;
    // brows (shot up in shock) and mouths (smiles, or a gasping "O")
    ctx.fillStyle = HAIR;
    if (H.length <= 12) for (let i = 0; i < H.length; i += 4) { // (a crammed load hides them anyway)
      const x = H[i], s = H[i + 2], y = H[i + 1] - (gasp ? 5.6 : 3.8) * s;
      ctx.fillRect(x - 4.3 * s, y, 3.1 * s, 0.85 * s); ctx.fillRect(x + 1.2 * s, y, 3.1 * s, 0.85 * s);
    }
    ctx.beginPath();
    for (let i = 0; i < H.length; i += 4) {
      const x = H[i], y = H[i + 1], s = H[i + 2], q = H[i + 3];
      if (gasp) { ctx.moveTo(x + 1.3 * s, y + 4 * s); ctx.ellipse(x, y + 4 * s, 1.3 * s, 1.9 * s, 0, 0, TAU); }
      else { ctx.moveTo(x - 1.9 * s, y + 3.4 * s); ctx.quadraticCurveTo(x, y + (q.smile ? 4.9 : 3.9) * s, x + 1.9 * s, y + 3.4 * s); }
    }
    if (gasp) { ctx.fillStyle = '#3a0d0a'; ctx.fill(); } else { ctx.strokeStyle = '#6b2a1f'; ctx.lineWidth = 0.75; ctx.stroke(); }
    if (teep && det > 1.8) {
      ctx.fillStyle = '#d00000';
      for (let i = 0; i < H.length; i += 4) if (H[i + 3].teep) ctx.fillRect(H[i] - 0.5 * H[i + 2], H[i + 1] - 4 * H[i + 2], H[i + 2], H[i + 2]);
    }
  }

  // Passenger seen from behind: shoulders above the backrest and the back of the head.
  // `turn` shifts the head sideways (they crane round to look when the driver is slapped).
  function paxBack(ctx, q, x, y, s, turn, H) {
    const X = (v) => x + v * s, Y = (v) => y + v * s;
    const t = q.type;
    ctx.beginPath(); ctx.moveTo(X(-8.6), Y(-6));
    ctx.quadraticCurveTo(X(-9.8), Y(-19), X(-8), Y(-22.2)); ctx.quadraticCurveTo(X(-6), Y(-23.4), X(-2.6), Y(-23.4));
    ctx.lineTo(X(2.6), Y(-23.4)); ctx.quadraticCurveTo(X(6), Y(-23.4), X(8), Y(-22.2));
    ctx.quadraticCurveTo(X(9.8), Y(-19), X(8.6), Y(-6)); ctx.closePath();
    ctx.fillStyle = q.top; ctx.fill();
    if (t === 2) line(ctx, [X(-5.6), Y(-23), X(-2.8), Y(-15), X(-4), Y(-6)], q.acc, 4.6 * s);      // anchal down the back
    else if (t === 3) line(ctx, [X(-8), Y(-21.4), X(0), Y(-17.6), X(8), Y(-21.4)], q.acc, 3.2 * s); // orna
    else if (t === 4) { ctx.fillStyle = q.main; ctx.fillRect(X(-5.6), Y(-21.5), 11.2 * s, 13 * s); } // school bag
    ctx.fillStyle = shade(q.skin, -0.2); ctx.fillRect(X(-2.3), Y(-26.5), 4.6 * s, 4.5 * s);
    const hx = X(turn), hy = Y(-29.5);
    if (q.hijab) {
      fillPoly(ctx, [X(-7), Y(-27), X(7), Y(-27), X(9.6), Y(-18.5), X(-9.6), Y(-18.5)], q.scarf);
      ell(ctx, hx, hy + 0.4 * s, 8.8 * s, 9.9 * s, 0, q.scarf);
    } else {
      ell(ctx, hx, hy, 7.4 * s, 7 * s, 0, q.skin); // the ears show at the sides
      if (q.ghomta) {
        ctx.beginPath(); ctx.arc(hx, hy - 0.4 * s, 8.2 * s, PI * 0.75, PI * 2.25); ctx.closePath();
        ctx.fillStyle = q.main; ctx.fill();
      }
    }
    H.push(hx, hy, s, q);
  }
  function paxBacks(ctx, H) {
    if (!H.length) return;
    let caps = false;
    ctx.beginPath();
    for (let i = 0; i < H.length; i += 4) {
      const x = H[i], y = H[i + 1], s = H[i + 2], q = H[i + 3];
      if (q.hair === 3) caps = true;
      if (q.hair === 2) continue;
      ctx.moveTo(x + Math.cos(PI * 0.8) * 7.2 * s, y - 0.6 * s + Math.sin(PI * 0.8) * 7.2 * s);
      ctx.arc(x, y - 0.6 * s, 7.2 * s, PI * 0.8, PI * 2.2); ctx.closePath();
      if (q.hair === 1) { ctx.moveTo(x + 3.4 * s, y + 3 * s); ctx.ellipse(x, y + 3 * s, 3.4 * s, 3 * s, 0, 0, TAU); } // bun
    }
    ctx.fillStyle = HAIR; ctx.fill();
    if (!caps) return;
    ctx.beginPath();
    for (let i = 0; i < H.length; i += 4) {
      if (H[i + 3].hair !== 3) continue;
      const x = H[i], y = H[i + 1], s = H[i + 2];
      ctx.moveTo(x + 7.5 * s, y - 1.8 * s); ctx.arc(x, y - 1.8 * s, 7.5 * s, 0, PI, true);
    }
    ctx.fillStyle = '#f5f5ee'; ctx.fill();
  }

  // ---------- the driver's head, facing the camera (head-local: centre at 0, 0, radius ~10) ----------
  function faceFront(ctx, k, L, S, det) {
    const skin = k.skin || '#8d5a3b', fw = L.faceW, hairC = L.grey ? GREY : HAIR;
    const hit = !!(S && S.hit > 0);
    // ears, then the face with a warm light from the upper right
    ctx.beginPath(); ctx.ellipse(-fw - 0.2, 0.8, L.ears, 3.3, 0, 0, TAU);
    ctx.moveTo(fw + 0.2 + L.ears, 0.8); ctx.ellipse(fw + 0.2, 0.8, L.ears, 3.3, 0, 0, TAU);
    ctx.moveTo(fw, 0); ctx.ellipse(0, 0, fw, 10.3, 0, 0, TAU);
    ctx.fillStyle = grad(ctx, 'face|' + skin, 3.2, -4.2, 0, 0.5, () => [0, shade(skin, 0.2), 0.5, skin, 1, shade(skin, -0.34)], 0.5, 12.6);
    ctx.fill();
    if (det > 1.4) { // stubble along the jaw, and a chin beard on some
      ctx.beginPath(); ctx.moveTo(-fw + 0.5, 1.2); ctx.quadraticCurveTo(-fw + 1, 9.6, 0, 10.2);
      ctx.quadraticCurveTo(fw - 1, 9.6, fw - 0.5, 1.2); ctx.quadraticCurveTo(4.2, 4.6, 0, 4);
      ctx.quadraticCurveTo(-4.2, 4.6, -fw + 0.5, 1.2);
      if (L.beard) { ctx.moveTo(3.4, 9); ctx.ellipse(0, 9, 3.4, 1.9, 0, 0, TAU); }
      ctx.fillStyle = L.stub || (L.stub = `rgba(35,22,14,${L.stubble.toFixed(2)})`); ctx.fill();
    }
    // hair, brows and moustache in one fill (a slap knocks the gamcha or cap off and the hair stands on end)
    const up = hit ? 2.4 : 0, b = L.brow;
    ctx.beginPath();
    if (!L.gamHead || hit) {
      ctx.moveTo(-fw - 0.2, -0.8);
      ctx.bezierCurveTo(-fw - 1, -9.5, -5.2, -12.4, 0, -12.2);
      ctx.bezierCurveTo(5.2, -12.4, fw + 1, -9.5, fw + 0.2, -0.8);
      ctx.lineTo(fw - 0.8, -2.2);
      ctx.bezierCurveTo(fw - 1.4, -6.6, 4, -7.6, 0.6, -6.9);
      ctx.bezierCurveTo(-3.4, -7.8, -fw + 1.4, -6.8, -fw + 0.8, -2.2);
      ctx.closePath();
      if (hit && S.fly > 0) {
        const u = 2.5 + 3.4 * S.fly;
        ctx.moveTo(-5.6, -11.2); ctx.lineTo(-7.6, -11.4 - u); ctx.lineTo(-2.6, -12.1);
        ctx.lineTo(-1.2, -12.4 - u * 1.25); ctx.lineTo(1.6, -12.2); ctx.lineTo(4, -11.8 - u); ctx.lineTo(5.8, -11);
      }
    }
    for (let g = -1; g <= 1; g += 2) { // brows: raised and worried after the slap
      ctx.moveTo(-6.8 * g, -4 + b * 0.6 - up * 0.6);
      ctx.quadraticCurveTo(-4.4 * g, -6.2 - up, -1.5 * g, -5.1 - b - up * 1.5);
      ctx.quadraticCurveTo(-4.4 * g, -4.6 - up, -6.8 * g, -4 + b * 0.6 - up * 0.6);
    }
    if (L.moustache && !hit) {
      ctx.moveTo(-4.8, 6.3); ctx.quadraticCurveTo(-2.3, 4.3, 0, 5.1); ctx.quadraticCurveTo(2.3, 4.3, 4.8, 6.3);
      ctx.quadraticCurveTo(2.4, 6.7, 0, 6.1); ctx.quadraticCurveTo(-2.4, 6.7, -4.8, 6.3);
    }
    ctx.fillStyle = hairC; ctx.fill();
    if (L.gamHead && !hit) { // checked gamcha tied round the head, knot on the side
      ctx.beginPath(); ctx.moveTo(-fw - 0.9, -2.4);
      ctx.bezierCurveTo(-fw - 2.2, -11, -5.4, -14.4, 0, -14.2);
      ctx.bezierCurveTo(5.4, -14.4, fw + 2.2, -11, fw + 0.9, -2.4);
      ctx.bezierCurveTo(5, -8.4, -5, -8.4, -fw - 0.9, -2.4);
      ctx.moveTo(-fw + 2.8, -8.6); ctx.ellipse(-fw + 0.2, -8.6, 2.6, 2.1, 0, 0, TAU);
      ctx.fillStyle = L.gam[0]; ctx.fill();
      if (det > 0.8) {
        ctx.setLineDash([1.1, 1.5]); ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(-fw + 0.4, -5.2); ctx.quadraticCurveTo(0, -10.6, fw - 0.4, -5.2);
        ctx.moveTo(-fw + 1.8, -10); ctx.quadraticCurveTo(0, -14.8, fw - 1.8, -10);
        ctx.strokeStyle = L.gam[1]; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]); ctx.lineCap = 'round';
        line(ctx, [-fw - 0.4, -7, -fw - 2.6, -2.5, -fw - 1.6, 2.6], L.gam[0], 2.2);
      }
    } else if (L.cap && !hit) { // crocheted cap
      ctx.beginPath(); ctx.moveTo(-fw - 0.5, -4.4); ctx.bezierCurveTo(-fw, -13.4, fw, -13.4, fw + 0.5, -4.4);
      ctx.quadraticCurveTo(0, -8.4, -fw - 0.5, -4.4);
      ctx.fillStyle = L.capCol; ctx.fill();
      if (det > 2) { ctx.setLineDash([0.01, 1.6]); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.setLineDash([]); }
    }
    if (hit) { // big red handprint on the cheek the palm hit (screen right)
      const c = `rgba(226,30,46,${(0.62 * S.mark).toFixed(2)})`;
      ell(ctx, 4.8, 3.4, 3.4, 3.9, -0.4, c);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { // four fingers fanning up toward the ear, and the thumb
        const a = i < 4 ? -1.95 + i * 0.45 : 2.45, r1 = i < 4 ? 7.4 : 6.2;
        ctx.moveTo(4.8 + Math.cos(a) * 2.5, 3.4 + Math.sin(a) * 2.5); ctx.lineTo(4.8 + Math.cos(a) * r1, 3.4 + Math.sin(a) * r1);
      }
      ctx.strokeStyle = c; ctx.lineWidth = 2.1; ctx.stroke();
    }
    // eyes
    if (hit) {
      ctx.beginPath(); ctx.ellipse(-3.7, -1.4, 2.5, 2.1, 0, 0, TAU); ctx.moveTo(6.2, -1.4); ctx.ellipse(3.7, -1.4, 2.5, 2.1, 0, 0, TAU);
      ctx.fillStyle = '#f6f0e4'; ctx.fill();
      ctx.beginPath();
      if (L.spiral) { // spinning spirals
        for (let g = -1; g <= 1; g += 2) {
          const ex = 3.7 * g, a = S.st * 13 * g;
          ctx.moveTo(ex + Math.cos(a) * 0.4, -1.4 + Math.sin(a) * 0.4);
          ctx.arc(ex, -1.4, 0.7, a, a + PI, g < 0); ctx.arc(ex + 0.3 * g, -1.4, 1.35, a + PI, a + TAU, g < 0);
          ctx.arc(ex, -1.4, 2, a, a + PI * 1.2, g < 0);
        }
      } else { // X eyes
        for (let g = -1; g <= 1; g += 2) {
          const ex = 3.7 * g;
          ctx.moveTo(ex - 1.6, -3); ctx.lineTo(ex + 1.6, 0.2); ctx.moveTo(ex + 1.6, -3); ctx.lineTo(ex - 1.6, 0.2);
        }
      }
      ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 0.9; ctx.stroke();
    } else if (((k.t || 0) + L.blink) % 4.3 < 0.13) { // blink
      ctx.beginPath(); ctx.moveTo(-5.6, -1.1); ctx.quadraticCurveTo(-3.7, -0.1, -1.8, -1.1);
      ctx.moveTo(5.6, -1.1); ctx.quadraticCurveTo(3.7, -0.1, 1.8, -1.1);
      ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 0.8; ctx.stroke();
    } else if (det > 1.6) {
      const look = k.violation === 'phone' ? -0.55 : 0; // on the phone: eyes drift away
      ctx.beginPath(); ctx.ellipse(-3.7, -1.3, 2.1, 1.3, 0, 0, TAU); ctx.moveTo(5.8, -1.3); ctx.ellipse(3.7, -1.3, 2.1, 1.3, 0, 0, TAU);
      ctx.fillStyle = '#f3ede2'; ctx.fill(); ctx.strokeStyle = 'rgba(40,20,10,0.55)'; ctx.lineWidth = 0.55; ctx.stroke();
      ctx.beginPath(); ctx.arc(-3.5 + look, -1.2, 1.05, 0, TAU); ctx.moveTo(4.95 + look, -1.2); ctx.arc(3.9 + look, -1.2, 1.05, 0, TAU);
      ctx.fillStyle = '#2b1a10'; ctx.fill();
      if (det > 2.4 && !(S && S.hit > 0)) {
        ctx.beginPath(); ctx.arc(-3.1 + look, -1.6, 0.36, 0, TAU); ctx.moveTo(4.66 + look, -1.6); ctx.arc(4.3 + look, -1.6, 0.36, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.arc(-3.6, -1.2, 1.2, 0, TAU); ctx.moveTo(4.8, -1.2); ctx.arc(3.6, -1.2, 1.2, 0, TAU);
      ctx.fillStyle = '#1a100a'; ctx.fill();
    }
    // nose
    ell(ctx, 0, 3.3, 2.6, 1.45, 0, shade(skin, -0.14));
    if (det > 2 && !hit) ell(ctx, 0.9, 1.4, 0.8, 1.9, 0.15, 'rgba(255,236,214,0.22)'); // light down the bridge
    // mouth: a howl after the slap, chatting away on the phone, or a plain line
    if (hit) {
      ell(ctx, 0.4, 7.7, 3, 3.4, 0.1, '#3b0c0c');
      ell(ctx, 1.1, 9.7, 2, 1.2, 0.2, '#e0566b');
      ctx.fillStyle = '#f7f3ea'; ctx.fillRect(-2, 4.7, 4.4, 1.3);
      if (L.moustache) {
        ctx.beginPath(); ctx.moveTo(-4.8, 5.4); ctx.quadraticCurveTo(-2.3, 3.4, 0, 4.2); ctx.quadraticCurveTo(2.3, 3.4, 4.8, 5.4);
        ctx.quadraticCurveTo(0, 5.4, -4.8, 5.4); ctx.fillStyle = hairC; ctx.fill();
      }
    } else if (k.violation === 'phone') {
      ell(ctx, 0.2, 7.6, 2.2, 0.5 + 0.9 * Math.abs(Math.sin((k.t || 0) * 11)), 0, '#4a1a12');
    } else {
      ctx.beginPath(); ctx.moveTo(-2.8, 7.5); ctx.quadraticCurveTo(0, 7.7 + L.smile * 1.8, 2.8, 7.5);
      ctx.strokeStyle = '#5a2a1c'; ctx.lineWidth = 0.95; ctx.stroke();
    }
  }

  // Things knocked into the air by the slap, in plane-local units around the head at (hx, hy).
  function slapDebris(ctx, k, L, S, hx, hy, dirX) {
    const e = S.st, a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * S.fly;
    // sweat drops spraying off the head
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = -PI * (0.1 + i * 0.27), sp = 13 + (i % 3) * 5, r = 11 + sp * e * 3;
      const x = hx + Math.cos(ang) * r, y = hy + Math.sin(ang) * r + 40 * e * e, rot = ang + PI / 2;
      ctx.moveTo(x + Math.cos(rot) * 1.2, y + Math.sin(rot) * 1.2); ctx.ellipse(x, y, 1.2, 2, rot, 0, TAU);
    }
    ctx.fillStyle = 'rgba(190,232,255,0.95)'; ctx.fill();
    // the gamcha or cap flies off, tumbling
    if (L.gamHead || L.cap) {
      ctx.save();
      ctx.translate(hx + dirX * (8 + 55 * e), hy - 12 - 46 * e + 52 * e * e);
      ctx.rotate(dirX * e * 8);
      if (L.gamHead) {
        ctx.beginPath(); ctx.moveTo(-9, 0.8); ctx.quadraticCurveTo(-4, -3.6, 1, 0.2); ctx.quadraticCurveTo(5.5, 3.4, 10.2, -0.4);
        ctx.strokeStyle = L.gam[0]; ctx.lineWidth = 4.6; ctx.stroke(); // a checked cloth, flapping as it tumbles
        ctx.setLineDash([1.1, 1.5]); ctx.lineCap = 'butt'; ctx.strokeStyle = L.gam[1]; ctx.stroke();
        ctx.setLineDash([]); ctx.lineCap = 'round';
      } else {
        ctx.beginPath(); ctx.moveTo(-9, 3); ctx.bezierCurveTo(-8.5, -6.5, 8.5, -6.5, 9, 3); ctx.quadraticCurveTo(0, 1, -9, 3);
        ctx.fillStyle = L.capCol; ctx.fill();
      }
      ctx.restore();
    }
    if (k.violation === 'phone') { // the phone goes flying too
      ctx.save();
      ctx.translate(hx - 14 - 70 * e, hy - 4 - 38 * e + 60 * e * e); ctx.rotate(-e * 14);
      ctx.fillStyle = '#111827'; ctx.fillRect(-2.2, -5, 4.4, 10);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(-1.5, -4, 3, 7.4);
      ctx.restore();
    }
    ctx.globalAlpha = a0;
  }

  // Checked gamcha: a stroke with a dashed stroke of the second colour over it.
  function gamStroke(ctx, pts, gam, w) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 4) ctx.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    ctx.strokeStyle = gam[0]; ctx.lineWidth = w; ctx.stroke();
    ctx.setLineDash([0.5, 1.6]); ctx.lineCap = 'butt';
    ctx.strokeStyle = gam[1]; ctx.stroke();                 // cross stripes...
    ctx.setLineDash([]); ctx.lineCap = 'round';
    ctx.lineWidth = w * 0.22; ctx.stroke();                 // ...and one along it: a check
  }

  // ---------- the driver facing the camera (near plane; head centre fixed at (0, -91)) ----------
  function driverFront(ctx, k, L, S, P, det, lean) {
    const tesla = k.violation === 'tesla';
    const hit = !!(S && S.hit > 0);
    const phone = k.violation === 'phone' && !hit;
    const skin = k.skin || '#8d5a3b';
    const body = k.body || '#0077b6', lungi = k.lungi || '#2a5caa';
    const a = k.wheelA || 0;

    // legs: pedalling knees rise and fall with the crank; a Tesla driver rests his feet on the footboard
    let lk, rk;
    if (tesla) {
      lk = { kx: -9.8, ky: -55, fx: -8.8, fy: -38.6, py: -37 };
      rk = { kx: 9.8, ky: -55, fx: 8.8, fy: -38.6, py: -37 };
      ctx.fillStyle = '#2f3138'; ctx.fillRect(-13, -37.2, 26, 2.8);
    } else {
      const leg = (ang, g) => {
        const px = 28 + Math.cos(ang) * 8, py = -24 + Math.sin(ang) * 8;
        const kn = ik(21.5, -56, px - 1.8, py - 2.4, 20, 21.5, 1);
        return { kx: g * (8.4 + (-45 - kn[1]) * 0.12), ky: kn[1], fx: g * 6.9, fy: py - 1.4, py };
      };
      lk = leg(a + PI, -1); rk = leg(a, 1);
      ctx.beginPath(); ctx.moveTo(-3, -24); ctx.lineTo(lk.fx, lk.py); ctx.moveTo(3, -24); ctx.lineTo(rk.fx, rk.py);
      ctx.strokeStyle = '#c9d0d7'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#1d1d22'; ctx.fillRect(lk.fx - 3, lk.py - 1, 6, 2.2); ctx.fillRect(rk.fx - 3, rk.py - 1, 6, 2.2);
    }
    // bare shins and feet, flip-flops
    ctx.beginPath();
    ctx.moveTo(lk.kx, lk.ky); ctx.lineTo(lk.fx, lk.fy - 1); ctx.lineTo(lk.fx - 0.6, lk.fy - 0.4);
    ctx.moveTo(rk.kx, rk.ky); ctx.lineTo(rk.fx, rk.fy - 1); ctx.lineTo(rk.fx + 0.6, rk.fy - 0.4);
    ctx.strokeStyle = skin; ctx.lineWidth = 4.4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(lk.fx, lk.fy + 0.6, 3.2, 1.2, 0, 0, TAU); ctx.moveTo(rk.fx + 3.2, rk.fy + 0.6); ctx.ellipse(rk.fx, rk.fy + 0.6, 3.2, 1.2, 0, 0, TAU);
    ctx.fillStyle = L.sandal; ctx.fill();

    // checked lungi, folded up to the knees and sagging between them
    const lo = Math.max(lk.ky, rk.ky);
    ctx.beginPath(); ctx.moveTo(-10.8, -61); ctx.lineTo(10.8, -61);
    ctx.quadraticCurveTo(12.8, (rk.ky - 61) / 2, rk.kx + 3.4, rk.ky + 1);
    ctx.quadraticCurveTo(0, lo + 7, lk.kx - 3.4, lk.ky + 1);
    ctx.quadraticCurveTo(-12.8, (lk.ky - 61) / 2, -10.8, -61); ctx.closePath();
    ctx.fillStyle = lungi; ctx.fill();
    if (det > 0.7) {
      ctx.save(); ctx.clip();
      ctx.beginPath();
      for (let x = -8.4; x <= 9; x += 5.6) ctx.rect(x, -62, 1.3, 36);
      for (let y = -57; y <= -33; y += 5.6) ctx.rect(-14, y, 28, 1.3);
      ctx.fillStyle = L.check; ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = shade(lungi, -0.22); ctx.fillRect(-11, -62, 22, 2.6); // rolled waistband

    // torso: sleeveless vest (genji) over bare shoulders, or a shirt
    const top = L.shirtOn ? L.shirtCol : k.vest || '#f1f1f1';
    const tg = (c) => grad(ctx, 'tor|' + c, -13, 0, 13, 0, () => [0, shade(c, -0.3), 0.58, c, 1, shade(c, 0.16)]);
    ctx.beginPath(); ctx.moveTo(-10.2, -59);
    ctx.quadraticCurveTo(-13.2, -68, -12.6, -76.5); ctx.quadraticCurveTo(-12.6, -80.3, -8, -80.8);
    ctx.lineTo(-3.8, -82.2); ctx.lineTo(3.8, -82.2); ctx.lineTo(8, -80.8);
    ctx.quadraticCurveTo(12.6, -80.3, 12.6, -76.5); ctx.quadraticCurveTo(13.2, -68, 10.2, -59); ctx.closePath();
    if (L.shirtOn) {
      ctx.fillStyle = tg(top); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
      fillPoly(ctx, [-3.8, -82.2, 0, -76.4, 3.8, -82.2], skin); // open neck
      ctx.beginPath(); ctx.moveTo(-4.6, -82.4); ctx.lineTo(-0.6, -77); ctx.lineTo(-6.8, -79.4);
      ctx.moveTo(4.6, -82.4); ctx.lineTo(0.6, -77); ctx.lineTo(6.8, -79.4);
      ctx.fillStyle = shade(top, 0.28); ctx.fill(); // collar
      if (det > 1.2) line(ctx, [0, -76.4, 0.3, -60], 'rgba(0,0,0,0.2)', 0.6);
    } else {
      ctx.beginPath(); ctx.moveTo(-11.4, -77.6); ctx.quadraticCurveTo(0, -85.6, 11.4, -77.6);
      ctx.strokeStyle = skin; ctx.lineWidth = 7.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10.2, -59); ctx.quadraticCurveTo(-12.9, -67, -11.3, -74);
      ctx.quadraticCurveTo(-8.8, -75.4, -7.7, -81.2); ctx.lineTo(-5.2, -81.6);
      ctx.quadraticCurveTo(0, -75.4, 5.2, -81.6); ctx.lineTo(7.7, -81.2);
      ctx.quadraticCurveTo(8.8, -75.4, 11.3, -74); ctx.quadraticCurveTo(12.9, -67, 10.2, -59); ctx.closePath();
      ctx.fillStyle = tg(top); ctx.fill();
    }
    if (!L.gamHead) { // gamcha round the neck, ends hanging down the chest (flapping after a slap)
      const f = S ? S.snap * 4 : 0;
      gamStroke(ctx, [-5.8 - f, -65, -7.4 - f * 0.5, -72, -6.6, -79.2, 0, -84.4, 6.6, -79.2, 6.4 - f * 0.4, -73, 5.4 - f, -68.5], L.gam, 4.2);
    }

    // front wheel: nearly edge-on, so a narrow ellipse; its side and spokes show when off centre
    const sw = sideOf(P, 0), cw = Math.sqrt(1 - sw * sw), hubY = -17;
    ell(ctx, 0, hubY, Math.max(1.9, 15.3 * sw + 1.9 * cw), 15.3, 0, '#1c1c20');
    if (15.3 * sw > 2.4 && det > 0.8) {
      ctx.beginPath(); ctx.ellipse(0, hubY, 13 * sw, 13, 0, 0, TAU);
      if (!lean) for (let i = 0; i < 4; i++) {
        const q = a * 1.12 + (i * PI) / 4, c = Math.cos(q) * 12.4 * sw, s = Math.sin(q) * 12.4;
        ctx.moveTo(-c, hubY - s); ctx.lineTo(c, hubY + s);
      }
      ctx.strokeStyle = 'rgba(205,212,220,0.8)'; ctx.lineWidth = 0.9; ctx.stroke();
    }
    // mudguard with a pinstripe, fork, head tube and stem
    ctx.beginPath(); ctx.ellipse(0, hubY, Math.max(1.6, 18.6 * sw + 1.6 * cw), 18.8, 0, PI * 1.12, PI * 1.88);
    ctx.strokeStyle = shade(body, -0.12); ctx.lineWidth = 2.6; ctx.stroke();
    if (det > 0.8 && !lean) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-2.9, -36); ctx.lineTo(-2.5, hubY); ctx.moveTo(2.9, -36); ctx.lineTo(2.5, hubY);
    ctx.moveTo(0, -37); ctx.lineTo(0, -70.4);
    ctx.strokeStyle = shade(body, -0.5); ctx.lineWidth = 1.9; ctx.stroke();
    ctx.fillStyle = shade(body, -0.35); ctx.fillRect(-4.4, -38.4, 8.8, 2.8); // fork crown
    if (tesla) { // headlight clamped to the stem
      circ(ctx, 0, -64.6, 3.7, '#d7dde3'); circ(ctx, 0, -64.6, 2.6, '#fffbe6');
    }

    // handlebar: chrome bar, black grips, bell, plastic flowers and streamers
    ctx.beginPath(); ctx.moveTo(-21.5, -72.2); ctx.quadraticCurveTo(0, -68.6, 21.5, -72.2);
    ctx.strokeStyle = '#6f7780'; ctx.lineWidth = 2.8; ctx.stroke();
    ctx.strokeStyle = '#d6dce2'; ctx.lineWidth = 1.5; ctx.stroke();
    if (det > 0.7 && !lean) {
      const flut = Math.sin((k.t || 0) * 6) * 0.9;
      ctx.beginPath();
      for (let g = -1; g <= 1; g += 2) {
        ctx.moveTo(21.6 * g, -72); ctx.quadraticCurveTo(22.4 * g + flut, -67, 21.4 * g + flut * 1.6, -61.2);
      }
      ctx.strokeStyle = L.art[4]; ctx.lineWidth = 1.6; ctx.stroke();
      ell(ctx, -12.4, -73.4, 2.7, 2, 0, CHROME); // bell
      {
        ctx.setLineDash([0.01, 2.35]); // two plastic flowers on the bar
        ctx.beginPath(); ctx.arc(-2.4, -76.2, 2.25, 0, TAU); ctx.moveTo(4.9, -77); ctx.arc(2.6, -77, 2.25, 0, TAU);
        ctx.strokeStyle = L.art[2]; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(-2.4, -76.2, 1.15, 0, TAU); ctx.moveTo(3.75, -77); ctx.arc(2.6, -77, 1.15, 0, TAU);
        ctx.fillStyle = '#ffd23f'; ctx.fill();
      }
    }

    // arms to the grips (the phone arm is drawn after the head)
    ctx.beginPath();
    if (!phone) { ctx.moveTo(-11.9, -78.6); ctx.lineTo(-17.4, -73.4); ctx.lineTo(-19.4, -71.8); }
    ctx.moveTo(11.9, -78.6); ctx.lineTo(17.4, -73.4); ctx.lineTo(19.4, -71.8);
    ctx.strokeStyle = skin; ctx.lineWidth = 4.5; ctx.stroke();
    if (L.shirtOn) {
      ctx.beginPath();
      if (!phone) { ctx.moveTo(-11.6, -78.8); ctx.lineTo(-14.6, -75.8); }
      ctx.moveTo(11.6, -78.8); ctx.lineTo(14.6, -75.8);
      ctx.strokeStyle = top; ctx.lineWidth = 6.2; ctx.stroke();
    }
    ctx.beginPath();
    if (!phone) ctx.ellipse(-19.3, -71.6, 3, 2.6, 0, 0, TAU);
    ctx.moveTo(22.3, -71.6); ctx.ellipse(19.3, -71.6, 3, 2.6, 0, 0, TAU);
    ctx.fillStyle = skin; ctx.fill();

    // neck and head; a slap flings the head toward screen-left (the palm comes in from the right)
    ctx.fillStyle = shade(skin, -0.26); ctx.fillRect(-3.8, -84.5, 7.6, 5);
    let hx = 0, hy = -91;
    ctx.save();
    if (hit) {
      hx = -11 * S.snap + Math.sin(S.st * 9) * 1.6 * S.daze; hy = -91 + 1.5 * S.snap;
      ctx.translate(hx, hy);
      ctx.rotate(-0.5 * S.snap + Math.sin(S.st * 11) * 0.14 * S.daze);
      const q = Math.max(0, 1 - S.st * 9); // squash at the moment of impact
      ctx.scale(1 - 0.16 * q, 1 + 0.08 * q);
    } else ctx.translate(0, -91);
    faceFront(ctx, k, L, S, det);
    ctx.restore();
    if (phone) { // phone pressed to the ear, steering one-handed
      line(ctx, [-11.9, -78.6, -18.4, -82.6, -12.6, -87.4], skin, 4.5);
      fillPoly(ctx, [-13.2, -97.4, -8.2, -96.6, -9.6, -84.6, -14.6, -85.4], '#e11d48'); // handset in a bright case
      fillPoly(ctx, [-12.5, -96.4, -9, -95.8, -10.1, -86.8, -13.6, -87.4], '#111827');
      ell(ctx, -12, -87.6, 3.3, 3.6, 0.2, skin);
      if (det > 1.4) line(ctx, [-14.4, -89.6, -10.4, -89, -14.6, -87.4, -10.6, -86.6], shade(skin, -0.3), 0.6);
    }
    if (hit && S.fly > 0) slapDebris(ctx, k, L, S, hx, hy, -1);
  }

  // ---------- hood geometry ----------
  // Coordinates of plane Q expressed in plane P's local units, to draw Q-plane shapes while in P's
  // transform (saves a save/translate/scale/restore per plane).
  function mapOf(P, Q) { return { k: Q.s / P.s, ox: (Q.x - P.x) / P.s, oy: (Q.y - P.y) / P.s }; }
  const M0 = { k: 1, ox: 0, oy: 0 };
  function outerArch(ctx, m) { // left to right, along the outside of the hood's front rim
    const k = m.k, ox = m.ox, oy = m.oy;
    ctx.moveTo(ox - 44.5 * k, oy - 57 * k);
    ctx.bezierCurveTo(ox - 48 * k, oy - 112 * k, ox - 39 * k, oy - 151 * k, ox, oy - 151 * k);
    ctx.bezierCurveTo(ox + 39 * k, oy - 151 * k, ox + 48 * k, oy - 112 * k, ox + 44.5 * k, oy - 57 * k);
  }
  function innerArch(ctx, m, first) { // right to left, along the inside of the rim (the hood's opening)
    const k = m.k, ox = m.ox, oy = m.oy;
    if (first) ctx.moveTo(ox + 37 * k, oy - 58 * k); else ctx.lineTo(ox + 37 * k, oy - 58 * k);
    ctx.bezierCurveTo(ox + 40 * k, oy - 106 * k, ox + 32 * k, oy - 141 * k, ox, oy - 141 * k);
    ctx.bezierCurveTo(ox - 32 * k, oy - 141 * k, ox - 40 * k, oy - 106 * k, ox - 37 * k, oy - 58 * k);
  }
  // Painted crest along the top of the rim: flowers, a peacock or hearts (L.motif, as in Classic).
  function crest(ctx, L) {
    if (L.motif === 0) {
      ctx.setLineDash([0.01, 3]);
      ctx.beginPath(); ctx.arc(-19, -144.4, 2.8, 0, TAU); ctx.moveTo(22.3, -146); ctx.arc(0, -146, 3.3, 0, TAU); ctx.moveTo(21.8, -144.4); ctx.arc(19, -144.4, 2.8, 0, TAU);
      ctx.strokeStyle = L.art[1]; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.setLineDash([]);
      circ(ctx, 0, -146, 1.6, L.art[2]);
    } else if (L.motif === 1) { // peacock fan
      ctx.beginPath(); ctx.arc(0, -143, 6.2, PI, TAU); ctx.fillStyle = '#0f8f6a'; ctx.fill();
      ctx.setLineDash([0.01, 2.4]);
      ctx.beginPath(); ctx.arc(0, -143, 4.6, PI * 1.05, PI * 1.95); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      ell(ctx, 0, -144.2, 1.5, 2.6, 0, '#2563eb');
    } else {
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const x = i * 17, y = -145.4 + Math.abs(i) * 1.4;
        ctx.moveTo(x, y + 2.6); ctx.bezierCurveTo(x - 3.8, y, x - 1.5, y - 3, x, y - 1);
        ctx.bezierCurveTo(x + 1.5, y - 3, x + 3.8, y, x, y + 2.6);
      }
      ctx.fillStyle = L.art[1]; ctx.fill();
    }
  }

  // ---------- oncoming rickshaw, seen from the front ----------
  // Planes (t from far = rear axle to near = front wheel): -0.3 back of the hood, 0 rear axle and
  // backrest, 0.12 passengers, 0.32 carriage front and hood rim, 0.5 footboard edge, 1 driver.
  function drawFront(ctx, k, near, far, env) {
    const L = lookOf(k), S = slapOf(k);
    const tesla = k.violation === 'tesla';
    const pax = k.pax || [], n = pax.length;
    const busy = n > 2;
    const hood = k.hood || '#d62828', body = k.body || '#0077b6';
    const night = !!(env && env.lit && env.lit.headlights);
    const det = near.s;
    const PL = lerpPlane(far, near, -0.3), PS = lerpPlane(far, near, 0.12), PR = lerpPlane(far, near, 0.32);
    const PF = lerpPlane(far, near, 0.5), PB = lerpPlane(far, near, 0.78);
    const gasp = !!(S && S.hit > 0 && S.st < 2.2);
    const lean = busy || !!(S && S.hit > 0); // crowded or chaotic: skip the small ornaments
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // shadow on the road
    fillPoly(ctx, [SX(far, -48), SY(far, 0), SX(far, 48), SY(far, 0), SX(near, 24), SY(near, 2), SX(near, -24), SY(near, 2)], 'rgba(20,12,6,0.25)');

    // rear-axle plane: the outside of the hood (shows at the side when off centre), rear wheels,
    // the lining seen through the hood's opening, the backrest
    enter(ctx, far);
    if (!busy) {
      ctx.beginPath(); outerArch(ctx, mapOf(far, PL)); ctx.closePath();
      ctx.fillStyle = grad(ctx, 'shell|' + hood, 0, -150, 0, -57, () => [0, shade(hood, 0.1), 1, shade(hood, -0.45)]); ctx.fill();
    }
    const w1 = sideOf(far, -39), w2 = sideOf(far, 39);
    const rx1 = Math.max(2.1, 18.4 * w1 + 2.2 * Math.sqrt(1 - w1 * w1)), rx2 = Math.max(2.1, 18.4 * w2 + 2.2 * Math.sqrt(1 - w2 * w2));
    ctx.beginPath(); ctx.ellipse(-39, -20, rx1, 18.4, 0, 0, TAU); ctx.moveTo(39 + rx2, -20); ctx.ellipse(39, -20, rx2, 18.4, 0, 0, TAU);
    ctx.fillStyle = '#1c1c20'; ctx.fill();
    if (det > 0.8 && (w1 > 0.14 || w2 > 0.14)) {
      ctx.beginPath(); ctx.ellipse(-39, -20, 16 * w1 + 0.1, 16, 0, 0, TAU); ctx.moveTo(39 + 16 * w2 + 0.1, -20); ctx.ellipse(39, -20, 16 * w2 + 0.1, 16, 0, 0, TAU);
      ctx.strokeStyle = '#c3cad2'; ctx.lineWidth = 1.3; ctx.stroke();
    }
    if (tesla) { // hub motor on the rear axle
      ctx.fillStyle = '#4b5563'; ctx.fillRect(31.5, -26.8, 8, 13.6);
      ctx.fillStyle = '#8b95a3'; ctx.fillRect(32, -25.8, 7, 2);
    }
    const lb = L.lining;
    ctx.beginPath(); innerArch(ctx, mapOf(far, PR), true); ctx.closePath();
    ctx.fillStyle = grad(ctx, 'lin|' + (lb || hood), 0, -150, 0, -60, () => (lb
      ? [0, shade(lb, -0.3), 0.6, lb, 1, shade(lb, 0.14)]
      : [0, shade(hood, -0.74), 0.6, shade(hood, -0.55), 1, shade(hood, -0.34)]));
    ctx.fill();
    if (!lean && det > 0.8) { // painted piping and a row of sequins on the lining, just inside the rim
      const m = mapOf(far, PR), k2 = m.k, X2 = (x) => m.ox + x * k2, Y2 = (y) => m.oy + y * k2;
      ctx.beginPath(); ctx.moveTo(X2(-31), Y2(-62));
      ctx.bezierCurveTo(X2(-34), Y2(-101), X2(-27), Y2(-131), X2(0), Y2(-131));
      ctx.bezierCurveTo(X2(27), Y2(-131), X2(34), Y2(-101), X2(31), Y2(-62));
      ctx.strokeStyle = L.art[5]; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.setLineDash([0.01, 4.6]); ctx.strokeStyle = 'rgba(255,226,140,0.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    }
    if (!busy) { // backrest cushion (hidden behind a crammed load)
      TH.rr(ctx, -33, -89, 66, 30, 6);
      ctx.fillStyle = grad(ctx, 'back|' + L.cushion, 0, -89, 0, -59, () => [0, shade(L.cushion, 0.18), 1, shade(L.cushion, -0.3)]); ctx.fill();
      if (det > 0.8 && !lean) { ctx.strokeStyle = shade(L.cushion, 0.35); ctx.lineWidth = 0.9; ctx.stroke(); }
    }
    ctx.restore();
    // seat top, seen from above
    if (!busy) fillPoly(ctx, [SX(far, -34), SY(far, -61), SX(far, 34), SY(far, -61), SX(PR, 32.5), SY(PR, -61), SX(PR, -32.5), SY(PR, -61)], shade(L.cushion, 0.1));

    // passengers (the overload is crammed: three abreast, a child on a lap, one on the footboard)
    const H = [], HH = [], seats = [], fling = gasp && !busy;
    enter(ctx, PS);
    if (n >= 5) {
      paxFront(ctx, paxLook(pax[1], false), 0, -60, 1, false, false, H, HH);
      paxFront(ctx, paxLook(pax[0], false), -24.5, -60, 1, true, false, H, HH);
      paxFront(ctx, paxLook(pax[2], false), 24.5, -60, 1, true, false, H, HH);
      paxFront(ctx, paxLook(pax[3], true), -22, -64.5, 0.66, false, false, H, HH); // child on a lap
      seats.push(-24.5, pax[0], 24.5, pax[2]);
    } else if (n === 1) {
      const x = L.soloR ? 18 : -18;
      paxFront(ctx, paxLook(pax[0], false), x, -60, 1, true, fling, H, HH); seats.push(x, pax[0]);
    } else if (n > 1) {
      for (let i = 0; i < n; i++) {
        const x = n === 2 ? (i ? 21 : -21) : -22 + (44 * i) / (n - 1);
        paxFront(ctx, paxLook(pax[i], false), x, -60, 1, true, fling, H, HH); seats.push(x, pax[i]);
      }
    }
    paxFaces(ctx, H, HH, PS.s, gasp);
    ctx.restore();

    // side of the carriage box facing the camera (shows when the rickshaw is off centre)
    const side = near.x > fp.CX ? -1 : 1;
    if (Math.abs(far.x - fp.CX) > 30 * far.s) {
      fillPoly(ctx, [SX(far, 33 * side), SY(far, -60), SX(PR, 31 * side), SY(PR, -57), SX(PR, 31 * side), SY(PR, -36.5), SX(far, 33 * side), SY(far, -30)], shade(body, -0.22));
    }
    // footboard, seen from above, with its front edge
    fillPoly(ctx, [SX(PR, -31), SY(PR, -36.5), SX(PR, 31), SY(PR, -36.5), SX(PF, 29), SY(PF, -36.5), SX(PF, -29), SY(PF, -36.5)], '#3b3430');
    ctx.fillStyle = shade(body, -0.3); ctx.fillRect(SX(PF, -29), SY(PF, -36.5), 58 * PF.s, 2.6 * PF.s);

    // carriage front and hood rim plane (the footboard-edge things are mapped into it)
    enter(ctx, PR);
    ctx.fillStyle = shade(L.cushion, -0.22); ctx.fillRect(-32.5, -61.5, 65, 5); // seat front roll
    ctx.fillStyle = grad(ctx, 'box|' + body, 0, -57, 0, -36, () => [0, shade(body, 0.2), 1, shade(body, -0.34)]); ctx.fillRect(-31, -57, 62, 20.5);
    if (det > 0.7) { // the painted front of the carriage box
      ctx.strokeStyle = L.art[1]; ctx.lineWidth = 1.2; ctx.strokeRect(-28.4, -54.4, 56.8, 15.4);
      if (!lean) {
        ctx.setLineDash([0.01, 3.5]);
        ctx.beginPath(); ctx.arc(-20, -46.8, 3.4, 0, TAU); ctx.moveTo(23.4, -46.8); ctx.arc(20, -46.8, 3.4, 0, TAU);
        ctx.strokeStyle = L.art[2]; ctx.lineWidth = 4.4; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // passengers' shins and feet on the footboard
    for (let i = 0; i < seats.length; i += 2) {
      const x = seats[i], q = paxLook(seats[i + 1], false);
      ctx.beginPath(); ctx.moveTo(x - 3.6, -57); ctx.lineTo(x - 4, -39.4); ctx.moveTo(x + 3.6, -57); ctx.lineTo(x + 4, -39.4);
      ctx.strokeStyle = q.type === 2 ? q.main : q.type === 1 ? '#ecebe4' : q.low; ctx.lineWidth = 4.2; ctx.stroke();
    }
    // the hood's front rim (chrome bow on its edge): painted band with studs, crest, tassel fringe (jhalor)
    ctx.beginPath(); ctx.moveTo(-40.8, -57.5); ctx.bezierCurveTo(-44, -109, -35.5, -146, 0, -146); ctx.bezierCurveTo(35.5, -146, 44, -109, 40.8, -57.5);
    ctx.strokeStyle = CHROME; ctx.lineWidth = 10.4; ctx.stroke();
    ctx.strokeStyle = grad(ctx, 'rim|' + hood, -44, -150, 44, -60, () => [0, shade(hood, -0.3), 0.5, hood, 1, shade(hood, 0.26)]);
    ctx.lineWidth = 8.6; ctx.stroke();
    if (det > 0.5) {
      ctx.strokeStyle = L.art[0]; ctx.lineWidth = 4.8; ctx.stroke();
      ctx.strokeStyle = L.art[3]; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([0.01, 4.4]); ctx.strokeStyle = 'rgba(255,250,225,0.95)'; ctx.lineWidth = 1.7; ctx.stroke(); ctx.setLineDash([]);
      if (det > 0.9 && !lean) crest(ctx, L);
    }
    const sway = Math.sin((k.t || 0) * 5) * 0.7;
    ctx.beginPath(); ctx.moveTo(-33.5 + sway, -113); ctx.bezierCurveTo(-30 + sway, -134, -16 + sway, -137.3, sway, -137.3);
    ctx.bezierCurveTo(16 + sway, -137.3, 30 + sway, -134, 33.5 + sway, -113);
    ctx.lineCap = 'butt'; ctx.lineWidth = 7.4;
    ctx.setLineDash([1.25, 1.9]); ctx.strokeStyle = L.art[1]; ctx.stroke();
    ctx.lineDashOffset = 1.6; ctx.strokeStyle = L.art[4]; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round';
    if (tesla) { // chasing LED strip along the hood edge
      ctx.beginPath(); outerArch(ctx, M0);
      ctx.setLineDash([0.01, 3.4]); ctx.lineDashOffset = -(k.t || 0) * 14;
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 2.3; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      if (night) for (let i = 0; i < 3; i++) fp.glow(SX(PR, (i - 1) * 44), SY(PR, i === 1 ? -151 : -100), clamp(16 * PR.s, 4, 120), '#5eead4', near.d, 0.55);
    }
    // frame tubes joining the carriage to the front fork (screen points mapped into this plane)
    const tx = (x) => (x - PR.x) / PR.s, ty = (y) => (y - PR.y) / PR.s;
    ctx.beginPath();
    ctx.moveTo(tx(SX(far, -10)), ty(SY(far, -22))); ctx.lineTo(tx(SX(PB, -2.4)), ty(SY(PB, -24)));
    ctx.moveTo(tx(SX(far, 10)), ty(SY(far, -22))); ctx.lineTo(tx(SX(PB, 2.4)), ty(SY(PB, -24)));
    ctx.moveTo(tx(SX(PF, 0)), ty(SY(PF, -33))); ctx.lineTo(tx(SX(near, 0)), ty(SY(near, -60)));
    ctx.strokeStyle = shade(body, -0.5); ctx.lineWidth = (2.8 * PF.s) / PR.s; ctx.stroke();
    // footboard edge: battery box (Tesla), the fifth passenger, the night lantern
    const mF = mapOf(PR, PF), fk = mF.k, fx = (x) => mF.ox + x * fk, fy = (y) => mF.oy + y * fk;
    if (tesla) {
      ctx.fillStyle = '#20242c'; ctx.fillRect(fx(-13), fy(-34.4), 26 * fk, 12.4 * fk);
      ctx.fillStyle = '#454c5a'; ctx.fillRect(fx(-13), fy(-34.4), 26 * fk, 2.4 * fk);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(fx(4.5), fy(-30.4), 6 * fk, 1.7 * fk);
      fillPoly(ctx, [fx(-6.4), fy(-32.6), fx(-10.2), fy(-27.4), fx(-7.6), fy(-27.4), fx(-9.2), fy(-23.6), fx(-4.4), fy(-29), fx(-7), fy(-29)], '#facc15');
      line(ctx, [fx(11), fy(-24), tx(SX(far, 33)), ty(SY(far, -22))], '#dc2626', 1.2 * fk);
    }
    if (n >= 5) { // the fifth one perches on the footboard, legs dangling
      const q = paxLook(pax[4], false), H2 = [], HH2 = [];
      ctx.beginPath(); ctx.moveTo(fx(15.5), fy(-37)); ctx.lineTo(fx(15), fy(-20)); ctx.moveTo(fx(22.5), fy(-37)); ctx.lineTo(fx(23), fy(-20));
      ctx.strokeStyle = q.type === 2 ? q.main : q.low; ctx.lineWidth = 4 * fk; ctx.stroke();
      paxFront(ctx, q, fx(19), fy(-37.5), 0.9 * fk, false, false, H2, HH2);
      paxFaces(ctx, H2, HH2, S ? 1 : Math.min(PF.s, 1.5), gasp);
    }
    if (night) { // hurricane lantern hanging under the carriage
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(fx(-18.9), fy(-30.8), 3.8 * fk, 1.5 * fk);
      ell(ctx, fx(-17), fy(-27.4), 2.3 * fk, 3 * fk, 0, '#ffd27a');
      fp.glow(SX(PF, -17), SY(PF, -27.4), clamp(34 * PF.s, 6, 240), '#ffb347', near.d, 0.95);
    }
    ctx.restore();

    // front-wheel plane: driver, front wheel, handlebar
    enter(ctx, near);
    if (S) ctx.translate(Math.sin(S.st * 40) * 1.3 * S.daze, 0);
    driverFront(ctx, k, L, S, near, det, lean);
    ctx.restore();
    if (tesla) fp.glow(SX(near, 0), SY(near, -64.6), clamp((night ? 32 : 24) * near.s, 8, 220), '#fff4c2', near.d, night ? 0.85 : 0.6, true);
  }

  // Far away: a few flat shapes (<= 50 canvas calls).
  function lodFront(ctx, k, near, far, env) {
    const L = lookOf(k), pax = k.pax || [], n = pax.length;
    const hood = k.hood || '#d62828';
    enter(ctx, far);
    ctx.beginPath(); ctx.ellipse(-39, -19, 3.4, 19, 0, 0, TAU); ctx.moveTo(42.4, -19); ctx.ellipse(39, -19, 3.4, 19, 0, 0, TAU);
    ctx.fillStyle = '#1c1c20'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-44, -57); ctx.bezierCurveTo(-48, -112, -39, -151, 0, -151); ctx.bezierCurveTo(39, -151, 48, -112, 44, -57); ctx.closePath();
    ctx.fillStyle = hood; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-35, -58); ctx.bezierCurveTo(-38, -104, -30, -138, 0, -138); ctx.bezierCurveTo(30, -138, 38, -104, 35, -58);
    ctx.fillStyle = shade(hood, -0.6); ctx.fill();
    ctx.fillStyle = k.body || '#0077b6'; ctx.fillRect(-32, -60, 64, 24);
    ctx.fillStyle = L.cushion; ctx.fillRect(-32, -64, 64, 5);
    if (n) {
      const m = Math.min(n, 3);
      for (let i = 0; i < m; i++) { ctx.fillStyle = pax[i].shirt || '#e63946'; ctx.fillRect(-26 + (m === 1 ? 18 : (i * 34) / (m - 1)), -84, 16, 22); }
      ctx.beginPath();
      for (let i = 0; i < m; i++) { const x = -18 + (m === 1 ? 18 : (i * 34) / (m - 1)); ctx.moveTo(x + 7, -90); ctx.arc(x, -90, 7, 0, TAU); }
      ctx.fillStyle = pax[0].skin || '#8d5a3b'; ctx.fill();
    }
    ctx.restore();
    enter(ctx, near);
    ell(ctx, 0, -16, 2.6, 16, 0, '#1c1c20');
    ctx.fillStyle = k.lungi || '#2a5caa'; ctx.fillRect(-11, -62, 22, 18);
    ctx.fillStyle = L.shirtOn ? L.shirtCol : k.vest || '#f1f1f1'; ctx.fillRect(-12, -82, 24, 22);
    circ(ctx, 0, -91, 10, k.skin || '#8d5a3b');
    ctx.fillStyle = L.gamHead ? L.gam[0] : HAIR; ctx.fillRect(-9, -103, 18, 7);
    ctx.restore();
    if (k.violation === 'tesla') fp.glow(SX(near, 0), SY(near, -64), clamp(40 * near.s, 5, 60), '#fff4c2', near.d, env && env.lit && env.lit.headlights ? 1 : 0.6, true);
    else if (env && env.lit && env.lit.headlights) fp.glow(SX(far, -17), SY(far, -27), clamp(34 * far.s, 4, 60), '#ffb347', near.d, 0.9);
  }

  // ---------- rear panel art (back view, near-plane units; panel x -35..35, y -62..-27) ----------
  // Painted scene in the frame x -23..23, y -52..-33: river with a boat, a village, or a Bengal tiger.
  function rearScene(ctx, type, det) {
    const x = -23, y = -52, w = 46, h = 19;
    const sky = type === 2 ? '#2f8f4e' : type === 1 ? '#8fd3f4' : '#ff9e6d';
    ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);
    if (type === 0) { // sunset river, a sailing boat, birds
      ctx.fillStyle = '#ffd98a'; ctx.fillRect(x, y + 6, w, 4);
      circ(ctx, x + 32, y + 7, 3.4, '#fff3a0');
      ctx.fillStyle = '#3c9a4c'; ctx.fillRect(x, y + 10, w, 2);
      ctx.fillStyle = '#2d7fc0'; ctx.fillRect(x, y + 12, w, 7);
      if (det > 0.9) {
        fillPoly(ctx, [x + 11, y + 14, x + 26, y + 14, x + 23.5, y + 16.4, x + 13.5, y + 16.4], '#6b3a1c');
        fillPoly(ctx, [x + 18.6, y + 13.6, x + 18.6, y + 2.2, x + 25.4, y + 12.6], '#f6f1e1');
        fillPoly(ctx, [x + 17.6, y + 13.6, x + 17.6, y + 4.4, x + 12.4, y + 12.6], '#e63946');
        ctx.beginPath(); ctx.moveTo(x + 5, y + 4); ctx.lineTo(x + 6.5, y + 5.2); ctx.lineTo(x + 8, y + 4);
        ctx.moveTo(x + 9.5, y + 2.4); ctx.lineTo(x + 10.7, y + 3.4); ctx.lineTo(x + 11.9, y + 2.4);
        ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 0.6; ctx.stroke();
      }
    } else if (type === 1) { // village hut under a coconut palm, by a pond
      ctx.fillStyle = '#62b246'; ctx.fillRect(x, y + 11, w, 8);
      ctx.fillStyle = '#4f9fd8'; ctx.fillRect(x + 27, y + 14, 16, 3.4);
      if (det > 0.9) {
        ctx.fillStyle = '#e8c07a'; ctx.fillRect(x + 7, y + 8, 13, 6.4);
        fillPoly(ctx, [x + 4.6, y + 8.6, x + 13.5, y + 2.4, x + 22.4, y + 8.6], '#9c5a24');
        ctx.fillStyle = '#5a3418'; ctx.fillRect(x + 12, y + 10, 3, 4.4);
        line(ctx, [x + 33, y + 13, x + 34, y + 7, x + 33.4, y + 2.4], '#7a4a26', 1.2);
        ctx.beginPath();
        ctx.moveTo(x + 33.4, y + 2.4); ctx.quadraticCurveTo(x + 29, y + 0.6, x + 27.6, y + 4.4);
        ctx.moveTo(x + 33.4, y + 2.4); ctx.quadraticCurveTo(x + 38, y + 0.6, x + 39.6, y + 4.4);
        ctx.moveTo(x + 33.4, y + 2.4); ctx.quadraticCurveTo(x + 31, y - 0.6, x + 29, y + 0.4);
        ctx.strokeStyle = '#2f7d3a'; ctx.lineWidth = 1.3; ctx.stroke();
      }
    } else { // Royal Bengal tiger peering out of the jungle
      ctx.fillStyle = '#1f6b3a'; ctx.fillRect(x, y + 12, w, 7);
      const tx = x + 23, ty = y + 10;
      ell(ctx, tx - 5.6, ty - 5.2, 2.2, 2.2, 0, '#e8841f'); ell(ctx, tx + 5.6, ty - 5.2, 2.2, 2.2, 0, '#e8841f');
      ell(ctx, tx, ty, 8, 6.8, 0, '#f08a24');
      if (det > 0.9) {
        ell(ctx, tx, ty + 2.6, 4.6, 3.4, 0, '#fff4e0');
        ctx.beginPath();
        ctx.moveTo(tx, ty - 6.4); ctx.lineTo(tx, ty - 3.4);
        ctx.moveTo(tx - 3.4, ty - 6); ctx.lineTo(tx - 2.4, ty - 3.8); ctx.moveTo(tx + 3.4, ty - 6); ctx.lineTo(tx + 2.4, ty - 3.8);
        ctx.moveTo(tx - 7.8, ty - 1); ctx.lineTo(tx - 5, ty - 0.4); ctx.moveTo(tx + 7.8, ty - 1); ctx.lineTo(tx + 5, ty - 0.4);
        ctx.moveTo(tx - 7.4, ty + 2.4); ctx.lineTo(tx - 4.8, ty + 1.8); ctx.moveTo(tx + 7.4, ty + 2.4); ctx.lineTo(tx + 4.8, ty + 1.8);
        ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.beginPath(); ctx.arc(tx - 2.9, ty - 1.3, 0.95, 0, TAU); ctx.moveTo(tx + 3.85, ty - 1.3); ctx.arc(tx + 2.9, ty - 1.3, 0.95, 0, TAU);
        ctx.fillStyle = '#9be15d'; ctx.fill();
        fillPoly(ctx, [tx - 1.4, ty + 1, tx + 1.4, ty + 1, tx, ty + 2.4], '#e0566b');
      }
    }
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1.6; ctx.strokeRect(x, y, w, h); // gilt frame
  }

  // ---------- the driver seen from behind (far plane; head peeks out right of the hood at (24, -96)) ----------
  function driverBack(ctx, k, L, S, P, det) {
    const tesla = k.violation === 'tesla';
    const hit = !!(S && S.hit > 0);
    const phone = k.violation === 'phone' && !hit;
    const skin = k.skin || '#8d5a3b', top = L.shirtOn ? L.shirtCol : k.vest || '#f1f1f1';
    const a = k.wheelA || 0;
    // front wheel and fork, seen through below the carriage
    const sw = sideOf(P, 0);
    ell(ctx, 0, -17, Math.max(1.9, 15.3 * sw + 1.9 * Math.sqrt(1 - sw * sw)), 15.3, 0, '#1c1c20');
    line(ctx, [0, -17, 0, -40], shade(k.body || '#0077b6', -0.5), 2.6);
    // heels on the pedals (or resting still on the footboard)
    ctx.beginPath();
    for (let g = -1; g <= 1; g += 2) {
      const py = tesla ? -37 : -24 + Math.sin(a + (g < 0 ? PI : 0)) * 8;
      ctx.moveTo(g * 7.4, -46); ctx.lineTo(g * 7, py - 2);
    }
    ctx.strokeStyle = skin; ctx.lineWidth = 4.4; ctx.stroke();
    // torso leaning out to the right, mostly hidden by the carriage
    ctx.beginPath(); ctx.moveTo(-1, -58); ctx.lineTo(15, -58);
    ctx.quadraticCurveTo(33, -69, 35.5, -81); ctx.quadraticCurveTo(34, -86.5, 27, -87.4);
    ctx.lineTo(18, -86.4); ctx.quadraticCurveTo(9, -80, -1, -58); ctx.closePath();
    ctx.fillStyle = top; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill();
    if (!L.shirtOn) { // vest straps over bare shoulders
      ctx.beginPath(); ctx.moveTo(33.4, -84.6); ctx.quadraticCurveTo(35.8, -82, 35.4, -78.6); ctx.lineTo(31.6, -79.5); ctx.closePath();
      ctx.fillStyle = skin; ctx.fill();
    }
    if (phone) line(ctx, [34, -83, 38.4, -89, 33.6, -94], skin, 4.4);
    else line(ctx, [34, -83, 37.2, -76.4, 31, -72.4], skin, 4.4);
    if (L.shirtOn) line(ctx, [33.6, -83.4, 36.2, -79.4], top, 6);
    if (!L.gamHead) gamStroke(ctx, [18.4, -86.6, 24, -89.8, 30, -86.6], L.gam, 4);
    // head: back of the head, ears, nape; a slap jerks it forward (down and away)
    let hx = 24, hy = -96;
    ctx.fillStyle = shade(skin, -0.2); ctx.fillRect(hx - 3.8, hy + 4.5, 7.6, 7);
    ctx.save();
    if (hit) {
      hx += Math.sin(S.st * 12) * 1.2 * S.daze; hy += 5.5 * S.snap;
      ctx.translate(hx, hy); ctx.rotate(Math.sin(S.st * 9) * 0.12 * S.daze); ctx.scale(1 - 0.08 * S.snap, 1 - 0.14 * S.snap);
    } else ctx.translate(hx, hy);
    ctx.beginPath(); ctx.ellipse(-9.4, 0.6, 2.1, 3.2, 0, 0, TAU); ctx.moveTo(11.5, 0.6); ctx.ellipse(9.4, 0.6, 2.1, 3.2, 0, 0, TAU);
    ctx.fillStyle = shade(skin, -0.12); ctx.fill();
    ell(ctx, 0, 0, 9.4, 10.2, 0, skin);
    const hairC = L.grey ? GREY : HAIR;
    ctx.beginPath(); ctx.moveTo(-9.5, 3.4); ctx.bezierCurveTo(-11, -9, -5, -12.6, 0, -12.4);
    ctx.bezierCurveTo(5, -12.6, 11, -9, 9.5, 3.4); ctx.quadraticCurveTo(0, 7.6, -9.5, 3.4);
    ctx.fillStyle = hairC; ctx.fill();
    if (L.gamHead && !hit) { // gamcha tied round the head, knot and tails at the back
      ctx.beginPath(); ctx.moveTo(-10, -2.4); ctx.bezierCurveTo(-11, -11.4, -5.4, -14.4, 0, -14.2);
      ctx.bezierCurveTo(5.4, -14.4, 11, -11.4, 10, -2.4); ctx.bezierCurveTo(5, -5.6, -5, -5.6, -10, -2.4);
      ctx.fillStyle = L.gam[0]; ctx.fill();
      ell(ctx, 0.5, -4, 2.8, 2.3, 0, shade(L.gam[0], -0.18));
      gamStroke(ctx, [-3.2, 7.6, -1.6, 2, 0.4, -3.6, 1.8, 2, 3.4, 7.2], L.gam, 2.2);
    } else if (L.cap && !hit) {
      ctx.beginPath(); ctx.moveTo(-9.8, -4); ctx.bezierCurveTo(-9.4, -13.6, 9.4, -13.6, 9.8, -4); ctx.quadraticCurveTo(0, -6, -9.8, -4);
      ctx.fillStyle = L.capCol; ctx.fill();
    }
    if (hit) { // handprint on the neck, where the palm came in from the right
      const c = `rgba(226,30,46,${(0.6 * S.mark).toFixed(2)})`;
      ell(ctx, 4.6, 5.2, 2.9, 2.5, 0.3, c);
      ctx.beginPath(); ctx.moveTo(6.4, 4); ctx.lineTo(9.6, 1.6); ctx.moveTo(6.8, 5.6); ctx.lineTo(10.2, 4.2); ctx.moveTo(6.2, 7); ctx.lineTo(9.4, 7);
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.restore();
    if (phone) {
      ctx.fillStyle = '#111827'; ctx.fillRect(32, -101.6, 4.4, 10.4);
      ell(ctx, 34, -93.6, 2.8, 3.1, 0, skin);
    }
    if (hit && S.fly > 0) slapDebris(ctx, k, L, S, hx, hy, 1);
  }

  // ---------- wrong-way rickshaw riding away, seen from behind ----------
  function drawBack(ctx, k, near, far, env) {
    const L = lookOf(k), S = slapOf(k);
    const tesla = k.violation === 'tesla';
    const pax = k.pax || [], n = pax.length;
    const hood = k.hood || '#d62828', body = k.body || '#0077b6';
    const night = !!(env && env.lit && env.lit.headlights);
    const det = near.s;
    const PB = lerpPlane(near, far, 0.06), PC = lerpPlane(near, far, 0.12), PD = lerpPlane(near, far, 0.55);
    const react = S ? S.hit * clamp(2 - S.st, 0, 1) : 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    fillPoly(ctx, [SX(near, -48), SY(near, 2), SX(near, 48), SY(near, 2), SX(far, 22), SY(far, 0), SX(far, -22), SY(far, 0)], 'rgba(20,12,6,0.25)');

    // far plane: the driver, front wheel and his heels
    enter(ctx, far);
    if (S) ctx.translate(Math.sin(S.st * 40) * 1.2 * S.daze, 0);
    driverBack(ctx, k, L, S, far, det);
    ctx.restore();

    // inside of the hood around its front opening (the canopy's rear curtain is rolled up)
    enter(ctx, PD);
    ctx.beginPath();
    const bx = (x) => inX(PD, PB, x), by = (y) => inY(PD, PB, y);
    ctx.moveTo(bx(-38.5), by(-107)); ctx.lineTo(bx(38.5), by(-107)); ctx.lineTo(bx(38.5), by(-62)); ctx.lineTo(bx(-38.5), by(-62)); ctx.closePath();
    ctx.moveTo(-37, -58); ctx.bezierCurveTo(-40, -106, -32, -141, 0, -141); ctx.bezierCurveTo(32, -141, 40, -106, 37, -58); ctx.closePath();
    ctx.fillStyle = L.lining || shade(hood, -0.6); ctx.fill('evenodd');
    ctx.restore();

    // passengers' heads and backs
    const H = [];
    enter(ctx, PC);
    const turn = react * 2.2;
    if (n >= 5) {
      paxBack(ctx, paxLook(pax[0], false), -21, -60 - react * 1.5, 1, turn, H);
      paxBack(ctx, paxLook(pax[2], false), 21, -60 - react * 1.5, 1, turn, H);
      paxBack(ctx, paxLook(pax[1], false), 0, -60 - react * 1.5, 1, turn, H);
      paxBack(ctx, paxLook(pax[3], true), -10, -64, 0.66, turn, H);
    } else if (n === 1) paxBack(ctx, paxLook(pax[0], false), L.soloR ? -5 : -14, -60 - react * 1.5, 1, turn, H);
    else if (n > 1) {
      for (let i = 0; i < n; i++) {
        const x = n === 2 ? (i ? 1 : -19) : -24 + (30 * i) / (n - 1);
        paxBack(ctx, paxLook(pax[i], false), x, -60 - react * 1.5, 1, turn, H);
      }
    }
    paxBacks(ctx, H);
    ctx.restore();

    // backrest (its back), then the hood: canopy roof with the rear curtain rolled up, and side flanks
    enter(ctx, PB);
    TH.rr(ctx, -34, -75, 68, 16, 4);
    ctx.fillStyle = grad(ctx, 'bb|' + L.cushion, 0, -75, 0, -59, () => [0, shade(L.cushion, -0.1), 1, shade(L.cushion, -0.42)]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-45.5, -60); ctx.bezierCurveTo(-49, -112, -39.5, -149, 0, -149); ctx.bezierCurveTo(39.5, -149, 49, -112, 45.5, -60);
    ctx.lineTo(38.6, -60); ctx.quadraticCurveTo(40.4, -86, 38.6, -107); ctx.lineTo(-38.6, -107); ctx.quadraticCurveTo(-40.4, -86, -38.6, -60); ctx.closePath();
    ctx.fillStyle = grad(ctx, 'hb|' + hood, 0, -149, 0, -60, () => [0, shade(hood, 0.2), 0.5, hood, 1, shade(hood, -0.36)]); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    if (det > 0.5) { // painted bands along the edge, a big motif and rows of studs
      ctx.save(); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-45.5, -60); ctx.bezierCurveTo(-49, -112, -39.5, -149, 0, -149); ctx.bezierCurveTo(39.5, -149, 49, -112, 45.5, -60);
      ctx.strokeStyle = L.art[0]; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = L.art[3]; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-36, -110); ctx.bezierCurveTo(-37, -134, -28, -141, 0, -141); ctx.bezierCurveTo(28, -141, 37, -134, 36, -110);
      ctx.setLineDash([0.01, 4.6]); ctx.strokeStyle = 'rgba(255,250,225,0.95)'; ctx.lineWidth = 1.7; ctx.stroke(); ctx.setLineDash([]);
      if (det > 0.9) {
        if (L.motif === 0) {
          flower(ctx, 0, -125, 7.4, L.art[1], L.art[2]);
          flower(ctx, -20, -121, 4, L.art[2], '#ffd23f'); flower(ctx, 20, -121, 4, L.art[2], '#ffd23f');
        } else if (L.motif === 1) { // peacock displaying its tail
          ctx.beginPath(); ctx.arc(0, -118, 13, PI, TAU); ctx.fillStyle = '#0f8f6a'; ctx.fill();
          ctx.setLineDash([0.01, 3.4]);
          ctx.beginPath(); ctx.arc(0, -118, 10, PI * 1.04, PI * 1.96); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.stroke();
          ctx.beginPath(); ctx.arc(0, -118, 5.6, PI * 1.08, PI * 1.92); ctx.strokeStyle = '#3a86ff'; ctx.lineWidth = 2.4; ctx.stroke();
          ctx.setLineDash([]);
          ell(ctx, 0, -119, 2.4, 4.4, 0, '#2563eb');
        } else { // a big heart flanked by stars
          ctx.beginPath(); ctx.moveTo(0, -113); ctx.bezierCurveTo(-13, -121, -7, -134, 0, -127);
          ctx.bezierCurveTo(7, -134, 13, -121, 0, -113); ctx.fillStyle = L.art[1]; ctx.fill();
          flower(ctx, -22, -122, 3.6, L.art[7], null); flower(ctx, 22, -122, 3.6, L.art[7], null);
        }
      }
      // the rolled-up rear curtain, strapped
      ctx.fillStyle = shade(hood, -0.2); ctx.fillRect(-39, -110.5, 78, 5.6);
      ctx.setLineDash([2.2, 2.6]); line(ctx, [-38, -107.7, 38, -107.7], L.art[4], 2.2); ctx.setLineDash([]);
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-22, -111.5, 2, 7.6); ctx.fillRect(20, -111.5, 2, 7.6);
    }
    if (tesla) {
      ctx.beginPath(); ctx.moveTo(-45.5, -60); ctx.bezierCurveTo(-49, -112, -39.5, -149, 0, -149); ctx.bezierCurveTo(39.5, -149, 49, -112, 45.5, -60);
      ctx.setLineDash([0.01, 3.4]); ctx.lineDashOffset = -(k.t || 0) * 14;
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 2.3; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    ctx.restore();

    // near plane: rear wheels, the painted rear panel, reflectors, licence plate, tassels
    enter(ctx, near);
    const w1 = sideOf(near, -39), w2 = sideOf(near, 39);
    const rx1 = Math.max(2.1, 18.4 * w1 + 2.2 * Math.sqrt(1 - w1 * w1)), rx2 = Math.max(2.1, 18.4 * w2 + 2.2 * Math.sqrt(1 - w2 * w2));
    ctx.beginPath(); ctx.ellipse(-39, -20, rx1, 18.4, 0, 0, TAU); ctx.moveTo(39 + rx2, -20); ctx.ellipse(39, -20, rx2, 18.4, 0, 0, TAU);
    ctx.fillStyle = '#1c1c20'; ctx.fill();
    if (det > 0.8 && (w1 > 0.14 || w2 > 0.14)) {
      ctx.beginPath(); ctx.ellipse(-39, -20, 16 * w1 + 0.1, 16, 0, 0, TAU); ctx.moveTo(39 + 16 * w2 + 0.1, -20); ctx.ellipse(39, -20, 16 * w2 + 0.1, 16, 0, 0, TAU);
      ctx.strokeStyle = '#c3cad2'; ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(-39, -20, rx1 + 2.4, 22.6, 0, PI * 1.12, PI * 1.88);
    ctx.moveTo(39 + Math.cos(PI * 1.12) * (rx2 + 2.4), -20 + Math.sin(PI * 1.12) * 22.6); ctx.ellipse(39, -20, rx2 + 2.4, 22.6, 0, PI * 1.12, PI * 1.88);
    ctx.strokeStyle = shade(body, -0.12); ctx.lineWidth = 3.4; ctx.stroke();
    line(ctx, [-39, -20, 39, -20], '#3a3d44', 2.4);
    if (tesla) { // battery box and hub motor show below the carriage
      ctx.fillStyle = '#20242c'; ctx.fillRect(-12, -27, 24, 8);
      fillPoly(ctx, [1, -26.4, -2.4, -22.4, -0.2, -22.4, -1.6, -19.6, 2.6, -23.6, 0.4, -23.6], '#facc15');
      ctx.fillStyle = '#4b5563'; ctx.fillRect(31.5, -26.8, 8, 13.6);
    }
    ctx.fillStyle = grad(ctx, 'rp|' + body, 0, -62, 0, -27, () => [0, shade(body, 0.22), 1, shade(body, -0.3)]);
    ctx.fillRect(-35, -62, 70, 35);
    if (det > 0.6) {
      ctx.strokeStyle = CHROME; ctx.lineWidth = 1.2; ctx.strokeRect(-34.4, -61.4, 68.8, 33.8);
      ctx.fillStyle = '#fff4d6'; ctx.fillRect(-26, -60, 52, 7);
      if (det > 1.1) {
        ctx.fillStyle = '#c1121f'; ctx.font = `bold 5.6px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(L.slogan, 0, -56.3, 50);
      }
      rearScene(ctx, L.scene, det);
      flower(ctx, -29.5, -42, 3, L.art[2], '#ffd23f'); flower(ctx, 29.5, -42, 3, L.art[5], '#ffd23f');
      ctx.fillStyle = '#f8f5e8'; ctx.fillRect(-9, -31.6, 18, 5.4); // licence plate
      if (det > 1.6) {
        ctx.fillStyle = '#1b1b1b'; ctx.font = `bold 3.4px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(L.plate, 0, -28.8, 17);
      }
    } else { ctx.fillStyle = '#fff4d6'; ctx.fillRect(-26, -60, 52, 7); ctx.fillStyle = '#78c6ec'; ctx.fillRect(-23, -52, 46, 19); }
    // round red reflectors
    ctx.beginPath(); ctx.arc(-30, -31, 2.6, 0, TAU); ctx.moveTo(32.6, -31); ctx.arc(30, -31, 2.6, 0, TAU);
    ctx.fillStyle = '#e3172b'; ctx.fill();
    if (det > 1.2) { ctx.beginPath(); ctx.arc(-30.8, -31.8, 0.8, 0, TAU); ctx.moveTo(30, -31.8); ctx.arc(29.2, -31.8, 0.8, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); }
    if (night) {
      fp.glow(SX(near, -30), SY(near, -31), clamp(9 * near.s, 3, 60), '#ff2b3a', near.d, 0.5);
      fp.glow(SX(near, 30), SY(near, -31), clamp(9 * near.s, 3, 60), '#ff2b3a', near.d, 0.5);
    }
    if (det > 0.8) { // tassel fringe along the bottom edge
      const sw = Math.sin((k.t || 0) * 6) * 0.5;
      ctx.beginPath(); ctx.moveTo(-34 + sw, -24.6); ctx.lineTo(34 + sw, -24.6);
      ctx.lineCap = 'butt'; ctx.lineWidth = 5; ctx.setLineDash([1.2, 1.9]);
      ctx.strokeStyle = L.art[1]; ctx.stroke(); ctx.lineDashOffset = 1.55; ctx.strokeStyle = L.art[6]; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round';
    }
    if (night) { // lantern hanging under the carriage
      line(ctx, [-18, -27, -18, -23.4], '#2b2b2b', 0.7);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-19.9, -23.8, 3.8, 1.5);
      ell(ctx, -18, -20.4, 2.3, 3, 0, '#ffd27a');
      fp.glow(SX(near, -18), SY(near, -20.4), clamp(34 * near.s, 6, 240), '#ffb347', near.d, 0.95);
    }
    ctx.restore();
  }

  function lodBack(ctx, k, near, far, env) {
    const L = lookOf(k), pax = k.pax || [], n = Math.min(3, pax.length);
    const hood = k.hood || '#d62828';
    enter(ctx, far);
    ctx.fillStyle = '#1c1c20'; ctx.fillRect(-2.5, -32, 5, 32);
    circ(ctx, 24, -96, 10, L.grey ? GREY : HAIR);
    ctx.restore();
    enter(ctx, near);
    if (n) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = n === 1 ? -10 : -20 + (i * 30) / (n - 1); ctx.moveTo(x + 7, -89); ctx.arc(x, -89, 7, 0, TAU); }
      ctx.fillStyle = HAIR; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-45, -60); ctx.bezierCurveTo(-49, -112, -39, -149, 0, -149); ctx.bezierCurveTo(39, -149, 49, -112, 45, -60);
    ctx.lineTo(38.6, -60); ctx.lineTo(38.6, -107); ctx.lineTo(-38.6, -107); ctx.lineTo(-38.6, -60); ctx.closePath();
    ctx.fillStyle = hood; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-39, -19, 3.4, 19, 0, 0, TAU); ctx.moveTo(42.4, -19); ctx.ellipse(39, -19, 3.4, 19, 0, 0, TAU);
    ctx.fillStyle = '#1c1c20'; ctx.fill();
    ctx.fillStyle = k.body || '#0077b6'; ctx.fillRect(-35, -62, 70, 35);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(-23, -52, 46, 19);
    ctx.fillStyle = '#e3172b'; ctx.fillRect(-32, -33, 5, 4); ctx.fillRect(27, -33, 5, 4);
    ctx.restore();
    if (env && env.lit && env.lit.headlights) fp.glow(SX(near, -18), SY(near, -20), clamp(34 * near.s, 4, 60), '#ffb347', near.d, 0.9);
  }

  // ---------- the sergeant's hands (screen space, logical 1000 x 600) ----------
  // Drawn after the world tint, so under a night/dusk tint every colour is mixed toward it.
  const handPals = new Map();
  // Under a tint the colours get the same multiply as the world (tintA-weighted), keeping a quarter of
  // the original so the hands stay readable: dusk warms and darkens them, night makes them dim and blue.
  function handPalette(tint, tintA) {
    const ta = clamp(tintA === undefined ? 1 : +tintA || 0, 0, 1);
    const key = (tint || '-') + '|' + ta;
    let P = handPals.get(key);
    if (P) return P;
    const tm = tint && /^#[0-9a-f]{6}$/i.exec(tint) ? parseInt(tint.slice(1), 16) : -1;
    const tk = tm < 0 ? null : [tm >> 16, (tm >> 8) & 255, tm & 255].map((v) => 1 - ta * (1 - v / 255));
    const m = (c) => {
      if (!tk) return c;
      const n = parseInt(c.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255];
      return 'rgb(' + ch.map((v, i) => Math.round(v * (0.25 + 0.75 * tk[i]))).join(',') + ')';
    };
    P = {
      key, skin: m('#a36a45'), skinLt: m('#c38a64'), skinDk: m('#7b4b2e'), line: m('#5a3420'), nail: m('#d6a88c'),
      shirt: m('#f6f8fb'), shirtDk: m('#c8d0db'), shirtLn: m('#98a4b4'), cuff: m('#e6ebf1'), button: m('#fbfbf6'),
      steel: m('#dfe4ea'), steelDk: m('#7d8792'), steelLt: m('#ffffff'), cord: m('#1f2a44'), cordLt: m('#56668c'),
      strap: m('#1c1c20'), dial: m('#f4f1e8'), bezel: m('#c9a54a'), tick: m('#222222'), smear: m('#ffffff'),
    };
    handPals.set(key, P);
    return P;
  }

  // White uniform sleeve from an off-screen shoulder (sx, sy) to the wrist (wx, wy), buttoned cuff.
  // w0 / w1: half widths at the shoulder and the cuff; k scales the cuff details with the hand.
  function sleeve(ctx, P, sx, sy, wx, wy, w0, w1, k) {
    const dx = wx - sx, dy = wy - sy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const ex = wx - ux * 12 * k, ey = wy - uy * 12 * k;   // cuff edge (the wrist shows past it)
    const bx = ex - ux * 30 * k, by = ey - uy * 30 * k;   // cuff seam
    const mx = (sx + bx) / 2, my = (sy + by) / 2, bulge = (w0 + w1) * 0.6;
    ctx.beginPath();
    ctx.moveTo(sx + nx * w0, sy + ny * w0);
    ctx.quadraticCurveTo(mx + nx * bulge, my + ny * bulge, bx + nx * w1, by + ny * w1);
    ctx.lineTo(bx - nx * w1, by - ny * w1);
    ctx.quadraticCurveTo(mx - nx * bulge, my - ny * bulge, sx - nx * w0, sy - ny * w0);
    ctx.closePath();
    ctx.fillStyle = P.shirt; ctx.fill();
    ctx.strokeStyle = P.shirtLn; ctx.lineWidth = 1.8; ctx.stroke();
    // shaded underside and a crease
    ctx.beginPath();
    ctx.moveTo(sx - nx * w0 * 0.7, sy - ny * w0 * 0.7);
    ctx.quadraticCurveTo(mx - nx * bulge * 0.8, my - ny * bulge * 0.8, bx - nx * w1 * 0.62, by - ny * w1 * 0.62);
    ctx.strokeStyle = P.shirtDk; ctx.lineWidth = w1 * 0.55; ctx.stroke();
    ctx.beginPath();
    const c1x = bx - ux * 44 * k, c1y = by - uy * 44 * k;
    ctx.moveTo(c1x - nx * w1 * 0.85, c1y - ny * w1 * 0.85); ctx.quadraticCurveTo(c1x + ux * 13 * k, c1y + uy * 13 * k, c1x + nx * w1 * 0.3, c1y + ny * w1 * 0.3);
    ctx.strokeStyle = P.shirtLn; ctx.lineWidth = 1.6; ctx.stroke();
    // cuff and its button
    const cw = w1 + 1.5 * k;
    ctx.beginPath();
    ctx.moveTo(bx + nx * cw, by + ny * cw); ctx.lineTo(ex + nx * (cw - k), ey + ny * (cw - k));
    ctx.lineTo(ex - nx * (cw - k), ey - ny * (cw - k)); ctx.lineTo(bx - nx * cw, by - ny * cw); ctx.closePath();
    ctx.fillStyle = P.cuff; ctx.fill(); ctx.strokeStyle = P.shirtLn; ctx.lineWidth = 1.6; ctx.stroke();
    circ(ctx, (bx + ex) / 2 - nx * w1 * 0.55, (by + ey) / 2 - ny * w1 * 0.55, 3.4 * k, P.button);
  }

  // Back of the open right hand; palm centre at (x, y), fingers toward local -y.
  // sqx/sqy squash it flat against a cheek; spread fans the fingers for the slap.
  const FINGERS = [[-16, -20, -0.15, 46], [-5, -24, -0.04, 52], [6, -23, 0.06, 48], [16, -18, 0.18, 38]];
  function openHand(ctx, P, x, y, rot, sc, sqx, sqy, spread) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc * sqx, sc * sqy);
    const tips = [];
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const f = FINGERS[i], fa = f[2] + spread * (i - 1.5) * 0.16;
      const tx = f[0] + Math.sin(fa) * f[3], ty = f[1] - Math.cos(fa) * f[3];
      ctx.moveTo(f[0], f[1]); ctx.lineTo(tx, ty); tips.push(tx, ty, fa);
    }
    const ta = -0.95 - spread * 0.25, ttx = -19 + Math.sin(ta) * 36, tty = 12 - Math.cos(ta) * 36;
    ctx.moveTo(-19, 12); ctx.lineTo(ttx, tty); tips.push(ttx, tty, ta);
    ctx.strokeStyle = P.line; ctx.lineWidth = 16; ctx.stroke();
    ctx.strokeStyle = P.skin; ctx.lineWidth = 12.8; ctx.stroke();
    // back of the hand, lit from the upper right
    fillPoly(ctx, [-13.5, 16, 14, 16, 12.5, 60, -12.5, 60], P.skinDk); // wrist
    ctx.beginPath(); ctx.moveTo(-14.5, 27); ctx.quadraticCurveTo(-26.5, 6, -24.5, -20); ctx.quadraticCurveTo(-22, -29.5, -11, -29.5);
    ctx.lineTo(12, -28.5); ctx.quadraticCurveTo(24.5, -27.5, 24.5, -15); ctx.quadraticCurveTo(24.5, 10, 14.5, 27); ctx.closePath();
    ctx.fillStyle = grad(ctx, 'hand|' + P.key, 12, -20, 0, 2, () => [0, P.skinLt, 0.55, P.skin, 1, P.skinDk], 2, 46); ctx.fill();
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.6; ctx.stroke();
    // knuckles and a hint of the tendons
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const f = FINGERS[i]; ctx.moveTo(f[0] - 4.5, f[1] - 3); ctx.quadraticCurveTo(f[0], f[1] - 6.5, f[0] + 4.5, f[1] - 3); }
    ctx.moveTo(-6, 16); ctx.quadraticCurveTo(-9, 0, -12, -13); ctx.moveTo(4, 16); ctx.quadraticCurveTo(5, 0, 5.5, -15);
    // finger joints
    for (let i = 0; i < 4; i++) {
      const f = FINGERS[i], tx = tips[i * 3], ty = tips[i * 3 + 1], mx = f[0] + (tx - f[0]) * 0.55, my = f[1] + (ty - f[1]) * 0.55;
      const c = Math.cos(tips[i * 3 + 2]), s = Math.sin(tips[i * 3 + 2]);
      ctx.moveTo(mx - c * 4, my - s * 4); ctx.lineTo(mx + c * 4, my + s * 4);
    }
    ctx.strokeStyle = 'rgba(70,35,15,0.32)'; ctx.lineWidth = 1.3; ctx.stroke();
    // nails
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = tips[i * 3 + 2], nx = tips[i * 3] - Math.sin(a) * 4.2, ny = tips[i * 3 + 1] + Math.cos(a) * 4.2;
      ctx.moveTo(nx + Math.cos(a) * 3.6, ny + Math.sin(a) * 3.6); ctx.ellipse(nx, ny, 3.6, 4.6, a, 0, TAU);
    }
    ctx.fillStyle = P.nail; ctx.fill();
    ctx.restore();
  }

  // Left fist holding the silver whistle, with a wristwatch; fist centre (x, y).
  function whistleFist(ctx, P, x, y, rot, sc) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
    // wrist and wristwatch
    fillPoly(ctx, [-34, 62, 2, 64, 14, 26, -26, 22], P.skinDk);
    line(ctx, [-36, 44, 9, 51], P.strap, 12);
    circ(ctx, -13, 47.5, 10.5, P.bezel); circ(ctx, -13, 47.5, 8.2, P.dial);
    line(ctx, [-13, 40.4, -13, 47.5, -9.4, 45.4], P.tick, 1.3); // the hands say ten past twelve
    // the whistle: chamber and mouthpiece, polished steel
    // (the round chamber sits above the thumb, the mouthpiece runs down into the fist)
    ctx.save(); ctx.translate(24, -40); ctx.rotate(-0.5);
    const sg = grad(ctx, 'steel|' + P.key, 0, -13, 0, 13, () => [0, P.steelLt, 0.35, P.steel, 0.7, P.steelDk, 1, P.steel]);
    ctx.beginPath(); ctx.moveTo(2, -12.5); ctx.lineTo(-38, -12.5); ctx.lineTo(-38, -3); ctx.lineTo(2, -3); ctx.closePath();
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = P.steelDk; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.tick; ctx.fillRect(-15, -12.9, 7, 3.2);
    line(ctx, [-36, -10.8, -17, -10.8, 3, -8, 8.5, 1], P.steelLt, 1.5);
    ctx.beginPath(); ctx.arc(9, 8, 3.8, 0, TAU); ctx.strokeStyle = P.steelDk; ctx.lineWidth = 1.8; ctx.stroke(); // cord ring
    ctx.restore();
    // fist: curled fingers wrap the whistle, the thumb pins it
    ctx.beginPath(); ctx.moveTo(-24, 32); ctx.quadraticCurveTo(-33, 2, -22, -20); ctx.quadraticCurveTo(-10, -32, 10, -28);
    ctx.quadraticCurveTo(31, -24, 30, -3); ctx.quadraticCurveTo(30, 22, 15, 33); ctx.closePath();
    ctx.fillStyle = grad(ctx, 'fist|' + P.key, 14, -16, 0, 0, () => [0, P.skinLt, 0.55, P.skin, 1, P.skinDk], 2, 40); ctx.fill();
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(29, -14); ctx.quadraticCurveTo(21, -10, 13, -15); ctx.moveTo(30, 0); ctx.quadraticCurveTo(22, 3, 14, -2);
    ctx.moveTo(28, 14); ctx.quadraticCurveTo(20, 16, 13, 11);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-17, -4); ctx.quadraticCurveTo(-14, -27, 5, -31); ctx.lineTo(13, -30);
    ctx.strokeStyle = P.line; ctx.lineWidth = 15; ctx.stroke(); ctx.strokeStyle = P.skin; ctx.lineWidth = 11.8; ctx.stroke();
    ell(ctx, 11.5, -30.5, 4.2, 3.3, -0.15, P.nail);
    ctx.restore();
  }

  const ease = (u) => u * u * (3 - 2 * u);
  // Right hand pose along the slap timeline (FP_CONTRACT §8).
  function rightPose(H, base) {
    const sl = H.slap;
    if (!sl) return { x: base.x, y: base.y, rot: base.rot, sc: base.sc, sqx: 1, sqy: 1, spread: 0, smear: 0 };
    const t = sl.t, hit = sl.hit !== false;
    const tx = hit ? sl.x + 20 : 470, ty = hit ? sl.y + 16 : 360;
    const T = { x: tx, y: ty, rot: -1.05, sc: base.sc * 0.8 };
    const Fo = { x: tx - 150, y: ty + 125, rot: -1.55, sc: base.sc * 0.9 };
    const lerp = (a, b, e) => a + (b - a) * e;
    const at = (A, B, e) => ({ x: lerp(A.x, B.x, e), y: lerp(A.y, B.y, e), rot: lerp(A.rot, B.rot, e), sc: lerp(A.sc, B.sc, e) });
    let p, sqx = 1, sqy = 1, spread = 0.6, smear = 0;
    if (t < 0.06) { // whip in along an arc, accelerating
      const e = (t / 0.06) * (t / 0.06), u = 1 - e;
      const cx = (base.x + tx) / 2 + 70, cy = Math.min(base.y, ty) - 60;
      p = at(base, T, e);
      p.x = u * u * base.x + 2 * u * e * cx + e * e * tx; p.y = u * u * base.y + 2 * u * e * cy + e * e * ty;
      smear = clamp(0.4 + e, 0, 1);
    } else if (hit && t < 0.12) { // contact: palm flat and squashed
      const q = 1 - (t - 0.06) / 0.06;
      p = at(T, T, 0); p.x += Math.sin(t * 190) * 3 * q;
      sqx = 1.22 - 0.1 * (1 - q); sqy = 0.82 + 0.06 * (1 - q); spread = 1;
    } else if (t < 0.22) { // follow through toward the lower left
      const t0 = hit ? 0.12 : 0.06, e = 1 - Math.pow(1 - (t - t0) / (0.22 - t0), 2);
      p = at(T, Fo, e); smear = 1 - e * 0.8; spread = 0.8;
    } else { // back to rest
      const e = ease(clamp((t - 0.22) / 0.2, 0, 1));
      p = at(Fo, base, e); spread = 0.8 * (1 - e);
    }
    return { x: p.x, y: p.y, rot: p.rot, sc: p.sc, sqx, sqy, spread, smear };
  }

  function drawHands(ctx, H, env) {
    const tint = H && H.light && H.light.tint;
    const P = handPalette(tint || null, H && H.light && H.light.tintA);
    const t = (H && H.t) || 0, walk = clamp((H && H.walk) || 0, 0, 1), ph = (H && H.phase) || 0;
    const strafe = clamp((H && H.strafe) || 0, -1, 1), bob = clamp((H && H.bob) || 0, -20, 20);
    const sway = Math.sin(ph) * 16 * walk, lift = Math.abs(Math.cos(ph)) * 10 * walk, breath = Math.sin(t * 1.7) * 2.4;
    const sl = H && H.slap, st = sl ? clamp(sl.t, 0, 0.42) : 0;
    const recoil = sl ? Math.sin((PI * st) / 0.42) : 0; // the left hand pulls back as the right one swings
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const LS = 1.45; // hand scale at rest (px per hand unit)

    // left hand, low left: fist holding the whistle on its cord, wristwatch
    const lx = 186 + sway - strafe * 28 - recoil * 40, ly = 452 + lift + breath + bob * 1.4 + recoil * 44;
    const lrot = -0.3 - strafe * 0.1 - recoil * 0.3;
    const c = Math.cos(lrot) * LS, s = Math.sin(lrot) * LS;
    const at = (px, py) => [lx + px * c - py * s, ly + px * s + py * c];
    const ring = at(35.7, -37.3), wr = at(-16, 56);
    ctx.beginPath(); ctx.moveTo(ring[0], ring[1]);
    ctx.quadraticCurveTo(ring[0] + 30 - sway * 0.6, ring[1] + 150, 70 + sway * 0.4, 660);
    ctx.strokeStyle = P.cord; ctx.lineWidth = 4.4; ctx.stroke();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = P.cordLt; ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
    sleeve(ctx, P, 150 + sway * 0.5 - strafe * 20, 780, wr[0], wr[1], 84, 44, LS);
    whistleFist(ctx, P, lx, ly, lrot, LS);

    // right hand, low right: open palm; a slap whips it to the target, squashes it, follows through, returns
    const base = { x: 818 - sway - strafe * 28, y: 458 + lift + breath + bob * 1.4, rot: -0.3 - strafe * 0.1, sc: LS };
    const q = rightPose(H || {}, base);
    const rc = Math.cos(q.rot), rs = Math.sin(q.rot), wl = 50 * q.sc * q.sqy;
    const rwx = q.x - rs * wl, rwy = q.y + rc * wl;
    if (q.smear > 0.05) { // motion smear: ghost hands and speed arcs along the swing
      const a0 = ctx.globalAlpha, ghosts = [];
      for (let i = 1; i <= 3; i++) ghosts.push(rightPose({ slap: { t: Math.max(0, sl.t - i * 0.011), x: sl.x, y: sl.y, hit: sl.hit } }, base));
      for (let i = 2; i >= 0; i--) {
        const g = ghosts[i];
        ctx.globalAlpha = a0 * q.smear * (0.5 - i * 0.13);
        ell(ctx, g.x + Math.sin(g.rot) * 8 * g.sc, g.y - Math.cos(g.rot) * 8 * g.sc, 36 * g.sc, 62 * g.sc, g.rot, P.skin);
      }
      ctx.globalAlpha = a0 * q.smear * 0.85;
      const g = ghosts[2];
      ctx.beginPath();
      for (let j = -1; j <= 1; j++) {
        const ox = rc * j * 26 * q.sc, oy = rs * j * 26 * q.sc;
        ctx.moveTo(g.x + ox, g.y + oy);
        ctx.quadraticCurveTo(ghosts[0].x + ox + (q.y - g.y) * 0.12, ghosts[0].y + oy - (q.x - g.x) * 0.12, q.x + ox, q.y + oy);
      }
      ctx.strokeStyle = P.smear; ctx.lineWidth = 5; ctx.stroke();
      ctx.globalAlpha = a0;
    }
    sleeve(ctx, P, 915 - sway * 0.5 - strafe * 20, 790, rwx, rwy, 82, 44 * (q.sc / LS), q.sc);
    openHand(ctx, P, q.x, q.y, q.rot, q.sc, q.sqx, q.sqy, q.spread);
  }

  const okPlane = (p) => !!p && p.s > 0 && isFinite(p.x + p.y + p.s + p.d);
  TH.fpSprites = {
    // Oncoming rickshaw: near = front-wheel plane (driver), far = rear-axle plane (carriage, hood).
    drawRickshawFront(ctx, k, near, far, env) {
      if (!k || !okPlane(near) || !okPlane(far)) return;
      ctx.save();
      if (near.s < 0.33) lodFront(ctx, k, near, far, env); else drawFront(ctx, k, near, far, env);
      ctx.restore();
    },
    // Rickshaw riding away: near = rear-axle plane (painted rear panel), far = front plane (driver).
    drawRickshawBack(ctx, k, near, far, env) {
      if (!k || !okPlane(near) || !okPlane(far)) return;
      ctx.save();
      if (near.s < 0.33) lodBack(ctx, k, near, far, env); else drawBack(ctx, k, near, far, env);
      ctx.restore();
    },
    drawHands(ctx, H, env) {
      ctx.save();
      drawHands(ctx, H || {}, env);
      ctx.restore();
    },
  };
})();
