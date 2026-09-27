// Road: Badda — crowded shops, tangled electric wires, crows.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;

  TH.roads.push({
    id: 'badda',
    order: 1,
    name: 'বাড্ডা',
    nameEn: 'Badda',
    tagline: 'দোকান, জট আর তারের জঙ্গল',
    weights: { wrongway: 2, footpath: 2, phone: 1, overload: 1, overcharge: 1, tesla: 2 },
    street: {},

    init(rng) {
      const rp = (a) => a[(rng() * a.length) | 0];
      const colors = ['#c9a27e', '#d9c7a3', '#9fb3a8', '#c47f5a', '#e0d4b8', '#a7a0b8', '#d8a15f', '#b5c4b1'];
      const signs = ['মায়ের দোয়া স্টোর', 'ঢাকা বিরিয়ানি', 'মোবাইল সার্ভিসিং', 'চা-নাস্তা', 'ফার্মেসী', 'কাচ্চি ঘর', 'টেইলার্স', 'বাবার দোয়া', 'হোটেল ভাই ভাই', 'স্বপ্ন সুইটস'];
      const signColors = ['#c1121f', '#2b9348', '#1d3557', '#f77f00', '#6a040f'];
      const far = [];
      for (let x = -20; x < W + 20;) {
        const w = 50 + rng() * 80;
        far.push({ x, w, h: 150 + rng() * 120 });
        x += w;
      }
      const buildings = [];
      let si = 0;
      for (let x = -10; x < W + 10;) {
        const w = 85 + rng() * 80, h = 120 + rng() * 120;
        const cols = Math.max(2, Math.floor((w - 14) / 24));
        const rows = Math.max(1, Math.floor((h - 80) / 32));
        const win = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) win.push((rng() * 10) | 0);
        buildings.push({ x, w, h, color: rp(colors), cols, rows, win, sign: signs[si++ % signs.length], signColor: rp(signColors) });
        x += w + (rng() < 0.4 ? 3 : 0);
      }
      const poles = [60, 440, 830];
      const wires = [];
      const ends = [-30, ...poles, W + 30];
      for (let i = 0; i < ends.length - 1; i++) {
        for (let j = 0; j < 7; j++) {
          wires.push({ x1: ends[i], x2: ends[i + 1], y1: 142 + j * 5 + rng() * 6, y2: 142 + j * 5 + rng() * 6, sag: 12 + rng() * 40 });
        }
      }
      const coils = poles.map(() => Array.from({ length: 6 }, () => ({ dx: (rng() - 0.5) * 22, dy: 145 + rng() * 25, rx: 6 + rng() * 10, ry: 4 + rng() * 6 })));
      const crows = [{ x: 250, w: 7 }, { x: 300, w: 9 }, { x: 610, w: 16 }];
      const clouds = [{ x: 120, y: 60, s: 1 }, { x: 520, y: 40, s: 1.3 }, { x: 860, y: 75, s: 0.9 }];
      return { far, buildings, poles, wires, coils, crows, clouds };
    },

    update(s, dt) {
      for (const c of s.clouds) { c.x += 6 * c.s * dt; if (c.x > W + 120) c.x = -120; }
    },

    drawBack(ctx, s) {
      const sky = ctx.createLinearGradient(0, 0, 0, 300);
      sky.addColorStop(0, '#f3c98b');
      sky.addColorStop(1, '#fbe9cf');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, 300);
      TH.circle(ctx, 800, 90, 34, 'rgba(255,240,200,0.9)');

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (const c of s.clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 50 * c.s, 14 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 30 * c.s, c.y - 8 * c.s, 30 * c.s, 14 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(150,140,170,0.45)';
      for (const f of s.far) ctx.fillRect(f.x, 300 - f.h, f.w - 2, f.h);

      for (const b of s.buildings) {
        const top = 300 - b.h;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, top, b.w, b.h);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(b.x, top, b.w, 6);
        const gx = (b.w - b.cols * 24) / 2 + 5;
        for (let r = 0; r < b.rows; r++) {
          for (let c = 0; c < b.cols; c++) {
            const v = b.win[r * b.cols + c];
            const wx = b.x + gx + c * 24, wy = top + 16 + r * 32;
            ctx.fillStyle = v < 3 ? '#4b5563' : v < 6 ? '#fde68a' : '#6b7280';
            ctx.fillRect(wx, wy, 14, 18);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(wx - 2, wy + 18, 18, 3);
            if (v === 8) { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(wx + 1, wy + 11, 12, 7); } // AC unit
            if (v === 9) { // clothes drying
              TH.line(ctx, [wx - 3, wy + 4, wx + 17, wy + 4], '#444', 1);
              ctx.fillStyle = '#e63946'; ctx.fillRect(wx + 2, wy + 4, 4, 7);
              ctx.fillStyle = '#2a9d8f'; ctx.fillRect(wx + 8, wy + 4, 4, 9);
            }
          }
        }
        // shop: signboard + shutter
        ctx.fillStyle = b.signColor;
        ctx.fillRect(b.x + 3, 300 - 64, b.w - 6, 22);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 12px ${TH.FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.sign, b.x + b.w / 2, 300 - 52, b.w - 10);
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(b.x + 6, 300 - 40, b.w - 12, 40);
        ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1;
        for (let y = 300 - 36; y < 300; y += 5) { ctx.beginPath(); ctx.moveTo(b.x + 6, y); ctx.lineTo(b.x + b.w - 6, y); ctx.stroke(); }
      }
    },

    // Things standing on the footpath (drawn after the footpath/road surface).
    drawMid(ctx, s) {
      for (const p of s.poles) {
        ctx.fillStyle = '#8b8b8b'; ctx.fillRect(p - 4, 130, 8, 216);
        ctx.fillStyle = '#6b6b6b'; ctx.fillRect(p - 22, 140, 44, 5);
      }
      for (const w of s.wires) {
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.quadraticCurveTo((w.x1 + w.x2) / 2, Math.max(w.y1, w.y2) + w.sag, w.x2, w.y2);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.3; ctx.stroke();
      }
      s.coils.forEach((cs, i) => {
        for (const c of cs) {
          ctx.beginPath();
          ctx.ellipse(s.poles[i] + c.dx, c.dy, c.rx, c.ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      });
      for (const c of s.crows) {
        const w = s.wires[c.w];
        const tt = (c.x - w.x1) / (w.x2 - w.x1);
        const cy = (1 - tt) * (1 - tt) * w.y1 + 2 * (1 - tt) * tt * (Math.max(w.y1, w.y2) + w.sag) + tt * tt * w.y2;
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.ellipse(c.x, cy - 6, 7, 5, -0.3, 0, Math.PI * 2); ctx.fill();
        TH.circle(ctx, c.x + 6, cy - 11, 3.5, '#111');
        ctx.beginPath(); ctx.moveTo(c.x - 6, cy - 5); ctx.lineTo(c.x - 13, cy - 2); ctx.lineTo(c.x - 6, cy - 3); ctx.fill();
      }
    },
  });
})();
