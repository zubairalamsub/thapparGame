// The street itself (shared by every road): footpath, curb, asphalt, lane markings,
// stop line + zebra crossing, one-way sign, and the traffic light.
(function () {
  'use strict';
  const TH = window.TH;
  const { W, H, STOP_X } = TH;

  TH.street = {
    // env: { t, light, lightT, road }   road.street may carry palette overrides (see js/ART_CONTRACT.md)
    draw(ctx, env) {
      const o = (env.road && env.road.street) || {};

      // footpath (y 300..347)
      ctx.fillStyle = o.footpath || '#c2b59b';
      ctx.fillRect(0, 300, W, 47);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x - 10, 347); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, 323); ctx.lineTo(W, 323); ctx.stroke();

      // one-way sign
      ctx.fillStyle = '#777'; ctx.fillRect(248, 232, 5, 116);
      ctx.fillStyle = '#1d4ed8'; TH.rr(ctx, 206, 206, 90, 38, 6); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; TH.rr(ctx, 209, 209, 84, 32, 4); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 12px ${TH.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('একমুখী রাস্তা', 251, 218);
      ctx.beginPath(); ctx.moveTo(222, 232); ctx.lineTo(270, 232); ctx.lineTo(270, 227); ctx.lineTo(282, 234); ctx.lineTo(270, 241); ctx.lineTo(270, 236); ctx.lineTo(222, 236); ctx.closePath(); ctx.fill();

      // curb (y 345..352)
      const curb = o.curb || ['#facc15', '#111'];
      for (let x = 0; x < W; x += 24) {
        ctx.fillStyle = (x / 24) % 2 ? curb[1] : curb[0];
        ctx.fillRect(x, 345, 24, 7);
      }

      // asphalt (y 352..600)
      ctx.fillStyle = o.asphalt || '#4a4a50';
      ctx.fillRect(0, 352, W, H - 352);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 18; i++) ctx.fillRect((i * 173) % W, 360 + ((i * 97) % 230), 30 + (i % 3) * 12, 4); // patches
      ctx.fillStyle = '#e5e5e5';
      for (const y of [445, 525]) for (let x = 10; x < W; x += 60) ctx.fillRect(x, y, 30, 4);

      // stop line + zebra crossing
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(STOP_X - 3, 354, 6, H - 354);
      ctx.fillStyle = 'rgba(245,245,245,0.85)';
      for (let y = 358; y < H; y += 24) ctx.fillRect(STOP_X + 12, y, 58, 12);
    },

    drawTrafficLight(ctx, env) {
      const x = STOP_X + 26;
      ctx.fillStyle = '#3f3f46'; ctx.fillRect(x - 3, 230, 6, 120);
      ctx.fillStyle = '#18181b'; TH.rr(ctx, x - 15, 160, 30, 76, 7); ctx.fill();
      const lamps = [['red', '#ef4444', '#4a1515', 178], ['yellow', '#facc15', '#4a4015', 198], ['green', '#22c55e', '#143d22', 218]];
      for (const [name, on, off, y] of lamps) {
        const lit = env.light === name;
        if (lit) { ctx.shadowColor = on; ctx.shadowBlur = 18; }
        TH.circle(ctx, x, y, 8, lit ? on : off);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = '#000'; TH.rr(ctx, x - 15, 240, 30, 20, 4); ctx.fill();
      ctx.fillStyle = env.light === 'red' ? '#ef4444' : env.light === 'yellow' ? '#facc15' : '#22c55e';
      ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(env.lightT)).padStart(2, '0'), x, 251);
    },
  };
})();
