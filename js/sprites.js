// Character art: rickshaws (pedal and "Tesla" battery), passengers, the traffic-sergeant player,
// and speech bubbles. Pure drawing — no game logic.
(function () {
  'use strict';
  const TH = window.TH;
  const { W } = TH;

  function drawPassenger(ctx, px, seatY, p, s = 1) {
    TH.line(ctx, [px, seatY, px + 14 * s, seatY, px + 17 * s, seatY + 20 * s], '#374151', 5 * s);
    ctx.fillStyle = p.shirt;
    TH.rr(ctx, px - 7 * s, seatY - 26 * s, 14 * s, 27 * s, 5 * s); ctx.fill();
    TH.circle(ctx, px + 1 * s, seatY - 33 * s, 7 * s, p.skin);
    ctx.beginPath(); ctx.arc(px + 1 * s, seatY - 34 * s, 7 * s, Math.PI, Math.PI * 2); ctx.fillStyle = '#1f1f1f'; ctx.fill();
  }

  TH.sprites = {
    // Draws rickshaw `k` with its ground line at y = gy. See js/ART_CONTRACT.md for the field list and fixed geometry.
    drawRickshaw(ctx, k, gy) {
      const line = (pts, c, w) => TH.line(ctx, pts, c, w);
      const circle = (x, y, r, f) => TH.circle(ctx, x, y, r, f);
      const rr = (x, y, w, h, r) => TH.rr(ctx, x, y, w, h, r);
      const tesla = k.violation === 'tesla';
      const dazed = k.slapped && k.slapT < 0.7;

      ctx.save();
      ctx.translate(k.x, gy);
      if (dazed) ctx.rotate(Math.sin(k.slapT * 40) * 0.06 * (1 - k.slapT / 0.7));
      ctx.scale(k.dir, 1);

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(5, 1, 72, 6, 0, 0, Math.PI * 2); ctx.fill();

      // back panel (painted rickshaw art) + backrest
      ctx.fillStyle = '#ffd166'; ctx.fillRect(-72, -62, 10, 36);
      circle(-67, -50, 4, '#e63946'); circle(-67, -36, 3, '#2a9d8f');
      ctx.fillStyle = '#7f1d1d'; ctx.fillRect(-64, -84, 9, 38);

      // hood (canopy)
      ctx.beginPath();
      ctx.moveTo(-68, -52);
      ctx.bezierCurveTo(-78, -128, -8, -134, 6, -98);
      ctx.lineTo(-6, -95);
      ctx.bezierCurveTo(-18, -118, -60, -114, -58, -52);
      ctx.closePath();
      ctx.fillStyle = k.hood; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = 0.15 + i * 0.18;
        circle(-63 + Math.sin(a * Math.PI) * 5 + a * 64, -60 - Math.sin(a * Math.PI) * 58, 2.2, '#fff3b0');
      }
      line([6, -98, 8, -88], '#ffd166', 2); line([2, -104, 3, -94], '#ef476f', 2); // tassels

      // seat cushion + passengers
      ctx.fillStyle = '#b91c1c'; rr(-60, -58, 56, 10, 4); ctx.fill();
      const n = k.pax.length;
      if (n === 5) {
        drawPassenger(ctx, -46, -56, k.pax[0]);
        drawPassenger(ctx, -30, -56, k.pax[1]);
        drawPassenger(ctx, -14, -56, k.pax[2]);
        drawPassenger(ctx, -34, -80, k.pax[3], 0.7);
        drawPassenger(ctx, -4, -40, k.pax[4], 0.7);
      } else {
        const xs = n === 1 ? [-32] : [-42, -22];
        k.pax.forEach((p, i) => drawPassenger(ctx, xs[i], -56, p));
      }

      // carriage body
      ctx.beginPath();
      ctx.moveTo(-64, -48); ctx.lineTo(4, -48); ctx.lineTo(0, -28); ctx.lineTo(-60, -28); ctx.closePath();
      ctx.fillStyle = k.body; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-58, -41, 56, 3);
      circle(-30, -34, 3, '#ffd166');

      // "Tesla" (battery rickshaw): battery box under the carriage + wiring
      if (tesla) {
        ctx.fillStyle = '#111'; rr(-8, -38, 28, 14, 2); ctx.fill();
        ctx.fillStyle = '#22c55e'; ctx.fillRect(-6, -36, 24, 3);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(8, -33); ctx.lineTo(3, -28); ctx.lineTo(7, -28); ctx.lineTo(4, -24.5);
        ctx.lineTo(11, -30); ctx.lineTo(7, -30); ctx.lineTo(10, -33); ctx.closePath(); ctx.fill();
        line([-8, -30, -26, -22], '#e11d48', 1.5);
      }

      // frame
      const crank = [30, -26];
      line([-30, -21, 30, -26, 48, -17], '#2d2d2d', 3);
      line([48, -17, 46, -68], '#2d2d2d', 3);
      line([39, -68, 53, -70], '#2d2d2d', 3);
      line([30, -26, 22, -52], '#2d2d2d', 3);
      ctx.fillStyle = '#111'; rr(13, -57, 18, 5, 2); ctx.fill();

      // driver legs (far leg first): pedalling follows the crank; a Tesla driver never pedals —
      // his feet rest still on the footboard.
      const a = k.wheelA * 1.25;
      const hip = [22, -56];
      const leg = (ang, col) => {
        const fx = tesla ? 41 : crank[0] + Math.cos(ang) * 8;
        const fy = tesla ? -35 : crank[1] + Math.sin(ang) * 8;
        const kx = (hip[0] + fx) / 2 + (tesla ? 6 : 9), ky = (hip[1] + fy) / 2 - (tesla ? 8 : 3);
        line([hip[0], hip[1], kx, ky, fx, fy], col, 5);
      };
      if (tesla) line([32, -33, 46, -36], '#2d2d2d', 3); // footboard
      leg(a + Math.PI, '#5a3a28');

      // wheels
      const wheel = (cx, cy, r) => {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const sa = k.wheelA + (i * Math.PI) / 4;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sa) * (r - 2), cy + Math.sin(sa) * (r - 2)); ctx.stroke();
        }
        circle(cx, cy, 3, '#555');
      };
      wheel(-30, -21, 21);
      wheel(48, -17, 17);
      if (tesla) {
        circle(-30, -21, 8, '#6b7280'); circle(-30, -21, 4, '#d1d5db'); // hub motor
        ctx.fillStyle = 'rgba(253,224,71,0.22)';
        ctx.beginPath(); ctx.moveTo(55, -63); ctx.lineTo(95, -76); ctx.lineTo(95, -48); ctx.closePath(); ctx.fill();
        circle(54, -63, 4, '#fde047'); // headlight
        if (!k.slapped && Math.sin(k.t * 31) > 0.7) line([2, -40, 6, -45, 3, -47, 8, -52], '#38bdf8', 1.5); // spark
      }

      // lungi + near leg
      ctx.beginPath();
      ctx.moveTo(15, -60); ctx.lineTo(29, -60); ctx.lineTo(38, -42); ctx.lineTo(22, -38); ctx.closePath();
      ctx.fillStyle = k.lungi; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(18 + i * 5, -58); ctx.lineTo(26 + i * 5, -40); ctx.stroke(); }
      leg(a, k.skin);

      // torso (vest) + gamcha
      line([21, -60, 30, -82], k.vest, 10);
      line([25, -80, 34, -80], '#dc2626', 4);

      // arms (phone violator holds a phone to his ear)
      if (k.violation === 'phone' && !k.slapped) {
        line([29, -79, 41, -78, 39, -92], k.skin, 4);
        ctx.fillStyle = '#111'; rr(36, -100, 6, 11, 2); ctx.fill();
      }
      line([30, -78, 45, -68], k.skin, 4);

      // head (centre at local (33, -91))
      ctx.save();
      ctx.translate(33, -91);
      if (k.slapped) ctx.rotate(-0.55 * Math.max(0, 1 - k.slapT / 1.2) + Math.sin(k.slapT * 25) * 0.1 * Math.max(0, 1 - k.slapT));
      circle(0, 0, 8.5, k.skin);
      ctx.beginPath(); ctx.arc(0, -1, 8.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fillStyle = '#1a1a1a'; ctx.fill();
      ctx.fillStyle = '#dc2626'; ctx.fillRect(-8, -6, 16, 3); // gamcha tied on head
      circle(4, 1, 1.4, '#111'); // eye
      if (k.slapped) { ctx.fillStyle = 'rgba(255,80,80,0.75)'; ctx.beginPath(); ctx.ellipse(3, 4, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
      else line([4, 5, 7, 5], '#3b2416', 1.3);
      ctx.restore();

      ctx.restore();
    },

    // Player at ground point (p.x, p.y). Fields: facing (1/-1), moving, walkT, slapAnim (0 = idle, else 0..0.3).
    drawPlayer(ctx, p) {
      const line = (pts, c, w) => TH.line(ctx, pts, c, w);
      const circle = (x, y, r, f) => TH.circle(ctx, x, y, r, f);
      const rr = (x, y, w, h, r) => TH.rr(ctx, x, y, w, h, r);
      const skin = '#9a6440';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.scale(p.facing, 1);
      const sw = p.moving ? Math.sin(p.walkT * 14) : 0;
      ctx.translate(0, p.moving ? -Math.abs(sw) * 2 : 0);

      // legs + shoes
      line([-4, -40, -4 - sw * 9, -4], '#1e2a4a', 8);
      line([4, -40, 4 + sw * 9, -4], '#27345c', 8);
      ctx.fillStyle = '#111';
      rr(-8 - sw * 9, -7, 14, 6, 2); ctx.fill();
      rr(0 + sw * 9, -7, 14, 6, 2); ctx.fill();

      line([-3, -70, -6 + sw * 7, -47], skin, 5); // back arm

      // uniform: white shirt, neon reflective vest, belt
      ctx.fillStyle = '#f8fafc'; rr(-12, -77, 24, 39, 7); ctx.fill();
      ctx.fillStyle = '#c6f432'; rr(-12, -72, 24, 30, 5); ctx.fill();
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(-12, -61, 24, 3); ctx.fillRect(-12, -53, 24, 3);
      ctx.fillStyle = '#1f2937'; ctx.fillRect(-12, -42, 24, 4);
      ctx.fillStyle = '#facc15'; ctx.fillRect(-2, -42, 5, 4);

      // head, mustache, cap, whistle
      circle(2, -87, 10, skin);
      circle(7, -90, 1.5, '#111');
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(8, -82, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; rr(-9, -104, 22, 11, 5); ctx.fill();
      ctx.fillStyle = '#111'; rr(-8, -96, 25, 4, 2); ctx.fill();
      circle(3, -99, 2.3, '#facc15');
      line([2, -77, 8, -68], '#111', 1);
      circle(9, -67, 2.2, '#9ca3af');

      // slapping arm: raised back, then swings forward
      const sh = [5, -70];
      const ang = p.slapAnim > 0 ? -2.1 + 2.4 * Math.min(1, p.slapAnim / 0.1) : 1.35 - sw * 0.4;
      const ex = sh[0] + Math.cos(ang) * 10, ey = sh[1] + Math.sin(ang) * 10;
      const hx = sh[0] + Math.cos(ang) * 25, hy = sh[1] + Math.sin(ang) * 25;
      line([sh[0], sh[1], ex, ey], '#f8fafc', 7);
      line([ex, ey, hx, hy], skin, 5);
      circle(hx, hy, p.slapAnim > 0 ? 7.5 : 4.5, skin);
      ctx.restore();
    },

    // Speech bubble whose tail points at (x, y); clamped inside the world width.
    drawBubble(ctx, x, y, str, border = '#333') {
      ctx.font = `bold 15px ${TH.FONT}`;
      const w = ctx.measureText(str).width + 18, h = 26;
      const bx = Math.max(4, Math.min(W - w - 4, x - w / 2)), by = y - h;
      const tx = Math.max(bx + 10, Math.min(bx + w - 10, x));
      ctx.fillStyle = '#fff'; ctx.strokeStyle = border; ctx.lineWidth = 2.5;
      TH.rr(ctx, bx, by, w, h, 10); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx - 6, by + h); ctx.lineTo(tx, by + h + 8); ctx.lineTo(tx + 6, by + h); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 6, by + h + 1); ctx.lineTo(tx, by + h + 8); ctx.lineTo(tx + 6, by + h + 1); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(tx - 5, by + h - 2, 10, 3);
      ctx.fillStyle = '#1f1f1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(str, bx + w / 2, by + h / 2 + 1);
    },
  };
})();
