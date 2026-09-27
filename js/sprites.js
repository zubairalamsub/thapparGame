// Character art: rickshaws (pedal and battery "Tesla"), passengers, the traffic-sergeant player
// and speech bubbles, in the spirit of Dhaka rickshaw art. Pure drawing — no game logic.
// The sun sits in the world's upper right. Sprites are mirrored with scale(dir, 1), so sunny-side
// highlights use R = ±1 (world-right expressed in local x) and stay lit whichever way they face.
// Budgets (see ART_CONTRACT.md): shapes are batched into shared paths wherever colours allow.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;
  const PI = Math.PI, TAU = PI * 2;

  // ---------- palette ----------
  const ART = ['#ff2e88', '#ffd23f', '#18c29c', '#3a86ff', '#ff7b25', '#a855f7', '#7ed957', '#fdfdfd'];
  const CUSHIONS = ['#b5172f', '#11897a', '#3d348b', '#d9480f', '#1f7a3a'];
  const SLOGANS = ['মায়ের দোয়া', 'বাবার দোয়া', 'সোনার বাংলা', 'ভাই ভাই', 'রূপসী বাংলা', 'দুই বন্ধু'];
  const GAMCHAS = [['#d62828', '#fbe3c4'], ['#2b9348', '#f25c54'], ['#1d4e89', '#fbe3c4'], ['#e36414', '#fff3b0']];
  const SHIRTS = ['#4a90c2', '#c2553b', '#6a8e3a', '#8e5aa8', '#d4a017', '#5b6770'];
  const PANTS = ['#2f3a4f', '#3d405b', '#5c4033', '#22223b', '#57606f'];
  const SCARVES = ['#1d3557', '#6d597a', '#2a9d8f', '#b56576', '#264653', '#e5989b'];
  const BAGS = ['rgba(244,114,182,0.9)', 'rgba(96,165,250,0.9)', '#c8a165', '#f8fafc'];
  const SANDALS = ['#1e3a8a', '#b91c1c', '#111827', '#15803d'];
  const INK = 'rgba(40,20,10,0.5)';
  const CHROME = '#e4e9ee';
  const HAIR = '#17110d';

  // ---------- helpers ----------
  const memo = new Map();
  // #rrggbb mixed toward black (f < 0) or white (f > 0), optionally with alpha a.
  function shade(hex, f, a) {
    const key = hex + '|' + f + '|' + a;
    let out = memo.get(key);
    if (out) return out;
    const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex);
    if (!m) return hex;
    const h6 = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    const n = parseInt(h6, 16), to = f < 0 ? 0 : 255, q = Math.abs(f);
    const c = (v) => Math.round(v + (to - v) * q);
    const rgb = `${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)}`;
    out = a === undefined ? `rgb(${rgb})` : `rgba(${rgb},${a})`;
    if (memo.size > 800) memo.clear();
    memo.set(key, out);
    return out;
  }
  // Gradients are built in local sprite space, so one per (colours, facing) is reused every frame.
  // stops(): [offset, colour, ...], only evaluated on a cache miss. r0 >= 0 makes it radial.
  const grads = new Map();
  function grad(ctx, key, x0, y0, x1, y1, stops, r0, r1) {
    let g = grads.get(key);
    if (!g) {
      g = r0 === undefined ? ctx.createLinearGradient(x0, y0, x1, y1) : ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
      const s = stops();
      for (let i = 0; i < s.length; i += 2) g.addColorStop(s[i], s[i + 1]);
      if (grads.size > 300) grads.clear();
      grads.set(key, g);
    }
    return g;
  }
  function poly(ctx, p) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  }
  function fillPoly(ctx, p, c) { poly(ctx, p); ctx.fillStyle = c; ctx.fill(); }
  // Polyline with flat ends (dashed over a stroke of the same width it paints check stripes).
  function flat(ctx, p, c, w) { poly(ctx, p); ctx.lineCap = 'butt'; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); ctx.lineCap = 'round'; }
  function ell(ctx, x, y, rx, ry, rot, c) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fillStyle = c; ctx.fill(); }
  function curve(ctx, p, c, w) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
  }
  function bez(p, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
  }
  // Two-bone IK: the joint between (ax, ay) and (bx, by); side picks which way it bends.
  function ik(ax, ay, bx, by, l1, l2, side) {
    const dx = bx - ax, dy = by - ay;
    const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01));
    const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const ang = Math.atan2(dy, dx) - side * Math.acos(Math.max(-1, Math.min(1, c)));
    return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
  }
  // Six-petal flower: round-capped dashes around a ring (dash left set), optional centre.
  function flower(ctx, x, y, r, petal, core) {
    ctx.setLineDash([0.01, r * 1.04]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.strokeStyle = petal; ctx.lineWidth = r * 1.3; ctx.stroke();
    if (core) TH.circle(ctx, x, y, r * 0.55, core);
  }
  // Text that stays readable on a mirrored sprite.
  function flatText(ctx, str, x, y, dir, maxW) { ctx.scale(dir, 1); ctx.fillText(str, x * dir, y, maxW); ctx.scale(dir, 1); }

  // ---------- rickshaw geometry (local, facing +x, ground at y = 0) ----------
  const HO = [-71, -52, -82, -127, -18, -147, 8, -103];   // hood: outer edge, rear bottom → front top
  const HI = [2, -97, -10, -111, -42, -115, -52, -92];    // hood: inner edge, front rim → rear shoulder
  const HM = [-64, -66, -70, -118, -26, -134, 5, -100];   // centre line of the painted band
  const FRINGE = Array.from({ length: 9 }, (_, i) => bez(HI, 0.04 + i * 0.066));
  const MOTIF = [0.2, 0.5, 0.8].map((t) => bez(HM, t));
  const HEARTS = [0.13, 0.31, 0.5, 0.69, 0.87].map((t) => bez(HM, t));
  const RX = -28, RY = -20, FX = 48, FY = -17;             // rear / front hubs
  const BBX = 28, BBY = -24;                                // bottom bracket (crank)
  const lastWheel = new WeakMap();                          // wheel angle last frame -> "is it moving?"

  // Small painted scene on the back plate, 20 × 17 with top-left (x, y). Bengal, no people.
  function paintScene(ctx, type, x, y, R) {
    const dusk = type === 2;
    ctx.fillStyle = dusk ? '#ff9a62' : '#78c6ec'; ctx.fillRect(x, y, 20, 17);
    ctx.fillStyle = dusk ? '#ffd98a' : '#dff1f7'; ctx.fillRect(x, y + 6, 20, 5);
    TH.circle(ctx, x + 10 + R * 5.5, y + (dusk ? 9.6 : 4), dusk ? 3.2 : 2.2, '#fff3a0');
    if (type === 0) { // river with a sailing boat
      ctx.fillStyle = '#3c9a4c'; ctx.fillRect(x, y + 9, 20, 2);
      ctx.fillStyle = '#2d7fc0'; ctx.fillRect(x, y + 11, 20, 6);
      TH.line(ctx, [x + 5, y + 13, x + 14, y + 13], '#6b3a1c', 2.2);
      fillPoly(ctx, [x + 9.5, y + 12, x + 9.5, y + 3, x + 14.5, y + 11.2], '#f6f1e1');
    } else if (type === 1) { // village hut under a coconut palm
      ctx.fillStyle = '#62b246'; ctx.fillRect(x, y + 11, 20, 6);
      ctx.fillStyle = '#e8c07a'; ctx.fillRect(x + 3, y + 8.4, 8, 4.8);
      fillPoly(ctx, [x + 1.5, y + 8.8, x + 7, y + 4, x + 12.5, y + 8.8], '#9c5a24');
      ctx.fillStyle = '#7a4a26'; ctx.fillRect(x + 15, y + 5, 1.1, 8);
      ctx.beginPath();
      ctx.moveTo(x + 15.5, y + 5); ctx.quadraticCurveTo(x + 12, y + 3.2, x + 11.4, y + 6.6);
      ctx.moveTo(x + 15.5, y + 5); ctx.quadraticCurveTo(x + 19, y + 3.2, x + 19.6, y + 6.6);
      ctx.strokeStyle = '#2f7d3a'; ctx.lineWidth = 1.3; ctx.stroke();
    } else { // sunset lake with a swan
      ctx.fillStyle = '#4f7fb8'; ctx.fillRect(x, y + 10, 20, 7);
      ell(ctx, x + 9, y + 14, 3.4, 1.6, 0, '#fdfdfd');
      TH.line(ctx, [x + 11.5, y + 13.5, x + 12.6, y + 10.2, x + 13.8, y + 10.4], '#fdfdfd', 1.1);
    }
  }

  // Seated passenger facing +x: hip at (px, sy), knee at x = kx, scale s (< 0.9 = child).
  // parts: 0 torso and head only (hidden behind others), 1 + legs, 2 + arm resting on the lap.
  // Hair and eyes are queued in `heads` and painted together afterwards.
  function drawPassenger(ctx, p, px, sy, kx, s, parts, heads) {
    const r = TH.mulberry32((p.seed | 0) + 101);
    const kid = s < 0.9, u = r();
    const type = kid ? 4 : u < 0.28 ? 0 : u < 0.46 ? 1 : u < 0.73 ? 2 : 3; // shirt, panjabi, saree, salwar, school kid
    const skin = p.skin, main = p.shirt, acc = ART[(r() * 8) | 0];
    const X = (v) => px + v * s, Y = (v) => sy + v * s;
    const top = type === 1 ? shade(main, 0.55) : kid ? '#eef2f8' : main;
    const low = type === 2 ? main : type === 3 ? shade(acc, 0.4) : kid ? '#27407a' : PANTS[(r() * PANTS.length) | 0];
    const hijab = type === 3 && r() < 0.55, cap = type === 1 && r() < 0.45, bag = parts > 1 && r() < 0.3;
    if (parts > 0) TH.line(ctx, [X(1), Y(-2), kx, sy - 1.5 * s, kx + 3 * s, sy + 19 * s, kx + 8 * s, sy + 19.5 * s], low, 5.6 * s);
    if (kid) { ctx.fillStyle = main; ctx.fillRect(X(-11.5), Y(-22), 6.5 * s, 14 * s); } // school bag
    // torso (a panjabi falls over the thighs)
    ctx.beginPath(); ctx.moveTo(X(-6), Y(0)); ctx.quadraticCurveTo(X(-8.5), Y(-13), X(-4), Y(-23));
    ctx.lineTo(X(5), Y(-23)); ctx.quadraticCurveTo(X(9.5), Y(-12), X(type === 1 ? 13 : 7), Y(type === 1 ? 1 : 0));
    ctx.fillStyle = top; ctx.fill();
    if (type === 2) TH.line(ctx, [X(-4.5), Y(-22), X(2), Y(-12), X(8), Y(-3)], acc, 3.8 * s);                  // saree anchal
    else if (type === 3) TH.line(ctx, [X(-7), Y(-8), X(-3.5), Y(-22), X(4.5), Y(-21.5), X(8.5), Y(-13)], acc, 3 * s); // orna
    if (parts > 1) {
      TH.line(ctx, [X(2), Y(-20), X(6.5), Y(-9.5), X(12.4), Y(-5)], type === 2 ? skin : top, 3.8 * s);
      if (bag) { // shopping bag on the lap
        ctx.fillStyle = BAGS[(r() * BAGS.length) | 0]; ctx.fillRect(X(7), Y(-11), 8.5 * s, 9 * s);
        ctx.beginPath(); ctx.arc(X(11.2), Y(-11), 2.6 * s, PI, TAU); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // head
    if (hijab) {
      ell(ctx, X(1.2), Y(-28.5), 8.6 * s, 9.8 * s, 0, SCARVES[(r() * SCARVES.length) | 0]);
      ell(ctx, X(3.4), Y(-30), 5.3 * s, 6.3 * s, 0, skin);
    } else TH.circle(ctx, X(2), Y(-30), 7 * s, skin);
    if (cap) { ctx.beginPath(); ctx.arc(X(1.6), Y(-31.2), 7.1 * s, PI * 1.04, PI * 1.96); ctx.fillStyle = '#f5f5ee'; ctx.fill(); } // tupi
    heads.push(X(2), Y(-30), s, hijab || cap ? 2 : type === 2 || type === 3 ? 1 : 0);
  }

  // Hair (0 short, 1 long with a bun, 2 covered) for all queued heads in one path, then the eyes.
  function drawHeads(ctx, h) {
    ctx.beginPath();
    for (let i = 0; i < h.length; i += 4) {
      const x = h[i], y = h[i + 1], s = h[i + 2], st = h[i + 3];
      if (st !== 2) {
        const cx = x - 0.4 * s, cy = y - 0.9 * s, rr = 7.4 * s;
        ctx.moveTo(cx + Math.cos(PI * 0.86) * rr, cy + Math.sin(PI * 0.86) * rr);
        ctx.arc(cx, cy, rr, PI * 0.86, PI * 1.98);
      }
      if (st === 1) { ctx.moveTo(x - 0.3 * s, y + s); ctx.ellipse(x - 3.6 * s, y + s, 3.4 * s, 6.2 * s, 0.25, 0, TAU); }
    }
    ctx.fillStyle = HAIR; ctx.fill();
    for (let i = 0; i < h.length; i += 4) ctx.fillRect(h[i] + 2.6 * h[i + 2], h[i + 1] - 1.6 * h[i + 2], 1.9 * h[i + 2], 2 * h[i + 2]);
  }

  TH.sprites = {
    // Draws rickshaw `k` with its ground line at y = gy. See js/ART_CONTRACT.md for the fields and fixed geometry.
    drawRickshaw(ctx, k, gy, env) {
      const R = k.dir < 0 ? -1 : 1;
      const tesla = k.violation === 'tesla';
      const dazed = k.slapped && k.slapT < 0.7;
      const pax = k.pax || [], n = pax.length;
      const busy = n > 2 || (tesla && n > 1); // crowded: skip small details the passengers hide anyway
      // per-rickshaw decoration, deterministic from k.seed
      const rnd = TH.mulberry32((k.seed | 0) + 40503);
      const ai = (rnd() * 8) | 0, art = (i) => ART[(ai + i) % 8];
      const motif = (rnd() * 3) | 0, scene = (rnd() * 3) | 0;
      const cushion = CUSHIONS[(rnd() * CUSHIONS.length) | 0], slogan = SLOGANS[(rnd() * SLOGANS.length) | 0];
      const gam = GAMCHAS[(rnd() * GAMCHAS.length) | 0], gamHead = rnd() < 0.5, shirtOn = rnd() < 0.4;
      const moustache = rnd() < 0.55, shirtCol = SHIRTS[(rnd() * SHIRTS.length) | 0], sandal = SANDALS[(rnd() * SANDALS.length) | 0];
      const check = rnd() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
      const prevA = lastWheel.get(k); lastWheel.set(k, k.wheelA);
      const moving = prevA === undefined || Math.abs(k.wheelA - prevA) > 1e-4;
      const a = k.wheelA;

      ctx.save();
      ctx.translate(k.x, gy);
      if (dazed) ctx.rotate(Math.sin(k.slapT * 40) * 0.06 * (1 - k.slapT / 0.7));
      ctx.scale(k.dir, 1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      ell(ctx, -5 - 2 * R, 0, 70, 4, 0, 'rgba(25,14,6,0.24)'); // shadow on the road, cast toward world-left

      // shaded lining inside the hood, behind the passengers
      if (!busy) {
        const lg = grad(ctx, 'lin|' + k.hood, -58, 0, 0, 0, () => [0, shade(k.hood, -0.62, 0.9), 1, shade(k.hood, -0.62, 0)]);
        ctx.beginPath(); ctx.moveTo(-58, -57); ctx.lineTo(HI[6], HI[7]);
        ctx.bezierCurveTo(HI[4], HI[5], HI[2], HI[3], HI[0], HI[1]); ctx.lineTo(-4, -60);
        ctx.fillStyle = lg; ctx.fill();
      }

      // carriage box: painted back plate with a framed scene, slogan, footboard, rear reflector
      const bg = grad(ctx, 'box|' + k.body, 0, -55, 0, -30, () => [0, shade(k.body, 0.2), 1, shade(k.body, -0.32)]);
      fillPoly(ctx, [-76, -55, -2, -55, -5, -33, -73, -30], bg);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(-73.5, -53.5, 23, 20);
      paintScene(ctx, scene, -72, -52, R);
      ctx.fillStyle = '#fff4d6'; ctx.fillRect(-46, -53.5, 35, 8.5);
      ctx.fillStyle = '#c1121f'; ctx.font = `bold 6.4px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      flatText(ctx, slogan, -28.5, -49, k.dir, 32);
      TH.line(ctx, [-6.5, -37.2, 15, -39.2], '#34343c', 3.4);
      ell(ctx, -76.3, -37, 2, 3.4, 0, '#e3172b');

      // seat cushion
      ctx.beginPath(); ctx.moveTo(-67, -54); ctx.lineTo(-67, -61); ctx.lineTo(-6, -61);
      ctx.quadraticCurveTo(-1, -61, -1, -57.5); ctx.quadraticCurveTo(-1, -54, -6, -54);
      ctx.fillStyle = cushion; ctx.fill();
      if (!busy) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-66, -60.4, 60, 1.6); }

      // passengers (the overload is crammed: three abreast, a child on a lap, one on the footboard)
      const heads = [];
      if (n === 5) {
        drawPassenger(ctx, pax[0], -52, -58, -4, 1, 0, heads);
        drawPassenger(ctx, pax[1], -38, -58, -3, 1, 0, heads);
        drawPassenger(ctx, pax[2], -24, -58, -1, 1, 1, heads);
        drawPassenger(ctx, pax[3], -11, -63, 0, 0.68, 1, heads);
        drawPassenger(ctx, pax[4], 5, -40, 12, 0.7, 1, heads);
      } else if (n === 2) {
        drawPassenger(ctx, pax[0], -42, -58, -5, 1, 2, heads);
        drawPassenger(ctx, pax[1], -24, -58, -1, 1, 2, heads);
      } else if (n === 1) {
        drawPassenger(ctx, pax[0], -30, -58, -2, 1, 2, heads);
      } else {
        for (let i = 0; i < n; i++) drawPassenger(ctx, pax[i], -52 + (i * 30) / Math.max(1, n - 1), -58, -2, 1, i === n - 1 ? 1 : 0, heads);
      }
      if (n) drawHeads(ctx, heads);

      // hood: painted canopy with a two-tone border, a row of studs and a motif
      const hg = grad(ctx, 'hood|' + k.hood + R, -31 - 38 * R, -58, -31 + 38 * R, -140,
        () => [0, shade(k.hood, -0.4), 0.55, k.hood, 1, shade(k.hood, 0.3)]);
      ctx.beginPath(); ctx.moveTo(HO[0], HO[1]); ctx.bezierCurveTo(HO[2], HO[3], HO[4], HO[5], HO[6], HO[7]);
      ctx.lineTo(HI[0], HI[1]); ctx.bezierCurveTo(HI[2], HI[3], HI[4], HI[5], HI[6], HI[7]); ctx.lineTo(-58, -57);
      ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.save(); ctx.clip();
      curve(ctx, HO, art(0), 9);
      curve(ctx, HO, art(3), 3.2);
      ctx.setLineDash([0.01, 5]); curve(ctx, HM, 'rgba(255,250,225,0.95)', 2.3);
      if (motif === 0) {        // three painted flowers
        flower(ctx, MOTIF[0][0], MOTIF[0][1], 3.2, art(1));
        flower(ctx, MOTIF[1][0], MOTIF[1][1] + 1, 4.6, art(2), '#ffd23f');
        flower(ctx, MOTIF[2][0], MOTIF[2][1], 3.2, art(1));
      } else if (motif === 1) { // peacock displaying its tail
        const x = MOTIF[1][0], y = MOTIF[1][1] + 3;
        ctx.beginPath(); ctx.arc(x, y, 7.4, PI, TAU); ctx.fillStyle = '#0f8f6a'; ctx.fill();
        ell(ctx, x + 0.6, y + 1.2, 2.1, 3.4, 0.25, '#2563eb');
        ctx.setLineDash([0.01, 2.7]);
        ctx.beginPath(); ctx.arc(x, y, 5.4, PI * 1.04, PI * 1.96); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.setLineDash([]); TH.line(ctx, [x + 1.4, y - 1.2, x + 2.4, y - 4.6], '#2563eb', 1.6);
      } else {                  // a row of hearts
        ctx.beginPath();
        for (const [x, y] of HEARTS) {
          ctx.moveTo(x, y + 3);
          ctx.bezierCurveTo(x - 4.5, y, x - 1.8, y - 3.6, x, y - 1.2);
          ctx.bezierCurveTo(x + 1.8, y - 3.6, x + 4.5, y, x, y + 3);
        }
        ctx.fillStyle = art(1); ctx.fill();
      }
      ctx.restore(); // also clears the dash

      // piping on the inner edge, chrome front bow, and the tassel fringe (jhalor) swinging along it
      curve(ctx, HI, art(5), 2.2);
      TH.line(ctx, [6.5, -100.5, -2.5, -60], CHROME, 1.8);
      const tas = [art(1), art(4), art(6)];
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        for (let i = c; i < FRINGE.length; i += 3) {
          const f = FRINGE[i], sw = Math.sin(k.t * 5 + i * 1.3) * 0.7 - (moving ? 1.1 : 0);
          ctx.moveTo(f[0], f[1] + 1); ctx.lineTo(f[0] + sw, f[1] + 6.6 + (i % 2) * 1.4);
        }
        ctx.strokeStyle = tas[c]; ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (tesla) { // chasing LED strip along the hood edge
        ctx.setLineDash([0.01, 4]); ctx.lineDashOffset = -k.t * 14;
        curve(ctx, HO, '#5eead4', 2.4);
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }

      // driver's legs: pedalling follows wheelA; a Tesla driver never pedals, his feet rest on the footboard
      const pedal = (ang) => [BBX + Math.cos(ang) * 8, BBY + Math.sin(ang) * 8];
      const legAt = (ang, back) => {
        if (tesla) return back ? [35, -53.5, 37.5, -39, 43, -38.4] : [37.5, -53, 40, -38.6, 45.5, -38];
        const pd = pedal(ang), ax = pd[0] - 1.8, ay = pd[1] - 2.4;
        const kn = ik(21.5, -56, ax, ay, 20, 21.5, 1);
        return [kn[0], kn[1], ax, ay, pd[0] + 5.2, pd[1] - 0.4];
      };
      const farL = legAt(a + PI, true), nearL = legAt(a, false);
      TH.line(ctx, [21, -57, farL[0], farL[1]], shade(k.lungi, -0.35), 6.6);
      TH.line(ctx, [farL[0], farL[1], farL[2], farL[3], farL[4], farL[5]], shade(k.skin, -0.3), 4);

      // wheels: tyres, rims, spokes turning with wheelA, hubs
      ctx.beginPath(); ctx.arc(RX, RY, 18.2, 0, TAU); ctx.moveTo(FX + 15.3, FY); ctx.arc(FX, FY, 15.3, 0, TAU);
      ctx.strokeStyle = '#1c1c20'; ctx.lineWidth = 3.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(RX, RY, 15.9, 0, TAU); ctx.moveTo(FX + 13.1, FY); ctx.arc(FX, FY, 13.1, 0, TAU);
      ctx.strokeStyle = '#c3cad2'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ra = a * 0.95 + (i * PI) / 4, fa = a * 1.12 + (i * PI) / 4;
        const rc = Math.cos(ra) * 15.4, rs = Math.sin(ra) * 15.4, fc = Math.cos(fa) * 12.6, fs = Math.sin(fa) * 12.6;
        ctx.moveTo(RX - rc, RY - rs); ctx.lineTo(RX + rc, RY + rs);
        ctx.moveTo(FX - fc, FY - fs); ctx.lineTo(FX + fc, FY + fs);
      }
      ctx.strokeStyle = moving ? 'rgba(220,226,232,0.75)' : '#d9dfe5'; ctx.lineWidth = 0.85; ctx.stroke();
      ctx.beginPath(); ctx.arc(RX, RY, 3, 0, TAU); ctx.moveTo(FX + 2.6, FY); ctx.arc(FX, FY, 2.6, 0, TAU); ctx.fillStyle = '#9aa3ad'; ctx.fill();
      const sa = R > 0 ? -PI / 4 : -PI * 0.75; // sunlit rubber, upper right in world space
      ctx.beginPath(); ctx.arc(RX, RY, 18.6, sa - 0.55, sa + 0.55);
      ctx.moveTo(FX + Math.cos(sa - 0.55) * 15.7, FY + Math.sin(sa - 0.55) * 15.7); ctx.arc(FX, FY, 15.7, sa - 0.55, sa + 0.55);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.1; ctx.stroke();

      // frame and handlebar
      ctx.beginPath();
      ctx.moveTo(RX, RY); ctx.lineTo(BBX, BBY); ctx.lineTo(21, -56);
      ctx.moveTo(BBX, BBY); ctx.lineTo(44.5, -52);
      ctx.moveTo(22, -49); ctx.lineTo(44.5, -60);
      ctx.moveTo(44, -66); ctx.lineTo(FX, FY);
      ctx.strokeStyle = shade(k.body, -0.5); ctx.lineWidth = 2.8; ctx.stroke();
      TH.line(ctx, [44, -66, 45.5, -71.5, 39.5, -72.5], '#cfd6dd', 2.2);

      if (!tesla) { // chainring, moving chain, crank arms and pedals
        TH.circle(ctx, BBX, BBY, 6.4, '#8d96a0');
        ctx.setLineDash([2, 1.3]); ctx.lineDashOffset = -a * 17;
        ctx.beginPath(); ctx.moveTo(RX, RY - 3.2); ctx.lineTo(BBX, BBY - 6.5); ctx.arc(BBX, BBY, 6.5, -PI / 2, PI / 2);
        ctx.lineTo(RX, RY + 3.2); ctx.arc(RX, RY, 3.2, PI / 2, PI * 1.5);
        ctx.strokeStyle = '#4b4f58'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
        const p1 = pedal(a + PI), p2 = pedal(a);
        TH.line(ctx, [p1[0], p1[1], BBX, BBY, p2[0], p2[1]], '#d5dbe1', 2.2);
        ctx.fillStyle = '#1d1d22'; ctx.fillRect(p1[0] - 3, p1[1] - 1, 6, 2); ctx.fillRect(p2[0] - 3, p2[1] - 1, 6, 2);
      } else { // battery box with a lightning mark, hub motor, footboard, headlight
        TH.line(ctx, [0, -27, RX + 5, RY], '#dc2626', 1.3);
        ctx.fillStyle = '#20242c'; ctx.fillRect(-1, -36, 22, 12);
        ctx.fillStyle = '#454c5a'; ctx.fillRect(-1, -36, 22, 2.4);
        ctx.fillStyle = '#4ade80'; ctx.fillRect(1, -32.6, 5.5, 1.6);
        ctx.fillStyle = '#e11d48'; ctx.fillRect(16.5, -37.4, 2.4, 1.6);
        fillPoly(ctx, [12.4, -33.4, 8.4, -28.6, 11, -28.6, 9.4, -25, 14, -30, 11.4, -30], '#facc15');
        TH.circle(ctx, RX, RY, 6.6, '#4b5563'); TH.circle(ctx, RX + R * 0.8, RY - 0.8, 3.8, '#c7ced6');
        TH.line(ctx, [28, -34.5, 47, -37], '#2f3138', 3.4);
        const bm = grad(ctx, 'beam', 51, 0, 95, 0, () => [0, 'rgba(255,244,190,0.3)', 1, 'rgba(255,244,190,0)']);
        fillPoly(ctx, [50.5, -63, 95, -77, 95, -47], bm);
        TH.circle(ctx, 48.6, -63, 3.4, '#d7dde3'); TH.circle(ctx, 49.4, -63, 2.2, '#fffbe6'); // lamp clamped to the fork
        if (moving && !k.slapped && Math.sin(k.t * 29) + Math.sin(k.t * 47) > 1.2) TH.line(ctx, [19, -38, 22.5, -42, 20.5, -43.5], '#7dd3fc', 1.2);
      }

      // mudguards with a pinstripe
      ctx.beginPath(); ctx.arc(RX, RY, 22.6, PI * 1.02, PI * 1.9);
      ctx.moveTo(FX + Math.cos(PI * 1.2) * 19.5, FY + Math.sin(PI * 1.2) * 19.5); ctx.arc(FX, FY, 19.5, PI * 1.2, PI * 1.95);
      ctx.strokeStyle = shade(k.body, -0.12); ctx.lineWidth = 3.6; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();

      // near leg: checked lungi folded to the knee, bare shin, flip-flop
      ell(ctx, 20, -57.5, 8.6, 6.3, 0.25, k.lungi);
      TH.line(ctx, [21, -57, nearL[0], nearL[1]], k.lungi, 7.4);
      ctx.setLineDash([1.1, 2.5]); flat(ctx, [21, -57, nearL[0], nearL[1]], check, 7.4); ctx.setLineDash([]);
      TH.line(ctx, [nearL[0], nearL[1], nearL[2], nearL[3], nearL[4], nearL[5]], k.skin, 4.3);
      TH.line(ctx, [nearL[2] - 2.2, nearL[3] + 2.4, nearL[4] + 1, nearL[5] + 1.4], sandal, 1.8);

      // far arm, torso (sleeveless vest or shirt), gamcha round the neck
      const phone = k.violation === 'phone' && !k.slapped;
      const skinDk = shade(k.skin, -0.3);
      const fe = ik(27, -80, 41.5, -72, 11.5, 11.5, -1);
      TH.line(ctx, [27, -80, fe[0], fe[1], 41.5, -72], skinDk, 3.8);
      const topCol = shirtOn ? shirtCol : k.vest;
      const tg = grad(ctx, 'top|' + topCol + R, 26 - 11 * R, 0, 26 + 11 * R, 0, () => [0, shade(topCol, -0.28), 1, shade(topCol, 0.12)]);
      ctx.beginPath(); ctx.moveTo(15.5, -58.5); ctx.quadraticCurveTo(15.5, -74, 24, -83.5); ctx.lineTo(35, -81.5);
      ctx.quadraticCurveTo(37, -67, 29.5, -56); ctx.fillStyle = tg; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
      if (shirtOn) fillPoly(ctx, [28.5, -83.2, 33, -78.4, 36, -82.6], shade(shirtCol, 0.3));
      else ell(ctx, 32, -81.2, 3.4, 2.2, 0.3, k.skin);
      if (!gamHead) {
        const gp = [23.5, -84, 31.5, -84.6, 36.2, -74.5];
        TH.line(ctx, gp, gam[0], 4.4);
        ctx.setLineDash([1.2, 1.8]); flat(ctx, gp, gam[1], 4.4); ctx.setLineDash([]);
      }

      // near arm on the handlebar (the phone arm is drawn after the head)
      if (!phone) {
        const ne = ik(32, -79.5, 43.5, -70.5, 11.5, 11.5, -1);
        if (shirtOn) TH.line(ctx, [32, -79.5, (32 + ne[0]) / 2 + 0.5, (-79.5 + ne[1]) / 2], shirtCol, 5.6);
        TH.line(ctx, [32, -79.5, ne[0], ne[1], 43.5, -70.5], k.skin, 4.1);
        TH.circle(ctx, 43.8, -70.5, 2.3, k.skin);
      }

      // head (centre at local (33, -91)); a slap tilts it back
      ctx.save();
      ctx.translate(33, -91);
      if (k.slapped) ctx.rotate(-0.55 * Math.max(0, 1 - k.slapT / 1.2) + Math.sin(k.slapT * 25) * 0.1 * Math.max(0, 1 - k.slapT));
      if (gamHead) TH.line(ctx, [-7.5, -3.5, -12, 1.5, -11, 6.5], gam[0], 3); // knot tail of the head gamcha
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.lineTo(11.3, 1.6); ctx.lineTo(8.3, 3.6);
      ctx.fillStyle = k.skin; ctx.fill();
      ell(ctx, -1.8, 0.6, 2, 2.9, 0, shade(k.skin, -0.2));
      if (gamHead) {
        ctx.beginPath(); ctx.arc(-0.5, -1.4, 9.6, PI * 0.9, PI * 1.9); ctx.fillStyle = gam[0]; ctx.fill();
        ctx.setLineDash([1, 1.6]); flat(ctx, [-8.4, -4.4, -1, -7.8, 7.8, -5.8], gam[1], 1.8); ctx.setLineDash([]);
      } else {
        ctx.beginPath(); ctx.arc(-1.2, -1.5, 9.2, PI * 0.9, PI * 1.74); ctx.fillStyle = HAIR; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 9, PI * 0.06, PI * 0.72); ctx.fillStyle = 'rgba(40,24,14,0.3)'; ctx.fill(); // stubble
      if (moustache) ell(ctx, 6.6, 3.9, 3, 1.15, 0.12, '#1d130d');
      if (k.slapped) { // shocked: wide eye, open mouth, red hand-mark on the cheek
        const m = Math.max(0.3, 1 - k.slapT / 3);
        TH.circle(ctx, 4.8, -1.4, 2.3, '#fff'); TH.circle(ctx, 5.3, -1.4, 1, '#111');
        ell(ctx, 7.2, 5.6, 1.5, 2.1, 0, '#5a1a14');
        ctx.beginPath(); ctx.ellipse(2.4, 3.4, 3.1, 2.4, 0.3, 0, TAU);
        ctx.moveTo(-0.5, 1); ctx.lineTo(-3, -2.5); ctx.moveTo(1.5, 0.6); ctx.lineTo(0, -3.4); ctx.moveTo(3.5, 0.8); ctx.lineTo(3.2, -3);
        ctx.fillStyle = ctx.strokeStyle = `rgba(230,35,45,${(0.55 * m).toFixed(3)})`; ctx.lineWidth = 1.5;
        ctx.fill(); ctx.stroke();
      } else {
        TH.circle(ctx, 4.6, -1.3, 1.3, '#1a100a');
        TH.line(ctx, [2.6, -4.4, 6.8, -4.1], '#1d130d', 1.1);
        TH.line(ctx, [5.6, 5.9, 8.2, 5.5], '#4a2616', 1);
      }
      ctx.restore();

      if (phone) { // phone pressed to the ear, steering one-handed
        ctx.fillStyle = '#111827'; ctx.fillRect(29.4, -98, 4.4, 10);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(R > 0 ? 32.4 : 30, -97, 0.9, 7);
        TH.line(ctx, [32, -79.5, 40.5, -82, 33.5, -88.5], k.skin, 4.1);
        TH.circle(ctx, 33, -88.6, 2.4, k.skin);
      }

      // handlebar: plastic flowers and streamers
      if (!busy) {
        const sw = Math.sin(k.t * 6) * 0.8 - (moving ? 1.3 : 0);
        ctx.beginPath(); ctx.moveTo(40.2, -72.4); ctx.lineTo(38.6 + sw, -62.5); ctx.moveTo(40.8, -72.4); ctx.lineTo(40.6 + sw, -64);
        ctx.strokeStyle = art(4); ctx.lineWidth = 1.3; ctx.stroke();
      }
      flower(ctx, 46.6, -74.8, 2.4, art(2), '#ffd23f');
      ctx.setLineDash([]);
      TH.circle(ctx, 43, -76.4, 1.7, art(7));

      ctx.restore();
    },

    // Player at ground point (p.x, p.y). Fields: facing (1/-1), moving, walkT, slapAnim (0 = idle, else 0..0.3).
    drawPlayer(ctx, p, env) {
      const F = p.facing < 0 ? -1 : 1;
      const t = (env && env.t) || 0;
      const skin = '#a36a45', skinDk = shade(skin, -0.22);
      ctx.save();
      ctx.translate(p.x, p.y);
      ell(ctx, -3, 0.5, 21, 4.6, 0, 'rgba(20,12,6,0.26)'); // shadow falls toward world-left
      ctx.scale(F, 1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      // walk cycle: thigh swings, the knee bends while the leg travels forward
      const mv = p.moving ? 1 : 0, ph = (p.walkT || 0) * 12.5;
      const leg = (q) => {
        const th = Math.sin(q) * 0.42 * mv, bend = Math.max(0, Math.cos(q)) * 0.85 * mv;
        const kx = Math.sin(th) * 23, ky = Math.cos(th) * 23, sh = th - bend;
        return [kx, ky, kx + Math.sin(sh) * 22, ky + Math.cos(sh) * 22, sh];
      };
      const L1 = leg(ph), L2 = leg(ph + PI);
      const hy = -(Math.max(L1[3], L2[3]) + 5); // the planted foot stays on the ground
      const drawLeg = (L, col, hx, near) => {
        TH.line(ctx, [hx, hy + 2, L[0], hy + L[1]], col, 11);
        TH.line(ctx, [L[0], hy + L[1], L[2], hy + L[3]], col, 9);
        if (near) TH.line(ctx, [hx + 2.4 * F, hy + 4, L[0] + 2.4 * F, hy + L[1], L[2] + 2 * F, hy + L[3] - 1], 'rgba(255,255,255,0.14)', 1.3); // sunny side
        ell(ctx, L[2] + 3.4, hy + L[3] + 2.4, 6.8, 3.2, -L[4] * 0.3, '#0c0c0f');
        if (near) ell(ctx, L[2] + 5.6, hy + L[3] + 1.2, 2.5, 0.9, -L[4] * 0.3, 'rgba(255,255,255,0.5)');
      };
      drawLeg(L2, '#172039', -2.5, false);
      fillPoly(ctx, [-10.5, hy - 1, 11, hy - 1, 8.5, hy + 9, -8, hy + 9], '#1d2847'); // trouser seat
      drawLeg(L1, '#243157', 2.5, true);

      // slap timeline: wind-up (pull back behind the head), whip forward by 0.1 s, follow-through, recover
      const u = p.slapAnim > 0 ? Math.min(p.slapAnim, 0.3) : -1;
      const rest = 1.72 - Math.sin(ph) * 0.38 * mv;
      let armA = rest, bend = -0.25, lean = 0.04 * mv, smear = 0;
      if (u >= 0 && u < 0.035) {
        const e = u / 0.035;
        armA = -2.6 - 0.35 * e; bend = 0.65 + 0.15 * e; lean = -0.18 * e;
      } else if (u >= 0.035 && u < 0.1) {
        const q = ((u - 0.035) / 0.065) ** 2;
        armA = -2.95 + 3.1 * q; bend = 0.8 * (1 - q); lean = -0.18 + 0.34 * q; smear = q;
      } else if (u >= 0.1 && u < 0.19) {
        const e = (u - 0.1) / 0.09, q = 1 - (1 - e) * (1 - e);
        armA = 0.15 + 0.75 * q; bend = -0.35 * q; lean = 0.16 - 0.06 * q; smear = 1 - e;
      } else if (u >= 0.19) {
        const e = (u - 0.19) / 0.11, q = e * e * (3 - 2 * e);
        armA = 0.9 + (rest - 0.9) * q; bend = -0.35 + 0.1 * q; lean = 0.1 * (1 - q);
      }

      ctx.save();
      ctx.translate(0, hy);
      ctx.rotate(lean);

      // far arm swings opposite the near leg; in a slap it reaches forward, then flings back
      const fa = u < 0 ? 1.72 + Math.sin(ph) * 0.38 * mv : u < 0.06 ? 1.15 : 2.1;
      const fe = [-3 + Math.cos(fa) * 13.5, -31 + Math.sin(fa) * 13.5];
      const fh = [fe[0] + Math.cos(fa - 0.3) * 12.5, fe[1] + Math.sin(fa - 0.3) * 12.5];
      TH.line(ctx, [-3, -31, fe[0], fe[1], fh[0], fh[1]], skinDk, 4.6);
      TH.line(ctx, [-3, -31, -3 + Math.cos(fa) * 8, -31 + Math.sin(fa) * 8], '#cfd5dc', 7.2);
      TH.circle(ctx, fh[0], fh[1], 3, skinDk);

      // white shirt
      const sg = grad(ctx, 'pShirt' + F, -12 * F, 0, 12 * F, 0, () => [0, '#c3c9d2', 0.6, '#f3f5f8', 1, '#ffffff']);
      ctx.beginPath(); ctx.moveTo(-10.5, 2); ctx.lineTo(-12, -23); ctx.quadraticCurveTo(-11.5, -32, -5, -33.5);
      ctx.lineTo(6, -33.5); ctx.quadraticCurveTo(13, -31, 12.5, -21); ctx.lineTo(11, 2); ctx.closePath();
      ctx.fillStyle = sg; ctx.fill();

      // neon reflective vest with silver bands
      const vg = grad(ctx, 'pVest' + F, -12 * F, 0, 12 * F, 0, () => [0, '#93c20f', 1, '#dcff45']);
      ctx.beginPath(); ctx.moveTo(-10.9, -1); ctx.lineTo(-11.7, -23); ctx.quadraticCurveTo(-11, -31, -6.8, -32.6);
      ctx.lineTo(-2.8, -32.6); ctx.lineTo(1.5, -22); ctx.lineTo(5, -32.6); ctx.lineTo(8.6, -32.2);
      ctx.quadraticCurveTo(12.4, -28, 12, -20); ctx.lineTo(10.9, -1); ctx.closePath();
      ctx.fillStyle = vg; ctx.fill(); ctx.strokeStyle = 'rgba(60,80,0,0.45)'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.fillStyle = grad(ctx, 'pBand' + F, -12 * F, 0, 12 * F, 0, () => [0, '#8e98a3', 0.55, '#eef2f6', 1, '#c9d0d8']);
      ctx.fillRect(-13, -18, 26, 3.2); ctx.fillRect(-13, -9.5, 26, 3.2);
      ctx.fillRect(-8.6, -33, 2.6, 15); ctx.fillRect(5.6, -33, 2.6, 15);
      ctx.restore();

      // belt, walkie-talkie on the hip, whistle on its cord, collar, neck
      ctx.fillStyle = '#101216'; ctx.fillRect(-11, -1.6, 22.2, 4);
      ctx.fillStyle = '#d8dee6'; ctx.fillRect(5.8, -1.2, 4.2, 3.2);
      ctx.fillStyle = '#101216'; ctx.fillRect(6.8, -0.4, 2.2, 1.6);
      ctx.fillStyle = '#15171c'; ctx.fillRect(-14.6, -8, 5.6, 10.5);
      ctx.fillStyle = '#39404c'; ctx.fillRect(-13.8, -6.4, 4, 3.4);
      TH.line(ctx, [-13, -8, -13, -15.5], '#0d0e11', 1.5);
      TH.circle(ctx, -10.4, -7.1, 0.8, Math.sin(t * 4) > 0.3 ? '#4ade80' : '#14532d');
      ctx.beginPath(); ctx.moveTo(6.6, -31.8); ctx.quadraticCurveTo(11, -25, 7.8, -19.4);
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.fillStyle = '#cfd6dd'; ctx.fillRect(6.4, -20.3, 4.6, 2.2);
      TH.circle(ctx, 10.9, -19.2, 1.7, '#e5e9ee');
      ctx.fillStyle = shade(skin, -0.12); ctx.fillRect(-2.2, -38.5, 6, 6);
      fillPoly(ctx, [-4.2, -33.6, 0.4, -29.2, 5.6, -33.6, 1.6, -35.4], '#ffffff');

      // head: face, ear, hair, eye, brow, thick moustache
      const hx = 1.5, hh = -44;
      const fg = grad(ctx, 'pFace' + F, hx + 3 * F, hh - 3, hx, hh, () => [0, shade(skin, 0.14), 1, skin], 1, 11);
      ctx.beginPath(); ctx.arc(hx, hh, 10, 0, TAU); ctx.lineTo(hx + 12.6, hh + 2.2); ctx.lineTo(hx + 9.2, hh + 3.6);
      ctx.fillStyle = fg; ctx.fill();
      ell(ctx, hx - 2.6, hh + 0.4, 2.3, 3.2, 0, skinDk);
      ctx.beginPath(); ctx.arc(hx - 0.8, hh - 0.6, 10.3, PI * 0.7, PI * 1.25); ctx.lineTo(hx - 3.5, hh - 6); ctx.fillStyle = HAIR; ctx.fill();
      TH.circle(ctx, hx + 5.4, hh - 1.6, 1.4, '#150d08');
      TH.line(ctx, [hx + 3, hh - 5, hx + 7.8, hh - 4.6], '#150d08', 1.5);
      ctx.beginPath(); ctx.moveTo(hx + 4, hh + 4.2); ctx.quadraticCurveTo(hx + 8, hh + 2, hx + 11.4, hh + 4.6);
      ctx.quadraticCurveTo(hx + 8, hh + 6.4, hx + 4, hh + 4.2); ctx.fillStyle = '#120c08'; ctx.fill();
      if (u >= 0 && u < 0.2) ell(ctx, hx + 8.2, hh + 7.2, 1.6, 1.2, 0, '#4a1a12'); // shout
      else TH.line(ctx, [hx + 6.4, hh + 7.3, hx + 9, hh + 7], '#4a2616', 1);

      // white peaked cap: crown, black band with a plain gold button, glossy black visor
      const cg = grad(ctx, 'pCap', 0, hh - 17, 0, hh - 5, () => [0, '#ffffff', 1, '#d9dee5']);
      ctx.beginPath(); ctx.moveTo(hx - 10, hh - 5); ctx.lineTo(hx - 12, hh - 12.5);
      ctx.quadraticCurveTo(hx + 1, hh - 18.5, hx + 13, hh - 12); ctx.lineTo(hx + 10, hh - 5); ctx.closePath();
      ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#15171c'; ctx.fillRect(hx - 10.2, hh - 8.8, 20.6, 3.8);
      TH.line(ctx, [hx - 9, hh - 7, hx + 9.4, hh - 7], '#d4a93a', 0.9);
      TH.circle(ctx, hx + 9.2, hh - 7, 1.1, '#f1d27a');
      ctx.beginPath(); ctx.moveTo(hx + 8, hh - 5.6); ctx.quadraticCurveTo(hx + 16, hh - 6, hx + 17.6, hh - 3);
      ctx.lineTo(hx + 8.4, hh - 3.2); ctx.closePath(); ctx.fillStyle = '#0b0c0f'; ctx.fill();
      TH.line(ctx, [hx + 10, hh - 4.8, hx + 15, hh - 4.6], 'rgba(255,255,255,0.45)', 0.9);

      // slapping arm: swoosh trail while it whips, open palm around the hit
      const sx = 4, sy = -31;
      if (smear > 0.05 && armA > -2.7) {
        const a0 = Math.max(-2.95, armA - 1.7);
        ctx.beginPath(); ctx.arc(sx, sy, 25, a0, armA);
        ctx.strokeStyle = `rgba(255,255,255,${(0.5 * smear).toFixed(3)})`; ctx.lineWidth = 6; ctx.stroke();
        if (armA - a0 > 0.5) {
          ctx.beginPath(); ctx.arc(sx, sy, 18.5, a0 + 0.4, armA);
          ctx.strokeStyle = `rgba(255,226,140,${(0.45 * smear).toFixed(3)})`; ctx.lineWidth = 3; ctx.stroke();
        }
      }
      const ex = sx + Math.cos(armA) * 14, ey = sy + Math.sin(armA) * 14;
      const fA = armA + bend, hx2 = ex + Math.cos(fA) * 13, hy2 = ey + Math.sin(fA) * 13;
      TH.line(ctx, [sx, sy, ex, ey, hx2, hy2], skin, 5);
      TH.line(ctx, [sx, sy, sx + Math.cos(armA) * 8, sy + Math.sin(armA) * 8], '#f3f5f7', 7.4);
      if (u >= 0 && u < 0.22) { // open palm, fingers splayed
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const fa2 = fA + (i - 1.5) * 0.26;
          ctx.moveTo(hx2 + Math.cos(fa2) * 2.5, hy2 + Math.sin(fa2) * 2.5); ctx.lineTo(hx2 + Math.cos(fa2) * 7.4, hy2 + Math.sin(fa2) * 7.4);
        }
        ctx.moveTo(hx2, hy2); ctx.lineTo(hx2 + Math.cos(fA - 1.2) * 5.4, hy2 + Math.sin(fA - 1.2) * 5.4); // thumb
        ctx.strokeStyle = skin; ctx.lineWidth = 2.2; ctx.stroke();
        ell(ctx, hx2 + Math.cos(fA) * 1.5, hy2 + Math.sin(fA) * 1.5, 4.4, 3.6, fA, skin);
      } else TH.circle(ctx, hx2, hy2, 3.3, skin);

      ctx.restore();
      ctx.restore();
    },

    // Speech bubble whose tail points at (x, y); clamped inside the world width.
    drawBubble(ctx, x, y, str, border = '#333') {
      ctx.save();
      ctx.font = `bold 15px ${TH.FONT}`;
      const w = Math.max(46, ctx.measureText(str).width + 22), h = 27, r = 11;
      const bx = Math.max(4, Math.min(W - w - 4, x - w / 2)), by = y - h;
      const tx = Math.max(r + 7, Math.min(w - r - 7, x - bx));   // tail base, bubble-local
      const tip = Math.max(tx - 7, Math.min(tx + 7, x - bx));
      const shape = () => {
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(w, 0, w, h, r);
        ctx.arcTo(w, h, 0, h, r);
        ctx.lineTo(tx + 6.5, h); ctx.lineTo(tip, h + 8.5); ctx.lineTo(tx - 6.5, h);
        ctx.arcTo(0, h, 0, 0, r);
        ctx.arcTo(0, 0, w, 0, r);
        ctx.closePath();
      };
      ctx.translate(bx, by); // drawn in bubble space so the fill gradient is shared
      ctx.lineJoin = 'round';
      ctx.translate(-2, 3); shape(); ctx.fillStyle = 'rgba(20,12,8,0.22)'; ctx.fill(); ctx.translate(2, -3); // drop shadow, lower left
      shape(); ctx.fillStyle = grad(ctx, 'bubble', 0, 0, 0, h, () => [0, '#ffffff', 1, '#eef0f4']); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = 2.5; ctx.stroke();
      TH.line(ctx, [r, 4, w - r, 4], 'rgba(255,255,255,0.9)', 2);
      ctx.fillStyle = '#1f1f1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(str, w / 2, h / 2 + 1, w - 12);
      ctx.restore();
    },
  };
})();
