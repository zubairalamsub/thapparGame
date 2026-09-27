// Road: Airport Road — Hazrat Shahjalal International Airport at dusk: the arched terminal,
// control tower, the Elevated Expressway on tall piers, palms, flags and passing planes.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;
  const TAU = Math.PI * 2;
  const GY = 300;                            // backdrop ground line (footpath starts here)
  const DECK = 98;                           // top of the expressway parapet; deck traffic sits on it
  const PIERS = [110, 290, 722, 930];        // one long span keeps the terminal sign clear; no pier behind a lamp
  const TOWER = 58;
  const TERM_X = 178;                        // left end of the terminal (it runs off the right edge)
  const SIGN = { x: 336, y: 186, w: 290, h: 40 };
  const WELCOME = { x: 758, y: 101, w: 136, h: 31 };
  const FLAGS = [760, 796, 832, 868, 904];
  const LAMPS = [[90, 1], [318, 1], [742, 1], [960, -1]];    // [x, arm direction]; clear of the tower, signal and signs
  const PLANTERS = [150, 420, 540, 800, 886];
  const BAN_X = 960, BAN_Y = 234;            // "no Tesla" sign on the last lamp post
  const TAILS = ['#0f7a5a', '#c8102e', '#1e3a8a', '#e07a1f', '#7c3aed'];
  const roofTop = (x) => 150 + 22 * ((x - 610) / 430) ** 2;

  // Gradients at fixed (local) coordinates are built once per context and reused every frame.
  const GRADS = new WeakMap();
  function memo(ctx, key, make) {
    let m = GRADS.get(ctx);
    if (!m) { m = new Map(); GRADS.set(ctx, m); }
    let g = m.get(key);
    if (!g) { g = make(); m.set(key, g); }
    return g;
  }

  // Radial glow; col is an 'r,g,b' string.
  function glow(ctx, x, y, r, col, a) {
    ctx.fillStyle = memo(ctx, `${x},${y},${r},${col},${a}`, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      return g;
    });
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Horizontal shading gradient for upright forms lit from the right.
  function sideGrad(g, x0, x1, dark, mid, lit) {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, dark); gr.addColorStop(0.55, mid); gr.addColorStop(1, lit);
    return gr;
  }

  // A plane gliding down to land (slipping behind the expressway) or climbing out from behind it.
  function newPlane(r) {
    const dir = r() < 0.5 ? 1 : -1;
    const land = r() < 0.5;
    const sp = 72 + r() * 26;
    const y0 = land ? 34 + r() * 14 : 106 + r() * 6;    // the low end sits behind the deck (98-124),
    const y1 = land ? 106 + r() * 6 : 30 + r() * 14;    // so no wingtip pokes out under its soffit
    return {
      x: dir > 0 ? -140 : W + 140, y: y0, vx: sp * dir, vy: ((y1 - y0) * sp) / (W + 280),
      s: 0.52 + r() * 0.2, land, tail: TAILS[(r() * TAILS.length) | 0], t: r() * 3,
    };
  }

  // ---------- static painters (cached offscreen) ----------

  function paintFar(g, s) {
    // hazy distant skyline + tree line on the horizon
    const cg = g.createLinearGradient(0, 150, 0, GY);
    cg.addColorStop(0, 'rgba(112,84,138,0.62)');
    cg.addColorStop(1, 'rgba(70,54,104,0.9)');
    for (const b of s.city) {
      g.fillStyle = cg; g.fillRect(b.x, b.top, b.w, GY - b.top);
      g.fillStyle = 'rgba(255,170,130,0.22)'; g.fillRect(b.x + b.w - 1.5, b.top, 1.5, GY - b.top);
      if (b.ant) { g.fillStyle = 'rgba(70,54,104,0.8)'; g.fillRect(b.x + b.w * 0.5, b.top - 12, 1, 12); }
    }
    g.fillStyle = 'rgba(255,212,150,0.6)';
    for (const l of s.cityLights) g.fillRect(l.x, l.y, 1.6, 1.4);
    g.fillStyle = '#3a3257';
    g.beginPath(); g.moveTo(0, GY);
    for (const t of s.treeLine) g.quadraticCurveTo(t.x - 7, t.y - 7, t.x, t.y);
    g.lineTo(W, GY); g.closePath(); g.fill();

    // apron floodlight masts behind the terminal
    for (const mx of [250, 540]) {
      g.fillStyle = '#4a4266'; g.fillRect(mx - 1, 140, 2, 150);
      g.fillStyle = '#2d2842'; g.fillRect(mx - 7, 136, 14, 4);
      glow(g, mx, 139, 30, '255,232,190', 0.55);
      g.fillStyle = '#fff6dc'; g.fillRect(mx - 6, 139, 12, 1.5);
    }
    // parked aircraft tails peeking over the roof
    for (const [tx, col] of [[430, '#8a3040'], [505, '#2f5a7c']]) {
      const ty = roofTop(tx) + 2;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(tx - 10, ty); g.lineTo(tx + 3, ty - 22); g.lineTo(tx + 9, ty - 22); g.lineTo(tx + 8, ty); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,200,150,0.35)';
      g.beginPath(); g.moveTo(tx + 8, ty); g.lineTo(tx + 9, ty - 22); g.lineTo(tx + 7.5, ty - 22); g.lineTo(tx + 6.5, ty); g.closePath(); g.fill();
      TH.circle(g, tx + 7, ty - 21, 1.2, '#ff5a5a');
    }
  }

  function paintTower(g) {
    const x = TOWER;
    // base block
    g.fillStyle = sideGrad(g, x - 24, x + 24, '#4f4869', '#7d7394', '#caa9a0');
    g.fillRect(x - 24, 258, 48, 30);
    g.fillStyle = 'rgba(255,214,150,0.75)';
    for (let i = 0; i < 5; i++) g.fillRect(x - 20 + i * 9, 266, 5, 7);
    // tapered shaft
    g.fillStyle = sideGrad(g, x - 9, x + 9, '#554e72', '#998ca6', '#ecc9b4');
    g.beginPath(); g.moveTo(x - 9, 260); g.lineTo(x - 5.5, 82); g.lineTo(x + 5.5, 82); g.lineTo(x + 9, 260); g.closePath(); g.fill();
    g.fillStyle = 'rgba(40,32,62,0.5)';
    for (let y = 130; y < 250; y += 18) g.fillRect(x - 1, y, 2, 9);
    // flared cab support with a lit service floor
    g.fillStyle = sideGrad(g, x - 21, x + 21, '#4e4768', '#8b7f9b', '#dab8a8');
    g.beginPath(); g.moveTo(x - 6.5, 88); g.lineTo(x - 21, 76); g.lineTo(x + 21, 76); g.lineTo(x + 6.5, 88); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,214,150,0.7)'; g.fillRect(x - 15, 78.5, 30, 1.4);
    // glazed cab, wider at the top, glowing consoles inside
    const cab = g.createLinearGradient(0, 55, 0, 75);
    cab.addColorStop(0, '#26335a'); cab.addColorStop(0.5, '#3c5878'); cab.addColorStop(1, '#f2b476');
    g.fillStyle = cab;
    g.beginPath(); g.moveTo(x - 20, 75); g.lineTo(x - 27, 55); g.lineTo(x + 27, 55); g.lineTo(x + 20, 75); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,190,130,0.35)';
    g.beginPath(); g.moveTo(x + 8, 75); g.lineTo(x + 11, 55); g.lineTo(x + 27, 55); g.lineTo(x + 20, 75); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,226,170,0.8)'; g.fillRect(x - 16, 70, 32, 1.5);     // console glow
    g.strokeStyle = 'rgba(30,26,48,0.75)'; g.lineWidth = 1;
    g.beginPath();
    for (const k of [-0.6, -0.2, 0.2, 0.6]) { g.moveTo(x + k * 20, 75); g.lineTo(x + k * 27, 55); }
    g.stroke();
    // roof cap, radar and antenna mast
    g.fillStyle = '#ece0da'; g.fillRect(x - 29, 51, 58, 4.5);
    g.fillStyle = '#6f6788'; g.fillRect(x - 29, 55, 58, 1.2);
    g.fillStyle = 'rgba(255,206,160,0.9)'; g.fillRect(x - 29, 51, 58, 1);
    g.fillStyle = sideGrad(g, x - 12, x + 12, '#5b5378', '#a79aae', '#efd2c0');
    g.fillRect(x - 12, 46, 24, 5);
    TH.line(g, [x, 46, x, 27], '#b3a8bd', 1.4);
    TH.line(g, [x - 4, 36, x + 4, 36, x, 36, x, 31, x - 3, 31, x + 3, 31], '#b3a8bd', 0.9);
    g.fillStyle = '#3b3553'; g.fillRect(x + 11, 42, 8, 4);        // beacon housing
    g.fillStyle = '#d8ccd0'; g.fillRect(x - 21, 43, 10, 1.6);     // radar bar
  }

  function paintTerminal(g, s) {
    const x0 = TERM_X, x1 = W + 20, base = 284;
    // glass curtain wall: dusk sky reflected above, warm interior light below
    const gl = g.createLinearGradient(0, 150, 0, base);
    gl.addColorStop(0, '#34366a'); gl.addColorStop(0.2, '#5c5088'); gl.addColorStop(0.42, '#c4886e');
    gl.addColorStop(0.66, '#f3bb7a'); gl.addColorStop(1, '#ffdb9c');
    g.fillStyle = gl; g.fillRect(x0, 150, x1 - x0, base - 150);
    const rf = g.createLinearGradient(x0, 0, x1, 0);
    rf.addColorStop(0, 'rgba(255,170,120,0)'); rf.addColorStop(0.65, 'rgba(255,170,120,0.1)'); rf.addColorStop(1, 'rgba(255,186,128,0.32)');
    g.fillStyle = rf; g.fillRect(x0, 150, x1 - x0, 92);
    // interior: lit and dim panes, hall lights
    for (const p of s.panes) { g.fillStyle = p.c; g.fillRect(p.x, p.y, 14, p.h); }
    g.fillStyle = 'rgba(255,248,222,0.95)';
    for (let x = x0 + 14; x < x1; x += 26) { g.fillRect(x, 206, 2, 1.4); g.fillRect(x + 13, 229, 2, 1.4); }
    // mullions and transoms
    g.fillStyle = 'rgba(34,28,62,0.5)';
    for (let x = x0 + 4; x < x1; x += 15) g.fillRect(x, 150, 1.2, 90);
    g.fillRect(x0, 197, x1 - x0, 1); g.fillRect(x0, 219, x1 - x0, 1);
    // mezzanine slab with downlights
    g.fillStyle = '#2d2843'; g.fillRect(x0, 240, x1 - x0, 6);
    g.fillStyle = '#b39aa5'; g.fillRect(x0, 240, x1 - x0, 1);
    g.fillStyle = '#fff1c8';
    for (let x = x0 + 8; x < x1; x += 18) g.fillRect(x, 246, 2.4, 1.3);
    // arrivals level: brighter, doors, people with trolleys
    g.fillStyle = 'rgba(255,220,160,0.28)'; g.fillRect(x0, 247, x1 - x0, base - 247);
    g.fillStyle = 'rgba(34,28,62,0.42)';
    for (let x = x0 + 10; x < x1; x += 30) g.fillRect(x, 247, 1.2, base - 247);
    for (let x = x0 + 40; x < x1; x += 96) {
      g.fillStyle = 'rgba(70,48,70,0.4)'; g.fillRect(x, 256, 24, base - 256);
      g.fillStyle = 'rgba(255,236,196,0.55)'; g.fillRect(x + 2, 258, 9, base - 258); g.fillRect(x + 13, 258, 9, base - 258);
    }
    const ink = 'rgba(48,32,54,0.82)';
    for (const p of s.people) {
      const hy = base - p.h;
      g.fillStyle = ink;
      TH.rr(g, p.x - 2.3, hy + 4.2, 4.6, p.h * 0.5, 1.6); g.fill();              // torso, rounded shoulders
      g.fillRect(p.x - 1.7, hy + 4.2 + p.h * 0.4, 1.4, p.h * 0.6 - 4.2);        // legs
      g.fillRect(p.x + 0.3, hy + 4.2 + p.h * 0.4, 1.4, p.h * 0.6 - 4.2);
      TH.circle(g, p.x, hy + 2, 1.8, ink);
      if (p.cart) {
        g.fillStyle = 'rgba(48,32,54,0.7)'; g.fillRect(p.x + 4, base - 8, 7, 5);
        g.fillRect(p.x + 3, hy + 7, 1, base - hy - 8);
      }
    }

    // long white arched roof with scalloped vault eaves
    const V = 64, joints = [];
    for (let x = x0; x < x1 + V; x += V) joints.push(x);
    const roofPath = (dy) => {
      g.beginPath();
      g.moveTo(x0 - 20, roofTop(x0) - 4 + dy);
      for (let x = x0; x <= x1; x += 10) g.lineTo(x, roofTop(x) + dy);
      for (let i = joints.length - 1; i > 0; i--) {
        const a = joints[i], b = joints[i - 1], m = (a + b) / 2;
        if (i === joints.length - 1) g.lineTo(a, roofTop(a) + 12 + dy);
        g.quadraticCurveTo(m, roofTop(m) + 3 + dy, b, roofTop(b) + 12 + dy);
      }
      g.lineTo(x0 - 20, roofTop(x0) + 1 + dy);
      g.closePath();
    };
    roofPath(6); g.fillStyle = '#6a6288'; g.fill();                 // soffit seen from below
    roofPath(0);
    const rg = g.createLinearGradient(x0, 0, x1, 0);
    rg.addColorStop(0, '#cbc2d8'); rg.addColorStop(0.55, '#eee6ee'); rg.addColorStop(1, '#fff0e1');
    g.fillStyle = rg; g.fill();
    const rv = g.createLinearGradient(0, 148, 0, 186);
    rv.addColorStop(0, 'rgba(90,80,130,0)'); rv.addColorStop(1, 'rgba(90,80,130,0.32)');
    g.fillStyle = rv; g.fill();
    g.beginPath(); g.moveTo(x0 - 20, roofTop(x0) - 4);
    for (let x = x0; x <= x1; x += 10) g.lineTo(x, roofTop(x));
    g.strokeStyle = 'rgba(255,222,188,0.95)'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = '#ffe8b8';
    for (let i = 0; i < joints.length - 1; i++) {
      const m = (joints[i] + joints[i + 1]) / 2;
      g.fillRect(m - 12, roofTop(m) + 11, 2, 1.4); g.fillRect(m + 10, roofTop(m) + 11, 2, 1.4);
    }
    // slender tree columns holding up the canopy
    for (let i = 1; i < joints.length; i++) {
      const x = joints[i];
      if (x > x1) break;
      const ey = roofTop(x) + 12;
      g.fillStyle = '#978eaf'; g.fillRect(x - 1.8, ey + 10, 1.8, base - ey - 10);
      g.fillStyle = '#f1e4df'; g.fillRect(x, ey + 10, 1.8, base - ey - 10);
      TH.line(g, [x - 10, ey + 1, x, ey + 13, x + 10, ey + 1], '#e2d6da', 1.6);
    }
    // end wall
    g.fillStyle = sideGrad(g, x0, x0 + 9, '#4c4668', '#6f6789', '#9d90a8');
    g.fillRect(x0, roofTop(x0) + 6, 9, base - roofTop(x0) - 6);

    // name sign: dark green lit panel (text drawn live so it stays crisp)
    const { x, y, w, h } = SIGN;
    g.fillStyle = '#4a4466';
    g.fillRect(x + 44, roofTop(x + 44) + 12, 2, y - roofTop(x + 44) - 12);
    g.fillRect(x + w - 46, roofTop(x + w - 46) + 12, 2, y - roofTop(x + w - 46) - 12);
    g.shadowColor = 'rgba(255,196,120,0.55)'; g.shadowBlur = 14;
    const pg = g.createLinearGradient(0, y, 0, y + h);
    pg.addColorStop(0, '#17513d'); pg.addColorStop(1, '#0a2c22');
    g.fillStyle = pg; TH.rr(g, x, y, w, h, 4); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(232,200,140,0.85)'; g.lineWidth = 1;
    TH.rr(g, x + 2.5, y + 2.5, w - 5, h - 5, 3); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 3, y + 3, w - 6, 6);
  }

  function paintExpressway(g) {
    // tall piers with hammerhead caps (lit from the right)
    for (const px of PIERS) {
      g.fillStyle = sideGrad(g, px - 10, px + 10, '#4c4669', '#8a809c', '#dbbbaa');
      g.fillRect(px - 10, 137, 20, GY - 137);
      const ao = g.createLinearGradient(0, 137, 0, 156);
      ao.addColorStop(0, 'rgba(22,18,42,0.5)'); ao.addColorStop(1, 'rgba(22,18,42,0)');
      g.fillStyle = ao; g.fillRect(px - 10, 137, 20, 19);
      g.fillStyle = sideGrad(g, px - 34, px + 34, '#4a4466', '#948aa2', '#e0c0ae');
      g.beginPath(); g.moveTo(px - 34, 123); g.lineTo(px + 34, 123); g.lineTo(px + 13, 138); g.lineTo(px - 13, 138); g.closePath(); g.fill();
      g.fillStyle = '#3a3454'; g.fillRect(px - 26, 123, 52, 2);   // bearings
    }
    // deck: parapet, drip groove, box girder face, soffit
    g.fillStyle = '#cbbec6'; g.fillRect(0, DECK, W, 6);
    g.fillStyle = 'rgba(255,206,160,0.8)'; g.fillRect(0, DECK, W, 1.2);
    g.fillStyle = '#554f72'; g.fillRect(0, DECK + 6, W, 2);
    const gf = g.createLinearGradient(0, DECK + 8, 0, DECK + 23);
    gf.addColorStop(0, '#a095ac'); gf.addColorStop(1, '#5e577c');
    g.fillStyle = gf; g.fillRect(0, DECK + 8, W, 15);
    const gw = g.createLinearGradient(0, 0, W, 0);           // warmer toward the sunset side
    gw.addColorStop(0, 'rgba(40,36,90,0.18)'); gw.addColorStop(1, 'rgba(255,170,120,0.16)');
    g.fillStyle = gw; g.fillRect(0, DECK, W, 23);
    g.fillStyle = '#39334f'; g.fillRect(0, DECK + 23, W, 3);
    g.fillStyle = 'rgba(38,32,62,0.35)';
    for (let x = 20; x < W; x += 44) g.fillRect(x, DECK + 8, 1, 15);
    // deck lamps
    for (let x = 100; x < W; x += 110) {
      TH.line(g, [x, DECK, x, DECK - 17, x + 5, DECK - 19], '#3c3656', 1.2);
      glow(g, x + 6, DECK - 18, 11, '255,236,190', 0.6);
      g.fillStyle = '#fff4d8'; g.fillRect(x + 3.5, DECK - 19.5, 5, 1.6);
    }
    // welcome sign hung on the girder
    const { x, y, w, h } = WELCOME;
    g.fillStyle = 'rgba(20,16,40,0.45)'; TH.rr(g, x + 2, y + 2, w, h, 4); g.fill();
    g.fillStyle = '#0e6b43'; TH.rr(g, x, y, w, h, 4); g.fill();
    g.strokeStyle = '#eef4ee'; g.lineWidth = 1.2; TH.rr(g, x + 2.5, y + 2.5, w - 5, h - 5, 3); g.stroke();
    TH.circle(g, x + 15, y + h / 2, 6, '#f42a41');
    glow(g, x + w / 2, y + h + 2, 26, '255,230,180', 0.18);
  }

  function paintFlagPoles(g) {
    for (const fx of FLAGS) {
      g.fillStyle = '#6f6a8a'; g.fillRect(fx - 1.1, 200, 1.1, 92);
      g.fillStyle = '#efe0d8'; g.fillRect(fx, 200, 1, 92);
      TH.circle(g, fx, 199, 1.9, '#e9c173');
    }
  }

  function paintBack(g, s) {
    paintFar(g, s);
    paintTower(g);
    paintTerminal(g, s);
    paintExpressway(g);
    paintFlagPoles(g);
    paintNear(g, s);        // palms + hedge: nothing live is drawn over them, so they share the cache
  }

  // One palm frond with zig-zag leaflets along an arching rachis.
  function paintFrond(g, cx, cy, f, col, rim) {
    const ex = cx + Math.cos(f.a) * f.L, ey = cy + Math.sin(f.a) * f.L + f.droop;
    const kx = cx + Math.cos(f.a) * f.L * 0.5, ky = cy + Math.sin(f.a) * f.L * 0.5 - f.L * 0.2;
    const N = 10, up = [], dn = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      const px = v * v * cx + 2 * v * u * kx + u * u * ex, py = v * v * cy + 2 * v * u * ky + u * u * ey;
      const tx = 2 * v * (kx - cx) + 2 * u * (ex - kx), ty = 2 * v * (ky - cy) + 2 * u * (ey - ky);
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const w = f.w * Math.pow(Math.sin(Math.PI * u), 0.6) * (i % 2 ? 1 : 0.4);
      up.push(px + nx * w, py + ny * w);
      dn.push(px - nx * w * 1.2, py - ny * w * 1.2 + w * 0.45);
    }
    g.beginPath(); g.moveTo(cx, cy);
    for (let i = 0; i < up.length; i += 2) g.lineTo(up[i], up[i + 1]);
    for (let i = dn.length - 2; i >= 0; i -= 2) g.lineTo(dn[i], dn[i + 1]);
    g.closePath(); g.fillStyle = col; g.fill();
    g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(kx, ky, ex, ey);
    g.strokeStyle = rim; g.lineWidth = 0.8; g.stroke();
  }

  // Royal palm: smooth grey trunk, green crownshaft, fronds lit from the right.
  function paintPalm(g, p) {
    const { x, top, sc, lean } = p;
    const cx = x + lean, cy = top, w0 = 3.6 * sc, w1 = 2.3 * sc, cs = cy + 15 * sc;
    const back = p.mid;
    g.fillStyle = back ? sideGrad(g, x - w0, x + w0, '#2c2438', '#51445c', '#8a6f70')
      : sideGrad(g, x - w0, x + w0, '#4a4260', '#978ba2', '#e6c4ae');
    g.beginPath();
    g.moveTo(x - w0, 298);
    g.quadraticCurveTo(x - w0 * 1.15 + lean * 0.3, (298 + cs) / 2, cx - w1, cs);
    g.lineTo(cx + w1, cs);
    g.quadraticCurveTo(x + w0 * 1.15 + lean * 0.3, (298 + cs) / 2, x + w0, 298);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(36,28,52,0.25)';
    for (let y = 292; y > cs + 4; y -= 6 * sc + 1) {
      const u = (298 - y) / (298 - cs);
      g.fillRect(x + lean * u * u - w0 + (w0 - w1) * u, y, 2 * (w0 - (w0 - w1) * u), 0.8);
    }
    g.fillStyle = back ? '#26402f' : sideGrad(g, cx - w1 * 1.3, cx + w1 * 1.3, '#2f5a3c', '#4f7f4f', '#8fb070');
    g.beginPath(); g.moveTo(cx - w1, cs); g.lineTo(cx - w1 * 1.35, cy + 2); g.lineTo(cx + w1 * 1.35, cy + 2); g.lineTo(cx + w1, cs); g.closePath(); g.fill();
    for (const f of p.fronds) {
      const c = Math.cos(f.a), up = Math.sin(f.a) < -0.75;
      let col, rim;
      if (back) { col = f.back ? '#15251f' : '#1d3229'; rim = 'rgba(120,150,120,0.25)'; }
      else if (f.back) { col = '#1b3328'; rim = 'rgba(120,160,120,0.2)'; }
      else if (c > 0.25 || up) { col = '#4d7b47'; rim = 'rgba(255,204,150,0.55)'; }
      else if (c > -0.35) { col = '#35603f'; rim = 'rgba(170,200,140,0.35)'; }
      else { col = '#284838'; rim = 'rgba(140,170,130,0.25)'; }
      paintFrond(g, cx, cy, f, col, rim);
    }
  }

  function paintHedge(g, s) {
    // clean granite edge + manicured hedge with bougainvillea
    const hg = g.createLinearGradient(0, 283, 0, 300);
    hg.addColorStop(0, '#4b784a'); hg.addColorStop(0.3, '#2f5a3d'); hg.addColorStop(1, '#152e28');
    g.fillStyle = hg;
    g.beginPath(); g.moveTo(0, GY); g.lineTo(0, 287);
    for (let x = 0; x < W; x += 25) g.quadraticCurveTo(x + 12.5, 284.2, x + 25, 286.6 + ((x / 25) % 3) * 0.3);
    g.lineTo(W, GY); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,196,140,0.26)'; g.fillRect(0, 285.4, W, 1.4);
    for (const f of s.flecks) { g.fillStyle = f.c; g.fillRect(f.x, f.y, 2.2, 1.4); }
    for (const b of s.topiary) {
      const tg = g.createRadialGradient(b.x + b.r * 0.35, b.y - b.r * 0.4, 1, b.x, b.y, b.r * 1.1);
      tg.addColorStop(0, '#78a45e'); tg.addColorStop(0.55, '#3b6a43'); tg.addColorStop(1, '#1c3a2c');
      TH.circle(g, b.x, b.y, b.r, tg);
    }
    for (const b of s.bougain) TH.circle(g, b.x, b.y, b.r, b.c);
    g.fillStyle = '#8f8aa0'; g.fillRect(0, 297.5, W, 2.5);
    g.fillStyle = '#c9c3cc'; g.fillRect(0, 297.5, W, 0.8);
  }

  function paintNear(g, s) {
    for (const p of s.palms) if (p.mid) paintPalm(g, p);
    paintHedge(g, s);
    for (const p of s.palms) if (!p.mid) paintPalm(g, p);
  }

  // Static layers are painted once into offscreen canvases (≥ 2× resolution, redone if the view grows).
  function layer(ctx, s, key, y0, y1, paint) {
    let c = s.cache[key];
    if (c === undefined) {
      c = null;
      if (typeof document !== 'undefined' && document.createElement) {
        c = document.createElement('canvas');
        c.width = Math.ceil(W * s.F); c.height = Math.ceil((y1 - y0) * s.F);
        const g = c.getContext && c.getContext('2d');
        if (g) { g.scale(s.F, s.F); g.translate(0, -y0); paint(g, s); } else c = null;
      }
      s.cache[key] = c;
    }
    if (c) ctx.drawImage(c, 0, y0, W, y1 - y0);
    else { ctx.save(); paint(ctx, s); ctx.restore(); }
  }

  // ---------- live pieces ----------

  function drawSky(ctx, s, t) {
    ctx.fillStyle = memo(ctx, 'sky', () => {
      const g = ctx.createLinearGradient(0, 0, 0, GY);
      g.addColorStop(0, '#11112f'); g.addColorStop(0.26, '#28235a'); g.addColorStop(0.5, '#583a7a');
      g.addColorStop(0.7, '#ad5878'); g.addColorStop(0.86, '#ec885d'); g.addColorStop(1, '#ffc47d');
      return g;
    });
    ctx.fillRect(0, 0, W, GY);
    ctx.fillStyle = memo(ctx, 'sun', () => {
      const g = ctx.createRadialGradient(890, 285, 0, 890, 285, 430);
      g.addColorStop(0, 'rgba(255,200,125,0.8)'); g.addColorStop(0.35, 'rgba(255,140,92,0.3)'); g.addColorStop(1, 'rgba(255,120,92,0)');
      return g;
    });
    ctx.fillRect(440, 0, W - 440, GY);

    // first stars
    ctx.fillStyle = '#fff8ea';
    for (const st of s.stars) {
      ctx.globalAlpha = st.a * (0.62 + 0.38 * Math.sin(t * st.sp + st.ph));
      ctx.fillRect(st.x, st.y, st.r, st.r);
      if (st.big) { ctx.fillRect(st.x - 2, st.y + st.r / 2 - 0.35, st.r + 4, 0.7); ctx.fillRect(st.x + st.r / 2 - 0.35, st.y - 2, 0.7, st.r + 4); }
    }
    ctx.globalAlpha = 1;

    // thin crescent, lit side toward the set sun, with faint earthshine
    const mx = 205, my = 68, mr = 10, ma = 0.6;
    glow(ctx, mx, my, 44, '255,232,200', 0.22);
    TH.circle(ctx, mx, my, mr, 'rgba(196,186,232,0.16)');
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr, ma, -Math.PI / 2, Math.PI / 2);
    ctx.ellipse(mx, my, mr * 0.42, mr, ma, Math.PI / 2, -Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = '#fff0cc'; ctx.fill();

    // thin dusk cloud streaks, undersides lit by the sunset
    for (const c of s.clouds) {
      ctx.fillStyle = c.y < 100 ? 'rgba(112,70,124,0.5)' : 'rgba(150,84,120,0.45)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w, c.h, 0, 0, TAU); ctx.ellipse(c.x - c.w * 0.45, c.y + 1, c.w * 0.5, c.h * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c.y < 100 ? 'rgba(255,150,130,0.4)' : 'rgba(255,176,120,0.55)';
      ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.12, c.y + c.h * 0.5, c.w * 0.78, c.h * 0.38, 0, 0, TAU); ctx.fill();
    }
  }

  function drawPlane(ctx, p) {
    const d = p.vx < 0 ? -1 : 1;
    const bl = p.t % 1.1, strobe = bl < 0.06 || (bl > 0.15 && bl < 0.21);
    const beacon = (p.t + 0.45) % 1.3 < 0.16;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(d * p.s, p.s);
    ctx.rotate(Math.atan2(p.vy, Math.abs(p.vx)));
    // far wing and far stabiliser, in shadow above the fuselage
    ctx.fillStyle = '#857fa2';
    ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(-9, -3); ctx.lineTo(-24, -11); ctx.lineTo(-18, -11.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-39, -3); ctx.lineTo(-47, -3); ctx.lineTo(-54, -8); ctx.lineTo(-50, -8.5); ctx.closePath(); ctx.fill();
    // tail fin in the livery colour
    ctx.beginPath(); ctx.moveTo(-29, -4.2); ctx.lineTo(-44, -23); ctx.lineTo(-51, -23); ctx.lineTo(-50, -3.2); ctx.closePath();
    ctx.fillStyle = p.tail; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-33, -4.2); ctx.lineTo(-45.5, -20); ctx.lineTo(-47.5, -20); ctx.lineTo(-37, -4.2); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    // fuselage
    ctx.beginPath();
    ctx.moveTo(-51, -3.2);
    ctx.lineTo(36, -4.7);
    ctx.quadraticCurveTo(49, -4.5, 52.5, 0.6);
    ctx.quadraticCurveTo(50.5, 4.7, 38, 4.9);
    ctx.lineTo(-24, 4.9);
    ctx.quadraticCurveTo(-42, 4, -51, -1);
    ctx.closePath();
    ctx.fillStyle = memo(ctx, 'fuselage', () => {
      const g = ctx.createLinearGradient(0, -5, 0, 5);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#e5e1ee'); g.addColorStop(1, '#8b86a8');
      return g;
    });
    ctx.fill();
    TH.line(ctx, [-44, -3.4, 36, -4.7], 'rgba(255,198,150,0.9)', 0.9);
    ctx.fillStyle = p.tail; ctx.fillRect(-34, 1.3, 78, 1.1);                      // cheatline
    ctx.setLineDash([1.3, 1.7]);
    TH.line(ctx, [-30, -1.5, 38, -1.9], '#ffe0a0', 1.3);                          // lit cabin windows
    ctx.setLineDash([]);
    ctx.fillStyle = '#2a2842';
    ctx.beginPath(); ctx.moveTo(43, -3); ctx.lineTo(48.5, -2.2); ctx.lineTo(50, -0.6); ctx.lineTo(43.5, -0.8); ctx.closePath(); ctx.fill();
    // near wing, engine and stabiliser
    ctx.fillStyle = '#d2cddd';
    ctx.beginPath(); ctx.moveTo(10, 1.8); ctx.lineTo(-8, 2.2); ctx.lineTo(-27, 13); ctx.lineTo(-20, 13.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9d97b6';
    ctx.beginPath(); ctx.moveTo(-8, 2.2); ctx.lineTo(-27, 13); ctx.lineTo(-25, 13.3); ctx.lineTo(-5, 2.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c2bdd0'; TH.rr(ctx, -3, 3.6, 14, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#34304a'; ctx.beginPath(); ctx.ellipse(11, 6.1, 1.1, 2.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d2cddd';
    ctx.beginPath(); ctx.moveTo(-38, 2.2); ctx.lineTo(-46, 1.8); ctx.lineTo(-55, 7.5); ctx.lineTo(-50, 7.8); ctx.closePath(); ctx.fill();
    // lights: nav light on the near wingtip (starboard green when flying right), beacon, strobes, landing lights
    const nav = d > 0 ? '80,255,150' : '255,70,70';
    glow(ctx, -24, 13.3, 6, nav, 0.9);
    TH.circle(ctx, -24, 13.3, 1.1, `rgb(${nav})`);
    if (beacon) { glow(ctx, 2, -5.4, 7, '255,60,60', 0.95); glow(ctx, 4, 5.4, 6, '255,60,60', 0.8); }
    if (strobe) { glow(ctx, -24.5, 13.5, 11, '255,255,255', 1); glow(ctx, -51, -2, 8, '255,255,255', 0.9); }
    if (p.land) { glow(ctx, 9, 3, 14, '255,250,225', 0.95); TH.circle(ctx, 9, 3, 1.5, '#ffffff'); }
    ctx.restore();
  }

  function drawTowerLights(ctx, t) {
    // airport beacon: alternating green and white flashes; red obstruction light on the mast
    const b = t % 2;
    const col = b < 0.16 ? '120,255,170' : b > 1 && b < 1.16 ? '255,255,255' : null;
    if (col) { glow(ctx, TOWER + 15, 41, 16, col, 0.95); TH.circle(ctx, TOWER + 15, 41, 1.6, `rgb(${col})`); }
    else TH.circle(ctx, TOWER + 15, 41, 1.2, '#4a5a52');
    if (t % 1.6 < 0.9) glow(ctx, TOWER, 27, 7, '255,60,60', 0.95);
    TH.circle(ctx, TOWER, 27, 1.2, '#ff5050');
  }

  function drawSignText(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx = SIGN.x + SIGN.w / 2;
    ctx.shadowColor = 'rgba(255,214,150,0.9)'; ctx.shadowBlur = 7;
    ctx.fillStyle = '#fff4dc';
    ctx.font = `bold 16px ${TH.FONT}`;
    ctx.fillText('হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর', cx, SIGN.y + 16, SIGN.w - 22);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(214,236,222,0.9)';
    ctx.font = `500 8px ${TH.FONT}`;
    ctx.fillText('Hazrat Shahjalal International Airport', cx, SIGN.y + 32, SIGN.w - 40);
    const wx = WELCOME.x + WELCOME.w / 2 + 8;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 14px ${TH.FONT}`;
    ctx.fillText('ঢাকায় স্বাগতম', wx, WELCOME.y + 12, WELCOME.w - 34);
    ctx.fillStyle = 'rgba(220,245,230,0.9)';
    ctx.font = `500 7px ${TH.FONT}`;
    ctx.fillText('Welcome to Dhaka', wx, WELCOME.y + 24.5, WELCOME.w - 40);
  }

  function drawDeckTraffic(ctx, s) {
    for (const v of s.cars) {
      const L = v.type === 2 ? 30 : v.type === 1 ? 19 : 15;
      const H = v.type === 2 ? 12 : v.type === 1 ? 9 : 6.5;
      const x0 = v.x - L / 2, y0 = DECK - H - (v.dir < 0 ? 0.8 : 0);
      const fx = v.dir > 0 ? x0 + L : x0, bx = v.dir > 0 ? x0 : x0 + L;
      ctx.fillStyle = v.col; ctx.fillRect(x0, y0, L, H);
      ctx.fillStyle = 'rgba(255,214,176,0.4)'; ctx.fillRect(x0, y0, L, 1);
      if (v.type === 2) {
        ctx.fillStyle = '#ffd98f'; ctx.fillRect(x0 + 2, y0 + 2, L - 4, 3); ctx.fillRect(x0 + 2, y0 + 7, L - 4, 2.4);
      } else {
        ctx.fillStyle = 'rgba(160,178,220,0.85)';
        ctx.fillRect(x0 + (v.dir > 0 ? L * 0.3 : L * 0.18), y0 + 1.2, L * 0.52, H * 0.4);
      }
      ctx.fillStyle = memo(ctx, 'beam' + v.dir, () => {        // built at x = 0, shifted per car
        const g = ctx.createLinearGradient(0, 0, v.dir * 18, 0);
        g.addColorStop(0, 'rgba(255,240,200,0.5)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        return g;
      });
      ctx.translate(fx, 0); ctx.fillRect(0, DECK - 4.5, v.dir * 18, 4); ctx.translate(-fx, 0);
      ctx.fillStyle = '#fff6d8'; ctx.fillRect(fx - 1, DECK - 3.5, 2, 2);
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(bx - 1, DECK - 3.5, 2, 2);
    }
  }

  function drawFlags(ctx, t) {
    // Bangladesh flags flying to the right (bottle green, red disc toward the hoist)
    FLAGS.forEach((fx, i) => {
      const ph = t * 3.2 + i * 0.9, top = 201, L = 26, H = 16;
      const wv = (u) => Math.sin(ph - u * 5) * 1.8 * u;
      ctx.beginPath();
      ctx.moveTo(fx + 1, top);
      ctx.bezierCurveTo(fx + L * 0.35, top + wv(0.35) - 1, fx + L * 0.7, top + wv(0.7) + 1, fx + L, top + wv(1) + 0.8);
      ctx.lineTo(fx + L, top + H + wv(1) - 0.4);
      ctx.bezierCurveTo(fx + L * 0.7, top + H + wv(0.7) + 1, fx + L * 0.35, top + H + wv(0.35) - 1, fx + 1, top + H);
      ctx.closePath();
      ctx.fillStyle = '#0a6a4c'; ctx.fill();
      const sh = ctx.createLinearGradient(fx, 0, fx + L, 0);
      for (let k = 0; k <= 4; k++) {
        const a = Math.sin(ph - k * 1.25 + 1.2) * 0.22;
        sh.addColorStop(k / 4, a > 0 ? `rgba(255,214,170,${a.toFixed(3)})` : `rgba(0,10,20,${(-a).toFixed(3)})`);
      }
      ctx.fillStyle = sh; ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx + 1 + L * 0.45, top + H / 2 + wv(0.45) * 0.8, 4.6, 4.9, 0, 0, TAU);
      ctx.fillStyle = '#f0283f'; ctx.fill();
    });
  }

  // ---------- footpath furniture (drawMid) ----------

  function drawPlanter(ctx, x) {
    ctx.fillStyle = 'rgba(18,14,34,0.3)';
    ctx.beginPath(); ctx.ellipse(x + 4, 344, 22, 2.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = sideGrad(ctx, x - 17, x + 17, '#6f6b84', '#b3acb7', '#e6d0c2');
    ctx.fillRect(x - 17, 325, 34, 19);
    ctx.fillStyle = '#ece4e0'; ctx.fillRect(x - 18.5, 322.5, 37, 3);
    ctx.fillStyle = 'rgba(40,34,60,0.3)'; ctx.fillRect(x - 17, 325.5, 34, 2);
    ctx.fillStyle = 'rgba(40,34,60,0.18)'; ctx.fillRect(x - 17, 336, 34, 1);
    const sg = ctx.createRadialGradient(x + 5, 304, 2, x, 311, 16);
    sg.addColorStop(0, '#80aa62'); sg.addColorStop(0.5, '#3e6d44'); sg.addColorStop(1, '#1b3a2c');
    TH.circle(ctx, x, 311, 14, sg);
    ctx.fillStyle = 'rgba(20,44,32,0.55)';
    ctx.fillRect(x - 8, 312, 2.2, 1.6); ctx.fillRect(x - 3, 318, 2.2, 1.6); ctx.fillRect(x + 4, 315, 2.2, 1.6);
    ctx.fillStyle = 'rgba(190,220,150,0.55)';
    ctx.fillRect(x + 3, 302, 2.2, 1.4); ctx.fillRect(x + 8, 307, 2, 1.4); ctx.fillRect(x - 2, 304, 2, 1.4);
    ctx.beginPath(); ctx.arc(x, 311, 13.3, -1.35, 0.2);
    ctx.strokeStyle = 'rgba(255,200,140,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  function drawLampLight(ctx, x, d) {
    const hx = x + d * 27;
    const cg = ctx.createLinearGradient(0, 148, 0, 344);
    cg.addColorStop(0, 'rgba(255,226,170,0.12)'); cg.addColorStop(1, 'rgba(255,226,170,0.02)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(hx - 10, 148); ctx.lineTo(hx + 10, 148); ctx.lineTo(hx + 44, 343); ctx.lineTo(hx - 44, 343); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.translate(hx, 334); ctx.scale(1, 0.24);
    const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
    pg.addColorStop(0, 'rgba(255,216,150,0.38)'); pg.addColorStop(1, 'rgba(255,216,150,0)');
    ctx.fillStyle = pg; ctx.fillRect(-70, -70, 140, 140);
    ctx.restore();
  }

  function drawLamp(ctx, x, d) {
    const top = 152, hx = x + d * 27;
    ctx.fillStyle = '#2e2e3c';
    ctx.beginPath(); ctx.moveTo(x - 2.6, 344); ctx.lineTo(x - 1.5, top); ctx.lineTo(x + 1.5, top); ctx.lineTo(x + 2.6, 344); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,140,0.5)'; ctx.fillRect(x + 0.4, top + 2, 1, 342 - top);
    ctx.fillStyle = sideGrad(ctx, x - 5, x + 5, '#2a2a36', '#4a4a5a', '#8d7f86');
    ctx.fillRect(x - 5, 333, 10, 11);
    ctx.fillStyle = '#5b5b6c'; ctx.fillRect(x - 5.5, 332, 11, 1.5);
    ctx.beginPath(); ctx.moveTo(x, top + 4); ctx.quadraticCurveTo(x + d * 3, top - 7, hx - d * 8, top - 6);
    ctx.strokeStyle = '#2e2e3c'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = '#262632'; TH.rr(ctx, hx - 13, top - 9, 26, 5, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,150,0.6)'; ctx.fillRect(hx - 11, top - 9, 22, 0.8);
    glow(ctx, hx, top - 3, 32, '255,226,160', 0.5);
    ctx.fillStyle = '#fff6da'; ctx.fillRect(hx - 11, top - 4.6, 22, 1.6);
  }

  // "No Tesla" sign on a lamp post: bolt in a red prohibition ring + label plate (text drawn live).
  function drawBanSign(ctx, x) {
    const y = BAN_Y;
    TH.circle(ctx, x, y, 11, '#f5f3f0');
    ctx.beginPath(); ctx.arc(x, y, 9.4, 0, TAU);
    ctx.strokeStyle = '#d0142c'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.fillStyle = '#1f1f24';
    ctx.beginPath();
    ctx.moveTo(x + 2.2, y - 7); ctx.lineTo(x - 4, y + 1); ctx.lineTo(x - 0.6, y + 1); ctx.lineTo(x - 2.2, y + 7);
    ctx.lineTo(x + 4, y - 1.4); ctx.lineTo(x + 0.6, y - 1.4); ctx.closePath(); ctx.fill();
    TH.line(ctx, [x - 6.4, y - 6.4, x + 6.4, y + 6.4], '#d0142c', 2.2);
    ctx.fillStyle = '#f5f3f0'; TH.rr(ctx, x - 21, y + 13, 42, 12, 2); ctx.fill();
  }

  function drawBanText(ctx, x) {
    ctx.fillStyle = '#b3001b'; ctx.font = `bold 8.5px ${TH.FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('টেসলা নিষেধ', x, BAN_Y + 19.5, 38);
  }

  // Everything on the footpath is static, so it is cached like the backdrop.
  function paintMid(g) {
    // soft contact shadow where the hedge meets the footpath (kept off the one-way sign pole)
    const sh = g.createLinearGradient(0, 300, 0, 307);
    sh.addColorStop(0, 'rgba(20,16,36,0.32)'); sh.addColorStop(1, 'rgba(20,16,36,0)');
    g.fillStyle = sh; g.fillRect(0, 300, 245, 7); g.fillRect(256, 300, W - 256, 7);
    for (const [x, d] of LAMPS) drawLampLight(g, x, d);
    for (const x of PLANTERS) drawPlanter(g, x);
    for (const [x, d] of LAMPS) drawLamp(g, x, d);
    drawBanSign(g, BAN_X);
  }

  TH.roads.push({
    id: 'airport',
    order: 4,
    name: 'এয়ারপোর্ট রোড',
    nameEn: 'Airport Road',
    tagline: 'টেসলা নিষিদ্ধ — তবু চলছেই!',
    weights: { wrongway: 3, footpath: 1, phone: 1, overload: 1, overcharge: 2, tesla: 4 },
    street: { asphalt: '#2c2d34', footpath: '#b1b4bd', curb: ['#c8102e', '#f1f1f1'], laneColor: '#f2f2f0' },

    init(rng) {
      const rp = (a) => a[(rng() * a.length) | 0];
      const city = [], cityLights = [];
      for (let x = -10; x < W + 10;) {
        const w = 14 + rng() * 34;
        const tall = (x < 190 || x > 840) && rng() < 0.5;
        const top = tall ? 146 + rng() * 44 : 200 + rng() * 50;
        city.push({ x, w, top, ant: tall && rng() < 0.5 });
        const n = Math.min(14, ((GY - top) * w) / 300) | 0;
        for (let i = 0; i < n; i++) if (rng() < 0.5) cityLights.push({ x: x + 2 + rng() * (w - 6), y: top + 4 + rng() * (GY - top - 30) });
        x += w + rng() * 5;
      }
      const treeLine = [];
      for (let x = 14; x < W + 14; x += 14) treeLine.push({ x, y: 262 + rng() * 10 });

      const stars = [];
      for (let i = 0; i < 140 && stars.length < 64; i++) {
        const x = rng() * W, y = 8 + Math.pow(rng(), 1.3) * 118;
        const a = (1 - y / 150) * (1 - 0.55 * (x / W));
        if (a < 0.18) continue;
        const big = rng() < 0.08;
        stars.push({ x, y, a: Math.min(1, a + 0.15), r: big ? 1.8 : rng() < 0.4 ? 1.4 : 1, big, ph: rng() * TAU, sp: 1.5 + rng() * 3 });
      }
      const clouds = [];
      for (let i = 0; i < 6; i++) {
        const low = i >= 3;
        clouds.push({ x: rng() * W, y: low ? 132 + rng() * 12 : 58 + rng() * 30, w: 36 + rng() * 50, h: 2.5 + rng() * 2.5, sp: 3 + rng() * 4 });
      }

      const panes = [];
      for (let x = TERM_X + 5; x < W + 20; x += 15) {
        for (const [y, h] of [[150, 47], [198, 21], [220, 20]]) {
          const v = rng();
          if (v < 0.22) panes.push({ x, y, h, c: 'rgba(255,238,196,0.3)' });
          else if (v < 0.34) panes.push({ x, y, h, c: 'rgba(30,24,60,0.2)' });
        }
      }
      const people = [];
      for (let x = TERM_X + 20; x < W; x += 10 + rng() * 34) people.push({ x, h: 11 + rng() * 4, cart: rng() < 0.25 });

      const cars = [];
      const CAR_COLS = ['#2b2742', '#e9e3dc', '#6b2f40', '#3b5579', '#8c8a96', '#1f1d2c', '#b8563a'];
      for (const dir of [1, -1]) {
        const n = 5, gap = (W + 80) / n;
        for (let i = 0; i < n; i++) {
          const r = rng();
          const type = r < 0.16 ? 2 : r < 0.42 ? 1 : 0;
          cars.push({
            x: -40 + i * gap + rng() * gap * 0.5, dir, sp: dir > 0 ? 56 : 44, type,
            col: type === 2 ? rp(['#b3262d', '#1f6f5c', '#2e4d7a']) : rp(CAR_COLS),
          });
        }
      }
      cars.sort((a, b) => a.dir - b.dir);   // far lane (moving left) first

      const palms = [];
      const mkPalm = (x, top, sc, mid) => {
        const fronds = [];
        const n = mid ? 9 : 12;
        for (let i = 0; i < n; i++) {
          const a = Math.PI + (Math.PI * (i + 0.5)) / n + (rng() - 0.5) * 0.25 + 0.12;
          const L = (30 + rng() * 10) * sc;
          fronds.push({ a, L, droop: L * (0.25 + 0.4 * Math.abs(Math.cos(a))) + rng() * 4 * sc, w: (5 + rng() * 1.5) * sc, back: rng() < 0.35 });
        }
        for (const a of [0.45, Math.PI - 0.5]) {
          const L = (26 + rng() * 6) * sc;
          fronds.push({ a, L, droop: L * 0.5, w: 4.6 * sc, back: true });
        }
        fronds.sort((p, q) => (q.back ? 1 : 0) - (p.back ? 1 : 0));
        palms.push({ x, top, sc, mid, lean: (2 + rng() * 3) * sc, fronds });
      };
      mkPalm(396, 248, 0.55, true);
      mkPalm(566, 250, 0.5, true);
      mkPalm(24, 176, 1.0, false);
      mkPalm(166, 196, 0.88, false);
      mkPalm(986, 170, 1.05, false);

      const topiary = [];
      for (const x of [92, 300, 470, 620, 700, 940]) topiary.push({ x: x + rng() * 10, y: 283, r: 6 + rng() * 3 });
      const bougain = [];
      for (let i = 0; i < 16; i++) {
        const bx = rng() * W, n = 3 + ((rng() * 4) | 0);
        for (let j = 0; j < n; j++) bougain.push({ x: bx + (rng() - 0.5) * 16, y: 286 + rng() * 5, r: 1.6 + rng() * 1.8, c: rp(['#d63384', '#e8559e', '#b0176a', '#f08bb9']) });
      }
      const flecks = [];
      for (let i = 0; i < 70; i++) flecks.push({ x: rng() * W, y: 288 + rng() * 9, c: rng() < 0.5 ? 'rgba(14,34,26,0.45)' : 'rgba(110,150,96,0.35)' });

      // one plane already in the sky at the start
      const plane = newPlane(rng);
      const f = 0.25 + rng() * 0.2, dur = (W + 280) / Math.abs(plane.vx);
      plane.x += plane.vx * dur * f; plane.y += plane.vy * dur * f;

      return {
        city, cityLights, treeLine, stars, clouds, panes, people, cars, palms, topiary, bougain, flecks,
        planes: [plane], planeT: 5 + rng() * 3, cache: {}, F: 2,
      };
    },

    update(s, dt) {
      for (const c of s.clouds) { c.x += c.sp * dt; if (c.x - c.w * 1.5 > W) c.x = -c.w * 1.2; }
      for (const v of s.cars) {
        v.x += v.dir * v.sp * dt;
        if (v.x > W + 40) v.x -= W + 80; else if (v.x < -40) v.x += W + 80;
      }
      s.planeT -= dt;
      if (s.planeT <= 0) { s.planes.push(newPlane(Math.random)); s.planeT = 8 + Math.random() * 4; }
      for (let i = s.planes.length - 1; i >= 0; i--) {
        const p = s.planes[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.t += dt;
        if (p.x < -160 || p.x > W + 160) s.planes.splice(i, 1);
      }
    },

    drawBack(ctx, s, env) {
      const t = env && Number.isFinite(env.t) ? env.t : 0;
      // cache resolution follows the real on-screen scale (never below 2×)
      let k = 2;
      if (typeof ctx.getTransform === 'function') { const m = ctx.getTransform(); k = Math.hypot(m.a, m.b) || 2; }
      const F = Math.min(3, Math.max(2, Math.ceil(k * 4) / 4));
      if (F > s.F + 0.01) { s.cache = {}; s.F = F; }

      drawSky(ctx, s, t);
      for (const p of s.planes) drawPlane(ctx, p);
      layer(ctx, s, 'back', 20, GY, paintBack);
      drawSignText(ctx);
      drawTowerLights(ctx, t);
      drawDeckTraffic(ctx, s);
      drawFlags(ctx, t);
    },

    drawMid(ctx, s) {
      layer(ctx, s, 'mid', 110, 352, paintMid);
      drawBanText(ctx, BAN_X);
    },
  });
})();
