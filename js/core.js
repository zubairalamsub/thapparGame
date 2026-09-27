// Shared namespace, world constants and drawing helpers.
// Loaded first; every other script adds itself to window.TH.
(function () {
  'use strict';
  const TH = (window.TH = window.TH || {});

  // World (logical) coordinates — the canvas is scaled to fit this box.
  TH.W = 1000;
  TH.H = 600;
  TH.STOP_X = 640;             // stop line for left-to-right traffic
  TH.FOOT_Y = 345;             // ground line of the footpath
  TH.LANES = [430, 510, 590];  // ground lines of the three road lanes
  TH.FONT = '"Hind Siliguri", "Nirmala UI", sans-serif';

  TH.roads = TH.roads || [];   // road/stage definitions push themselves here (see js/roads/*.js)

  TH.mulberry32 = function (seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Rounded-rect path (call fill/stroke after).
  TH.rr = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  TH.circle = function (ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Polyline from a flat [x0, y0, x1, y1, ...] array, round caps/joins.
  TH.line = function (ctx, pts, color, width) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
})();
