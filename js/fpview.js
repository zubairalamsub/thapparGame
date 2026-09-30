// First-person renderer ("facing traffic"): camera, world layers, depth-sorted billboards, lighting,
// world-anchored bubbles, first-person hands and slap effects, and first-person picking.
// Game logic stays in game.js world coordinates; this file only looks at it through the camera.
// See js/FP_CONTRACT.md.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = TH.fp;
  const { CX, HY, F, NEAR, DZ } = fp;
  const cam = fp.cam;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Gameplay geometry in game-logic units (x along the road, y lane).
  const C = {
    CAM_BACK: 30,      // camera sits this far behind the sergeant's feet (+x)
    PX_MIN: 620,       // how far forward (-x) the sergeant may walk
    PX_MAX: 990,
    SPAWN_AHEAD: 1000, // oncoming rickshaws appear this far ahead of the camera
    BEHIND: 260,       // wrong-way riders appear this far behind it
    ESCAPE_AHEAD: 1250, // a wrong-way rider this far ahead has got away
    BLOCK_MIN: 30,     // an oncoming rickshaw stops when its centre is BLOCK_STOP in front of you
    BLOCK_STOP: 55,
    REACH_MIN: -15,    // slap reach, measured from the rickshaw end nearest you
    REACH_MAX: 45,
    // third-person chase camera: behind the sergeant (game-logic x), over his right shoulder (FP units)
    TP_BACK: 125, TP_SIDE: 100, TP_H: 138,
  };
  const FRONT = 50, REAR = 35; // FP units from the rickshaw centre to its front wheel / rear axle planes

  let api = null;      // { G, groundY } from game.js
  const errs = new Set();
  function safe(key, fn) {
    if (errs.has(key)) return undefined;
    try { return fn(); } catch (e) { errs.add(key); console.error(`[fp ${key}] failed:`, e); return undefined; }
  }

  // ---------- per-road first-person scene ----------
  let cur = { id: null, fr: null, fs: null, ts: null };
  function seedFor(id) { let h = 2166136261; for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
  function sync(road) {
    const id = (road && road.id) || 'none';
    if (cur.id === id) return;
    if (cur.fr && cur.fr.dispose) safe(cur.id + '.dispose', () => cur.fr.dispose(cur.fs));
    if (cur.ts && TH.fpTraffic && TH.fpTraffic.dispose) safe('traffic.dispose', () => TH.fpTraffic.dispose(cur.ts));
    const fr = TH.fpRoads.find((r) => r.id === id) || null;
    const fs = (fr && fr.init && safe(id + '.init', () => fr.init(TH.mulberry32(seedFor(id) ^ 0x2545f491)))) || {};
    const ts = TH.fpTraffic && TH.fpTraffic.create
      ? safe('traffic.create', () => TH.fpTraffic.create(fr || {}, TH.mulberry32(seedFor(id) ^ 0x9e3779b9))) || null : null;
    cur = { id, fr, fs, ts };
  }
  const LIGHT_DEF = { tint: null, tintA: 1, glow: 0, fog: '#cfd8e0', fogNear: 1600, fogFar: 6500, fogMax: 0.85, lamps: false, headlights: false };
  const lightOf = (fr) => Object.assign({}, LIGHT_DEF, (fr && fr.light) || {});

  // ---------- camera ----------
  const view = { roll: 0, zoom: 1, walk: 0, phase: 0, strafe: 0, lastU: null, bob: 0, fall: 0 };
  const kick = { t: 9, side: 1 };
  const hands = { t: 0, slap: null };
  const dust = [];

  // 'fp' = through the sergeant's eyes, 'tp' = chase camera behind him. The rules use the same
  // "sergeant's eyes" position either way (camX); only the rendering camera moves back in 'tp'.
  let mode = 'fp';
  function camX() { return api.G.player.x + C.CAM_BACK; }
  const onWalkAt = (u) => (u > fp.U.curbR + 4 ? fp.CURB_H : 0);
  function placeCamera(dt) {
    const G = api.G, p = G.player;
    const snap = view.lastU === null || dt <= 0;
    const pu = fp.laneU(p.y);
    let du;
    if (mode === 'tp') {
      const tz = (p.x + C.TP_BACK) * DZ, tu = Math.min(fp.U.wallR - 70, pu + C.TP_SIDE);
      cam.z = snap ? tz : cam.z + (tz - cam.z) * Math.min(1, dt * 7);
      const lu = view.lastPU === undefined || snap ? pu : view.lastPU;
      du = snap ? 0 : (pu - lu) / dt;
      view.lastPU = pu;
      cam.u = snap ? tu : cam.u + (tu - cam.u) * Math.min(1, dt * 6);
    } else {
      cam.z = camX() * DZ;
      cam.u = snap ? pu : cam.u + (pu - cam.u) * Math.min(1, dt * 16);
      du = snap ? 0 : (cam.u - view.lastU) / dt;
    }
    view.lastU = cam.u;
    view.strafe += (clamp(du / 420, -1, 1) - view.strafe) * Math.min(1, Math.max(0, dt) * 10);
    const moving = p.moving && (G.state === 'play');
    view.walk += ((moving ? 1 : 0) - view.walk) * Math.min(1, Math.max(0, dt) * 8);
    if (moving) view.phase += dt * 10.5;
    view.bob = Math.sin(view.phase * 2) * 2.4 * view.walk;
    view.fall = G.state === 'dying' ? clamp(1 - G.dyingT / 1.1, 0, 1) : G.state === 'over' ? 1 : 0;
    if (mode === 'tp') cam.h = C.TP_H + onWalkAt(cam.u) + view.bob * 0.3;
    else cam.h = fp.EYE + onWalkAt(cam.u) + view.bob - view.fall * view.fall * 58;
  }

  function reset() {
    view.lastU = null; view.lastPU = undefined; view.fall = 0; view.walk = 0; view.strafe = 0;
    hands.slap = null; kick.t = 9; dust.length = 0;
    if (api) placeCamera(0);
  }

  // Screen transform applied to the world layer (roll + zoom punch around the centre).
  function rollXY(x, y) {
    const c = Math.cos(view.roll), s = Math.sin(view.roll), dx = x - CX, dy = y - 300;
    return { x: CX + view.zoom * (dx * c - dy * s), y: 300 + view.zoom * (dx * s + dy * c) };
  }
  function unrollXY(x, y) {
    const c = Math.cos(-view.roll), s = Math.sin(-view.roll), dx = (x - CX) / view.zoom, dy = (y - 300) / view.zoom;
    return { x: CX + dx * c - dy * s, y: 300 + dx * s + dy * c };
  }

  // ---------- rickshaw geometry through the camera ----------
  const laneOf = (k) => fp.laneU(api.groundY(k));
  const baseOf = (k) => (k.lane < 0 ? fp.CURB_H : 0);
  function planes(k) {
    const zc = k.x * DZ, zF = zc + FRONT * k.dir, zR = zc - REAR * k.dir;
    return { zc, zF, zR, zNear: Math.max(zF, zR), zFar: Math.min(zF, zR) };
  }
  // Slap target: the driver's head. Oncoming: on the front plane. Riding away: peeking out to the
  // right of the hood, on the far (front) plane.
  function headWorld(k) {
    const { zF } = planes(k), u = laneOf(k), h = baseOf(k);
    return k.dir === 1 ? [zF, u, h + 91] : [zF, u + 24, h + 96];
  }
  function headRaw(k) {
    const w = headWorld(k);
    const pr = fp.project(w[0], w[1], w[2]);
    if (pr) return pr;
    const du = w[1] - cam.u;
    return { x: clamp(CX + du * 3, 40, 960), y: 300, s: 3, d: NEAR };
  }
  function headScreen(k) { const p = headRaw(k); return rollXY(p.x, p.y); }

  // ---------- walls (strip-textured facades) ----------
  const STRIP = 6;
  function wallRange(w) {
    const du = w.u - cam.u;
    if (Math.abs(du) < 2) return null;
    const dMin = Math.max(NEAR, (Math.abs(du) * F) / 530); // nearer than this it is off the screen edge
    const zA = Math.max(w.z0, cam.z - fp.FAR), zB = Math.min(w.z1, cam.z - dMin);
    return zB > zA ? { du, zA, zB } : null;
  }
  function eachStrip(w, r, cb) {
    const { du, zA, zB } = r;
    const xA = CX + (du * F) / (cam.z - zA), xB = CX + (du * F) / (cam.z - zB);
    const dFar = cam.z - zA, strip = dFar > 2500 && cam.z - zB > 1200 ? STRIP * 2 : STRIP;
    const n = Math.min(160, Math.max(1, Math.ceil(Math.abs(xB - xA) / strip)));
    const base = w.base === undefined ? fp.CURB_H : w.base;
    let px = xA, pz = zA;
    for (let i = 1; i <= n; i++) {
      const x = i === n ? xB : xA + ((xB - xA) * i) / n;
      const z = i === n ? zB : cam.z - (du * F) / (x - CX);
      const dm = cam.z - (pz + z) / 2, s = F / dm;
      const yT = HY + (cam.h - base - w.h) * s, yB = HY + (cam.h - base) * s;
      cb(pz, z, Math.min(px, x), Math.max(px, x), yT, yB, dm);
      px = x; pz = z;
    }
  }
  function texX(w, img, z) {
    const sx0 = w.sx0 || 0, sx1 = w.sx1 === undefined ? img.width : w.sx1;
    let t = (z - w.z0) / (w.z1 - w.z0);
    if (w.u < 0) t = 1 - t; // left facades read near -> far, left to right
    return sx0 + (sx1 - sx0) * t;
  }
  function drawWallSeg(ctx, w, img, emis, glowK) {
    const r = wallRange(w);
    if (!r || !img || !img.width) return;
    const a0 = ctx.globalAlpha;
    eachStrip(w, r, (za, zb, xl, xr, yT, yB, dm) => {
      let sa = texX(w, img, za), sb = texX(w, img, zb);
      if (sa > sb) { const q = sa; sa = sb; sb = q; }
      sa = clamp(sa, 0, img.width - 0.05); sb = clamp(sb, sa + 0.05, img.width);
      if (!emis) {
        ctx.globalAlpha = a0 * (1 - fp.fogAt(dm) * 0.95);
        ctx.drawImage(img, sa, 0, sb - sa, img.height, xl, yT, xr - xl + 0.7, yB - yT);
        return;
      }
      // lit windows: skip whatever a nearer solid (rickshaw, bus) covers from the ground up
      let cut = yB;
      for (const s of fp._solids) if (s.d < dm && s.x1 > xl && s.x0 < xr && s.y1 > yT) cut = Math.min(cut, s.y0);
      if (cut <= yT + 1) return;
      const frac = (cut - yT) / (yB - yT);
      ctx.globalAlpha = a0 * glowK * (1 - fp.fogAt(dm) * 0.8);
      ctx.drawImage(img, sa, 0, sb - sa, img.height * frac, xl, yT, xr - xl, cut - yT); // no overlap: additive seams would glow
    });
    ctx.globalAlpha = a0;
  }
  function drawWalls(ctx, walls, emisK) {
    if (!walls || !walls.length) return;
    for (const side of [1, -1]) {
      const segs = walls.filter((w) => (w.u > 0 ? 1 : -1) === side && w.h > 0 && w.z1 > w.z0).sort((a, b) => a.z0 - b.z0);
      for (let i = 0; i < segs.length; i++) {
        const w = segs[i];
        if (emisK === undefined) {
          const prev = segs[i - 1];
          // return face where the nearer building is set back from the one before it
          if (prev && Math.abs(w.u) > Math.abs(prev.u) + 1 && Math.abs(prev.z1 - w.z0) < 2 && cam.z - w.z0 > NEAR) {
            const base = w.base === undefined ? fp.CURB_H : w.base;
            if (fp.crossQuad(ctx, w.z0, prev.u, w.u, base, base + Math.min(w.h, prev.h))) {
              ctx.fillStyle = w.ret || prev.ret || '#6b6258'; ctx.fill();
            }
          }
          drawWallSeg(ctx, w, w.tex, false);
        } else if (w.emis) drawWallSeg(ctx, w, w.emis, true, emisK);
      }
    }
  }

  // ---------- draw list ----------
  const list = [];
  function add(z, fn, u, r, key, noFade) {
    const d = cam.z - z;
    if (!(d > NEAR * 0.5) || d > fp.FAR || typeof fn !== 'function') return;
    if (u !== undefined && r !== undefined) {
      const s = F / d, x = CX + (u - cam.u) * s, rr = r * s;
      if (x + rr < -60 || x - rr > 1060) return;
    }
    list.push({ d, fn, i: list.length, key, noFade: !!noFade });
  }
  // Each source gets its own add(), so a drawing error only switches off that source.
  const adders = new Map();
  function addFrom(key) {
    let f = adders.get(key);
    if (!f) { f = (z, fn, u, r, opts) => { if (!errs.has(key)) add(z, fn, u, r, key, opts && opts.noFade); }; adders.set(key, f); }
    return f;
  }

  // ---------- placeholder art (used only when an art module is missing) ----------
  function phRickshaw(ctx, k, near, far) {
    ctx.save();
    ctx.translate(far.x, far.y); ctx.scale(far.s, far.s);
    ctx.fillStyle = k.hood; ctx.beginPath(); ctx.ellipse(0, -118, 44, 32, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(-40, -34, 8, 34); ctx.fillRect(32, -34, 8, 34);
    ctx.fillStyle = k.body; ctx.fillRect(-40, -62, 80, 28);
    ctx.restore();
    ctx.save();
    ctx.translate(near.x, near.y); ctx.scale(near.s, near.s);
    ctx.fillStyle = '#1c1c20'; ctx.fillRect(-4, -32, 8, 32);
    ctx.fillStyle = k.vest; ctx.fillRect(-13, -84, 26, 30);
    ctx.fillStyle = k.lungi; ctx.fillRect(-12, -56, 24, 22);
    TH.circle(ctx, 0, -91, 9, k.skin);
    if (k.dir !== 1) { ctx.fillStyle = k.body; ctx.fillRect(-42, -70, 84, 40); }
    ctx.restore();
  }
  function phHands(ctx, H) {
    const bob = H.bob || 0;
    const sl = H.slap;
    TH.circle(ctx, 190, 600 + bob, 58, '#a36a45');
    let x = 800, y = 590 + bob;
    if (sl) {
      const q = clamp(sl.t / 0.06, 0, 1), back = clamp((sl.t - 0.14) / 0.2, 0, 1);
      x = 800 + (sl.x - 800) * q * (1 - back); y = 590 + (sl.y - 590) * q * (1 - back);
    }
    TH.circle(ctx, x, y, 55, '#b77a52');
  }
  function phSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, HY + 20);
    g.addColorStop(0, '#79b4e6'); g.addColorStop(1, '#e3ebef');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1000, HY + 20);
  }
  function phGround(ctx) {
    const U = fp.U, z0 = cam.z - fp.FAR, z1 = cam.z;
    ctx.fillStyle = '#4a4a50'; if (fp.quad(ctx, z0, z1, U.oppL, U.curbR)) ctx.fill();
    ctx.fillStyle = '#c2b59b'; if (fp.quad(ctx, z0, z1, U.curbR, U.wallR, fp.CURB_H)) ctx.fill();
    ctx.fillStyle = '#b8ab92'; if (fp.quad(ctx, z0, z1, U.wallL, U.oppL, fp.CURB_H)) ctx.fill();
    ctx.fillStyle = '#6b7b55'; if (fp.quad(ctx, z0, z1, U.medianL, U.curbL, 12)) ctx.fill();
    ctx.beginPath();
    for (let z = Math.floor(z1 / 160) * 160; z > z0; z -= 160) for (const u of [70, -70]) fp.subQuad(ctx, z - 70, z, u - 3, u + 3);
    ctx.fillStyle = '#e5e5e5'; ctx.fill();
    ctx.fillStyle = '#f2f2ee'; if (fp.quad(ctx, TH.STOP_X * DZ - 8, TH.STOP_X * DZ + 8, -210, 210)) ctx.fill();
  }

  // ---------- speech bubbles in the world ----------
  function bubble(ctx, x, y, str, border, sc, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold 15px ${TH.FONT}`;
    const w = Math.max(46, ctx.measureText(str).width + 22), h = 27;
    const half = (w / 2) * sc;
    let off = 0;
    if (x - half < 6) off = (6 - (x - half)) / sc; else if (x + half > 994) off = (994 - (x + half)) / sc;
    ctx.translate(x, y); ctx.scale(sc, sc);
    const bx = -w / 2 + off, by = -h - 9, tip = clamp(-off, -w / 2 + 14, w / 2 - 14);
    ctx.beginPath();
    ctx.moveTo(bx + 11, by); ctx.arcTo(bx + w, by, bx + w, by + h, 11); ctx.arcTo(bx + w, by + h, bx, by + h, 11);
    ctx.lineTo(off + tip + 7, by + h); ctx.lineTo(0, 0); ctx.lineTo(off + tip - 7, by + h);
    ctx.arcTo(bx, by + h, bx, by, 11); ctx.arcTo(bx, by, bx + w, by, 11); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = '#1f1f1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, bx + w / 2, by + h / 2 + 1, w - 12);
    ctx.restore();
  }

  function drawOverlays(ctx, fe) {
    const G = api.G;
    for (const k of G.rickshaws) {
      const b = k._fp;
      if (!b) continue;
      const w = headWorld(k);
      const top = fp.project(w[0], w[1], w[2] + 62);
      if (!top) continue;
      const sc = clamp(0.42 + top.s * 0.42, 0.55, 1.15), a = clamp((k.age === undefined ? 9 : k.age) / 0.7, 0, 1) * fp.fade(top.d);
      const by = Math.max(top.y, 52 + 40 * sc); // keep clear of the HUD when the rickshaw is right in front of us
      if (k.bubble && !k.slapped && top.d < 2300) {
        bubble(ctx, top.x, by + Math.sin(k.t * 4) * 2 * sc, `${k.bubble.icon} ${k.bubble.text}`, '#333', sc, a);
      }
      if (k.say && k.slapT < 1.6) bubble(ctx, top.x, by - 4 * sc, k.say, '#ff4d6d', sc, a);
      if (k.slapped && k.slapT < 1.5) {
        const hp = headRaw(k), r = 18 * clamp(hp.s, 0.3, 3);
        ctx.font = `${Math.round(clamp(14 * hp.s, 9, 40))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
          const sa = k.slapT * 6 + (i * TAU) / 3;
          ctx.fillText('⭐', hp.x + Math.cos(sa) * r, hp.y - r * 0.8 + Math.sin(sa) * r * 0.3);
        }
      }
    }
    const tg = G.player.target;
    if (tg && tg.k && tg.k._fp && G.state === 'play') {
      const hp = headRaw(tg.k), r = clamp(20 * hp.s, 8, 70) + Math.sin(G.time * 10) * 2;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, r, 0, TAU);
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    } else if (tg && !tg.k && G.state === 'play') {
      const pr = fp.project(fp.zOf(tg.x), fp.laneU(tg.y), 0);
      if (pr) {
        ctx.beginPath(); ctx.ellipse(pr.x, pr.y, 16 * clamp(pr.s, 0.3, 3), 6 * clamp(pr.s, 0.3, 3), 0, 0, TAU);
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
  }

  // ---------- slap effects, hands, warnings (screen space) ----------
  function drawFx(ctx) {
    const G = api.G;
    for (const f of G.fx) {
      if (f.t < 0.3) {
        ctx.globalAlpha = 1 - f.t / 0.3;
        ctx.beginPath(); ctx.arc(f.x, f.y, 14 + f.t * 320, 0, TAU);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 7 * (1 - f.t / 0.3) + 1; ctx.stroke();
      }
      if (f.t < 0.26) { // comic "POW" burst behind the hit
        const s = (0.6 + Math.min(1, f.t / 0.05) * 0.6) * (f.big ? 1.3 : 1), a = f.t < 0.18 ? 1 : 1 - (f.t - 0.18) / 0.08;
        ctx.globalAlpha = Math.max(0, a);
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * TAU + f.t * 2, r = (i % 2 ? 34 : 70 + ((i * 37) % 17)) * s;
          const x = f.x + Math.cos(ang) * r, y = f.y + Math.sin(ang) * r * 0.8;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = f.good === false ? '#ff6b6b' : '#ffd23f'; ctx.fill();
        ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.font = `${Math.round(46 * s)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('💥', f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }
    const fl = G.fx.reduce((m, f) => Math.max(m, f.t < 0.08 ? 1 - f.t / 0.08 : 0), 0);
    if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${(0.32 * fl).toFixed(3)})`; ctx.fillRect(0, 0, 1000, 600); }
  }

  function handsState(L) {
    let slap = null;
    if (hands.slap) {
      const k = hands.slap.k;
      let x = 600, y = 330;
      if (k && api.G.rickshaws.includes(k)) { const p = headScreen(k); x = p.x; y = p.y; } else if (hands.slap.x !== undefined) { x = hands.slap.x; y = hands.slap.y; }
      if (!hands.slap.k) { x = 470; y = 360; }
      hands.slap.x = x; hands.slap.y = y;
      slap = { t: hands.slap.t, x, y, hit: !!hands.slap.k };
    }
    return { t: hands.t, walk: view.walk, phase: view.phase, strafe: view.strafe, bob: view.bob, slap, light: L };
  }

  function drawWarnings(ctx) {
    const G = api.G, cx = camX();
    for (const k of G.rickshaws) {
      if (k.dir !== -1 || k.slapped || !k.guilty) continue;
      if (k.x - 25 < cx - 20) continue; // already in front of us
      const du = laneOf(k) - cam.u, x = clamp(CX + du * 1.9, 90, 910);
      const pulse = 0.65 + 0.35 * Math.sin(G.time * 12);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(200,20,40,0.88)';
      TH.rr(ctx, x - 78, 520, 156, 34, 17); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold 17px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${k.bubble ? k.bubble.icon : '⚠️'} পেছনে!`, x, 538);
      ctx.beginPath(); ctx.moveTo(x - 14, 562); ctx.lineTo(x, 576); ctx.lineTo(x + 14, 562);
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- glows ----------
  const rgbCache = new Map();
  function rgbOf(c) {
    let v = rgbCache.get(c);
    if (v) return v;
    const m = /^#([0-9a-f]{6})$/i.exec(c);
    const n = m ? parseInt(m[1], 16) : 0xfff2c0;
    v = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    rgbCache.set(c, v);
    return v;
  }
  // One pre-rendered soft disc per colour; each glow is then a single drawImage.
  const glowSprites = new Map();
  function glowSprite(color) {
    let c = glowSprites.get(color);
    if (c !== undefined) return c;
    const S = 64, cv = fp.canvas(S, S);
    c = null;
    if (cv) {
      const rgb = rgbOf(color), g = cv.ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, `rgba(${rgb},1)`);
      g.addColorStop(0.35, `rgba(${rgb},0.45)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      cv.ctx.fillStyle = g; cv.ctx.fillRect(0, 0, S, S);
      c = cv.canvas;
    }
    if (glowSprites.size > 64) glowSprites.clear();
    glowSprites.set(color, c);
    return c;
  }
  function drawGlows(ctx, L) {
    const gk = L.glow || 0;
    const a0 = ctx.globalAlpha;
    for (const g of fp._glows) {
      if (!g.always && gk <= 0) continue;
      if (fp.occluded(g.x, g.y, g.d)) continue;
      const a = clamp(g.a * (g.always ? Math.max(0.55, gk) : gk) * (1 - fp.fogAt(g.d) * 0.7), 0, 1);
      if (a < 0.01) continue;
      const img = glowSprite(g.color);
      if (!img) continue;
      ctx.globalAlpha = a0 * a;
      ctx.drawImage(img, g.x - g.r, g.y - g.r * g.sy, g.r * 2, g.r * 2 * g.sy);
    }
    ctx.globalAlpha = a0;
  }

  function groundFog(ctx) {
    const f = fp.fog;
    if (!(f.max > 0) || cam.h <= 1) return;
    const off = (d) => clamp((cam.h * F) / d / (600 - HY), 0, 1);
    const g = ctx.createLinearGradient(0, HY, 0, 600);
    const ds = [fp.FAR, f.far, (f.far + f.near) / 2, f.near * 1.2, f.near];
    let last = -1;
    g.addColorStop(0, fp.shade(f.color, 0, f.max.toFixed(3)));
    for (const d of ds) {
      const o = off(d);
      if (o <= last || o <= 0 || o >= 1) continue;
      g.addColorStop(o, fp.shade(f.color, 0, fp.fogAt(d).toFixed(3)));
      last = o;
    }
    g.addColorStop(1, fp.shade(f.color, 0, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-40, HY, 1080, 640 - HY);
  }

  let vignette = null;
  // Optional stage timings for profiling: TH.fpView.prof = {} to turn on (ms accumulate per stage).
  let profT = 0;
  function prof(stage) {
    const P = TH.fpView.prof;
    if (!P) return;
    const now = performance.now();
    if (stage) P[stage] = (P[stage] || 0) + now - profT;
    profT = now;
  }

  // ---------- third person: the sergeant himself, seen from behind ----------
  function sergeantPose(L) {
    const G = api.G, p = G.player, H = handsState(L);
    // arms up to stop an oncoming rickshaw standing right in front of him
    const block = G.rickshaws.some((k) => k.dir === 1 && !k.slapped && Math.abs(p.y - api.groundY(k)) < 26
      && p.x - k.x > C.BLOCK_MIN - 2 && p.x - k.x < C.BLOCK_STOP + 20);
    // he is drawn inside the rolled world layer, so aim at the un-rolled head position
    let slap = H.slap;
    if (slap && hands.slap && hands.slap.k && G.rickshaws.includes(hands.slap.k)) {
      const hp = headRaw(hands.slap.k);
      slap = Object.assign({}, slap, { x: hp.x, y: hp.y });
    }
    return { t: H.t, walk: H.walk, phase: H.phase, strafe: H.strafe, slap, block, fall: view.fall, light: L };
  }
  function phSergeant(ctx, pr, pose) {
    ctx.save();
    ctx.translate(pr.x, pr.y); ctx.scale(pr.s, pr.s);
    ctx.rotate(-pose.fall * 1.2);
    const sw = Math.sin(pose.phase) * 6 * pose.walk;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#243157'; ctx.fillRect(-13 + sw * 0.3, -52, 11, 52); ctx.fillRect(2 - sw * 0.3, -52, 11, 52);
    ctx.fillStyle = '#c6f135'; ctx.fillRect(-17, -94, 34, 44);
    ctx.fillStyle = '#e9edf2'; ctx.fillRect(-17, -76, 34, 5);
    ctx.fillStyle = '#f4f6f8'; ctx.fillRect(-24, -92, 8, 30); ctx.fillRect(16, pose.slap ? -120 : -92, 8, 30);
    TH.circle(ctx, 0, -104, 11, '#a36a45');
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(-12, -120, 24, 9);
    ctx.restore();
  }
  function addSergeant(fe) {
    const G = api.G, p = G.player;
    const pz = p.x * DZ, pu = fp.laneU(p.y), ph = onWalkAt(pu);
    if (cam.z - pz < NEAR + 4) return;
    add(pz, (c) => {
      const pr = fp.project(pz, pu, ph);
      if (!pr) return;
      // fade him out where he would hide the face of the driver he is dealing with
      const x0 = pr.x - 20 * pr.s, x1 = pr.x + 20 * pr.s, y0 = pr.y - 122 * pr.s;
      for (const k of G.rickshaws) {
        if (k.slapped || !k._fp || k._fp.d <= pr.d) continue;
        const hp = headRaw(k);
        if (hp.x > x0 && hp.x < x1 && hp.y > y0 && hp.y < pr.y) { c.globalAlpha *= 0.6; break; }
      }
      const pose = sergeantPose(fe.lit);
      const P = TH.fpPlayer;
      if (P && P.drawSergeant && !errs.has('player.sergeant')) safe('player.sergeant', () => P.drawSergeant(c, pr, pose, fe)); else phSergeant(c, pr, pose);
    }, pu, 60);
  }

  // ---------- public ----------
  TH.fpView = {
    C,
    bind(a) { api = a; reset(); },
    reset,
    camX,
    // 'fp' first-person or 'tp' third-person (chase camera). Same rules, different camera.
    setMode(m) { mode = m === 'tp' ? 'tp' : 'fp'; view.lastU = null; },
    get mode() { return mode; },
    // x of the rendering camera: things are only gone once they pass it
    renderCamX: () => cam.z / DZ,
    // Game-logic x of the rickshaw end nearest the sergeant: the front (driver) for oncoming ones,
    // the rear panel for wrong-way riders heading away.
    nearEnd: (k) => k.x + (k.dir === 1 ? FRONT : REAR) / DZ,

    update(dt, e) {
      if (!api) return;
      sync(e.road);
      placeCamera(dt);
      const fe = Object.assign({}, e, { cam, fr: cur.fr, lit: lightOf(cur.fr), view: 'fp' });
      if (cur.fr && cur.fr.update) safe(cur.id + '.update', () => cur.fr.update(cur.fs, dt, fe));
      if (cur.ts && TH.fpTraffic.update) safe('traffic.update', () => TH.fpTraffic.update(cur.ts, dt, fe));
      for (const p of dust) { p.t += dt; p.z += p.vz * dt; p.u += p.vu * dt; p.h += p.vh * dt; p.vh *= 0.97; }
      for (let i = dust.length - 1; i >= 0; i--) if (dust[i].t > dust[i].life) dust.splice(i, 1);
    },

    // Real-time animation (runs through hit-stop): hands, camera kick.
    tick(rdt) {
      hands.t += rdt;
      if (hands.slap) { hands.slap.t += rdt; if (hands.slap.t > 0.42) hands.slap = null; }
      kick.t += rdt;
      const kk = Math.exp(-kick.t * 9);
      view.zoom = 1 + 0.075 * kk * Math.min(1, kick.t / 0.04);
      view.roll = view.strafe * (mode === 'tp' ? -0.012 : -0.028) + kick.side * 0.045 * kk * Math.sin(Math.min(kick.t, 0.5) * 30)
        + (mode === 'fp' ? view.fall * view.fall * 0.5 : 0);
    },

    render(ctx, e) {
      if (!api) return;
      const G = api.G;
      sync(e.road);
      const tz = (G.player.x + (mode === 'tp' ? C.TP_BACK : C.CAM_BACK)) * DZ;
      if (view.lastU === null || (mode === 'fp' ? cam.z !== tz : Math.abs(cam.z - tz) > 600)) placeCamera(0);
      const L = lightOf(cur.fr);
      Object.assign(fp.fog, { color: L.fog, near: L.fogNear, far: L.fogFar, max: L.fogMax });
      const fe = Object.assign({}, e, { cam, fr: cur.fr, lit: L, view: 'fp' });
      prof();
      fp._begin();
      list.length = 0;
      for (const k of G.rickshaws) k._fp = null;

      ctx.save();
      if (view.roll || view.zoom !== 1) {
        ctx.translate(CX, 300); ctx.rotate(view.roll); ctx.scale(view.zoom, view.zoom); ctx.translate(-CX, -300);
      }
      // 1. sky + horizon landmark
      ctx.save();
      if (cur.fr && cur.fr.drawSky && !errs.has(cur.id + '.drawSky')) safe(cur.id + '.drawSky', () => cur.fr.drawSky(ctx, cur.fs, fe)); else phSky(ctx);
      ctx.restore();
      prof('sky');
      // 2. ground
      ctx.save();
      if (TH.fpStreet && TH.fpStreet.drawGround && !errs.has('street.drawGround')) safe('street.drawGround', () => TH.fpStreet.drawGround(ctx, fe)); else phGround(ctx);
      ctx.restore();
      prof('ground');
      ctx.save(); groundFog(ctx); ctx.restore();
      prof('groundFog');
      // 3. facades
      const walls = cur.fr && cur.fr.walls ? safe(cur.id + '.walls', () => cur.fr.walls(cur.fs, fe)) : null;
      ctx.save(); safe('walls', () => drawWalls(ctx, walls)); ctx.restore();
      prof('walls');
      // 4. everything standing in the street, far to near
      if (TH.fpStreet && TH.fpStreet.add) safe('street.add', () => TH.fpStreet.add(fe, addFrom('street.item')));
      if (cur.fr && cur.fr.add) safe(cur.id + '.add', () => cur.fr.add(cur.fs, fe, addFrom(cur.id + '.item')));
      if (cur.ts && TH.fpTraffic.add) safe('traffic.add', () => TH.fpTraffic.add(cur.ts, fe, addFrom('traffic.item')));
      const S = TH.fpSprites;
      for (const k of G.rickshaws) {
        const pl = planes(k), u = laneOf(k), hb = baseOf(k);
        if (cam.z - pl.zNear < NEAR + 2 || cam.z - pl.zc > fp.FAR) continue;
        add(pl.zc, (c) => {
          const near = fp.project(pl.zNear, u, hb), far = fp.project(pl.zFar, u, hb);
          if (!near || !far) return;
          c.globalAlpha *= clamp((k.age === undefined ? 9 : k.age) / 0.7, 0, 1);
          const front = k.dir === 1;
          const fn = S && (front ? S.drawRickshawFront : S.drawRickshawBack);
          if (fn && !errs.has('sprites.rickshaw')) safe('sprites.rickshaw', () => fn(c, k, near, far, fe)); else phRickshaw(c, k, near, far);
          const x0 = Math.min(near.x - 48 * near.s, far.x - 46 * far.s), x1 = Math.max(near.x + 48 * near.s, far.x + 46 * far.s);
          const y0 = Math.min(near.y - (front ? 128 : 152) * near.s, far.y - 152 * far.s), y1 = Math.max(near.y, far.y) + 4 * near.s;
          k._fp = { x0, y0, x1, y1, d: near.d };
          fp.solid(x0, y0 + (y1 - y0) * 0.1, x1, y1, near.d);
        }, u, 60);
      }
      if (mode === 'tp' && G.state !== 'menu') addSergeant(fe);
      for (const p of dust) {
        add(p.z, (c) => {
          const pr = fp.project(p.z, p.u, p.h);
          if (!pr) return;
          c.globalAlpha *= Math.max(0, 1 - p.t / p.life) * 0.5;
          TH.circle(c, pr.x, pr.y, p.r * (1 + p.t * 1.6) * pr.s, '#c8b89a');
        });
      }
      prof('queue');
      list.sort((a, b) => b.d - a.d || a.i - b.i);
      const P = TH.fpView.prof;
      for (const it of list) {
        const t0 = P ? performance.now() : 0;
        ctx.save();
        ctx.globalAlpha = it.noFade ? 1 : fp.fade(it.d);
        if (it.key) safe(it.key, () => it.fn(ctx, it.d, fe)); else it.fn(ctx, it.d, fe);
        ctx.restore();
        if (P) { const k = 'item:' + (it.key || 'engine'); P[k] = (P[k] || 0) + performance.now() - t0; }
      }
      prof('items');
      // 5. lighting: tint the whole world, then add lights that shine through it
      if (L.tint) {
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = L.tintA;
        ctx.fillStyle = L.tint; ctx.fillRect(-80, -80, 1160, 760); ctx.restore();
      }
      prof('tint');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (L.glow > 0) safe('walls.emis', () => drawWalls(ctx, walls, L.glow));
      drawGlows(ctx, L);
      ctx.restore();
      prof('glow');
      // 6. bubbles, stars, target marker
      ctx.save(); drawOverlays(ctx, fe); ctx.restore();
      ctx.restore(); // roll

      // 7. screen space: vignette, slap effects, hands, warnings
      if (!vignette) {
        vignette = ctx.createRadialGradient(CX, 290, 300, CX, 290, 700);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
      }
      prof('overlays');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, 1000, 600);
      prof('vignette');
      ctx.save(); drawFx(ctx); ctx.restore();
      if (G.state === 'play') {
        if (mode === 'fp') {
          ctx.save();
          const H = handsState(L);
          if (S && S.drawHands && !errs.has('sprites.hands')) safe('sprites.hands', () => S.drawHands(ctx, H, fe)); else phHands(ctx, H);
          ctx.restore();
        }
        ctx.save(); drawWarnings(ctx); ctx.restore();
      }
    },

    // Screen point (logical px) -> { k } for a rickshaw, { x, y } for a spot on the road, or null.
    pick(px, py) {
      if (!api) return null;
      const q = unrollXY(px, py);
      let best = null, bd = Infinity;
      for (const k of api.G.rickshaws) {
        const b = k._fp;
        if (!b || k.slapped) continue;
        if (q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1 && b.d < bd) { bd = b.d; best = k; }
      }
      if (best) return { k: best };
      const g = fp.unproject(q.x, q.y, 0);
      return g ? { x: fp.xOf(g.z), y: fp.uToY(g.u) } : null;
    },
    headScreen,
    // Where an anchored floating text should sit this frame.
    textPos(t) { const p = headScreen(t.k); return { x: p.x, y: p.y + (t.dy || 0) + (t.y - t.y0) }; },
    onSlap(k, good) {
      hands.slap = { t: 0, k };
      kick.t = 0; kick.side = headScreen(k).x < CX ? -1 : 1;
      if (good === false) kick.side *= 1.4;
    },
    onMiss() { hands.slap = { t: 0, k: null }; },
    dust(k) {
      const u = laneOf(k), zb = k.x * DZ - (REAR + 10) * k.dir;
      for (let i = 0; i < 7; i++) {
        dust.push({ z: zb + (Math.random() - 0.5) * 30, u: u + (Math.random() - 0.5) * 60, h: baseOf(k) + Math.random() * 10,
          vz: -k.dir * (40 + Math.random() * 90), vu: (Math.random() - 0.5) * 60, vh: 12 + Math.random() * 20,
          t: 0, life: 0.6 + Math.random() * 0.5, r: 8 + Math.random() * 7 });
      }
    },
  };
})();
