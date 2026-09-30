// Background life for the first-person view (see js/FP_CONTRACT.md §9).
// - Traffic on the opposite carriageway (lanes u = −375 / −555), always pulling away from the camera, so
//   it is seen from behind: dented Dhaka local buses with people hanging off the back and the door, red
//   double-deckers, green CNG auto-rickshaws in their cages, white cars and yellow-green taxis, motorbikes
//   with pillions, and painted trucks. Car-following (IDM) on two lanes; bikes split between the lanes;
//   buses pull up at bus stops and anywhere else they fancy.
//   Each vehicle look is painted once into offscreen textures (rear face + right side): the rear is one
//   billboard, the side is strip-mapped in perspective like the facades. Lamps, brake lights, indicators,
//   exhaust puffs, night glows and headlight spill are drawn live on top.
// - Street life on both sidewalks: men, women, school kids, hawkers and stray dogs walking both ways
//   (front and back views, walk cycle, distance LOD), groups at road.lifeSpots (tea-stall bench, bus stop,
//   chatting crowd) and a few people dashing over the zebra when the light turns red.
// A small call governor keeps everything under the contract budget, degrading the farthest things first.
(function () {
  'use strict';
  const TH = window.TH;
  const fp = TH.fp;
  const { CX, HY, F, NEAR } = fp;
  const cam = fp.cam;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const shade = fp.shade;
  const FONT = TH.FONT;
  const CURB = fp.CURB_H;
  const BUDGET = 1100;                 // canvas calls per frame, all included (contract: 1200)
  const LANE_U = [fp.U.opp[0], fp.U.opp[1], (fp.U.opp[0] + fp.U.opp[1]) / 2]; // median lane, kerb lane, lane split
  const S0 = 45, BRK = 260;            // car-following: jam gap, comfortable braking
  const WALK = { R: [306, 440], L: [-785, -668] }; // sidewalk bands people walk in
  const ZEBRA = [1310, 1410];
  const MEDIAN_U = -240, MEDIAN_H = 10;

  // ---------- palettes ----------
  const INK = 'rgba(40,20,10,0.5)';
  const HAIR = '#17110d';
  const SKINS = ['#8d5a3b', '#a8694a', '#6e4630', '#b97c56', '#7a4b31', '#c08a62', '#9a6243'];
  const SHIRTS = ['#4a90c2', '#c2553b', '#6a8e3a', '#8e5aa8', '#d4a017', '#5b6770', '#f1f1f1', '#e9e4d4', '#2a9d8f', '#e63946', '#1d3557', '#f4a261', '#7f5539', '#9bb7d4'];
  const PANTS = ['#2f3a4f', '#3d405b', '#5c4033', '#22223b', '#57606f', '#6b705c', '#1c1c24', '#7a6a55'];
  const LUNGIS = ['#2a5caa', '#3a7d44', '#7b2cbf', '#8d6e63', '#1d3557', '#9d0208', '#264653', '#5e548e'];
  const PANJABI = ['#f4f1e8', '#e8e0cc', '#cfe3f0', '#f6d9c4', '#d8e8d0', '#ffffff', '#c9b8e8'];
  const SAREES = ['#d6336c', '#e85d04', '#2a9d8f', '#ffb703', '#7209b7', '#c1121f', '#06d6a0', '#3a86ff', '#f15bb5', '#588157'];
  const PAAR = ['#ffd23f', '#c1121f', '#1b4332', '#ffffff', '#f77f00'];
  const KAMEEZ = ['#ef476f', '#ffd166', '#118ab2', '#8338ec', '#fb8500', '#90be6d', '#f28482', '#4cc9f0', '#b5838d'];
  const SCARVES = ['#1d3557', '#6d597a', '#2a9d8f', '#b56576', '#264653', '#e5989b', '#111111', '#f4a261'];
  const BURQA = ['#16161c', '#1f2338', '#2d1e2f', '#3a2f28'];
  const SANDALS = ['#1e3a8a', '#b91c1c', '#111827', '#15803d', '#6b4226', '#222222'];
  const UMB_M = ['#15151a', '#1f2430', '#2b2b2b', '#243b55'];
  const UMB_W = ['#e63946', '#8338ec', '#ff8fab', '#2a9d8f', '#ffb703', '#3a86ff'];
  const BAGS = ['#f4f4f4', '#f472b6', '#60a5fa', '#c8a165', '#facc15', '#16a34a'];
  const PACKS = ['#e63946', '#3a86ff', '#ffb703', '#8338ec', '#06d6a0', '#ff006e'];
  const GOODS = [['#f6d743', '#7a9a2a'], ['#8ac926', '#5a8f1a'], ['#fdfdf4', '#d9c9a3'], ['#e63946', '#8a1c1c']]; // bananas, guavas, popcorn, tomatoes
  const DOGS = [['#c68f5c', '#9c6a3f'], ['#d9c29a', '#b39468'], ['#3b3029', '#231c17'], ['#e9dfcf', '#b8a78f'], ['#8a5a3b', '#5e3b25']];
  const ART = ['#ff2e88', '#ffd23f', '#18c29c', '#3a86ff', '#ff7b25', '#a855f7', '#7ed957', '#fdfdfd'];

  const BUS_COLS = [ // body, stripe, accent
    ['#c0392b', '#f1c40f', '#1d3557'], ['#1f6fb2', '#f0f0f0', '#e63946'], ['#2e8b57', '#f4d03f', '#c0392b'],
    ['#e67e22', '#fff3de', '#1f6fb2'], ['#7d3c98', '#f0f0f0', '#ffb703'], ['#d6336c', '#ffe066', '#2a9d8f'],
    ['#ecebe2', '#2e8b57', '#c0392b'], ['#1b998b', '#ffffff', '#ff6b35'], ['#3d5a80', '#ee6c4d', '#e0fbfc'],
  ];
  // Invented operators only (no real companies).
  const BUS_NAMES = ['ঠেলাঠেলি পরিবহন', 'হুড়োহুড়ি এক্সপ্রেস', 'চাপাচাপি সার্ভিস', 'গাদাগাদি পরিবহন', 'ঝাঁকুনি এক্সপ্রেস', 'আস্তে চলো পরিবহন', 'দৌড়ঝাঁপ লাইন', 'ঘামাঘামি সিটিং', 'লটরপটর পরিবহন'];
  const ROUTES = ['গুলিস্তান - মিরপুর ১০', 'মতিঝিল - উত্তরা', 'সদরঘাট - গাজীপুর', 'যাত্রাবাড়ী - আব্দুল্লাহপুর', 'ফার্মগেট - বাড্ডা', 'মহাখালী - সায়েদাবাদ', 'মোহাম্মদপুর - রামপুরা', 'নিউমার্কেট - কুড়িল'];
  const TRUCK_LINES = ['১০০ হাত দূরে থাকুন', 'দেখবি আর জ্বলবি', 'চাচা আপন প্রাণ বাঁচা', 'ধীরে চলুন', 'হর্ন দিন'];
  const TRUCK_TOPS = ['মায়ের দোয়া', 'বাবার দোয়া', 'সোনার বাংলা', 'ভাই ভাই', 'মা-বাবার দোয়া'];
  const TRUCK_BASE = ['#f4c20d', '#e63946', '#2a9d8f', '#1f6fb2', '#2e8b57', '#ff7b25', '#6a4c93'];
  const TARPS = ['#1e5aa8', '#2e8b57', '#e0a100', '#b23a48', '#3d5a80', '#5a7d2a'];
  const CAR_COLS = ['#f4f4f0', '#f1f1ec', '#ecece6', '#c9ccd1', '#1d1f24', '#7a1f2b', '#23395b', '#f6f6f2'];
  const BIKE_COLS = ['#c1121f', '#111111', '#1f4e9c', '#e8e8e8', '#2b2d42', '#0f766e'];
  const HELMETS = ['#e63946', '#111111', '#f1f1f1', '#1d4ed8', '#ffd166', '#6b7280', '#16a34a'];

  const DEF_TRAFFIC = { bus: 3, cng: 4, car: 3, bike: 3, truck: 1 };
  const DEF_LIFE = { walker: 5, woman: 4, kid: 1.3, hawker: 0.9, dog: 1 };
  const DEF_SPOTS = [
    { z: 1110, u: 405, kind: 'teastall' }, { z: 220, u: -728, kind: 'busstop' },
    { z: -900, u: 372, kind: 'crowd' }, { z: -2700, u: -720, kind: 'crowd' }, { z: -3900, u: 395, kind: 'busstop' },
  ];
  const KIND = { // speeds (FP units/s), max acceleration, time headway
    bus: { v: [240, 360], a: 70, T: 1.0 }, truck: { v: [260, 420], a: 60, T: 1.1 }, cng: { v: [330, 500], a: 110, T: 0.8 },
    car: { v: [400, 650], a: 125, T: 0.8 }, bike: { v: [430, 650], a: 170, T: 0.55 },
  };

  const pick = (r, a) => a[(r() * a.length) | 0];
  const BN = '০১২৩৪৫৬৭৮৯';
  const bn = (s) => String(s).replace(/\d/g, (d) => BN[+d]);
  const plateNo = (r) => bn(`${11 + ((r() * 88) | 0)}-${1000 + ((r() * 9000) | 0)}`);

  // ---------- small drawing helpers (local units) ----------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fillRR(g, x, y, w, h, r, c) { rr(g, x, y, w, h, r); g.fillStyle = c; g.fill(); }
  function ell(g, x, y, rx, ry, c, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, TAU); g.fillStyle = c; g.fill(); }
  function circ(g, x, y, r, c) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); g.fillStyle = c; g.fill(); }
  function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  function fillPoly(g, p, c) { poly(g, p); g.fillStyle = c; g.fill(); }
  function line(g, p, c, w) {
    g.beginPath(); g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.strokeStyle = c; g.lineWidth = w; g.stroke();
  }
  function label(g, s, x, y, size, c, maxW, outline) {
    g.font = `bold ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (outline) { g.lineWidth = size * 0.24; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(s, x, y, maxW); }
    g.fillStyle = c; g.fillText(s, x, y, maxW);
  }
  function vgrad(g, y0, y1, stops) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  // Two-bone IK: elbow between shoulder (ax, ay) and hand (bx, by); side +1 bends toward +x.
  function ik(ax, ay, bx, by, l1, l2, side) {
    const dx = bx - ax, dy = by - ay;
    const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01));
    const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const ang = Math.atan2(dy, dx) - side * Math.acos(clamp(c, -1, 1));
    return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
  }
  function flower(g, x, y, r, petal, core) {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; g.moveTo(px + r * 0.62, py); g.arc(px, py, r * 0.62, 0, TAU); }
    g.fillStyle = petal; g.fill();
    circ(g, x, y, r * 0.55, core);
  }
  // Small painted Bengal scene (river boat / village hut / sunset lake), w × h at (x, y).
  function scene(g, type, x, y, w, h) {
    g.save(); g.translate(x, y); g.scale(w / 20, h / 17);
    const dusk = type === 2;
    g.fillStyle = dusk ? '#ff9a62' : '#78c6ec'; g.fillRect(0, 0, 20, 17);
    g.fillStyle = dusk ? '#ffd98a' : '#dff1f7'; g.fillRect(0, 6, 20, 5);
    circ(g, 15.5, dusk ? 9.6 : 4, dusk ? 3.2 : 2.2, '#fff3a0');
    if (type === 0) {
      g.fillStyle = '#3c9a4c'; g.fillRect(0, 9, 20, 2);
      g.fillStyle = '#2d7fc0'; g.fillRect(0, 11, 20, 6);
      line(g, [5, 13, 14, 13], '#6b3a1c', 2.2);
      fillPoly(g, [9.5, 12, 9.5, 3, 14.5, 11.2], '#f6f1e1');
    } else if (type === 1) {
      g.fillStyle = '#62b246'; g.fillRect(0, 11, 20, 6);
      g.fillStyle = '#e8c07a'; g.fillRect(3, 8.4, 8, 4.8);
      fillPoly(g, [1.5, 8.8, 7, 4, 12.5, 8.8], '#9c5a24');
      g.fillStyle = '#7a4a26'; g.fillRect(15, 5, 1.1, 8);
      g.beginPath(); g.moveTo(15.5, 5); g.quadraticCurveTo(12, 3.2, 11.4, 6.6); g.moveTo(15.5, 5); g.quadraticCurveTo(19, 3.2, 19.6, 6.6);
      g.strokeStyle = '#2f7d3a'; g.lineWidth = 1.3; g.stroke();
    } else {
      g.fillStyle = '#4f7fb8'; g.fillRect(0, 10, 20, 7);
      ell(g, 9, 14, 3.4, 1.6, '#fdfdfd');
      line(g, [11.5, 13.5, 12.6, 10.2, 13.8, 10.4], '#fdfdfd', 1.1);
    }
    g.restore();
  }
  function plate(g, x, y, w, h, cls, num, green) {
    fillRR(g, x, y, w, h, 1.4, green ? '#15803d' : '#f5f5ef');
    g.strokeStyle = green ? '#e8f5e9' : '#2b2b2b'; g.lineWidth = 0.6; g.stroke();
    const c = green ? '#ffffff' : '#141414';
    label(g, `ঢাকা মেট্রো-${cls}`, x + w / 2, y + h * 0.31, h * 0.33, c, w - 2);
    label(g, num, x + w / 2, y + h * 0.72, h * 0.42, c, w - 2);
  }
  function tyreBack(g, x, y, w, h) {
    fillRR(g, x, y, w, h, Math.min(5, w / 3), '#141417');
    g.fillStyle = '#2c2c32'; g.fillRect(x + w * 0.2, y + 2, w * 0.13, h - 4); g.fillRect(x + w * 0.62, y + 2, w * 0.13, h - 4);
  }
  function wheelSide(g, x, y, r, rim) {
    circ(g, x, y, r, '#141417');
    circ(g, x, y, r * 0.64, rim || '#8d949b');
    circ(g, x, y, r * 0.5, shade(rim || '#8d949b', -0.25));
    circ(g, x, y, r * 0.24, '#d0d5da');
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6, px = x + Math.cos(a) * r * 0.38, py = y + Math.sin(a) * r * 0.38; g.moveTo(px + r * 0.06, py); g.arc(px, py, r * 0.06, 0, TAU); }
    g.fillStyle = '#3b4046'; g.fill();
    g.beginPath(); g.arc(x, y, r - 1, PI * 1.12, PI * 1.62); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.2; g.stroke();
  }
  // wear and tear inside the current clip: dents with a lit rim, bare primer, rust runs, scratches
  function wear(g, r, x0, x1, y0, y1, n) {
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), rx = 4 + r() * 10, ry = 3 + r() * 6, a = (r() - 0.5) * 0.8;
      ell(g, x, y, rx, ry, 'rgba(0,0,0,0.17)', a);
      g.beginPath(); g.ellipse(x - rx * 0.15, y - ry * 0.2, rx, ry, a, PI * 1.05, PI * 1.75);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1; g.stroke();
    }
    for (let i = 0; i < 2; i++) {
      if (r() < 0.35) continue;
      const x = x0 + r() * (x1 - x0 - 30), y = y0 + r() * (y1 - y0 - 10);
      fillPoly(g, [x, y, x + 14 + r() * 12, y - 2, x + 18 + r() * 4, y + 6 + r() * 5, x + 3, y + 8], '#a2a6a4');
    }
    g.fillStyle = 'rgba(125,62,22,0.36)';
    for (let i = 0; i < 6; i++) g.fillRect(x0 + r() * (x1 - x0), y1 - 6 - r() * 20, 1.4, 6 + r() * 16);
    g.beginPath();
    for (let i = 0; i < 8; i++) { const x = x0 + r() * (x1 - x0 - 20), y = y0 + r() * (y1 - y0); g.moveTo(x, y); g.lineTo(x + 8 + r() * 28, y + (r() - 0.5) * 6); }
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.7; g.stroke();
  }

  // ---------- people: looks ----------
  function makeLook(r, kind) {
    const P = {
      kind, sc: 1, hs: 1, skin: pick(r, SKINS), top: pick(r, SHIRTS), topLen: 'shirt', sleeve: 'short', low: 'pants',
      lowCol: pick(r, PANTS), drape: null, drapeCol: null, paar: null, head: 'hair', headCol: null, stache: false, beard: false,
      bindi: false, acc: null, accCol: null, shoe: pick(r, SANDALS), bib: null, goods: null,
    };
    const u = r();
    if (kind === 'woman') {
      P.sc = 0.93;
      if (u < 0.38) { // saree
        P.low = 'saree'; P.lowCol = pick(r, SAREES); P.paar = pick(r, PAAR); P.top = shade(pick(r, SAREES), -0.15); P.topLen = 'blouse';
        P.drape = 'anchal'; P.head = r() < 0.3 ? 'veil' : 'long'; P.headCol = P.lowCol; P.bindi = r() < 0.3;
      } else if (u < 0.8) { // salwar kameez with an orna, some in hijab
        P.top = pick(r, KAMEEZ); P.topLen = 'long'; P.sleeve = 'long'; P.low = 'salwar'; P.lowCol = r() < 0.5 ? '#f3efe6' : shade(P.top, -0.3);
        P.drape = 'orna'; P.drapeCol = pick(r, KAMEEZ); P.head = r() < 0.48 ? 'hijab' : 'long'; P.headCol = pick(r, SCARVES);
      } else { // burqa
        P.top = pick(r, BURQA); P.topLen = 'burqa'; P.sleeve = 'long'; P.low = 'burqa'; P.lowCol = P.top; P.head = 'hijab'; P.headCol = r() < 0.6 ? P.top : pick(r, SCARVES);
      }
      if (P.head === 'long') P.braid = r() < 0.4;
      const a = r();
      if (a < 0.16) { P.acc = 'umbrella'; P.accCol = pick(r, UMB_W); } else if (a < 0.42) { P.acc = 'bag'; P.accCol = pick(r, BAGS); } else if (a < 0.5) P.acc = 'phone';
    } else if (kind === 'kid') {
      P.sc = 0.68; P.hs = 1.22; P.top = '#f4f6f8'; P.shoe = '#151515';
      if (r() < 0.55) { P.low = 'shorts'; P.lowCol = pick(r, ['#1d3557', '#27407a', '#5b4636']); } else { P.low = 'skirt'; P.lowCol = pick(r, ['#1d3557', '#27407a', '#7a1f2b']); P.bib = P.lowCol; P.head = 'braids'; P.headCol = pick(r, ['#e63946', '#f1f1f1', '#3a86ff']); }
      P.acc = 'backpack'; P.accCol = pick(r, PACKS);
    } else { // men (walkers and hawkers)
      if (u < 0.42) { P.stache = r() < 0.5; P.topLen = r() < 0.35 ? 'tuck' : 'shirt'; if (r() < 0.3) P.sleeve = 'long'; } else if (u < 0.74 || kind === 'hawker') {
        P.low = 'lungi'; P.lowCol = pick(r, LUNGIS); P.stache = r() < 0.6; if (r() < 0.35) P.top = pick(r, ['#f1f1f1', '#e9e4d4', '#f4f1e8']);
        if (r() < 0.35) P.drape = 'gamcha';
      } else {
        P.top = pick(r, PANJABI); P.topLen = 'long'; P.sleeve = 'long'; P.lowCol = '#efece2'; P.head = r() < 0.5 ? 'tupi' : 'hair';
        P.beard = r() < 0.45; P.beardCol = r() < 0.4 ? '#d8d4cc' : '#1d130d';
      }
      if (kind === 'hawker') { P.acc = 'basket'; P.goods = pick(r, GOODS); } else {
        const a = r();
        if (a < 0.1) { P.acc = 'umbrella'; P.accCol = pick(r, UMB_M); } else if (a < 0.22) { P.acc = 'bag'; P.accCol = pick(r, BAGS); } else if (a < 0.31) { P.acc = 'sack'; P.accCol = '#b8976a'; } else if (a < 0.41) P.acc = 'phone'; else if (a < 0.48) P.acc = 'phoneLook'; else if (a < 0.56) { P.acc = 'backpack'; P.accCol = pick(r, ['#1b1b1b', '#3d405b', '#5c4033']); }
      }
    }
    return P;
  }

  // ---------- people: drawing ----------
  // Front or back view, local units (a man is 100 tall, feet at y = 0); the caller translates to the
  // ground point and scales by px-per-unit × P.sc.
  // o: { front, q (walk phase), mv (0..1), t, tier (0 full, 1 medium), sit, act ('cup'|'chat'|'raise'|'shake'), sip, hand: { R, L }, look }
  const tgrads = new WeakMap();
  function torsoFill(g, c) { // shaded across the body; cached per context and colour (local units, valid at any scale)
    if (g.isStub) return c;
    let m = tgrads.get(g);
    if (!m) { m = new Map(); tgrads.set(g, m); }
    let gr = m.get(c);
    if (!gr) {
      gr = g.createLinearGradient(-13, 0, 13, 0);
      gr.addColorStop(0, shade(c, 0.1)); gr.addColorStop(0.55, c); gr.addColorStop(1, shade(c, -0.2));
      if (m.size > 200) m.clear();
      m.set(c, gr);
    }
    return gr;
  }
  function figure(g, P, o) {
    const front = !!o.front, LS = front ? 1 : -1; // screen side of the person's own left
    const mv = o.mv || 0, q = o.q || 0, sq = Math.sin(q), t = o.t || 0, full = !o.tier, sit = !!o.sit;
    const by = sit ? 19 : -Math.abs(sq) * 1.7 * mv, bx = sit ? 0 : sq * 0.8 * mv;
    const hipY = -48 + by, waistY = -55 + by, shY = -79 + by;
    const hr = 7.3 * P.hs, hx = bx * 0.6 + (o.look || 0), headY = shY - 4 - hr * 0.92 + (P.acc === 'phoneLook' ? 1.2 : 0);
    const skin = P.skin, acc = P.acc, top = P.top, low = P.low;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // hands (the person's own right / left)
    let hR = [-LS * 13.4 + bx, hipY + 1 + sq * 2.6 * mv], hL = [LS * 13.4 + bx, hipY + 1 - sq * 2.6 * mv];
    if (sit) { hR = [-LS * 8, -35]; hL = [LS * 8, -35]; }
    if (acc === 'umbrella') hR = [-LS * 3.5 + bx, shY + 9];
    else if (acc === 'phone') hR = [-LS * 8.6 + hx, headY + 2];
    else if (acc === 'phoneLook') { hR = [-LS * 3 + bx, shY + 15]; hL = [LS * 3 + bx, shY + 15]; }
    else if (acc === 'sack') hR = [-LS * 10.5 + bx, shY - 3];
    else if (acc === 'basket') hR = [-LS * 16 + hx, headY - hr - 3];
    if (o.act === 'cup') hR = o.sip ? [-LS * 2.5 + hx, headY + 5] : [-LS * 6.5 + bx, shY + 17];
    else if (o.act === 'chat') hR = [-LS * (12 + 3 * Math.sin(t * 5.3)) + bx, shY + 11 + 3 * Math.sin(t * 7.1)];
    else if (o.act === 'raise') hR = [-LS * 16 + bx, shY - 12];
    else if (o.act === 'shake') hR = [-LS * (4 + 2 * Math.sin(t * 16)) + bx, shY + 12 + 2 * Math.cos(t * 16)];
    if (o.hand) { if (o.hand.R) hR = o.hand.R; if (o.hand.L) hL = o.hand.L; }

    if (front && acc === 'sack') ell(g, -LS * 9 + bx, shY - 7, 12, 14, P.accCol, -LS * 0.3); // sack over the shoulder, behind
    // arms: in the back view a hand held in front of the body (phone, cup, umbrella) hides its arm behind the torso
    const sy = shY + 2.5, long = P.sleeve === 'long';
    const armR = [-LS * 11.6 + bx, hR, -LS], armL = [LS * 11.6 + bx, hL, LS];
    const hidden = (a) => !front && Math.abs(a[1][0] - bx) < 10.5 && a[1][1] > shY;
    const arms = (list) => {
      if (!list.length) return;
      const el = list.map(([x, h, side]) => (full ? ik(x, sy, h[0], h[1], 13.6, 13.6, side) : [(x + h[0]) / 2, (sy + h[1]) / 2]));
      g.beginPath();
      list.forEach(([x, h], i) => { g.moveTo(x, sy); if (full) g.lineTo(el[i][0], el[i][1]); g.lineTo(h[0], h[1]); });
      g.strokeStyle = long ? top : skin; g.lineWidth = long ? 4.8 : 4.2; g.stroke();
      if (!long) { // short sleeves along the upper arm
        g.beginPath();
        list.forEach(([x], i) => { const dx = el[i][0] - x, dy = el[i][1] - sy, l = Math.hypot(dx, dy) || 1; g.moveTo(x, sy - 0.6); g.lineTo(x + (dx / l) * 7.5, sy + (dy / l) * 7.5); });
        g.strokeStyle = top; g.lineWidth = 6.6; g.stroke();
      }
      if (full) { g.fillStyle = skin; for (const [, h] of list) g.fillRect(h[0] - 2, h[1] - 2, 4, 4); }
    };
    arms([armR, armL].filter(hidden));

    // ---- lower body
    const liftL = sit ? 0 : mv * Math.max(0, sq), liftR = sit ? 0 : mv * Math.max(0, -sq);
    const fLx = LS * 5.2, fRx = -LS * 5.2, fLy = -liftL * 6, fRy = -liftR * 6;
    if (sit) {
      if (!front) { /* seated seen from behind: legs are hidden */ } else if (low === 'saree' || low === 'burqa' || low === 'lungi') {
        const hem = low === 'lungi' ? -11 : -2;
        if (low === 'lungi') line(g, [LS * 6.5, hem, LS * 7, -2, -LS * 6.5, hem, -LS * 7, -2], skin, 4.4);
        fillPoly(g, [-12.8, -32, 12.8, -32, 12.5, hem, -12.5, hem], P.lowCol);
      } else {
        g.beginPath(); g.moveTo(LS * 6.5, -28); g.lineTo(LS * 7, -3); g.moveTo(-LS * 6.5, -28); g.lineTo(-LS * 7, -3);
        g.strokeStyle = low === 'shorts' || low === 'skirt' ? skin : P.lowCol; g.lineWidth = 6.6; g.stroke();
        fillRR(g, -12.8, -36, 25.6, 11, 5, P.lowCol);
      }
      if (front) { g.fillStyle = P.shoe; g.fillRect(LS * 7 - 3.4, -2.8, 6.8, 2.8); g.fillRect(-LS * 7 - 3.4, -2.8, 6.8, 2.8); }
    } else if (low === 'pants' || low === 'salwar') {
      g.beginPath();
      g.moveTo(LS * 4.6 + bx, hipY + 2); if (full) g.lineTo(fLx + bx * 0.4, -26 - liftL * 3); g.lineTo(fLx, fLy - 3);
      g.moveTo(-LS * 4.6 + bx, hipY + 2); if (full) g.lineTo(fRx + bx * 0.4, -26 - liftR * 3); g.lineTo(fRx, fRy - 3);
      g.strokeStyle = P.lowCol; g.lineWidth = low === 'salwar' ? 8.8 : 7.4; g.stroke();
    } else if (low === 'lungi' || low === 'shorts' || low === 'skirt') {
      const hem = low === 'lungi' ? -14 : -30;
      g.beginPath(); g.moveTo(fLx * 0.85 + bx * 0.5, hem - 2); g.lineTo(fLx, fLy - 2); g.moveTo(fRx * 0.85 + bx * 0.5, hem - 2); g.lineTo(fRx, fRy - 2);
      g.strokeStyle = skin; g.lineWidth = 4.4; g.stroke();
      if (P.kind === 'kid' && full) { g.fillStyle = '#f7f7f7'; g.fillRect(fLx - 2.4, fLy - 8, 4.8, 5); g.fillRect(fRx - 2.4, fRy - 8, 4.8, 5); }
      const w = low === 'lungi' ? 11.8 : low === 'skirt' ? 13.5 : 11, sway = sq * 1.2 * mv;
      fillPoly(g, [-10.4 + bx, waistY + 1.5, 10.4 + bx, waistY + 1.5, w + bx + sway, hem - liftR * 2.5, -w + bx + sway, hem - liftL * 2.5], P.lowCol);
      if (low === 'lungi' && full) {
        g.beginPath(); g.moveTo(-10.8 + bx, waistY + 12); g.lineTo(11 + bx, waistY + 12); g.moveTo(-11.2 + bx, waistY + 26); g.lineTo(11.4 + bx, waistY + 26);
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.6; g.stroke();
      }
    } else if (low === 'saree') {
      const sway = sq * 1.4 * mv;
      fillPoly(g, [-10.2 + bx, waistY + 1, 10.2 + bx, waistY + 1, 13.4 + sway, -2.5 - liftR * 1.5, -13.4 + sway, -2.5 - liftL * 1.5], P.lowCol);
      if (full) {
        g.beginPath(); g.moveTo(-12.8 + sway, -4.6 - liftL * 1.5); g.lineTo(12.8 + sway, -4.6 - liftR * 1.5);
        g.strokeStyle = P.paar; g.lineWidth = 3.2; g.stroke();
        if (front) {
          g.beginPath(); for (let i = 0; i < 2; i++) { g.moveTo(-LS * (1.5 + i * 3) + bx, waistY + 8); g.lineTo(-LS * (2 + i * 3.6) + sway, -8); }
          g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.2; g.stroke();
        }
      }
    }
    if (!sit && low !== 'burqa' && full) { g.fillStyle = P.shoe; g.fillRect(fLx - 3.2, fLy - 2.6, 6.4, 2.8); g.fillRect(fRx - 3.2, fRy - 2.6, 6.4, 2.8); }

    // ---- torso
    const tl = P.topLen;
    const hemY = tl === 'long' ? (sit ? -30 : -27 + by * 0.5) : tl === 'burqa' ? (sit ? -2 : -1.5) : tl === 'tuck' ? waistY + 2 : hipY + 3;
    const hemW = tl === 'long' ? 13 : tl === 'burqa' ? 15.8 : 10.8;
    g.beginPath();
    g.moveTo(-12.4 + bx, shY + 1.5); g.quadraticCurveTo(bx, shY - 1.4, 12.4 + bx, shY + 1.5);
    g.lineTo(10.2 + bx, waistY); g.lineTo(hemW + bx * 0.5, hemY); g.lineTo(-hemW + bx * 0.5, hemY); g.lineTo(-10.2 + bx, waistY); g.closePath();
    g.fillStyle = full ? torsoFill(g, top) : top; g.fill();
    if (full) { g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke(); }
    if (full) {
      if (front && (tl === 'shirt' || tl === 'tuck')) fillPoly(g, [-4 + bx, shY - 0.6, bx, shY + 5.5, 4 + bx, shY - 0.6], shade(top, -0.3));
      else if (front && tl === 'long' && P.kind !== 'woman') { g.fillStyle = shade(top, -0.18); g.fillRect(-0.7 + bx, shY, 1.4, 15); }
      if (tl === 'tuck') { g.fillStyle = '#1b1b1b'; g.fillRect(-10.4 + bx, waistY + 1, 20.8, 2.4); }
    }
    if (P.bib) { g.fillStyle = P.bib; g.fillRect(-7 + bx, shY + 7, 14, waistY - shY - 5); }
    // drapes
    if (P.drape === 'anchal') {
      if (front) fillPoly(g, [-LS * 11 + bx, hipY + 4, -LS * 3.5 + bx, hipY + 6, LS * 13 + bx, shY + 3, LS * 7.5 + bx, shY - 1.8], P.lowCol);
      else fillPoly(g, [LS * 12.6 + bx, shY + 1, LS * 4.5 + bx, shY - 1.2, -LS * 9.5 + bx, hipY + 12, -LS * 12.5 + bx, hipY + 16, -LS * 11.5 + bx, hipY], P.lowCol);
    } else if (P.drape === 'orna') {
      if (front) {
        g.beginPath(); g.moveTo(-11.8 + bx, shY + 1); g.quadraticCurveTo(bx, shY + 17, 11.8 + bx, shY + 1); g.lineTo(8 + bx, shY - 1);
        g.quadraticCurveTo(bx, shY + 9, -8 + bx, shY - 1); g.closePath(); g.fillStyle = P.drapeCol; g.fill();
      } else { g.fillStyle = P.drapeCol; g.fillRect(-10.5 + bx, shY, 5, 27); g.fillRect(5.5 + bx, shY, 5, 27); }
    } else if (P.drape === 'gamcha') {
      g.fillStyle = '#d62828'; g.fillRect(LS * 8.5 - 3.5 + bx, shY - 1, 7, 22);
      if (full) { g.fillStyle = 'rgba(255,240,220,0.8)'; g.fillRect(LS * 8.5 - 0.8 + bx, shY, 1.6, 21); }
    }
    // things on the back (back view) or straps (front view)
    if (!front) {
      if (acc === 'backpack') { fillRR(g, -9 + bx, shY + 3, 18, 23, 4, P.accCol); if (full) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-9 + bx, shY + 10, 18, 1.6); } }
      else if (acc === 'sack') ell(g, -LS * 6.5 + bx, shY + 7, 12.5, 19, P.accCol, LS * 0.2);
      if (P.head === 'long' && P.braid) line(g, [hx, headY + 4, hx + 0.6, shY + 24], HAIR, 4.2);
      if (P.head === 'braids') { g.beginPath(); g.moveTo(hx - 4, headY + 3); g.lineTo(hx - 5, shY + 9); g.moveTo(hx + 4, headY + 3); g.lineTo(hx + 5, shY + 9); g.strokeStyle = HAIR; g.lineWidth = 3; g.stroke(); }
    } else if (acc === 'backpack' && full) { g.fillStyle = shade(P.accCol, -0.3); g.fillRect(-8.2 + bx, shY + 0.5, 2, 15); g.fillRect(6.2 + bx, shY + 0.5, 2, 15); }

    // ---- arms
    arms([armR, armL].filter((a) => !hidden(a)));

    // ---- head
    if (full) { g.fillStyle = skin; g.fillRect(hx - 2.3, shY - 5.5, 4.6, 6.5); }
    const head = P.head;
    if (head === 'hijab' || head === 'veil') {
      const hc = P.headCol;
      fillPoly(g, [hx - hr - 2, headY + 3, hx + hr + 2, headY + 3, hx + 12.6, shY + 5, hx - 12.6, shY + 5], hc);
      ell(g, hx, headY + 0.8, hr + 2.6, hr + 3.4, hc);
      if (front) ell(g, hx, headY + 1.3, hr - 1.6, hr - 0.5, skin);
      if (head === 'veil' && front && full) { g.fillStyle = HAIR; g.fillRect(hx - 4, headY - hr + 1.8, 8, 1.8); }
    } else {
      circ(g, hx, headY, hr, skin);
      if (front) { g.beginPath(); g.arc(hx, headY - 0.6, hr + 0.5, PI * 1.02, PI * 1.98); g.closePath(); g.fillStyle = HAIR; g.fill(); }
      else circ(g, hx, headY - 0.9, hr + 0.3, HAIR);
      if (head === 'long') {
        if (front) { g.fillStyle = HAIR; g.fillRect(hx - hr - 0.9, headY - 1.5, 2.8, 11.5); g.fillRect(hx + hr - 1.9, headY - 1.5, 2.8, 11.5); }
        else if (!P.braid) circ(g, hx, headY + 3.6, 3.9, HAIR);
      } else if (head === 'tupi') {
        g.beginPath(); g.arc(hx, headY - 1.4, hr + 0.3, PI * 1.08, PI * 1.92); g.closePath(); g.fillStyle = '#f4f4ee'; g.fill();
      } else if (head === 'braids') {
        g.fillStyle = P.headCol; g.fillRect(hx - hr - 1.5, headY + 1, 3, 3); g.fillRect(hx + hr - 1.5, headY + 1, 3, 3);
      }
      if (front && full) {
        g.fillStyle = '#1a100a'; g.fillRect(hx - 3.3, headY + 0.3, 1.6, 1.8); g.fillRect(hx + 1.7, headY + 0.3, 1.6, 1.8);
        if (P.stache) g.fillRect(hx - 2.8, headY + 3.7, 5.6, 1.3);
        if (P.beard) { g.beginPath(); g.arc(hx, headY + 1.4, hr - 0.3, PI * 0.1, PI * 0.9); g.closePath(); g.fillStyle = P.beardCol; g.fill(); }
        if (P.bindi) { g.fillStyle = '#d00000'; g.fillRect(hx - 0.7, headY - 3.6, 1.4, 1.4); }
      }
    }

    // ---- things held
    if (acc === 'umbrella') {
      const ux = hR[0] + LS * 1.5, uy = -121 + by;
      g.beginPath(); g.moveTo(ux - 31, uy + 13); g.quadraticCurveTo(ux - 30, uy - 4, ux, uy - 5); g.quadraticCurveTo(ux + 30, uy - 4, ux + 31, uy + 13);
      if (full) {
        g.quadraticCurveTo(ux + 23, uy + 8.5, ux + 15.5, uy + 13); g.quadraticCurveTo(ux + 8, uy + 8.5, ux, uy + 13);
        g.quadraticCurveTo(ux - 8, uy + 8.5, ux - 15.5, uy + 13); g.quadraticCurveTo(ux - 23, uy + 8.5, ux - 31, uy + 13);
      }
      g.closePath(); g.fillStyle = P.accCol; g.fill();
      if (full) {
        g.beginPath(); g.moveTo(ux, uy - 10); g.lineTo(ux, uy - 5); g.lineTo(ux - 15.5, uy + 13); g.moveTo(ux, uy - 5); g.lineTo(ux + 15.5, uy + 13);
        g.moveTo(ux, uy + 13); g.lineTo(hR[0], hR[1]);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.1; g.stroke();
      }
    } else if (acc === 'bag') {
      const x = hL[0], y = hL[1], sw = sq * 0.7 * mv;
      if (full) fillPoly(g, [x - 4.6, y + 2.5, x + 4.6, y + 2.5, x + 6.4 + sw, y + 16, x - 6.4 + sw, y + 16], P.accCol);
      else { g.fillStyle = P.accCol; g.fillRect(x - 5.5, y + 2.5, 11, 13); }
    } else if (acc === 'phone') { g.fillStyle = '#111'; g.fillRect(hR[0] - 1.4, hR[1] - 3.8, 2.8, 5.6); }
    else if (acc === 'phoneLook' && front) { g.fillStyle = '#111'; g.fillRect(bx - 2.5, shY + 10.5, 5, 7.5); }
    else if (acc === 'basket') {
      const G = P.goods, yb = headY - hr - 2.6;
      g.beginPath(); g.ellipse(hx, yb - 1.5, 16, 8.5, 0, PI, TAU); g.closePath(); g.fillStyle = G[0]; g.fill();
      if (full) { g.beginPath(); for (let i = 0; i < 5; i++) { const x = hx - 11 + i * 5.5; g.moveTo(x + 1.6, yb - 4 - (i % 2) * 2.5); g.arc(x, yb - 4 - (i % 2) * 2.5, 1.6, 0, TAU); } g.fillStyle = G[1]; g.fill(); }
      ell(g, hx, yb, 21, 4.6, '#a8793f');
    }
    if (o.act === 'cup') { g.fillStyle = '#efe8d6'; g.fillRect(hR[0] - 1.9, hR[1] - 5, 3.8, 5); if (full) { g.fillStyle = '#b07a44'; g.fillRect(hR[0] - 1.6, hR[1] - 4.8, 3.2, 1.3); } }
    else if (o.act === 'shake') { g.fillStyle = '#c9ced4'; g.fillRect(hR[0] - 3, hR[1] - 8, 6, 9); }
  }

  // Exact canvas-call cost of a drawing, measured once on a counting stub (for the call governor).
  const STUB = (() => {
    const o = { n: 0, isStub: true };
    const f = () => { o.n++; };
    const gr = { addColorStop: f };
    for (const k of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fill', 'stroke',
      'fillRect', 'strokeRect', 'quadraticCurveTo', 'bezierCurveTo', 'translate', 'scale', 'rotate', 'setLineDash', 'fillText',
      'strokeText', 'drawImage', 'clip', 'setTransform', 'transform']) o[k] = f;
    o.createLinearGradient = () => gr; o.createRadialGradient = () => gr; o.measureText = () => ({ width: 10 });
    return o;
  })();
  function costOf(obj, key, fn) {
    const c = obj._cost || (obj._cost = {});
    let n = c[key];
    if (n === undefined) { STUB.n = 0; fn(STUB); n = c[key] = STUB.n; }
    return n;
  }
  // (+4 at full detail: the torso gradient is created once per context and colour)
  const figCost = (P, tier, front, sit, act) => costOf(P, `f${tier}${front ? 1 : 0}${sit ? 1 : 0}${act || ''}`, (g) => figure(g, P, { front, tier, sit, act, mv: 1, q: 0.5 })) + (tier ? 0 : 4);

  // Side view walking toward +x (the caller mirrors for −x); same units as figure().
  function profile(g, P, q, mv, full, raise) {
    const skin = P.skin, low = P.low;
    const leg = (ph) => {
      const a = Math.sin(ph) * 0.5 * mv, bend = Math.max(0, Math.cos(ph)) * 0.95 * mv, sh = a - bend;
      const kx = Math.sin(a) * 23, ky = Math.cos(a) * 23;
      return [kx, ky, kx + Math.sin(sh) * 23, ky + Math.cos(sh) * 23];
    };
    const A = leg(q), B = leg(q + PI);
    const hipY = -Math.max(A[3], B[3]) - 3, shY = hipY - 31, headY = shY - 11;
    const legs = (L, col, w) => { g.beginPath(); g.moveTo(0, hipY); g.lineTo(L[0], hipY + L[1]); g.lineTo(L[2], hipY + L[3]); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
    const foot = (L, col) => { g.fillStyle = col; g.fillRect(L[2] - 1.5, hipY + L[3] - 1, 6.5, 3); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const skirt = low === 'saree' || low === 'burqa' || low === 'lungi';
    const legCol = low === 'pants' || low === 'salwar' ? P.lowCol : skin;
    const ar = -Math.sin(q) * 0.55 * mv; // arm swing opposite to the near leg
    // far arm and far leg
    line(g, [1, shY + 3, Math.sin(-ar) * 13, shY + 3 + Math.cos(-ar) * 13, Math.sin(-ar + 0.35) * 26, shY + 3 + Math.cos(-ar + 0.35) * 26], shade(P.sleeve === 'long' ? P.top : skin, -0.25), 4.2);
    legs(B, shade(legCol, -0.25), low === 'salwar' ? 8 : 6.5); foot(B, '#1c1c1c');
    // near leg
    legs(A, legCol, low === 'salwar' ? 8.4 : 6.8); foot(A, P.shoe);
    if (skirt) {
      const hemY = low === 'lungi' ? hipY + 32 : hipY + 45, spread = Math.max(Math.abs(A[2]), Math.abs(B[2])) * 0.55 + 6;
      fillPoly(g, [-6.5, hipY - 7, 6.5, hipY - 7, spread, hemY, -spread, hemY], P.lowCol);
      if (low === 'saree' && full) fillPoly(g, [-spread, hemY, spread, hemY, spread - 0.5, hemY - 4, -spread + 0.5, hemY - 4], P.paar);
    }
    // torso
    const hemT = P.topLen === 'long' ? hipY + 20 : P.topLen === 'burqa' ? hipY + 45 : hipY + 3;
    fillPoly(g, [-6.2, shY + 1, 6.4, shY + 1, 7, hipY - 5, P.topLen === 'long' ? 9 : 7, hemT, P.topLen === 'long' ? -8 : -6.5, hemT, -6.5, hipY - 5], P.top);
    if (P.drape === 'anchal') fillPoly(g, [-7, shY, 3, shY - 1, -2, hipY + 14, -8, hipY + 18], P.lowCol);
    else if (P.drape === 'orna') line(g, [-5, shY, 5, shY + 9, 1, shY + 1, -8, shY + 24], P.drapeCol, 3);
    // head
    circ(g, 1.6, headY, 7.3, skin);
    if (P.head === 'hijab' || P.head === 'veil') {
      g.beginPath(); g.arc(1.2, headY + 0.5, 9.4, PI * 0.35, PI * 1.72); g.lineTo(-7, shY + 6); g.closePath(); g.fillStyle = P.headCol; g.fill();
    } else {
      g.beginPath(); g.arc(1.2, headY - 0.6, 7.9, PI * 0.62, PI * 1.9); g.closePath(); g.fillStyle = HAIR; g.fill();
      if (P.head === 'long') circ(g, -6, headY + 2, 3.8, HAIR);
    }
    if (full) { g.fillStyle = '#1a100a'; g.fillRect(4.6, headY - 0.8, 1.6, 1.6); fillPoly(g, [8.4, headY - 0.5, 10.4, headY + 2.6, 8.2, headY + 2.8], skin); }
    // near arm (raised to stop the traffic, palm out)
    const sx = 0.5, sy = shY + 3;
    if (raise) { line(g, [sx, sy, 9, sy - 6, 16, sy - 15], P.sleeve === 'long' ? P.top : skin, 4.4); g.fillStyle = skin; g.fillRect(14.5, sy - 21, 4, 6.5); }
    else line(g, [sx, sy, sx + Math.sin(ar) * 13, sy + Math.cos(ar) * 13, sx + Math.sin(ar + 0.35) * 26, sy + Math.cos(ar + 0.35) * 26], P.sleeve === 'long' ? P.top : skin, 4.4);
  }

  // Stray dog in side view (it reads far better than end-on), local units, ~28 at the shoulder, facing
  // o.face (±1). D = { c, d (darker), ear (floppy), ph }; o.view 'trot' | 'lie'.
  function dog(g, D, o) {
    const q = o.q || 0, mv = o.mv || 0, t = o.t || 0, full = !o.tier, ph = D.ph;
    g.scale((o.face < 0 ? -1 : 1) * 0.86, 1);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (o.view === 'lie') {
      const lift = Math.max(0, Math.sin(t * 0.35 + ph) - 0.55) * 14;
      ell(g, -12, -10, 15, 10, D.c);                       // haunch
      ell(g, 2, -8.5, 22, 8, D.c);                          // body
      fillRR(g, 12, -5.5, 22, 5.5, 2.7, D.c);               // front paws stretched out
      if (full) { g.beginPath(); g.arc(-12, -8, 22, PI * 0.55, PI * 0.95); g.strokeStyle = D.d; g.lineWidth = 3; g.stroke(); } // tail round the rump
      const hy = -12 - lift;
      circ(g, 25, hy, 7.6, D.c);
      ell(g, 32.5, hy + 2.6, 6.2, 4, shade(D.c, 0.12));
      if (D.ear) ell(g, 21.5, hy - 1, 3, 6, D.d, 0.5); else fillPoly(g, [20, hy - 4.5, 21.5, hy - 12, 26, hy - 5.5], D.d);
      if (full) { g.fillStyle = '#111'; g.fillRect(37.2, hy + 1.2, 2.4, 2.2); g.fillRect(27.5, hy - 2, lift > 2 ? 2 : 2.8, lift > 2 ? 2 : 0.9); }
      return;
    }
    const bob = -Math.abs(Math.sin(q)) * 1.2 * mv;
    const legs = (sgn, col) => { // one diagonal pair per call: front leg and the opposite hind leg
      const a = Math.sin(q) * 0.5 * mv * sgn;
      g.beginPath();
      g.moveTo(18, -24 + bob); g.lineTo(18 + Math.sin(a) * 12, -12); g.lineTo(18 + Math.sin(a) * 22, -Math.max(0, Math.sin(q * sgn)) * 4 * mv);
      g.moveTo(-18, -26 + bob); g.lineTo(-14 - Math.sin(a) * 10, -13); g.lineTo(-19 - Math.sin(a) * 18, -Math.max(0, -Math.sin(q * sgn)) * 4 * mv);
      g.strokeStyle = col; g.lineWidth = 4.3; g.stroke();
    };
    legs(-1, D.d);
    const w = Math.sin(t * 9 + ph) * 5;
    line(g, [-24, -31 + bob, -32, -40 + bob + w * 0.3, -30 + w * 0.4, -48 + bob], D.c, 3.4);
    ell(g, 0, -30 + bob, 25, 9.5, D.c);
    ell(g, 14, -29 + bob, 11, 10.5, D.c);
    if (full) ell(g, 4, -24 + bob, 14, 4, shade(D.c, 0.18));
    legs(1, D.c);
    // neck and head
    fillPoly(g, [16, -36 + bob, 26, -46 + bob, 32, -40 + bob, 22, -28 + bob], D.c);
    circ(g, 30, -44 + bob, 7.4, D.c);
    ell(g, 37.5, -41.5 + bob, 6.4, 4, shade(D.c, 0.12));
    if (D.ear) ell(g, 26.5, -45 + bob, 3, 6.4, D.d, 0.4); else fillPoly(g, [25, -48 + bob, 27, -57 + bob, 31, -49 + bob], D.d);
    if (full) { g.fillStyle = '#111'; g.fillRect(42.2, -43.4 + bob, 2.4, 2.2); g.fillRect(31.4, -46.6 + bob, 1.8, 1.8); }
  }

  // Jhalmuri push-cart seen end-on, local units, ground y = 0.
  function cart(g, full) {
    ell(g, -22, -10, 2.6, 10, '#222'); ell(g, 22, -10, 2.6, 10, '#222');
    g.fillStyle = '#3b2a1c'; g.fillRect(-20, -30, 3, 22); g.fillRect(17, -30, 3, 22);
    fillRR(g, -26, -64, 52, 36, 3, '#b0703a');
    g.fillStyle = '#c1121f'; g.fillRect(-26, -54, 52, 11);
    label(g, 'ঝালমুড়ি', 0, -48.5, 8, '#fff7e0', 48);
    fillRR(g, -23, -82, 46, 18, 2, 'rgba(210,235,245,0.6)');
    if (full) {
      circ(g, -14, -71, 4.5, '#e63946'); circ(g, -4, -71, 4.5, '#ffd23f'); circ(g, 6, -71, 4.5, '#6a994e'); circ(g, 15, -71, 4, '#d4a373');
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.8; g.strokeRect(-23, -82, 46, 18);
    }
    fillRR(g, 9, -98, 12, 16, 2, '#c9ced4');
    g.fillStyle = '#5b3a1f'; g.fillRect(-19, -92, 5, 10);
    circ(g, -16.5, -95, 2.4, '#ffcc4d');
  }

  // ---------- vehicle looks ----------
  function hangLook(r) { return makeLook(r, 'walker'); }
  function lookBus(r, dd) {
    const cols = dd ? [pick(r, ['#c8102e', '#b5121b', '#d0142c']), '#f3e7c9', '#1b1b1b'] : pick(r, BUS_COLS);
    const L = {
      kind: 'bus', dd, W: dd ? 146 : 144, H: dd ? 262 : 182, len: dd ? 600 : 560, cols, body: cols[0], seed: (r() * 1e9) | 0,
      name: pick(r, BUS_NAMES), route: pick(r, ROUTES), plateNo: plateNo(r), nameCol: cols[1] === '#f0f0f0' || cols[1] === '#ffffff' ? '#ffffff' : cols[1],
      ladder: !dd && r() < 0.7, bent: r() < 0.5, crack: r() < 0.3, curtains: r() < 0.5,
      bumper: dd ? (r() < 0.3 ? 1 : 0) : r() < 0.85 ? 1 + (r() < 0.45 ? 1 : 0) : 0, door: !dd && r() < 0.9, roof: !dd && r() < 0.22 ? 2 : 0,
      pipe: [-47.5, 25], smoke: 'dark', solid: true, cls: 'ব', green: true, spd: dd ? [220, 320] : KIND.bus.v,
    };
    if (L.name === L.route) L.name = BUS_NAMES[0];
    L.ml = L.door ? 44 : 4; L.mr = 4; L.mt = L.roof ? 70 : 4;
    L.win = dd ? [-60, -L.H + 12, 120, 44] : [-61, -L.H + 13, 122, 49];
    L.win2 = dd ? [-60, -170, 120, 44] : null;
    L.tails = [[-71, -74, 10, 14], [61, -74, 10, 14], [-71, -51, 10, 10], [61, -51, 10, 10]];
    L.inds = [[-71, -59, 10, 7], [61, -59, 10, 7]];
    L.sideWin = dd ? [[20, L.len - 120, 16, 58], [20, L.len - 120, 92, 134]] : [[16, L.len - 118, 30, 76]];
    L.hang = [hangLook(r), hangLook(r), hangLook(r), hangLook(r), hangLook(r), hangLook(r)];
    return L;
  }
  function lookTruck(r) {
    const base = pick(r, TRUCK_BASE);
    let trim = pick(r, ['#c1121f', '#1d3557', '#ffd23f', '#2b9348', '#ffffff']);
    if (trim === base) trim = '#1b1b1b';
    const L = {
      kind: 'truck', W: 140, H: 212, len: 430, base, trim, body: base, tarp: pick(r, TARPS), cab: pick(r, ['#1f6fb2', '#c0392b', '#2e8b57', '#f4c20d', '#ecebe2']),
      art: [pick(r, ART), pick(r, ART), pick(r, ART)], scene: (r() * 3) | 0, line: pick(r, TRUCK_LINES), top: pick(r, TRUCK_TOPS),
      seed: (r() * 1e9) | 0, plateNo: plateNo(r), cls: 'ট', green: true, load: r() < 0.5 ? 'sacks' : 'crates', rider: r() < 0.35,
      pipe: [-40, 30], smoke: 'dark', solid: true, spd: KIND.truck.v,
    };
    L.ml = 4; L.mr = 4; L.mt = L.rider ? 36 : 4;
    L.tails = [[-68, -56, 9, 9], [59, -56, 9, 9]];
    L.inds = [[-58, -55, 6, 8], [52, -55, 6, 8]];
    L.win = null; L.sideWin = null;
    L.riderLook = hangLook(r);
    return L;
  }
  function lookCng(r) {
    const L = {
      kind: 'cng', W: 84, H: 106, len: 150, body: pick(r, ['#1e8f4e', '#1b8a47', '#229954']), top: pick(r, ['#17603a', '#1a1a1a', '#1d5c3a']),
      seed: (r() * 1e9) | 0, plateNo: plateNo(r), cls: 'থ', green: true, pipe: [-29, 17], smoke: 'light', spd: KIND.cng.v, sticker: r() < 0.6 ? pick(r, TRUCK_TOPS) : null,
    };
    L.ml = 4; L.mr = 4; L.mt = 4;
    L.tails = [[-38.4, -43.4, 6.8, 6.8], [31.6, -43.4, 6.8, 6.8]];
    L.inds = [[-38, -52, 6, 4], [32, -52, 6, 4]];
    L.win = [-19, -97, 38, 22];
    L.pax = [makeLook(r, 'walker'), makeLook(r, 'woman'), makeLook(r, 'walker')];
    return L;
  }
  function lookCar(r, type) {
    const taxi = type === 'taxi', micro = type === 'micro';
    const L = {
      kind: 'car', taxi, micro, W: micro ? 108 : 104, H: micro ? 122 : taxi ? 100 : 90, len: micro ? 300 : 270,
      body: taxi ? '#f5c518' : micro ? pick(r, ['#f4f4f0', '#dcdcd6', '#f1f1ec']) : pick(r, CAR_COLS), seed: (r() * 1e9) | 0,
      plateNo: plateNo(r), cls: taxi ? 'চ' : micro ? 'চ' : 'গ', green: taxi, pipe: [-38, 16], smoke: taxi && r() < 0.6 ? 'light' : null,
      sticker: !taxi && r() < 0.25 ? pick(r, ['প্রেস', 'ডাক্তার', 'সাংবাদিক']) : null, pax: r() < 0.6, spd: KIND.car.v,
    };
    L.ml = 4; L.mr = 4; L.mt = 4;
    if (micro) { L.tails = [[-54, -72, 7, 24], [47, -72, 7, 24]]; L.inds = [[-54, -47, 7, 5], [47, -47, 7, 5]]; L.win = [-44, -114, 88, 42]; }
    else { L.tails = [[-51, -54, 18, 7], [33, -54, 18, 7]]; L.inds = [[-51, -47, 8, 3], [43, -47, 8, 3]]; L.win = null; }
    L.heads = [makeLook(r, 'walker'), makeLook(r, r() < 0.5 ? 'woman' : 'walker'), makeLook(r, 'walker')];
    return L;
  }
  function lookBike(r, type) {
    const L = {
      kind: 'bike', type, W: 44, H: 112, len: 125, body: pick(r, BIKE_COLS), seed: (r() * 1e9) | 0, plateNo: plateNo(r), cls: 'ল', green: false,
      helmet: pick(r, HELMETS), helmet2: r() < 0.55 ? pick(r, HELMETS) : null, rider: makeLook(r, 'walker'), pil: makeLook(r, type === 'side' || type === 'hijab' ? 'woman' : 'walker'),
      box: pick(r, ['#e63946', '#ff7b25', '#ffd23f', '#2a9d8f']), pipe: [11, 22], smoke: null, spd: KIND.bike.v,
    };
    if (type === 'hijab') { L.pil.head = 'hijab'; L.pil.low = 'salwar'; L.helmet2 = null; }
    if (type === 'side' && L.pil.low !== 'saree') { L.pil.low = 'saree'; L.pil.lowCol = pick(r, SAREES); L.pil.paar = pick(r, PAAR); L.pil.drape = 'anchal'; L.pil.topLen = 'blouse'; L.pil.head = 'long'; }
    L.ml = 12; L.mr = 12; L.mt = 4;
    L.tails = [[-5, -48, 10, 4]]; L.inds = [[-11, -47, 4, 3], [7, -47, 4, 3]]; L.win = null;
    return L;
  }

  // ---------- vehicle art (painted once into textures; local units, ground y = 0) ----------
  // Rear textures are seen front-on from behind (x right). Side textures are the vehicle's right side seen
  // from the road, painted with the rear at x = 0 and the front at x = len.
  function sitter(g, P, x, y, s) { g.save(); g.translate(x, y); g.scale(s, s); figure(g, P, { front: false, sit: true }); g.restore(); }
  function hangers(g, L) {
    const T = -L.H;
    if (L.roof) { sitter(g, L.hang[4], -30, T + 30, 0.95); sitter(g, L.hang[5], 22, T + 30, 0.95); }
    for (let i = 0; i < L.bumper; i++) { // standing on the rear bumper, clinging to the window frame
      const x = i === 0 ? -26 : 14;
      g.save(); g.translate(x, -31); g.scale(0.95, 0.95);
      const wb = (L.win2 || L.win)[1] + (L.win2 || L.win)[3] + 4;
      figure(g, L.hang[i], { front: false, hand: { R: [9, (wb + 31) / 0.95], L: [-10, (wb + 35) / 0.95] } });
      g.restore();
    }
    if (L.door) { // the helper hanging out of the door, leaning out, waving the traffic on
      g.save(); g.beginPath(); g.rect(-200, -400, 128.5, 500); g.clip();
      g.save(); g.translate(-70, -33); g.rotate(-0.17); figure(g, L.hang[3], { front: false, hand: { R: [4, -92], L: [-12, -60] } }); g.restore();
      g.translate(-64, -31); g.rotate(-0.36);
      figure(g, L.hang[2], { front: false, hand: { R: [9, -96], L: [-24, -84] } });
      g.restore();
    }
  }
  function artBusRear(g, L) {
    const r = TH.mulberry32(L.seed + 11);
    const [body, stripe, accent] = L.cols;
    const T = -L.H, dd = L.dd;
    tyreBack(g, -69, -31, 27, 31); tyreBack(g, 42, -31, 27, 31);
    g.fillStyle = '#1b1b1f'; g.fillRect(-56, -37, 112, 13);
    const shell = () => {
      g.beginPath(); g.moveTo(-72, -25); g.lineTo(-72, T + 16); g.quadraticCurveTo(-72, T, -56, T);
      g.lineTo(56, T); g.quadraticCurveTo(72, T, 72, T + 16); g.lineTo(72, -25); g.closePath();
    };
    shell(); g.fillStyle = vgrad(g, T, -25, [0, shade(body, 0.18), 0.5, body, 1, shade(body, -0.28)]); g.fill();
    g.save(); shell(); g.clip();
    if (dd) {
      g.fillStyle = stripe; g.fillRect(-72, T + 62, 144, 20); g.fillRect(-72, -66, 144, 5);
      g.fillStyle = shade(body, -0.35); for (let i = 0; i < 6; i++) g.fillRect(-40, -84 + i * 5, 80, 2.2); // engine grille
    } else {
      fillPoly(g, [-72, T + 96, 0, T + 72, 72, T + 44, 72, T + 58, 0, T + 86, -72, T + 110], stripe);
      fillPoly(g, [-72, T + 112, 0, T + 88, 72, T + 60, 72, T + 65, 0, T + 93, -72, T + 117], accent);
      g.fillStyle = stripe; g.fillRect(-72, -71, 144, 11);
      g.fillStyle = accent; g.fillRect(-72, -58, 144, 3.5);
    }
    g.fillStyle = vgrad(g, -66, -25, [0, 'rgba(70,52,34,0)', 1, 'rgba(70,52,34,0.42)']); g.fillRect(-72, -66, 144, 42);
    ell(g, -47, -44, 15, 24, 'rgba(15,15,15,0.3)');
    wear(g, r, -68, 64, T + 66, -34, dd ? 3 : 5);
    g.restore();
    shell(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    // rear windows crammed with standing passengers
    const win = (W, rows) => {
      const [wx, wy, ww, wh] = W;
      fillRR(g, wx - 2.5, wy - 2.5, ww + 5, wh + 5, 6, '#151515');
      g.save(); rr(g, wx, wy, ww, wh, 4); g.clip();
      g.fillStyle = vgrad(g, wy, wy + wh, [0, '#3a4550', 1, '#232a31']); g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(235,245,255,0.55)'; g.fillRect(wx + 8, wy + 3, 36, 2); g.fillRect(wx + ww - 44, wy + 3, 36, 2);
      line(g, [wx, wy + 11, wx + ww, wy + 11], '#9aa3ab', 1.4);
      for (let row = 0; row < rows; row++) {
        const n = 7 + ((r() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const x = wx + 6 + ((i + r() * 0.8) * (ww - 12)) / n, y = wy + wh - 14 + r() * 8 - (i % 2) * 5 - row * 9;
          if (r() < 0.35) line(g, [x + 4, y + 6, x + 6, wy + 11], pick(r, SKINS), 3);
          fillRR(g, x - 10, y + 5, 20, 26, 7, pick(r, SHIRTS));
          circ(g, x, y, 6.6, pick(r, SKINS));
          if (r() < 0.2) circ(g, x, y + 0.4, 7.8, pick(r, SCARVES)); else circ(g, x, y - 1.3, 6.5, HAIR);
        }
      }
      g.fillStyle = 'rgba(40,55,70,0.3)'; g.fillRect(wx, wy, ww, wh);
      fillPoly(g, [wx + 14, wy + wh, wx + 40, wy, wx + 54, wy, wx + 28, wy + wh], 'rgba(255,255,255,0.1)');
      if (L.crack) {
        const cx = wx + ww * (0.6 + r() * 0.3), cy = wy + wh * (0.3 + r() * 0.4);
        g.beginPath(); for (let i = 0; i < 7; i++) { const a = r() * TAU, l = 8 + r() * 20; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); }
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.6; g.stroke();
      }
      g.restore();
      g.fillStyle = '#151515'; g.fillRect(-2, wy, 4, wh);
    };
    win(L.win, 1);
    if (L.win2) win(L.win2, 1);
    if (dd) {
      fillRR(g, -34, T + 84, 68, 11, 2, '#111');
      label(g, `${bn(pick(r, [6, 8, 12, 26]))}  ${pick(r, ['মতিঝিল', 'মিরপুর', 'গুলিস্তান', 'উত্তরা'])}`, 0, T + 89.8, 7.5, '#ffb627', 64);
    } else {
      fillRR(g, -64, T + 67, 128, 18, 3, shade(body, -0.32));
      g.strokeStyle = L.cols[1]; g.lineWidth = 1; g.stroke();
      label(g, L.name, 0, T + 76.5, 13.5, L.nameCol, 122, 'rgba(20,12,8,0.5)');
      fillRR(g, -44, T + 86, 88, 11, 2, 'rgba(255,250,235,0.92)');
      label(g, L.route, 0, T + 91.8, 7.4, '#b3121b', 84);
      fillRR(g, 30, -56, 26, 8, 1.5, '#ffffff'); label(g, 'সিটিং সার্ভিস', 43, -51.8, 4.6, '#1d3557', 25);
    }
    g.fillStyle = '#ffb627'; g.fillRect(-66, T + 3, 6, 3); g.fillRect(60, T + 3, 6, 3);
    for (const x of [-71, 61]) {
      fillRR(g, x - 1, -75, 12, 40, 2, '#1d1d21');
      g.fillStyle = '#9e1b1b'; g.fillRect(x, -74, 10, 14);
      g.fillStyle = '#c9790f'; g.fillRect(x, -59, 10, 7);
      g.fillStyle = '#7e1414'; g.fillRect(x, -51, 10, 10);
      g.fillStyle = '#dcdcd2'; g.fillRect(x + 2, -39.5, 6, 2.5);
    }
    fillPoly(g, [-75, -32, 75, -31, 75, -23, -75, -24], '#2a2a2e');
    if (L.bent) fillPoly(g, [-75, -32, -56, -31, -58, -24, -77, -20], '#202024');
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-74, -31.5, 148, 1.5);
    plate(g, -21, -50, 42, 15, L.cls, L.plateNo, true);
    fillRR(g, -53, -27, 11, 5, 2, '#3c3c3c'); ell(g, -47.5, -24.5, 3.5, 1.6, '#0c0c0c');
    if (L.ladder) {
      g.fillStyle = '#8f969c'; g.fillRect(46, T + 4, 2.4, 110); g.fillRect(57, T + 4, 2.4, 110);
      g.beginPath(); g.moveTo(52.6, T + 8); g.lineTo(52.6, T + 112); g.setLineDash([2.4, 9]); g.strokeStyle = '#8f969c'; g.lineWidth = 11; g.lineCap = 'butt'; g.stroke(); g.setLineDash([]); g.lineCap = 'round';
    }
    hangers(g, L);
  }
  function artBusSide(g, L) {
    const r = TH.mulberry32(L.seed + 23);
    const [body, stripe, accent] = L.cols;
    const len = L.len, T = -L.H, dd = L.dd, ax = [150, len - 100];
    const shell = () => {
      g.beginPath(); g.moveTo(1, -25); g.lineTo(1, T + 14); g.quadraticCurveTo(1, T, 15, T); g.lineTo(len - 26, T);
      g.quadraticCurveTo(len - 3, T + 1, len - 1, T + 22); g.lineTo(len - 1, -25); g.closePath();
    };
    shell(); g.fillStyle = vgrad(g, T, -25, [0, shade(body, 0.1), 0.5, shade(body, -0.06), 1, shade(body, -0.34)]); g.fill();
    g.save(); shell(); g.clip();
    if (dd) { g.fillStyle = stripe; g.fillRect(0, T + 64, len, 18); g.fillRect(0, -66, len, 5); }
    else {
      for (let x = -80; x < len; x += 190) {
        fillPoly(g, [x, -60, x + 90, -60, x + 170, T + 40, x + 150, T + 40], stripe);
        fillPoly(g, [x + 96, -60, x + 104, -60, x + 184, T + 40, x + 176, T + 40], accent);
      }
      g.fillStyle = stripe; g.fillRect(0, -71, len, 11);
      g.fillStyle = accent; g.fillRect(0, -58, len, 3.5);
    }
    g.fillStyle = vgrad(g, -68, -25, [0, 'rgba(70,52,34,0)', 1, 'rgba(70,52,34,0.45)']); g.fillRect(0, -68, len, 44);
    wear(g, r, 8, len - 30, T + 80, -34, dd ? 5 : 9);
    for (const x of ax) ell(g, x, -25, 38, 36, '#121215');
    g.restore();
    shell(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    // windows with seated and standing passengers, arms out, curtains
    for (const [o0, o1, y0, y1] of L.sideWin) {
      const n = Math.max(1, Math.round((o1 - o0) / 64)), pw = (o1 - o0) / n;
      for (let i = 0; i < n; i++) {
        const x = o0 + i * pw + 3, w = pw - 6, h = y1 - y0;
        fillRR(g, x - 2, T + y0 - 2, w + 4, h + 4, 4, '#151515');
        g.save(); rr(g, x, T + y0, w, h, 3); g.clip();
        g.fillStyle = vgrad(g, T + y0, T + y1, [0, '#3d4852', 1, '#262d34']); g.fillRect(x, T + y0, w, h);
        const k = 1 + (r() < 0.5 ? 1 : 0);
        for (let j = 0; j < k; j++) {
          const hx = x + (w * (j + 0.5)) / k + (r() - 0.5) * 6, hy = T + y1 - 15 - r() * 8 - (r() < 0.3 ? 12 : 0);
          fillRR(g, hx - 10, hy + 6, 20, 30, 7, pick(r, SHIRTS));
          circ(g, hx, hy, 6.8, pick(r, SKINS));
          g.beginPath(); g.arc(hx - 0.8, hy - 0.8, 7, PI * 0.7, PI * 1.95); g.closePath(); g.fillStyle = r() < 0.18 ? pick(r, SCARVES) : HAIR; g.fill();
        }
        if (L.curtains && r() < 0.6) { const c = pick(r, ['#d62828', '#2b9348', '#f4a261', '#7209b7']); g.fillStyle = c; g.fillRect(x, T + y0, 7, h); g.fillRect(x + w - 6, T + y0, 6, h * 0.8); }
        g.fillStyle = 'rgba(40,55,70,0.28)'; g.fillRect(x, T + y0, w, h);
        fillPoly(g, [x + 10, T + y1, x + 24, T + y0, x + 32, T + y0, x + 18, T + y1], 'rgba(255,255,255,0.1)');
        g.restore();
        if (r() < 0.22) line(g, [x + w * 0.5, T + y1 - 4, x + w * 0.5 + 4, T + y1 + 6, x + w * 0.5 + 2, T + y1 + 20], pick(r, SKINS), 3.4);
      }
    }
    if (!dd) {
      // driver's window at the front (right-hand drive: the driver sits on this side), elbow out
      const x = len - 108;
      fillRR(g, x - 2, T + 24, 80, 58, 4, '#151515');
      g.fillStyle = vgrad(g, T + 26, T + 80, [0, '#46525c', 1, '#2a3239']); g.fillRect(x, T + 26, 76, 54);
      fillRR(g, x + 28, T + 58, 24, 30, 8, pick(r, SHIRTS));
      circ(g, x + 40, T + 50, 7.2, pick(r, SKINS)); g.beginPath(); g.arc(x + 39, T + 49, 7.4, PI * 0.8, PI * 1.9); g.closePath(); g.fillStyle = HAIR; g.fill();
      line(g, [x + 32, T + 66, x + 18, T + 80, x + 30, T + 82], pick(r, SKINS), 4);
      label(g, L.name, len * 0.4, T + 94, 16, L.nameCol, len * 0.62, 'rgba(20,12,8,0.6)');
      label(g, L.route, len * 0.4, T + 112, 8, '#ffffff', len * 0.5, 'rgba(0,0,0,0.45)');
    } else label(g, 'দোতলা বাস', len * 0.45, -94, 13, '#f3e7c9', 200, 'rgba(0,0,0,0.4)');
    for (const x of ax) wheelSide(g, x, -30, 30, '#8b9096');
  }

  function artTruckRear(g, L) {
    const r = TH.mulberry32(L.seed + 31);
    const T = -L.H;
    tyreBack(g, -69, -36, 27, 36); tyreBack(g, 42, -36, 27, 36);
    g.fillStyle = '#18181b'; g.fillRect(-52, -46, 104, 12); ell(g, 0, -33, 13, 8, '#232327');
    for (const x of [-66, 51]) {
      g.fillStyle = '#16161a'; g.fillRect(x, -50, 15, 42);
      g.strokeStyle = L.art[1]; g.lineWidth = 1.4; g.strokeRect(x + 2, -48, 11, 37);
      flower(g, x + 7.5, -30, 3, L.art[0], '#ffffff');
    }
    // hanging chains (jhalor) under the bumper
    g.beginPath(); for (let x = -62; x <= 62; x += 7) { g.moveTo(x, -45); g.lineTo(x, -38 - (Math.abs(x) % 3)); } g.strokeStyle = '#c9ced4'; g.lineWidth = 0.8; g.stroke();
    // bumper board with warning stripes
    g.save(); g.beginPath(); g.rect(-70, -58, 140, 12); g.clip();
    g.fillStyle = '#d62828'; g.fillRect(-70, -58, 140, 12);
    g.beginPath(); for (let x = -84; x < 84; x += 12) { g.moveTo(x, -46); g.lineTo(x + 6, -46); g.lineTo(x + 12, -58); g.lineTo(x + 6, -58); g.closePath(); }
    g.fillStyle = '#f5f5f0'; g.fill();
    g.restore();
    circ(g, -63.5, -51.5, 4.4, '#8e1414'); circ(g, 63.5, -51.5, 4.4, '#8e1414');
    g.fillStyle = '#c9790f'; g.fillRect(-58, -55, 6, 8); g.fillRect(52, -55, 6, 8);
    plate(g, -17, -59, 34, 13, L.cls, L.plateNo, true);
    // painted tailgate: border, three panels, slogans
    fillRR(g, -70, -116, 140, 58, 2, L.base);
    g.strokeStyle = L.trim; g.lineWidth = 4; g.strokeRect(-67.5, -113.5, 135, 53);
    label(g, L.top, 0, -106, 8, L.trim, 120);
    for (const [x, k] of [[-62, 0], [-20, 1], [22, 2]]) {
      fillRR(g, x, -99, 40, 26, 2, k === 1 ? '#fff4d6' : shade(L.base, 0.35));
      g.strokeStyle = L.art[k]; g.lineWidth = 1.5; g.strokeRect(x + 1, -98, 38, 24);
      if (k === 1) scene(g, L.scene, x + 3, -96.5, 34, 21);
      else { flower(g, x + 20, -86, 6, L.art[k], '#ffd23f'); flower(g, x + 7, -93, 2.8, L.art[2 - k], '#fff'); flower(g, x + 33, -79, 2.8, L.art[2 - k], '#fff'); }
    }
    fillRR(g, -60, -70, 120, 9, 1.5, L.trim);
    label(g, L.line, 0, -65.4, 6.6, '#ffffff', 116);
    g.fillStyle = '#2a2a2a'; g.fillRect(-66, -62, 8, 3); g.fillRect(58, -62, 8, 3);
    // load and tarp above the tailgate, between painted posts
    if (L.load === 'sacks') { for (let i = 0; i < 9; i++) ell(g, -52 + (i % 5) * 26 + (i > 4 ? 13 : 0), -124 - (i > 4 ? 16 : 0), 15, 10, i % 2 ? '#cdb58a' : '#bfa577'); }
    else { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#9c6b3c' : '#b07c47'; g.fillRect(-60 + (i % 3) * 40, -136 - (i > 2 ? 18 : 0), 38, 18); } }
    g.beginPath(); g.moveTo(-68, -150); g.quadraticCurveTo(-70, T, -30, T + 2); g.lineTo(30, T + 2); g.quadraticCurveTo(70, T, 68, -150); g.closePath();
    g.fillStyle = vgrad(g, T, -150, [0, shade(L.tarp, 0.15), 1, shade(L.tarp, -0.2)]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.beginPath(); for (let i = 0; i < 4; i++) { const x = -60 + i * 40; g.moveTo(x, -150); g.lineTo(x + 40, T + 8); g.moveTo(x + 40, -150); g.lineTo(x, T + 8); }
    g.strokeStyle = 'rgba(240,230,200,0.7)'; g.lineWidth = 1.2; g.stroke();
    for (const x of [-70, 62]) { g.fillStyle = L.trim; g.fillRect(x, -158, 8, 44); g.fillStyle = L.art[0]; g.fillRect(x, -150, 8, 4); g.fillRect(x, -134, 8, 4); }
    fillRR(g, -70, -160, 140, 8, 2, L.trim);
    if (L.rider) sitter(g, L.riderLook, 8, T + 26, 0.95);
  }
  function artTruckSide(g, L) {
    const r = TH.mulberry32(L.seed + 37);
    const len = L.len, box = len - 112, T = -L.H;
    g.fillStyle = '#1a1a1d'; g.fillRect(6, -52, len - 12, 10);
    fillRR(g, box - 42, -66, 34, 18, 6, '#c3c9cf'); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(box - 42, -58, 34, 2);
    // painted wooden body
    fillRR(g, 0, -150, box, 92, 2, L.base);
    g.fillStyle = L.trim; g.fillRect(0, -150, box, 10); g.fillRect(0, -70, box, 8);
    for (let x = 0; x <= box; x += box / 5) { g.fillStyle = L.trim; g.fillRect(Math.min(box - 6, x), -150, 6, 92); }
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.5) * (box / 5);
      if (i === 2) scene(g, L.scene, x - 22, -128, 44, 34);
      else { flower(g, x, -112, 7, L.art[i % 3], '#ffd23f'); flower(g, x - 15, -128, 3, L.art[(i + 1) % 3], '#fff'); flower(g, x + 15, -96, 3, L.art[(i + 2) % 3], '#fff'); }
    }
    label(g, L.top, box * 0.5, -145, 8, '#ffffff', box * 0.6);
    g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(0, -150, box, 92);
    // tarp and ropes
    g.beginPath(); g.moveTo(2, -150); g.quadraticCurveTo(0, T, 30, T + 2); g.lineTo(box - 10, T + 4); g.quadraticCurveTo(box + 4, T + 8, box, -150); g.closePath();
    g.fillStyle = vgrad(g, T, -150, [0, shade(L.tarp, 0.12), 1, shade(L.tarp, -0.22)]); g.fill();
    g.beginPath(); for (let x = 20; x < box; x += 50) { g.moveTo(x, -150); g.lineTo(x + 25, T + 6); g.moveTo(x + 50, -150); g.lineTo(x + 25, T + 6); }
    g.strokeStyle = 'rgba(240,230,200,0.7)'; g.lineWidth = 1.3; g.stroke();
    // cab with its painted forehead board
    const cx = box + 4;
    g.beginPath(); g.moveTo(cx, -50); g.lineTo(cx, -170); g.lineTo(len - 22, -170); g.quadraticCurveTo(len - 2, -168, len - 2, -140); g.lineTo(len - 2, -50); g.closePath();
    g.fillStyle = vgrad(g, -170, -50, [0, shade(L.cab, 0.15), 1, shade(L.cab, -0.25)]); g.fill(); g.strokeStyle = INK; g.stroke();
    fillRR(g, cx - 2, -196, len - cx - 6, 28, 4, L.trim);
    for (let i = 0; i < 5; i++) flower(g, cx + 12 + i * 20, -182, 4.2, ART[(i * 3 + 1) % 8], '#fff');
    fillRR(g, cx + 12, -160, 62, 44, 4, '#151515');
    g.fillStyle = vgrad(g, -158, -118, [0, '#4a5761', 1, '#2b333a']); g.fillRect(cx + 14, -158, 58, 40);
    circ(g, cx + 44, -134, 7.4, pick(r, SKINS)); g.beginPath(); g.arc(cx + 43, -135, 7.6, PI * 0.8, PI * 1.9); g.closePath(); g.fillStyle = HAIR; g.fill();
    fillRR(g, cx + 32, -126, 24, 10, 5, pick(r, SHIRTS));
    line(g, [cx + 36, -122, cx + 22, -110, cx + 34, -106], pick(r, SKINS), 4);
    g.fillStyle = '#d7dde2'; g.fillRect(cx, -92, len - cx - 2, 3);
    g.fillStyle = '#222'; g.fillRect(cx + 70, -150, 3, 26); fillRR(g, cx + 66, -176, 10, 26, 2, '#1c1c1c');
    for (const x of [88, len - 62]) wheelSide(g, x, -34, 34, '#9aa0a6');
  }

  function artCngRear(g, L) {
    tyreBack(g, -42, -24, 11, 24); tyreBack(g, 31, -24, 11, 24);
    g.fillStyle = '#1a1a1c'; g.fillRect(-31, -24, 62, 7);
    const lower = () => { g.beginPath(); g.moveTo(-38, -15); g.quadraticCurveTo(-43, -15, -43, -24); g.lineTo(-41, -57); g.lineTo(41, -57); g.lineTo(43, -24); g.quadraticCurveTo(43, -15, 38, -15); g.closePath(); };
    lower(); g.fillStyle = vgrad(g, -57, -15, [0, shade(L.body, 0.15), 1, shade(L.body, -0.3)]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = '#f2d74e'; g.fillRect(-41.5, -51, 83, 1.8);
    g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(-24 + i * 4, -30); g.lineTo(-24 + i * 4, -21); } g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.strokeRect(-16.5, -47.5, 33, 15);
    plate(g, -16, -47, 32, 14, L.cls, L.plateNo, true);
    circ(g, -35, -40, 3.4, '#8e1414'); circ(g, 35, -40, 3.4, '#8e1414');
    ell(g, -35, -50, 3, 2, '#c9790f'); ell(g, 35, -50, 3, 2, '#c9790f');
    fillRR(g, -32, -19, 8, 4, 2, '#3c3c3c');
    // canopy with a caged rear window and passengers
    const top = () => { g.beginPath(); g.moveTo(-40, -57); g.lineTo(-38, -92); g.quadraticCurveTo(-37, -106, -22, -106); g.lineTo(22, -106); g.quadraticCurveTo(37, -106, 38, -92); g.lineTo(40, -57); g.closePath(); };
    top(); g.fillStyle = vgrad(g, -106, -57, [0, shade(L.top, 0.18), 1, shade(L.top, -0.15)]); g.fill(); g.strokeStyle = INK; g.stroke();
    fillRR(g, -20.5, -98.5, 41, 25, 3, '#101010');
    g.save(); rr(g, -19, -97, 38, 22, 3); g.clip();
    g.fillStyle = '#3a444c'; g.fillRect(-19, -97, 38, 22);
    [-10, 0, 10].forEach((x, i) => { fillRR(g, x - 7, -82, 14, 12, 5, L.pax[i].top); circ(g, x, -86, 5, L.pax[i].skin); circ(g, x, -87, 5, L.pax[i].head === 'hijab' ? L.pax[i].headCol : HAIR); });
    g.fillStyle = 'rgba(40,55,70,0.3)'; g.fillRect(-19, -97, 38, 22);
    g.restore();
    g.fillStyle = '#20251f'; for (let x = -16; x <= 16; x += 4.5) g.fillRect(x - 0.6, -97, 1.2, 22);
    g.fillRect(-19, -87, 38, 1.2);
    g.beginPath(); for (let y = -96; y < -60; y += 5) { g.moveTo(-39, y); g.lineTo(-33, y + 5); g.moveTo(-33, y); g.lineTo(-39, y + 5); g.moveTo(39, y); g.lineTo(33, y + 5); g.moveTo(33, y); g.lineTo(39, y + 5); }
    g.strokeStyle = 'rgba(20,24,20,0.8)'; g.lineWidth = 0.8; g.stroke();
    if (L.sticker) label(g, L.sticker, 0, -65, 6, '#ffe8a3', 44);
    else flower(g, 0, -65, 3.2, '#ff2e88', '#ffd23f');
  }
  function artCngSide(g, L) {
    const len = L.len;
    // body shell and canopy
    g.beginPath(); g.moveTo(2, -16); g.quadraticCurveTo(0, -30, 4, -56); g.lineTo(len - 22, -56); g.quadraticCurveTo(len - 2, -52, len - 1, -34); g.lineTo(len - 4, -16); g.closePath();
    g.fillStyle = vgrad(g, -56, -16, [0, shade(L.body, 0.12), 1, shade(L.body, -0.3)]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = '#f2d74e'; g.fillRect(4, -50, len - 12, 1.8);
    g.beginPath(); g.moveTo(4, -56); g.lineTo(5, -92); g.quadraticCurveTo(6, -106, 22, -106); g.lineTo(104, -106); g.quadraticCurveTo(126, -104, 138, -80); g.lineTo(146, -56); g.closePath();
    g.fillStyle = vgrad(g, -106, -56, [0, shade(L.top, 0.2), 1, shade(L.top, -0.1)]); g.fill(); g.stroke();
    // passengers behind the steel cage door
    g.fillStyle = '#2f3a40'; g.fillRect(24, -98, 72, 42);
    [[40, 0], [62, 1]].forEach(([x, i]) => { const P = L.pax[i]; fillRR(g, x - 9, -80, 20, 24, 7, P.top); circ(g, x + 2, -86, 6.4, P.skin); g.beginPath(); g.arc(x + 1, -87, 6.6, PI * 0.6, PI * 1.9); g.closePath(); g.fillStyle = P.head === 'hijab' ? P.headCol : HAIR; g.fill(); });
    g.beginPath(); for (let x = 20; x < 100; x += 6) { g.moveTo(x, -98); g.lineTo(x + 12, -56); g.moveTo(x + 12, -98); g.lineTo(x, -56); }
    g.save(); g.beginPath(); g.rect(24, -98, 72, 42); g.clip(); g.strokeStyle = 'rgba(15,30,20,0.85)'; g.lineWidth = 0.9; g.stroke(); g.restore();
    g.strokeStyle = shade(L.top, -0.3); g.lineWidth = 2.6; g.strokeRect(24, -98, 72, 42);
    // the driver at the front, hands on the handlebar
    g.fillStyle = '#2f3a40'; g.fillRect(100, -98, 30, 40);
    fillRR(g, 106, -82, 18, 24, 7, pick(TH.mulberry32(L.seed), SHIRTS)); circ(g, 116, -88, 6.6, '#8d5a3b');
    g.beginPath(); g.arc(115, -89, 6.8, PI * 0.6, PI * 1.9); g.closePath(); g.fillStyle = HAIR; g.fill();
    line(g, [118, -76, 130, -70, 138, -72], '#8d5a3b', 3.6);
    g.fillStyle = shade(L.top, -0.3); g.fillRect(98, -100, 3, 44);
    for (const x of [30, len - 16]) wheelSide(g, x, -12.5, 12.5, '#aab0b6');
  }

  function artCarRear(g, L) {
    const r = TH.mulberry32(L.seed + 51), body = L.body;
    if (L.micro) {
      tyreBack(g, -51, -22, 13, 22); tyreBack(g, 38, -22, 13, 22);
      const sh = () => { g.beginPath(); g.moveTo(-54, -16); g.lineTo(-54, -112); g.quadraticCurveTo(-53, -122, -42, -122); g.lineTo(42, -122); g.quadraticCurveTo(53, -122, 54, -112); g.lineTo(54, -16); g.closePath(); };
      sh(); g.fillStyle = vgrad(g, -122, -16, [0, shade(body, 0.08), 1, shade(body, -0.22)]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
      fillRR(g, -46, -116, 92, 46, 5, '#141414');
      g.save(); rr(g, -44, -114, 88, 42, 4); g.clip();
      g.fillStyle = vgrad(g, -114, -72, [0, '#3f4a54', 1, '#262d34']); g.fillRect(-44, -114, 88, 42);
      [-26, 0, 26].forEach((x, i) => { const P = L.heads[i]; fillRR(g, x - 10, -88, 20, 20, 7, P.top); circ(g, x, -93, 6.4, P.skin); circ(g, x, -94, 6.4, P.head === 'hijab' ? P.headCol : HAIR); });
      g.fillStyle = 'rgba(40,55,70,0.3)'; g.fillRect(-44, -114, 88, 42);
      fillPoly(g, [-30, -72, -14, -114, -4, -114, -20, -72], 'rgba(255,255,255,0.12)');
      g.restore();
      line(g, [-6, -74, 14, -96], '#111', 1.2);
      for (const x of [-54, 47]) { fillRR(g, x, -72, 7, 24, 2, '#8e1414'); g.fillStyle = '#c9790f'; g.fillRect(x, -47, 7, 5); }
      fillRR(g, -55, -30, 110, 13, 4, shade(body, -0.15));
      plate(g, -17, -46, 34, 12, L.cls, L.plateNo, L.green);
      if (L.sticker) { fillRR(g, 24, -112, 18, 7, 1, '#fff'); label(g, L.sticker, 33, -108.4, 4.2, '#c1121f', 17); }
      return;
    }
    tyreBack(g, -49, -22, 13, 22); tyreBack(g, 36, -22, 13, 22);
    const lower = () => { g.beginPath(); g.moveTo(-50, -14); g.quadraticCurveTo(-53, -14, -53, -22); g.lineTo(-52, -52); g.quadraticCurveTo(-51, -57, -44, -57); g.lineTo(44, -57); g.quadraticCurveTo(51, -57, 52, -52); g.lineTo(53, -22); g.quadraticCurveTo(53, -14, 50, -14); g.closePath(); };
    // cabin (C-pillars and roof) behind the lower body
    fillPoly(g, [-46, -56, 46, -56, 34, -86, -34, -86], shade(body, 0.04));
    fillRR(g, -34, -90, 68, 7, 3, shade(body, 0.12));
    fillPoly(g, [-40, -58, 40, -58, 30.5, -83, -30.5, -83], '#141414');
    g.save(); poly(g, [-38, -59, 38, -59, 29.5, -82, -29.5, -82]); g.clip();
    g.fillStyle = vgrad(g, -82, -59, [0, '#44505a', 1, '#252c33']); g.fillRect(-40, -84, 80, 26);
    if (L.pax) { const P = L.heads[1]; fillRR(g, -24, -70, 18, 14, 6, P.top); circ(g, -15, -73, 5.8, P.skin); circ(g, -15, -74, 5.8, P.head === 'hijab' ? P.headCol : HAIR); }
    { const P = L.heads[0]; fillRR(g, 6, -70, 18, 14, 6, P.top); circ(g, 15, -73, 5.8, P.skin); circ(g, 15, -74, 5.8, HAIR); }
    g.fillStyle = '#f2f2f2'; g.fillRect(-10, -62, 11, 4);
    g.fillStyle = 'rgba(40,55,70,0.28)'; g.fillRect(-40, -84, 80, 26);
    fillPoly(g, [-26, -59, -12, -82, -4, -82, -18, -59], 'rgba(255,255,255,0.12)');
    g.restore();
    lower(); g.fillStyle = vgrad(g, -57, -14, [0, shade(body, 0.12), 0.5, body, 1, shade(body, -0.25)]); g.fill();
    if (L.taxi) {
      g.save(); lower(); g.clip();
      g.fillStyle = '#1e8f4e'; g.fillRect(-60, -34, 120, 24);
      g.fillStyle = '#111'; for (let x = -52; x < 52; x += 6) g.fillRect(x, -37, 3, 3);
      g.restore();
    }
    lower(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    line(g, [-44, -46.5, 44, -46.5], shade(body, -0.2), 0.9);
    fillRR(g, -53, -27, 106, 11, 4, L.taxi ? '#1a6b3c' : shade(body, -0.12));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-48, -17, 96, 2);
    for (const x of [-51, 33]) { fillRR(g, x, -54, 18, 8, 2, '#7e1414'); g.fillStyle = '#b11d1d'; g.fillRect(x + 2, -52.5, 14, 3); g.fillStyle = '#e8e8e0'; g.fillRect(x + (x < 0 ? 12 : 2), -50, 4, 2.5); }
    g.fillStyle = '#c9790f'; g.fillRect(-51, -47, 8, 3); g.fillRect(43, -47, 8, 3);
    plate(g, -17, -42, 34, 12, L.cls, L.plateNo, L.green);
    fillRR(g, -41, -18, 8, 4, 2, '#4a4a4a');
    if (L.taxi) { fillRR(g, -14, -99, 28, 10, 2, '#f5c518'); g.strokeStyle = '#111'; g.lineWidth = 0.8; g.stroke(); label(g, 'ট্যাক্সি', 0, -94, 6, '#111', 26); }
    if (L.sticker) { fillRR(g, 20, -66, 14, 6, 1, '#fff'); label(g, L.sticker, 27, -62.9, 3.8, '#c1121f', 13); }
    if (r() < 0.5) { fillRR(g, -44, -40, 12, 4, 1, '#ffffff'); }
  }
  function artCarSide(g, L) {
    const len = L.len, body = L.body;
    if (L.micro) {
      g.beginPath(); g.moveTo(2, -16); g.lineTo(2, -112); g.quadraticCurveTo(3, -122, 16, -122); g.lineTo(len - 70, -122); g.quadraticCurveTo(len - 40, -120, len - 14, -80); g.lineTo(len - 2, -62); g.lineTo(len - 2, -16); g.closePath();
      g.fillStyle = vgrad(g, -122, -16, [0, shade(body, 0.05), 1, shade(body, -0.28)]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
      fillPoly(g, [10, -110, len - 74, -110, len - 44, -106, len - 20, -76, 10, -76], '#161616');
      g.save(); poly(g, [12, -108, len - 74, -108, len - 46, -104, len - 23, -78, 12, -78]); g.clip();
      g.fillStyle = vgrad(g, -108, -78, [0, '#4a5761', 1, '#2b333a']); g.fillRect(10, -110, len, 34);
      [50, 120, 190, 240].forEach((x, i) => { const P = L.heads[i % 3]; fillRR(g, x - 10, -90, 20, 16, 6, P.top); circ(g, x, -94, 6.6, P.skin); g.beginPath(); g.arc(x - 1, -95, 6.8, PI * 0.6, PI * 1.9); g.closePath(); g.fillStyle = P.head === 'hijab' ? P.headCol : HAIR; g.fill(); });
      g.restore();
      g.fillStyle = '#161616'; for (const x of [80, 160, 222]) g.fillRect(x, -110, 4, 34);
      line(g, [160, -76, 160, -24], 'rgba(0,0,0,0.3)', 1); line(g, [222, -76, 222, -24], 'rgba(0,0,0,0.3)', 1);
      g.fillStyle = shade(body, -0.2); g.fillRect(2, -30, len - 4, 4);
      for (const x of [58, len - 58]) { ell(g, x, -16, 24, 22, '#151515'); wheelSide(g, x, -20, 20, '#b7bdc3'); }
      return;
    }
    g.beginPath(); g.moveTo(3, -18); g.lineTo(2, -52); g.quadraticCurveTo(4, -57, 60, -58); g.lineTo(92, -86); g.quadraticCurveTo(100, -90, 170, -89);
    g.lineTo(206, -60); g.quadraticCurveTo(262, -58, 267, -48); g.lineTo(268, -20); g.quadraticCurveTo(268, -14, 262, -14); g.lineTo(8, -14); g.closePath();
    g.fillStyle = vgrad(g, -90, -14, [0, shade(body, 0.12), 0.55, body, 1, shade(body, -0.28)]); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    if (L.taxi) {
      g.save(); g.beginPath(); g.rect(0, -38, len, 26); g.clip(); g.fillStyle = '#1e8f4e'; g.fillRect(0, -38, len, 26); g.restore();
      g.fillStyle = '#111'; for (let x = 8; x < len - 8; x += 6) g.fillRect(x, -41, 3, 3);
      fillRR(g, 120, -99, 34, 10, 2, '#f5c518'); label(g, 'ট্যাক্সি', 137, -94, 6.4, '#111', 32);
    }
    fillPoly(g, [66, -60, 94, -84, 128, -84, 128, -60], '#161616');
    fillPoly(g, [132, -60, 132, -84, 168, -84, 198, -60], '#161616');
    g.save(); poly(g, [68, -61, 95, -83, 127, -83, 127, -61]); poly(g, [133, -61, 133, -83, 167, -83, 195, -61]); g.clip();
    g.fillStyle = vgrad(g, -84, -60, [0, '#4a5761', 1, '#2b333a']); g.fillRect(60, -86, 150, 28);
    if (L.pax) { const P = L.heads[1]; circ(g, 110, -70, 6.2, P.skin); g.beginPath(); g.arc(109, -71, 6.4, PI * 0.6, PI * 1.9); g.closePath(); g.fillStyle = P.head === 'hijab' ? P.headCol : HAIR; g.fill(); }
    { const P = L.heads[0]; circ(g, 158, -71, 6.2, P.skin); g.beginPath(); g.arc(157, -72, 6.4, PI * 0.6, PI * 1.9); g.closePath(); g.fillStyle = HAIR; g.fill(); }
    fillPoly(g, [80, -61, 96, -83, 104, -83, 88, -61], 'rgba(255,255,255,0.12)');
    g.restore();
    line(g, [130, -58, 130, -18], 'rgba(0,0,0,0.3)', 1); line(g, [200, -58, 202, -20], 'rgba(0,0,0,0.3)', 1);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(108, -50, 8, 2); g.fillRect(176, -50, 8, 2);
    fillRR(g, 196, -68, 8, 7, 2, shade(body, -0.15));
    g.fillStyle = '#8e1414'; g.fillRect(2, -52, 5, 8); g.fillStyle = '#c9790f'; g.fillRect(len - 6, -46, 4, 5);
    for (const x of [55, 215]) { ell(g, x, -14, 26, 24, '#151515'); wheelSide(g, x, -20, 20, '#b7bdc3'); }
  }

  function artBikeRear(g, L) {
    const R = L.rider, P = L.pil, type = L.type;
    fillRR(g, -4.5, -27, 9, 27, 4, '#141417');
    fillRR(g, 7, -27, 9, 6, 2.5, '#c3c9cf'); ell(g, 11.5, -24, 2, 1.6, '#333');
    // the rider (behind the pillion): legs out to the pegs, torso, arms to the bars, mirrors, helmet
    line(g, [-10, -52, -15, -46, -12.5, -26], R.lowCol, 6.4); line(g, [10, -52, 15, -46, 12.5, -26], R.lowCol, 6.4);
    g.fillStyle = '#1c1c1c'; g.fillRect(-15.5, -27, 6.5, 3); g.fillRect(9, -27, 6.5, 3);
    line(g, [-19, -74, -23, -90], '#2a2a2a', 1.2); line(g, [19, -74, 23, -90], '#2a2a2a', 1.2);
    ell(g, -23.5, -92, 3.6, 2.6, '#9aa3ab'); ell(g, 23.5, -92, 3.6, 2.6, '#9aa3ab');
    fillPoly(g, [-12.5, -86, 12.5, -86, 10, -54, -10, -54], R.top);
    line(g, [-12, -84, -20, -76, -21, -72], R.sleeve === 'long' ? R.top : R.skin, 4.2); line(g, [12, -84, 20, -76, 21, -72], R.sleeve === 'long' ? R.top : R.skin, 4.2);
    g.fillStyle = '#1c1c1c'; g.fillRect(-2, -90, 4, 5);
    circ(g, 0, -99, 9, L.helmet); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-5, -104, 4, 2);
    g.fillStyle = shade(L.helmet, -0.35); g.fillRect(-8.6, -95, 17.2, 3);
    fillRR(g, -7, -52, 14, 6, 2, '#1b1b1b');
    if (type === 'box') {
      fillRR(g, -16, -82, 32, 32, 3, L.box); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-16, -74, 32, 1.6);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-12, -68, 24, 10);
    } else if (type === 'side') { // side-saddle, both legs to the left, the saree end fluttering
      line(g, [-6, -50, -17, -48, -18, -26], P.lowCol, 8);
      g.fillStyle = P.shoe; g.fillRect(-21, -27, 6, 3);
      fillPoly(g, [-11, -84, 7, -84, 6, -50, -11, -50], P.top);
      fillPoly(g, [5, -84, 12, -80, 19, -58, 15, -52, 4, -62], P.lowCol);
      fillPoly(g, [-12, -54, 8, -54, 10, -44, -14, -44], P.lowCol);
      circ(g, -2, -92, 7.2, P.skin); circ(g, -2, -93, 7.2, HAIR); circ(g, -2, -87, 3.6, HAIR);
    } else if (type !== 'solo') { // astride pillion (a kid squeezed in front sometimes)
      if (type === 'kid') { circ(g, 5, -90, 5.8, '#8d5a3b'); circ(g, 5, -91, 5.8, HAIR); }
      const lc = P.low === 'saree' || P.low === 'lungi' ? P.lowCol : P.lowCol;
      line(g, [-8, -52, -16, -45, -13, -25], lc, 6.4); line(g, [8, -52, 16, -45, 13, -25], lc, 6.4);
      g.fillStyle = P.shoe; g.fillRect(-16, -26, 6.5, 3); g.fillRect(9.5, -26, 6.5, 3);
      fillPoly(g, [-11.5, -83, 11.5, -83, 10, -50, -10, -50], P.top);
      if (P.drape === 'orna') { g.fillStyle = P.drapeCol; g.fillRect(-9, -83, 4.5, 24); g.fillRect(4.5, -83, 4.5, 24); }
      line(g, [-11, -80, -12, -66, -8, -58], P.sleeve === 'long' ? P.top : P.skin, 4); line(g, [11, -80, 12, -66, 8, -58], P.sleeve === 'long' ? P.top : P.skin, 4);
      if (L.helmet2) { circ(g, 0, -91, 8.6, L.helmet2); g.fillStyle = shade(L.helmet2, -0.35); g.fillRect(-8.2, -87, 16.4, 2.6); }
      else if (P.head === 'hijab') { ell(g, 0, -90, 9.4, 10.4, P.headCol); fillPoly(g, [-9, -86, 9, -86, 12, -78, -12, -78], P.headCol); }
      else { circ(g, 0, -90, 7.2, P.skin); circ(g, 0, -91, 7.2, HAIR); }
    }
    fillRR(g, -6.5, -47, 13, 4, 2, L.body);
    fillRR(g, -5, -48, 10, 4, 1.5, '#7e1414');
    plate(g, -9, -42, 18, 9, L.cls, L.plateNo, false);
  }
  function artBikeSide(g, L) { // the bike itself plus the riders' right legs and the rider's arm; their backs are on the rear billboard
    const R = L.rider, P = L.pil, type = L.type;
    for (const x of [18, 106]) { circ(g, x, -17, 17, '#141417'); circ(g, x, -17, 12, '#9aa0a6'); circ(g, x, -17, 10.5, '#2a2a2e'); circ(g, x, -17, 3, '#c9ced4'); }
    line(g, [18, -17, 50, -26], '#2a2a2e', 3.6);
    line(g, [106, -17, 96, -64], '#b7bdc3', 3.2);
    line(g, [86, -77, 98, -74], '#1c1c1c', 3);
    fillRR(g, 44, -44, 30, 22, 4, '#5b6168');
    line(g, [70, -30, 58, -22, 12, -24], '#c3c9cf', 4.2); fillRR(g, 8, -28, 22, 8, 4, '#c3c9cf');
    fillPoly(g, [60, -46, 92, -54, 90, -62, 66, -60], L.body);
    fillPoly(g, [8, -44, 34, -46, 36, -40, 12, -38], L.body);
    fillRR(g, 26, -52, 44, 6, 3, '#1b1b1b');
    circ(g, 100, -64, 4.2, '#e9eef2');
    if (type === 'box') fillRR(g, 6, -84, 36, 34, 3, L.box);
    else if (type === 'side') fillPoly(g, [22, -52, 40, -52, 44, -36, 26, -32], P.lowCol);
    else if (type !== 'solo') { line(g, [32, -52, 52, -50, 44, -27], P.lowCol, 6.8); g.fillStyle = P.shoe; g.fillRect(42, -28, 8, 3); }
    line(g, [58, -52, 80, -52, 72, -27], R.lowCol, 7); g.fillStyle = '#1c1c1c'; g.fillRect(70, -28, 9, 3);
    line(g, [66, -80, 80, -70, 88, -75], R.sleeve === 'long' ? R.top : R.skin, 4.2);
  }
  const ARTS = {
    bus: [artBusRear, artBusSide], truck: [artTruckRear, artTruckSide], cng: [artCngRear, artCngSide],
    car: [artCarRear, artCarSide], bike: [artBikeRear, artBikeSide],
  };
  // Texture levels in px per unit. Level 0 (sharp, for vehicles right beside the camera) is painted on
  // demand and freed again when unused; levels 1..3 are painted once per look.
  const REAR_K = [1.75, 0.8, 0.4, 0.16], SIDE_K = [1.2, 0.45, 0.22, 0.1];
  function paint(w, h, k, fn) {
    const c = fp.canvas(w * k, h * k);
    if (!c) return null;
    c.ctx.setTransform(k, 0, 0, k, 0, 0); c.ctx.lineCap = 'round'; c.ctx.lineJoin = 'round';
    fn(c.ctx);
    return c.canvas;
  }
  function mip(src, f) {
    const c = fp.canvas(src.width * f, src.height * f);
    if (!c) return src;
    c.ctx.imageSmoothingEnabled = true; c.ctx.imageSmoothingQuality = 'high';
    c.ctx.drawImage(src, 0, 0, c.canvas.width, c.canvas.height);
    return c.canvas;
  }
  function paintLevel(L, T, k, side) {
    const art = ARTS[L.kind];
    return side ? paint(L.len, T.by1 - T.by0, k, (g) => { g.translate(0, -T.by0); art[1](g, L); })
      : paint(T.bx1 - T.bx0, T.by1 - T.by0, k, (g) => { g.translate(-T.bx0, -T.by0); art[0](g, L); });
  }
  function buildTex(L) {
    const T = { bx0: -L.W / 2 - L.ml, bx1: L.W / 2 + L.mr, by0: -(L.H + L.mt), by1: 2, R: [null], S: [null], used: 0 };
    const rear = paintLevel(L, T, REAR_K[1], false), side = rear && paintLevel(L, T, SIDE_K[1], true);
    if (!rear || !side) return null;
    T.R.push(rear); T.S.push(side);
    for (let i = 2; i < 4; i++) { T.R.push(mip(T.R[i - 1], REAR_K[i] / REAR_K[i - 1])); T.S.push(mip(T.S[i - 1], SIDE_K[i] / SIDE_K[i - 1])); }
    return T;
  }
  const level = (K, s) => { let i = 0; while (i < K.length - 1 && K[i + 1] >= s) i++; return i; };
  function texFor(ts, L) {
    if (L.stale && L.tex && ts.builds < 2) { // repaint in place (the old one stays on screen until then)
      ts.builds++; L.stale = false;
      const nt = buildTex(L);
      if (nt) { for (const c of L.tex.R.concat(L.tex.S)) if (c) c.width = 0; ts.hi.delete(L); L.tex = nt; }
    }
    if (L.tex !== undefined) return L.tex;
    if (ts.builds >= 6) return undefined; // spread texture painting over a few frames
    ts.builds++;
    L.tex = buildTex(L);
    if (L.tex) { ts.built.push(L); if (ts.firstBuild < 0) ts.firstBuild = ts.t; }
    return L.tex;
  }
  // the sharp level for a vehicle near the camera (falls back to level 1 while it is being painted)
  function hiLevel(ts, L, side) {
    const T = L.tex, A = side ? T.S : T.R;
    T.used = ts.t;
    if (!A[0] && ts.builds < 3) {
      if (!ts.hi.has(L) && ts.hi.size >= 4) { // keep at most four sharp looks: drop the least recently used
        let old = null;
        for (const o of ts.hi) if (!old || o.tex.used < old.tex.used) old = o;
        if (old) dropHi(ts, old);
      }
      ts.builds++; A[0] = paintLevel(L, T, side ? SIDE_K[0] : REAR_K[0], side); if (A[0]) ts.hi.add(L);
    }
    return A[0] || A[1];
  }
  function dropHi(ts, L) {
    const T = L.tex;
    if (T) for (const A of [T.R, T.S]) if (A[0]) { A[0].width = 0; A[0] = null; }
    ts.hi.delete(L);
  }
  function freeHi(ts, all) {
    for (const L of [...ts.hi]) if (all || !L.tex || ts.t - L.tex.used > 6) dropHi(ts, L);
  }
  function freeTex(ts) {
    freeHi(ts, true);
    for (const o of ts.sheets) { if (o._sh) for (const c of o._sh.lv) c.width = 0; o._sh = undefined; }
    ts.sheets.length = 0;
    for (const L of ts.built) {
      if (L.tex) for (const c of L.tex.R.concat(L.tex.S)) if (c) c.width = 0;
      L.tex = undefined;
    }
    ts.built.length = 0;
  }

  // ---------- simulation: traffic ----------
  function weights(src, def) {
    const out = [];
    let sum = 0;
    if (src && typeof src === 'object') for (const k of Object.keys(def)) { const w = +src[k]; if (w > 0 && isFinite(w)) { out.push([k, w]); sum += w; } }
    if (!sum) for (const k of Object.keys(def)) { out.push([k, def[k]]); sum += def[k]; }
    return { list: out, sum };
  }
  function pickW(r, W) { let x = r() * W.sum; for (const [k, w] of W.list) { x -= w; if (x <= 0) return k; } return W.list[W.list.length - 1][0]; }
  function newCar(ts, kind, lane) {
    const r = ts.rng, K = KIND[kind];
    let pool = ts.looks[kind];
    if (kind === 'bus') pool = r() < 0.18 ? pool.filter((L) => L.dd) : pool.filter((L) => !L.dd);
    const L = pick(r, pool.length ? pool : ts.looks[kind]);
    const v0 = L.spd[0] + r() * (L.spd[1] - L.spd[0]);
    return {
      kind, L, lane, u: LANE_U[lane], du: (r() - 0.5) * (kind === 'bike' ? 70 : 22), z: 0, len: L.len, v: v0 * 0.85, v0, a: K.a, T: K.T * (0.62 + r() * 0.35),
      s0: kind === 'bike' ? 30 : S0, mood: 0.8 + r() * 0.25, moodTo: 1, moodT: r() * 4, acc: 0, brk: 0, stopZ: null, hold: 0, ind: 0, served: null,
      splitT: 0, lcT: r() * 3, puffs: [], puffT: r() * 0.4, ph: r() * TAU, seed: (r() * 1e6) | 0,
    };
  }
  function laneFor(r, kind) {
    if (kind === 'bus' || kind === 'truck') return r() < 0.3 ? 0 : 1;
    if (kind === 'car') return r() < 0.62 ? 0 : 1;
    return r() < 0.5 ? 0 : 1;
  }
  const needGap = (ts) => S0 + (90 + ts.rng() * ts.rng() * 720) / ts.dens;
  function populateTraffic(ts) {
    const r = ts.rng, zMin = Math.min(cam.z, 1420) - fp.FAR - 150;
    for (let lane = 0; lane < 2; lane++) {
      let front = Math.max(cam.z, 2040) + 250 - r() * 300;
      for (let guard = 0; guard < 60 && front > zMin; guard++) {
        let kind = pickW(r, ts.mix);
        if (laneFor(r, kind) !== lane && r() < 0.6) kind = pickW(r, ts.mix);
        const v = newCar(ts, kind, lane);
        v.z = front - (guard ? needGap(ts) : 0);
        front = v.z - v.len;
        ts.cars.push(v);
      }
    }
    ts.need = [needGap(ts), needGap(ts)];
  }
  function idm(v, lead, h) {
    const v0 = Math.max(30, v.v0 * v.mood);
    let acc = v.a * (1 - Math.pow(v.v / v0, 4));
    const sq = 2 * Math.sqrt(v.a * BRK);
    if (lead) {
      const gap = Math.max(2, v.z - v.len - lead.z);
      const ss = v.s0 + Math.max(0, v.v * v.T + (v.v * (v.v - lead.v)) / sq);
      acc -= v.a * (ss / gap) * (ss / gap);
    }
    if (v.stopZ !== null) {
      const gap = v.z - v.stopZ;
      if (gap < 8 && v.v < 14) { v.v = 0; acc = Math.min(acc, 0); v.hold -= h; if (v.hold <= 0) { v.stopZ = null; v.ind = 0; } }
      else { const ss = 4 + v.v * v.T * 0.6 + (v.v * v.v) / sq; acc = Math.min(acc, v.a * (1 - ((ss / Math.max(2, gap)) ** 2))); }
    }
    acc = clamp(acc, -700, v.a);
    v.acc = acc;
    v.v = Math.max(0, v.v + acc * h);
    v.z -= v.v * h;
    if (lead && v.z - v.len < lead.z + 3) { v.z = lead.z + v.len + 3; v.v = Math.min(v.v, lead.v); }
    const braking = acc < -40 || v.v < 6;
    v.brk += ((braking ? 1 : 0) - v.brk) * Math.min(1, h * 14);
  }
  function stepTraffic(ts, h) {
    const r = ts.rng, lanes = ts.lanes;
    for (const L of lanes) L.length = 0;
    for (const v of ts.cars) lanes[v.lane].push(v);
    for (const L of lanes) L.sort((a, b) => a.z - b.z);
    for (let li = 0; li < 3; li++) {
      const L = lanes[li];
      for (let i = 0; i < L.length; i++) {
        const v = L[i];
        v.moodT -= h;
        if (v.moodT <= 0) { v.moodTo = 0.78 + r() * 0.32; v.moodT = 2.5 + r() * 5; }
        v.mood += (v.moodTo - v.mood) * Math.min(1, h * 0.8);
        idm(v, L[i - 1] || null, h);
        const tu = LANE_U[v.lane] + (v.lane === 2 ? 0 : v.du);
        v.u += (tu - v.u) * Math.min(1, h * (v.kind === 'bike' ? 2.4 : 1.2));
      }
    }
    // buses pull over at bus stops on the left kerb, and anywhere else they like
    for (const v of ts.cars) {
      if (v.kind !== 'bus' || v.stopZ !== null) continue;
      const d = cam.z - v.z;
      if (d < -300 || d > 5200) continue;
      if (v.lane === 1) {
        for (const s of ts.stopsL) {
          const ahead = v.z - (s.z + 50);
          if (ahead > 150 && ahead < 420 && v.served !== s) { v.stopZ = s.z + 50; v.hold = 2.5 + r() * 2.5; v.ind = -1; v.served = s; break; }
        }
      }
      if (v.stopZ === null && r() < h / 40) { v.stopZ = v.z - (160 + r() * 200); v.hold = 1.2 + r() * 2.4; v.ind = v.lane === 1 ? -1 : 2; }
    }
    // cars, CNGs and bikes overtake a slow leader when the other lane has room
    for (const v of ts.cars) {
      if (v.lcT > 0) { v.lcT -= h; continue; }
      if (v.lane === 2 || v.kind === 'bus' || v.kind === 'truck' || r() > h * 0.8) continue;
      const L = lanes[v.lane], lead = L[L.indexOf(v) - 1];
      if (!lead || lead.v > v.v0 * v.mood * 0.75 || v.z - v.len - lead.z > 260) continue;
      const to = 1 - v.lane;
      if (free(lanes[to], v, 110 + v.v * 0.6)) { v.lane = to; v.lcT = 4 + r() * 3; }
    }
    // motorbikes split between the lanes when stuck, and cut back in when there is room
    for (const v of ts.cars) {
      if (v.kind !== 'bike') continue;
      if (v.lane < 2) {
        const L = lanes[v.lane], i = L.indexOf(v), lead = L[i - 1];
        if (lead && v.z - v.len - lead.z < 240 && lead.v < v.v0 * 0.72 && r() < h * 1.4 && free(lanes[2], v, 160)) { v.lane = 2; v.splitT = 0; }
      } else {
        v.splitT += h;
        if (v.splitT > 1.6 && r() < h * 0.9) {
          const t = r() < 0.5 ? 0 : 1;
          if (free(lanes[t], v, 150)) v.lane = t;
        }
      }
    }
    // leave far ahead or far behind; enter behind the camera
    const zGone = cam.z - fp.FAR - 250;
    for (let i = ts.cars.length - 1; i >= 0; i--) {
      const v = ts.cars[i];
      if (v.z - v.len < zGone || v.z - v.len > cam.z + 1500) ts.cars.splice(i, 1);
    }
    for (let lane = 0; lane < 2; lane++) {
      let last = null;
      for (const v of ts.cars) if (v.lane === lane && (!last || v.z > last.z)) last = v;
      const front = cam.z + 250;
      if (last && front - last.z < ts.need[lane]) continue;
      let kind = pickW(r, ts.mix);
      if (laneFor(r, kind) !== lane && r() < 0.6) kind = pickW(r, ts.mix);
      const v = newCar(ts, kind, lane);
      v.z = front + v.len;
      v.v = last ? Math.min(v.v0 * v.mood, last.v + 60) : v.v0 * v.mood;
      ts.cars.push(v);
      ts.need[lane] = needGap(ts);
    }
  }
  function free(L, v, room) {
    for (const o of L) if (o !== v && o.z - o.len - room < v.z && o.z + room > v.z - v.len) return false;
    return true;
  }
  function stepPuffs(ts, dt) {
    const r = ts.rng;
    for (const v of ts.cars) {
      const P = v.puffs;
      for (const p of P) { p.t += dt; p.z += 28 * dt; p.h += 13 * dt; p.u += p.vu * dt; }
      for (let i = P.length - 1; i >= 0; i--) if (P[i].t >= P[i].life) P.splice(i, 1);
      const sm = v.L.smoke;
      if (!sm) continue;
      const d = cam.z - v.z;
      if (d < 40 || d > 2800) continue;
      v.puffT -= dt;
      if (v.puffT > 0) continue;
      v.puffT = sm === 'dark' ? (v.acc > 15 ? 0.13 : 0.34) + r() * 0.1 : 0.24 + r() * 0.12;
      if (P.length < 5) P.push({ z: v.z + 3, u: v.u + v.L.pipe[0], h: v.L.pipe[1], t: 0, life: 0.9 + r() * 0.5, vu: (r() - 0.5) * 16, dark: sm === 'dark' });
    }
  }

  // ---------- simulation: people ----------
  function newPerson(ts, side, z) {
    const r = ts.rng, kind = pickW(r, ts.lifeMix);
    const band = side > 0 ? WALK.R : WALK.L;
    const p = { kind, side, z, u: band[0] + r() * (band[1] - band[0]), dir: r() < 0.5 ? 1 : -1, v: 0, ph: r() * TAU, still: false, face: 1, turnT: 3 + r() * 8, seed: (r() * 1e6) | 0 };
    if (kind === 'dog') {
      p.D = pick(r, ts.pool.dog); p.flip = r() < 0.5 ? 1 : -1;
      p.still = r() < 0.45; p.v = 95 + r() * 50;
      if (p.still) p.u = band[r() < 0.5 ? 0 : 1] + (side > 0 ? 1 : -1) * (r() < 0.5 ? 4 : -4);
    } else if (kind === 'hawker') {
      p.cart = r() < 0.45;
      p.P = pick(r, p.cart ? ts.pool.vendor : ts.pool.hawker);
      p.still = p.cart ? r() < 0.8 : r() < 0.35;
      p.v = p.cart ? 22 : 45 + r() * 20;
      if (p.cart) p.u = side > 0 ? band[0] + 10 : band[1] - 10;
    } else {
      p.P = pick(r, ts.pool[kind]);
      p.v = kind === 'kid' ? 85 + r() * 35 : 62 + r() * 38;
      p.still = r() < 0.1;
      if (p.P.acc === 'phoneLook' || p.P.acc === 'phone') p.v *= 0.75;
    }
    p.face = p.dir;
    return p;
  }
  function populatePeople(ts) {
    const span = 6800, n = Math.round((span / 185) * ts.lifeDens), r = ts.rng;
    const z0 = Math.min(cam.z, 1420) - 6200, z1 = Math.max(cam.z, 2040) + 600;
    for (const side of [1, -1]) for (let i = 0; i < n; i++) ts.people.push(newPerson(ts, side, z0 + ((i + r()) / n) * (z1 - z0)));
  }
  function stepPeople(ts, dt) {
    const r = ts.rng, lo = cam.z - 6200, hi = cam.z + 600, span = hi - lo;
    for (const p of ts.people) {
      if (p.still) {
        p.turnT -= dt;
        if (p.turnT <= 0) {
          p.turnT = 3 + r() * 9;
          if (p.kind !== 'dog' && !p.cart && r() < 0.35) { p.still = false; p.dir = r() < 0.5 ? 1 : -1; p.face = p.dir; }
          else p.face = r() < 0.6 ? 1 : -1;
        }
      } else {
        p.z += p.dir * p.v * dt;
        p.ph += (p.v * dt * TAU) / (p.kind === 'dog' ? 70 : p.kind === 'kid' ? 78 : 104);
        p.turnT -= dt;
        if (p.turnT <= 0) { p.turnT = 5 + r() * 10; if (p.kind !== 'dog' && r() < 0.12 && !p.cart) p.still = true; }
      }
      if (p.z > hi) p.z -= span; else if (p.z < lo) p.z += span;
      // make way for the sergeant when he stands on the footpath (nobody walks through the camera)
      if (p.side > 0 && cam.u > fp.U.curbR - 20) {
        const dz = cam.z - p.z, need = cam.u + 92;
        if (dz > -200 && dz < 700 && p.u < need) p.u = Math.min(need, p.u + dt * (dz < 250 ? 160 : 70));
      }
    }
  }

  // ---------- groups at road.lifeSpots ----------
  function buildGroups(ts) {
    const r = ts.rng;
    for (const s of ts.spots) {
      if (!s || !isFinite(+s.z) || !isFinite(+s.u)) continue;
      const side = s.u >= 0 ? 1 : -1, band = side > 0 ? WALK.R : WALK.L;
      const U = (du) => clamp(+s.u + du, band[0] - 4, band[1] + 4);
      const G = { kind: s.kind, z: +s.z, u: +s.u, side, m: [], bench: null, stove: null };
      if (s.kind === 'teastall') {
        G.bench = { z: G.z, u: U(0) };
        for (let i = 0; i < 3; i++) G.m.push({ z: G.z - 4, u: G.bench.u - 30 + i * 30, P: makeLook(r, i === 1 && r() < 0.4 ? 'woman' : 'walker'), front: true, sit: true, act: 'cup', ph: r() * TAU });
        G.m.push({ z: G.z - 45, u: U(side * -46), P: makeLook(r, 'walker'), front: r() < 0.5, act: 'cup', ph: r() * TAU });
        G.m.push({ z: G.z + 30, u: U(side * 34), P: makeLook(r, 'walker'), front: false, act: 'chat', ph: r() * TAU });
        G.stove = { z: G.z - 60, u: U(side * 30) };
      } else if (s.kind === 'busstop') {
        const n = 5 + ((r() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const P = makeLook(r, r() < 0.45 ? 'woman' : r() < 0.15 ? 'kid' : 'walker');
          G.m.push({ z: G.z - 80 + (i / (n - 1)) * 160 + (r() - 0.5) * 20, u: U((r() - 0.5) * 60), P, front: r() < 0.8, act: r() < 0.25 ? 'look' : null, ph: r() * TAU });
        }
      } else {
        const n = 4 + ((r() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + r() * 0.4, P = makeLook(r, r() < 0.3 ? 'woman' : 'walker');
          if (P.acc === 'umbrella' || P.acc === 'sack') P.acc = null;
          const dz = Math.cos(a) * 26, front = dz < 0;
          G.m.push({ z: G.z + dz, u: U(Math.sin(a) * 24), P, front, act: i % 2 === 0 ? 'chat' : r() < 0.3 ? 'look' : null, ph: r() * TAU });
        }
      }
      G.m.sort((a, b) => a.z - b.z);
      G.items = G.m.slice();
      if (G.bench) G.items.push({ z: G.bench.z + 2, u: G.bench.u, bench: true });
      if (G.stove) G.items.push({ z: G.stove.z, u: G.stove.u, stove: true });
      G.items.sort((a, b) => a.z - b.z);
      G.zN = Math.max(...G.m.map((m) => m.z), G.z);
      ts.groups.push(G);
      if (s.kind === 'busstop' && side < 0) ts.stopsL.push(G);
    }
  }

  // ---------- zebra crossers ----------
  function stepCrossers(ts, dt, env) {
    const r = ts.rng, light = env && env.light;
    if (light === 'red' && ts.lastLight !== 'red') {
      for (const c of ts.crossers) if (c.state === 'wait') { c.state = 'go'; c.dirU = 1; c.delay = 0.1 + r() * 0.8; }
      // only on the part of the zebra well ahead of the camera, so nobody crosses through it
      const zHi = Math.min(ZEBRA[1] - 10, cam.z - 260), zLo = ZEBRA[0] + 10;
      const n = ts.crossers.length < 6 && zHi > zLo ? 1 + ((r() * 3) | 0) : 0;
      for (let i = 0; i < n; i++) {
        const P = makeLook(r, r() < 0.4 ? 'woman' : r() < 0.2 ? 'kid' : 'walker');
        if (P.acc === 'umbrella') P.acc = null;
        ts.crossers.push({ P, z: zLo + r() * (zHi - zLo), u: 268 + r() * 40, h: CURB, dirU: -1, v: 125 + r() * 35, ph: r() * TAU, delay: r() * 0.8, state: 'go', raise: i === 0 });
      }
    }
    ts.lastLight = light;
    for (let i = ts.crossers.length - 1; i >= 0; i--) {
      const c = ts.crossers[i];
      if (c.state !== 'go') continue;
      if (c.delay > 0) { c.delay -= dt; continue; }
      const v = c.v * (light === 'green' ? 1.7 : 1);
      c.u += c.dirU * v * dt; c.ph += (v * dt * TAU) / 104;
      c.h = c.u > fp.U.curbR ? CURB : c.u < fp.U.curbL ? MEDIAN_H : 0;
      if (c.dirU < 0 && c.u <= MEDIAN_U) { c.u = MEDIAN_U; c.state = 'wait'; c.h = MEDIAN_H; }
      else if (c.dirU > 0 && c.u >= 330) ts.crossers.splice(i, 1);
    }
    while (ts.crossers.filter((c) => c.state === 'wait').length > 4) ts.crossers.splice(ts.crossers.findIndex((c) => c.state === 'wait'), 1);
  }

  // ---------- drawing: vehicles ----------
  const bounceOf = (v, t) => {
    const k = v.kind, amp = k === 'bus' ? 1.6 : k === 'truck' ? 1.3 : k === 'cng' ? 1.1 : k === 'bike' ? 0.6 : 0.8;
    return amp * Math.sin(v.z * 0.021 + v.ph) * Math.min(1, v.v / 150) + (k === 'cng' ? Math.sin(t * 38 + v.ph) * 0.35 : 0) + amp;
  };
  // Right side of vehicle v, texture tex (rear at x = 0), strip-mapped between depths dN < dF.
  function sideStrips(ctx, v, tex, dN, dF, stripPx, yTop, yBot, maxN) {
    const du = v.us - cam.u;
    if (du > -2) return;
    const xN = CX + (du * F) / dN, xF = CX + (du * F) / dF;
    const n = clamp(Math.ceil((xF - xN) / stripPx), 1, maxN || 60);
    const kx = tex.width / v.len, off = v.z - cam.z;
    let px = xN, pd = dN;
    for (let i = 1; i <= n; i++) {
      const x = i === n ? xF : xN + ((xF - xN) * i) / n;
      const d = i === n ? dF : (du * F) / (x - CX);
      const s = F / ((pd + d) / 2);
      const yT = HY + (cam.h - yTop) * s, yB = HY + (cam.h - yBot) * s;
      let sa = (off + pd) * kx, sb = (off + d) * kx;
      sa = clamp(sa, 0, tex.width - 0.05); sb = clamp(sb, sa + 0.05, tex.width);
      if (yB - yT > 0.3) ctx.drawImage(tex, sa, 0, sb - sa, tex.height, px, yT, x - px + 0.6, yB - yT);
      px = x; pd = d;
    }
  }
  function shadowQuads(ctx, v, full) {
    const W2 = v.L.W / 2, zR = Math.min(v.z + 16, cam.z - NEAR - 1), zF = v.z - v.len - 12;
    if (zR <= zF) return;
    const a0 = ctx.globalAlpha;
    if (full) { ctx.globalAlpha = a0 * 0.55; if (fp.quad(ctx, zF - 10, zR + 8, v.u - W2 - 14, v.u + W2 + 6)) { ctx.fillStyle = '#1b140e'; ctx.fill(); } }
    ctx.globalAlpha = a0 * (full ? 0.3 : 0.4);
    if (fp.quad(ctx, zF, zR, v.u - W2 - 4, v.u + W2 - 2)) { ctx.fillStyle = '#1b140e'; ctx.fill(); }
    ctx.globalAlpha = a0;
  }
  function lampRects(ctx, list, x, y, s, col) {
    ctx.fillStyle = col;
    for (const q of list) ctx.fillRect(x + q[0] * s, y + q[1] * s, q[2] * s, q[3] * s);
  }
  // vector stand-in used where offscreen canvases are missing
  function vecRear(ctx, v, p, s) {
    const L = v.L, W2 = L.W / 2;
    ctx.fillStyle = L.body; ctx.fillRect(p.x - W2 * s, p.y - L.H * s, L.W * s, (L.H - 16) * s);
    ctx.fillStyle = '#2a3138'; ctx.fillRect(p.x - W2 * 0.8 * s, p.y - L.H * 0.9 * s, L.W * 0.8 * s, L.H * 0.3 * s);
    ctx.fillStyle = '#141417'; ctx.fillRect(p.x - W2 * s, p.y - 18 * s, L.W * s, 18 * s);
  }
  function vecSide(ctx, v, zA, zB, b) {
    const L = v.L;
    if (fp.wallQuad(ctx, zA, zB, v.us, b + 16, b + L.H)) { ctx.fillStyle = shade(L.body, -0.18); ctx.fill(); }
  }

  function planVehicle(ts, v, E, night, glowK, env) {
    const L = v.L, W2 = L.W / 2;
    const dR = cam.z - v.z, dF = cam.z - (v.z - v.len);
    if (dF < NEAR + 6 || dR > fp.FAR - 20) return;
    v.us = v.u + (v.kind === 'bike' ? 4 : W2);
    const du = v.us - cam.u;
    if (CX + (du * F) / dF < -60) return; // entirely off the left edge
    const t = ts.t, b = bounceOf(v, t);
    const tex = texFor(ts, L);
    const T = tex || null;
    const sR = dR > NEAR ? F / dR : 99;
    const want = sR >= 0.45 ? 0 : sR >= 0.13 ? 1 : 2;
    const dMin = Math.max(NEAR + 1, (-du * F) / (CX + 50));
    const dN = Math.max(dR, dMin);
    const sideOK = du < -2 && dF > dN + 1;
    const xN = sideOK ? CX + (du * F) / dN : 0, xF = sideOK ? CX + (du * F) / dF : 0, sw = xF - xN;
    const rearOK = dR > NEAR + 2 && CX + (v.u + W2 + L.mr - cam.u) * (F / dR) > -60;
    if (!sideOK && !rearOK) return;
    const long = v.len >= 400;
    // side slices (split near the camera so things beside the vehicle sort correctly)
    const cuts = [dN];
    if (sideOK && long && want === 0) { let dd = dN; while (dd * 1.45 < dF - 40 && cuts.length < 4) { dd *= 1.45; cuts.push(dd); } }
    if (sideOK) cuts.push(dF);
    const nSl = Math.max(0, cuts.length - 1);
    // exact canvas-call costs per tier (the governor relies on them)
    const nT = L.tails.length;
    const strips = (a, bb, px, maxN) => clamp(Math.ceil(((du * F) / bb - (du * F) / a) / px), 1, maxN);
    const rearC = (lod) => (T ? 1 : 3) + (night ? nT : 0) + (v.brk > 0.05 ? nT : 0) + (v.ind ? 2 : 0) + (lod < 2 ? (night && L.win ? (L.win2 ? 2 : 1) : 0) + 3 * v.puffs.length : 0);
    const sideC = (tier) => {
      if (!sideOK) return 0;
      if (tier === 1) return 2 + (T ? strips(dN, dF, 13, 60) : 9) + 9;
      let n = 0;
      for (let i = 0; i < nSl; i++) n += 2 + (T ? strips(cuts[i], cuts[i + 1], 7, 60) : 9) + (night && L.sideWin ? 9 * L.sideWin.length : 0);
      return n + 18;
    };
    const costs = [
      sideC(0) + (rearOK ? 2 + rearC(0) + (sideOK ? 0 : 9) : 0),
      sideC(1) + (rearOK ? 2 + rearC(1) + (sideOK ? 0 : 9) : 0),
      2 + (sideOK ? (T ? strips(dN, dF, 24, 2) : 9) : 0) + (rearOK ? rearC(2) : 0),
    ];
    const e = { kind: v.kind, d: Math.max(dR, NEAR), tier: want, costs, emit: null };
    e.emit = (add, tier) => {
      const yTop = b + L.H + L.mt, yBot = b - 2;
      const drawRear = (c, lodTier) => {
        const p = fp.project(v.z, v.u, b);
        if (!p) return;
        const s = Math.min(p.s, 9);
        if (T) {
          const lv = Math.max(lodTier === 2 ? 2 : 0, level(REAR_K, s * 0.95));
          c.drawImage(lv === 0 ? hiLevel(ts, L, false) : T.R[lv], p.x + T.bx0 * s, p.y + T.by0 * s, (T.bx1 - T.bx0) * s, (T.by1 - T.by0) * s);
        } else vecRear(c, v, p, s);
        const a0 = c.globalAlpha;
        // lamps: tail lights at night, brake lights, indicators
        if (night) lampRects(c, L.tails, p.x, p.y, s, '#ff4a3a');
        if (v.brk > 0.05) { c.globalAlpha = a0 * clamp(v.brk, 0, 1); lampRects(c, L.tails, p.x, p.y, s, '#ff8a7a'); c.globalAlpha = a0; }
        if (v.ind && Math.sin(t * 9.5) > 0) {
          c.fillStyle = '#ffc233';
          const q0 = L.inds[0], q1 = L.inds[1];
          if (v.ind !== 1) c.fillRect(p.x + q0[0] * s, p.y + q0[1] * s, q0[2] * s, q0[3] * s);
          if (v.ind !== -1) c.fillRect(p.x + q1[0] * s, p.y + q1[1] * s, q1[2] * s, q1[3] * s);
        }
        if (night && L.win && lodTier < 2) {
          c.fillStyle = 'rgba(215,255,228,0.3)';
          c.fillRect(p.x + L.win[0] * s, p.y + L.win[1] * s, L.win[2] * s, L.win[3] * s);
          if (L.win2) c.fillRect(p.x + L.win2[0] * s, p.y + L.win2[1] * s, L.win2[2] * s, L.win2[3] * s);
        }
        // glows
        const d = p.d;
        if (night || v.brk > 0.3) {
          const always = !(glowK > 0), ga = night ? (always ? 0.45 : 1) : 0.35 * v.brk;
          if (lodTier === 2) fp.glow(p.x, p.y - 45 * s, 34 * s + 2, '#ff3322', d, ga * (0.5 + v.brk * 0.4), always || !night);
          else for (const q of L.tails) fp.glow(p.x + (q[0] + q[2] / 2) * s, p.y + (q[1] + q[3] / 2) * s, (night ? 21 + v.brk * 12 : 9) * s + 2.5, '#ff3322', d, ga * (0.55 + v.brk * 0.45), always || !night);
          if (night && lodTier < 2) {
            const sp = fp.project(v.z - v.len - 150, v.us + 26, 0);
            if (sp) fp.glow(sp.x, sp.y, Math.min(260, (v.kind === 'bike' ? 60 : 95) * sp.s), '#ffe3a8', sp.d, always ? 0.12 : 0.24, always);
            if (L.win) fp.glow(p.x + (L.win[0] + L.win[2] / 2) * s, p.y + (L.win[1] + L.win[3] / 2) * s, L.win[2] * 0.55 * s, '#cfffe0', d, always ? 0.15 : 0.3, always);
          }
        }
        if (L.solid) fp.solid(p.x - W2 * s, p.y - L.H * s, p.x + W2 * s, p.y - 22 * s, d);
        // exhaust puffs trailing behind
        if (lodTier < 2) for (const pf of v.puffs) {
          const q = fp.project(pf.z, pf.u, pf.h);
          if (!q) continue;
          const k = clamp(pf.t / pf.life, 0, 1);
          c.globalAlpha = a0 * (1 - k) * (pf.dark ? 0.42 : 0.3);
          c.beginPath(); c.arc(q.x, q.y, Math.min(400, (5 + k * 15) * q.s), 0, TAU);
          c.fillStyle = pf.dark ? '#3b3b3e' : '#dfe6ec'; c.fill();
        }
        c.globalAlpha = a0;
      };
      if (tier === 2) {
        add(v.z, (c) => {
          if (sideOK) { if (T) sideStrips(c, v, T.S[Math.max(2, level(SIDE_K, (F / dN) * 0.75))], dN, dF, 24, yTop, yBot, 2); else vecSide(c, v, cam.z - dF, cam.z - dN, b); }
          if (rearOK) drawRear(c, 2);
        }, v.u, W2 + 60);
        return;
      }
      if (sideOK) {
        const n = tier === 0 ? cuts.length - 1 : 1;
        for (let i = 0; i < n; i++) {
          const a = tier === 0 ? cuts[i] : dN, bb = tier === 0 ? cuts[i + 1] : dF, last = i === n - 1;
          add(cam.z - bb, (c) => {
            if (last) shadowQuads(c, v, tier === 0);
            if (T) {
              const s = F / a, lv = level(SIDE_K, s * 0.75);
              const k = Math.max(lv, tier === 1 ? 1 : 0);
              sideStrips(c, v, k === 0 ? hiLevel(ts, L, true) : T.S[k], a, bb, tier === 0 ? 7 : 13, yTop, yBot);
            } else vecSide(c, v, cam.z - bb, cam.z - a, b);
            if (night && L.sideWin) { // tube-lit bus interiors glowing through the side windows
              const oA = Math.max(L.sideWin[0][0], v.z - (cam.z - a)), oB = Math.min(L.sideWin[0][1], v.z - (cam.z - bb));
              if (oB > oA) for (const w of L.sideWin) {
                const hw = b + L.H - (w[2] + w[3]) / 2;
                if (tier === 0) {
                  const a0 = c.globalAlpha; c.globalAlpha = a0 * 0.3;
                  if (fp.wallQuad(c, v.z - oB, v.z - oA, v.us, b + L.H - w[3], b + L.H - w[2])) { c.fillStyle = '#d7ffe4'; c.fill(); }
                  c.globalAlpha = a0;
                }
                for (const f of [0.25, 0.75]) {
                  const g = fp.project(v.z - (oA + (oB - oA) * f), v.us, hw);
                  if (g) fp.glow(g.x, g.y, Math.min(300, (w[3] - w[2]) * 1.1 * g.s), '#d9ffe6', g.d, glowK > 0 ? 0.32 : 0.14, !(glowK > 0));
                }
              }
            }
            if (L.solid) {
              const s = F / bb, xa = CX + (du * F) / a, xb = CX + (du * F) / bb;
              fp.solid(xa, HY + (cam.h - b - L.H) * s, xb, HY + (cam.h - b - 22) * s, a * 1.4);
            }
          }, v.us, 40);
        }
      }
      if (rearOK) add(v.z, (c) => { if (!sideOK) shadowQuads(c, v, false); drawRear(c, tier); }, v.u, W2 + 60);
    };
    E.push(e);
  }

  // ---------- drawing: people ----------
  // The nearest people are vector figures (animated, crisp). Everyone else is one frame of a pre-painted
  // sheet (walk cycle in front and back view, standing poses) drawn with a single drawImage; looks come
  // from a small pool so the sheets stay few. Until a sheet is painted, a few rects stand in.
  const SPR_K = [0.5, 0.25, 0.125];
  const WALK_N = 6;
  const FULL_S = 0.62;                     // px per unit from which people are vector figures
  const COST_RECT = 11, COST_FAR = 3;
  function cellBox(wu, hu) { // cell rounded to whole pixels (multiples of 4 at level 0, so the mips stay exact)
    const w = (4 * Math.ceil((wu * SPR_K[0]) / 4)) / SPR_K[0], h = (4 * Math.ceil((hu * SPR_K[0]) / 4)) / SPR_K[0];
    return { x0: -w / 2, y0: 4 - h, w, h };
  }
  function buildSheet(box, n, draw) {
    const c0 = paint(box.w * n, box.h, SPR_K[0], (g) => {
      for (let f = 0; f < n; f++) { g.save(); g.translate(f * box.w - box.x0, -box.y0); draw(g, f); g.restore(); }
    });
    if (!c0) return null;
    const c1 = mip(c0, 0.5);
    return { lv: [c0, c1, mip(c1, 0.5)], box, n };
  }
  function sheetOf(ts, o, make) {
    if (o._stale && o._sh && ts.sheetB < 2) { ts.sheetB++; o._stale = false; const ns = make(); if (ns) { for (const c of o._sh.lv) c.width = 0; o._sh = ns; } }
    if (o._sh !== undefined) return o._sh;
    if (ts.sheetB >= 3) return undefined; // a few per frame
    ts.sheetB++;
    o._sh = make();
    if (o._sh) ts.sheets.push(o);
    return o._sh;
  }
  const personSheet = (P) => {
    const wide = P.acc === 'umbrella' || P.acc === 'basket' || P.acc === 'sack';
    return buildSheet(cellBox(wide ? 70 : 44, P.acc === 'umbrella' ? 136 : P.acc === 'basket' ? 126 : 110), WALK_N * 2 + 2, (g, f) => {
      const walk = f < WALK_N * 2;
      ell(g, 0, 0, 13, 2.8, 'rgba(0,0,0,0.2)');
      figure(g, P, { front: f < WALK_N || f === WALK_N * 2, q: walk ? ((f % WALK_N) / WALK_N) * TAU : 0, mv: walk ? 1 : 0, tier: 0 });
    });
  };
  const dogSheet = (D) => buildSheet(cellBox(112, 66), WALK_N * 2 + 2, (g, f) => {
    const walk = f < WALK_N * 2;
    ell(g, 0, 0, 28, 2.8, 'rgba(0,0,0,0.2)');
    dog(g, D, { view: walk ? 'trot' : 'lie', face: (walk ? f < WALK_N : f === WALK_N * 2) ? 1 : -1, q: walk ? ((f % WALK_N) / WALK_N) * TAU : 0, mv: 1, t: 0, tier: 0 });
  });
  const cartSheet = (P) => buildSheet(cellBox(70, 128), 2, (g, f) => {
    ell(g, 0, 0, 26, 3, 'rgba(0,0,0,0.2)');
    g.save(); g.translate(0, -2); figure(g, P, { front: true, t: f * 0.1, tier: 0, act: 'shake' }); g.restore();
    g.translate(0, 18); cart(g, true);
  });
  const memberSheet = (m) => {
    const P = m.P, wide = P.acc === 'umbrella' || P.acc === 'sack';
    return buildSheet(cellBox(wide ? 70 : 48, P.acc === 'umbrella' ? 136 : 110), 1, (g) => {
      if (!m.sit) ell(g, 0, 0, 13, 2.8, 'rgba(0,0,0,0.2)');
      figure(g, P, { front: m.front, t: m.ph, tier: 0, sit: m.sit, act: m.act === 'look' ? null : m.act });
    });
  };
  function sheetFor(ts, p) {
    if (p.kind === 'dog') return sheetOf(ts, p.D, () => dogSheet(p.D));
    if (p.cart) return sheetOf(ts, p.P.cartLook || (p.P.cartLook = { text: true }), () => cartSheet(p.P));
    return sheetOf(ts, p.P, () => personSheet(p.P));
  }
  function frameOf(p, t) {
    if (p.cart) return Math.sin(t * 16 + p.seed) > 0 ? 1 : 0;
    const w = Math.floor(((((p.ph % TAU) + TAU) % TAU) / TAU) * WALK_N) % WALK_N;
    if (p.kind === 'dog') return p.still ? (p.flip > 0 ? WALK_N * 2 : WALK_N * 2 + 1) : ((p.u > cam.u ? 1 : -1) * p.dir > 0 ? 0 : WALK_N) + w;
    return p.still ? (p.face > 0 ? WALK_N * 2 : WALK_N * 2 + 1) : (p.face > 0 ? 0 : WALK_N) + w;
  }
  function drawSheet(c, S, f, x, y, s) {
    const lv = s > SPR_K[1] * 1.25 ? 0 : s > SPR_K[2] * 1.25 ? 1 : 2, img = S.lv[lv], fw = img.width / S.n, B = S.box;
    c.drawImage(img, f * fw, 0, fw, img.height, x + B.x0 * s, y + B.y0 * s, B.w * s, B.h * s);
  }
  function personCost(p) { // vector figure
    const base = 7; // item save/restore, translate + scale, contact shadow
    if (p.kind === 'dog') {
      const view = p.still ? 'lie' : 'trot';
      return base + 1 + costOf(p.D, `d${view}`, (g) => dog(g, p.D, { view, tier: 0, mv: 1, q: 0.5, t: 99 }));
    }
    if (p.cart) return base + 4 + figCost(p.P, 0, true, false, 'shake') + costOf(p.P, 'cart', (g) => cart(g, true));
    return base + figCost(p.P, 0, p.face > 0, false, null);
  }
  const BENCH_C = 9, STOVE_C = 28;
  function memberCost(m) {
    if (m.bench) return BENCH_C;
    if (m.stove) return STOVE_C;
    return 5 + (m.sit ? 0 : 3) + figCost(m.P, 0, m.front, m.sit, m.act === 'look' ? null : m.act);
  }
  function rectFigure(c, P, x, y, s, front, q) { // stand-in while a sheet is being painted (≤ 8 calls)
    const skirt = P.low === 'saree' || P.low === 'burqa' || P.low === 'skirt';
    const top = P.topLen === 'long' ? 54 : P.topLen === 'burqa' ? 79 : 34;
    c.fillStyle = P.low === 'lungi' || P.low === 'shorts' ? P.skin : P.lowCol;
    if (skirt) c.fillRect(x - 9 * s, y - 50 * s, 18 * s, 48 * s);
    else {
      const a = q ? Math.max(0, Math.sin(q)) * 5 : 0, b = q ? Math.max(0, -Math.sin(q)) * 5 : 0;
      c.fillRect(x - 7.6 * s, y - 49 * s, 5.8 * s, (47 - a) * s); c.fillRect(x + 1.8 * s, y - 49 * s, 5.8 * s, (47 - b) * s);
    }
    if (P.low === 'lungi' || P.low === 'shorts') { c.fillStyle = P.lowCol; c.fillRect(x - 10.5 * s, y - 53 * s, 21 * s, (P.low === 'lungi' ? 39 : 22) * s); }
    c.fillStyle = P.top; c.fillRect(x - 11.5 * s, y - 80 * s, 23 * s, top * s);
    c.beginPath(); c.arc(x, y - 89.5 * s * P.hs, 7.6 * s * P.hs, 0, TAU);
    c.fillStyle = P.head === 'hijab' || P.head === 'veil' ? P.headCol : front ? P.skin : HAIR; c.fill();
    if (P.acc === 'umbrella') { c.fillStyle = P.accCol; c.fillRect(x - 28 * s, y - 124 * s, 56 * s, 12 * s); }
    else if (P.acc === 'basket') { c.fillStyle = P.goods[0]; c.fillRect(x - 18 * s, y - 108 * s, 36 * s, 9 * s); }
  }
  function rectWalker(c, p, x, y, s) {
    if (p.kind === 'dog') {
      const f = p.still ? p.flip : (p.u > cam.u ? 1 : -1) * p.dir;
      c.fillStyle = p.D.c;
      if (p.still) { c.fillRect(x - 24 * s, y - 17 * s, 46 * s, 17 * s); c.fillRect(x + (f > 0 ? 17 : -31) * s, y - 20 * s, 14 * s, 13 * s); return; }
      c.fillRect(x - 22 * s, y - 39 * s, 44 * s, 18 * s); c.fillRect(x + (f > 0 ? 20 : -32) * s, y - 52 * s, 12 * s, 14 * s);
      c.fillStyle = p.D.d; c.fillRect(x - 20 * s, y - 22 * s, 40 * s, 22 * s);
      return;
    }
    if (p.cart) { c.fillStyle = '#b0703a'; c.fillRect(x - 26 * s, y - 64 * s, 52 * s, 36 * s); }
    rectFigure(c, p.P, x, y, s * p.P.sc, p.face > 0, p.still ? 0 : p.ph);
  }
  function drawWalker(c, p, t) { // vector figure, near the camera
    const pr = fp.project(p.z, p.u, CURB);
    if (!pr) return;
    const s = Math.min(pr.s, 7) * (p.P ? p.P.sc : 1);
    c.translate(pr.x, pr.y); c.scale(s, s);
    ell(c, 0, 0, p.kind === 'dog' ? 28 : 13, 2.8, 'rgba(0,0,0,0.2)');
    const mv = p.still ? 0 : 1;
    if (p.kind === 'dog') { dog(c, p.D, { view: p.still ? 'lie' : 'trot', face: p.still ? p.flip : (p.u > cam.u ? 1 : -1) * p.dir, q: p.ph, mv, t, tier: 0 }); return; }
    if (p.cart) {
      c.save(); c.translate(0, -2);
      figure(c, p.P, { front: true, t: t + p.seed, tier: 0, act: 'shake', look: Math.sin(t * 0.7 + p.seed) * 1.5 });
      c.restore();
      c.translate(0, 18); cart(c, true);
      return;
    }
    figure(c, p.P, { front: p.face > 0, q: p.ph, mv, t, tier: 0, look: p.still ? Math.sin(t * 0.8 + p.seed) * 1.6 : 0 });
  }
  // near people hide the lamps and lit windows behind them at night
  function personSolid(z, u, h, sc, w) {
    const q = fp.project(z, u, h);
    if (q) fp.solid(q.x - (w || 11) * q.s * sc, q.y - 96 * q.s * sc, q.x + (w || 11) * q.s * sc, q.y, q.d);
  }
  function planPeople(ts, E, night, glowK) {
    const t = ts.t;
    for (const p of ts.people) {
      const d = cam.z - p.z;
      if (d < 60 || d > fp.FAR - 60) continue;
      const s = F / d, x = CX + (p.u - cam.u) * s;
      if (x + 40 * s < -30 || x - 40 * s > 1030) continue;
      const want = s >= FULL_S ? 0 : s >= 0.11 ? 1 : 2;
      const S = want > 0 ? sheetFor(ts, p) : p.kind === 'dog' ? p.D._sh : p.cart ? p.P.cartLook && p.P.cartLook._sh : p.P._sh;
      const glowy = night && ((p.cart && d < 4000) || (p.P && (p.P.acc === 'phoneLook' || p.P.acc === 'phone') && d < 1600));
      const e = { kind: p.kind, d, tier: want, costs: [personCost(p), S ? 3 : COST_RECT, S ? 1 : COST_FAR], emit: null };
      e.emit = (add, tier) => {
        if (tier === 2) { ts.bucket.push(p); return; }
        add(p.z, (c) => {
          if (tier === 0) drawWalker(c, p, t);
          else {
            const q = fp.project(p.z, p.u, CURB);
            if (!q) return;
            const sc = p.P && !p.cart ? p.P.sc : 1;
            if (S) drawSheet(c, S, frameOf(p, t), q.x, q.y, q.s * sc); else rectWalker(c, p, q.x, q.y, q.s);
          }
          if (night && p.kind !== 'dog' && s >= 0.3) personSolid(p.z, p.u, CURB, p.P.sc, p.cart ? 26 : 11);
          if (glowy) {
            const q = fp.project(p.z, p.u, CURB + (p.cart ? 95 + 18 : 70));
            if (q) fp.glow(q.x + (p.cart ? -16 * q.s : 0), q.y, (p.cart ? 70 : 22) * q.s + 1.5, p.cart ? '#ffcf70' : '#9fd8ff', q.d, glowK > 0 ? 0.6 : 0.3, !(glowK > 0));
          }
        }, p.u, 45);
      };
      E.push(e);
    }
  }
  function flushBucket(ts, add) { // far people, a few per depth band, one item each band
    const B = ts.bucket;
    if (!B.length) return;
    const groups = new Map();
    for (const p of B) {
      const key = (p.side > 0 ? 1000 : 0) + Math.floor((cam.z - p.z) / 600);
      let g = groups.get(key);
      if (!g) { g = []; groups.set(key, g); }
      g.push(p);
    }
    B.length = 0;
    for (const g of groups.values()) {
      let zN = -Infinity, u = 0;
      for (const p of g) { if (p.z > zN) zN = p.z; u += p.u; }
      add(zN, (c) => {
        const a0 = c.globalAlpha, fN = Math.max(0.01, fp.fade(cam.z - zN));
        for (const p of g) {
          const q = fp.project(p.z, p.u, CURB);
          if (!q) continue;
          c.globalAlpha = clamp((a0 * fp.fade(q.d)) / fN, 0, 1); // each at its own fog depth
          const S = p.kind === 'dog' ? p.D._sh : p.cart ? p.P.cartLook && p.P.cartLook._sh : p.P._sh;
          const s = q.s * (p.P && !p.cart ? p.P.sc : 1);
          if (S) { drawSheet(c, S, frameOf(p, ts.t), q.x, q.y, s); continue; }
          if (p.kind === 'dog') { c.fillStyle = p.D.c; if (p.still) c.fillRect(q.x - 24 * s, q.y - 17 * s, 48 * s, 17 * s); else c.fillRect(q.x - 22 * s, q.y - 38 * s, 44 * s, 38 * s); continue; }
          const P = p.P;
          c.fillStyle = P.lowCol; c.fillRect(q.x - 5.5 * s, q.y - 48 * s, 11 * s, 48 * s);
          c.fillStyle = P.top; c.fillRect(q.x - 10 * s, q.y - 80 * s, 20 * s, 34 * s);
          c.fillStyle = P.head === 'hijab' ? P.headCol : HAIR; c.fillRect(q.x - 6 * s, q.y - 97 * s, 12 * s, 16 * s);
        }
        c.globalAlpha = a0;
      }, u / g.length, 220);
    }
  }
  function planGroups(ts, E, night, glowK) {
    const t = ts.t;
    for (const G of ts.groups) {
      const d = cam.z - G.zN, dF = cam.z - (G.m.length ? G.m[0].z : G.z) + 70;
      if (dF < NEAR + 6 || d > fp.FAR - 60) continue;
      const dd = Math.max(d, NEAR + 6), s = F / dd, x = CX + (G.u - cam.u) * s;
      if (x + 110 * s < -30 || x - 110 * s > 1030) continue;
      const want = s >= 0.85 ? 0 : 1; // groups are dense: vector only when close
      if (want || s >= 0.6) for (const m of G.m) sheetOf(ts, m, () => memberSheet(m));
      if (!G.c0) G.c0 = G.items.reduce((n, m) => n + memberCost(m), 2);
      const c1 = G.items.reduce((n, m) => n + (m.bench || m.stove ? 1 : m._sh ? 1 : 8), 2);
      const e = { kind: 'group', d: dd, tier: want, costs: [G.c0, c1], emit: null };
      e.emit = (add, tier) => {
        add(G.zN, (c) => {
          const a0 = c.globalAlpha;
          for (const m of G.items) {
            const q = fp.project(m.z, m.u, CURB);
            if (!q || q.d < 60) continue;
            if (tier === 1) {
              if (m.bench) { c.fillStyle = '#8a5a33'; c.fillRect(q.x - 50 * q.s, q.y - 29 * q.s, 100 * q.s, 7 * q.s); }
              else if (m.stove) { c.fillStyle = '#6b4a2e'; c.fillRect(q.x - 10 * q.s, q.y - 33 * q.s, 20 * q.s, 33 * q.s); }
              else if (m._sh) drawSheet(c, m._sh, 0, q.x, q.y, q.s * m.P.sc);
              else rectFigure(c, m.P, q.x, q.y, q.s * m.P.sc, m.front);
              if (night && m.stove) { const g = fp.project(m.z, m.u, CURB + 6); if (g) fp.glow(g.x, g.y, 40 * g.s + 1, '#ff9a3c', g.d, glowK > 0 ? 0.55 : 0.25, !(glowK > 0)); }
              continue;
            }
            c.save();
            const s = Math.min(q.s, 7);
            c.translate(q.x, q.y); c.scale(s, s);
            if (m.bench) {
              c.fillStyle = '#5e3d22'; c.fillRect(-46, -24, 3, 24); c.fillRect(43, -24, 3, 24);
              c.fillStyle = '#8a5a33'; c.fillRect(-50, -27, 100, 5);
              c.fillStyle = '#a8733f'; c.fillRect(-50, -29, 100, 2.4);
            } else if (m.stove) {
              fillPoly(c, [-11, 0, 11, 0, 8, -18, -8, -18], '#9c5a2c');
              c.fillStyle = '#ff7b25'; c.fillRect(-4, -8, 8, 4);
              fillRR(c, -9, -33, 18, 15, 5, '#2b2b2b');
              c.fillStyle = '#2b2b2b'; c.fillRect(7, -30, 8, 2.5);
              const w = Math.sin(t * 2.3) * 3;
              c.globalAlpha = a0 * 0.5;
              line(c, [0, -34, w, -44, -w, -54, w * 0.5, -62], '#f4f4f4', 2.4);
              c.globalAlpha = a0;
              if (night) { const g = fp.project(m.z, m.u, CURB + 6); if (g) fp.glow(g.x, g.y, 40 * g.s + 1, '#ff9a3c', g.d, glowK > 0 ? 0.55 : 0.25, !(glowK > 0)); }
            } else {
              c.scale(m.P.sc, m.P.sc);
              const sip = m.act === 'cup' && Math.sin(t * 0.8 + m.ph) > 0.82;
              const look = m.act === 'look' ? Math.sin(t * 0.6 + m.ph) * 2.2 : m.act === 'chat' ? Math.sin(t * 1.7 + m.ph) * 0.8 : 0;
              if (!m.sit) ell(c, 0, 0, 13, 2.8, 'rgba(0,0,0,0.2)');
              figure(c, m.P, { front: m.front, t: t + m.ph, tier: 0, sit: m.sit, act: m.act === 'look' ? null : m.act, sip, look });
              if (night) personSolid(m.z, m.u, CURB, m.P.sc * (m.sit ? 0.75 : 1));
            }
            c.restore();
          }
        }, G.u, 120);
      };
      E.push(e);
    }
  }
  function planCrossers(ts, E, night) {
    const t = ts.t;
    for (const cr of ts.crossers) {
      const d = cam.z - cr.z;
      if (d < 250 || d > fp.FAR - 60) continue; // never right in front of the camera
      const s = F / d, x = CX + (cr.u - cam.u) * s;
      if (x + 40 * s < -30 || x - 40 * s > 1030) continue;
      const want = s >= 0.55 ? 0 : s >= 0.3 ? 1 : 2;
      const cc = (tr) => 8 + Math.max(figCost(cr.P, tr, true, false, null), costOf(cr.P, 'p' + tr + (cr.raise ? 1 : 0), (g) => profile(g, cr.P, 0.5, 1, tr === 0, cr.raise)));
      const e = { kind: 'crosser', d, tier: want, costs: [cc(0), cc(1), COST_RECT], emit: null };
      e.emit = (add, tier) => {
        add(cr.z, (c) => {
          const q = fp.project(cr.z, cr.u, cr.h);
          if (!q) return;
          const s = Math.min(q.s, 7) * cr.P.sc;
          if (tier === 2) { rectFigure(c, cr.P, q.x, q.y, s, true); return; }
          c.translate(q.x, q.y); c.scale(s, s);
          ell(c, 0, 0, 13, 2.8, 'rgba(0,0,0,0.2)');
          const moving = cr.state === 'go' && cr.delay <= 0;
          if (night) personSolid(cr.z, cr.u, cr.h, cr.P.sc);
          if (moving) { c.scale(cr.dirU, 1); profile(c, cr.P, cr.ph, 1, tier === 0, cr.raise && cr.dirU < 0); }
          else figure(c, cr.P, { front: true, t, tier, look: Math.sin(t * 0.9 + cr.ph) * 2 });
        }, cr.u, 40);
      };
      E.push(e);
    }
  }

  // Fit the frame into the budget: cheaper representations first (farthest first), dropping things only
  // as a last resort.
  function govern(E, budget) {
    let total = 0;
    for (const e of E) total += e.costs[e.tier];
    if (total <= budget) return;
    E.sort((a, b) => b.d - a.d);
    for (let pass = 0; pass < 3 && total > budget; pass++) {
      for (const e of E) {
        if (total <= budget) break;
        if (e.tier < 0 || e.tier >= e.costs.length - 1) continue;
        const c = e.costs[e.tier];
        e.tier++; total += e.costs[e.tier] - c;
      }
    }
    for (const e of E) {
      if (total <= budget) break;
      if (e.tier >= 0) { total -= e.costs[e.tier]; e.tier = -1; }
    }
  }

  // ---------- public ----------
  TH.fpTraffic = {
    create(road, rng) {
      road = road || {};
      const r = typeof rng === 'function' ? rng : TH.mulberry32(20240917);
      const num = (x, d) => (isFinite(+x) && +x > 0 ? +x : d);
      const ts = {
        rng: r, t: 0, cars: [], lanes: [[], [], []], people: [], groups: [], stopsL: [], crossers: [], bucket: [], plan: [],
        looks: { bus: [], truck: [], cng: [], car: [], bike: [] }, built: [], hi: new Set(), sheets: [], sheetB: 0, builds: 0, firstBuild: -1, fontFix: false, lastLight: null,
        mix: weights(road.traffic, DEF_TRAFFIC), dens: clamp(num(road.trafficDensity, 1), 0.25, 3),
        lifeMix: weights(road.life, DEF_LIFE), lifeDens: clamp(num(road.lifeDensity, 1), 0.2, 2.5),
        spots: Array.isArray(road.lifeSpots) ? road.lifeSpots : DEF_SPOTS,
      };
      const lr = TH.mulberry32((r() * 4294967296) >>> 0);
      for (let i = 0; i < 7; i++) ts.looks.bus.push(lookBus(lr, false));
      for (let i = 0; i < 2; i++) ts.looks.bus.push(lookBus(lr, true));
      for (let i = 0; i < 4; i++) ts.looks.truck.push(lookTruck(lr));
      for (let i = 0; i < 3; i++) ts.looks.cng.push(lookCng(lr));
      for (const ty of ['sedan', 'sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'micro']) ts.looks.car.push(lookCar(lr, ty));
      for (const ty of ['solo', 'astride', 'side', 'hijab', 'box', 'kid', 'astride']) ts.looks.bike.push(lookBike(lr, ty));
      // a pool of looks for the sidewalk crowd (each look gets one sprite sheet)
      ts.pool = { walker: [], woman: [], kid: [], hawker: [], vendor: [], dog: [] };
      for (let i = 0; i < 11; i++) ts.pool.walker.push(makeLook(lr, 'walker'));
      for (let i = 0; i < 10; i++) ts.pool.woman.push(makeLook(lr, 'woman'));
      for (let i = 0; i < 4; i++) ts.pool.kid.push(makeLook(lr, 'kid'));
      for (let i = 0; i < 3; i++) ts.pool.hawker.push(makeLook(lr, 'hawker'));
      for (let i = 0; i < 2; i++) { const P = makeLook(lr, 'hawker'); P.acc = null; ts.pool.vendor.push(P); }
      for (const c of DOGS) ts.pool.dog.push({ c: c[0], d: c[1], ear: lr() < 0.45, ph: lr() * TAU });
      buildGroups(ts);
      populateTraffic(ts);
      populatePeople(ts);
      return ts;
    },

    update(ts, dt, env) {
      if (!ts) return;
      dt = clamp(+dt || 0, 0, 0.5);
      if (dt <= 0) return;
      ts.t += dt;
      const n = Math.ceil(dt / 0.05), h = dt / n;
      for (let i = 0; i < n; i++) stepTraffic(ts, h);
      stepPuffs(ts, dt);
      stepPeople(ts, dt);
      stepCrossers(ts, dt, env);
    },

    add(ts, env, add) {
      if (!ts || typeof add !== 'function') return;
      ts.builds = 0; ts.sheetB = 0;
      if (((ts.t * 0.5) | 0) !== ts.freeT) { ts.freeT = (ts.t * 0.5) | 0; freeHi(ts, false); }
      // textures painted before the web font arrived are repainted once
      if (!ts.fontFix && ts.firstBuild >= 0 && ts.t > 4) {
        ts.fontFix = true;
        if (ts.firstBuild < 3.5) { for (const L of ts.built) L.stale = true; for (const o of ts.sheets) if (o.text) o._stale = true; }
      }
      const lit = (env && env.lit) || {};
      const glowK = +lit.glow > 0 ? +lit.glow : 0, night = glowK > 0 || !!lit.headlights;
      const E = ts.plan;
      E.length = 0;
      for (const v of ts.cars) planVehicle(ts, v, E, night, glowK, env);
      planPeople(ts, E, night, glowK);
      planGroups(ts, E, night, glowK);
      planCrossers(ts, E, night);
      govern(E, BUDGET - 40);
      for (const e of E) if (e.tier >= 0) e.emit(add, e.tier);
      flushBucket(ts, add);
    },

    dispose(ts) {
      if (!ts) return;
      freeTex(ts);
      ts.cars.length = 0; ts.people.length = 0; ts.groups.length = 0; ts.crossers.length = 0;
    },
  };
})();
