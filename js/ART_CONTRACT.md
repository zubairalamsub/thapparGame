# Art contract (Thappor!)

All art is drawn on a 2D canvas in **logical coordinates**: a 1000 × 600 world (`TH.W`, `TH.H`), scaled to the window by `game.js`.
Scripts load in this order: `core.js` → `street.js` → `sprites.js` → `roads/*.js` → `game.js`.
Every file is an IIFE that adds to `window.TH`. Helpers from `core.js`: `TH.rr(ctx,x,y,w,h,r)` (rounded-rect path), `TH.circle(ctx,x,y,r,fill)`, `TH.line(ctx,[x0,y0,x1,y1,...],color,width)`, `TH.mulberry32(seed)`, `TH.FONT`.

## World layout (y grows downward)

| y range | what |
|---|---|
| 0 – 300 | sky + backdrop (buildings, landmarks). The HUD overlays roughly y < 45, so keep important details lower. |
| 300 – 345 | footpath (drawn by `street.js`). Footpath rickshaws have their ground line at `TH.FOOT_Y` = 345. |
| 345 – 352 | curb |
| 352 – 600 | asphalt: 3 lanes with ground lines `TH.LANES` = [430, 510, 590]. Gameplay area — keep it readable. |

Fixed street furniture drawn by `street.js`: one-way sign at x 206–296 (y 206–348), traffic light at x ≈ 651–681 (y 160–350), stop line at `TH.STOP_X` = 640, zebra crossing x 652–710.
Rickshaws are ~150 px wide and ~135 px tall above their ground line; bubbles appear up to ~150 px above the ground line.

## Render order (each layer wrapped in save/restore by game.js)

1. `road.drawBack(ctx, s, env)` — sky and backdrop, y 0–300.
2. `TH.street.draw(ctx, env)` — footpath, curb, asphalt, lane markings, stop line, zebra, one-way sign.
3. `road.drawMid(ctx, s, env)` *(optional)* — things standing on the footpath (poles, wires, lamps, trees, stalls). Bases sit on y ≈ 300–346. Must not draw below y = 352.
4. `TH.street.drawTrafficLight(ctx, env)`
5. Rickshaws (`TH.sprites.drawRickshaw`) and the player (`TH.sprites.drawPlayer`), sorted by ground y.
6. `road.drawFront(ctx, s, env)` *(optional)* — overhead things (planes, flyover edges, flying birds). Keep them at **y < 250**. Anything over the road (y > 300) must have alpha ≤ 0.15.
7. Speech bubbles, effects and banners (game.js).

`env = { t, light: 'green'|'yellow'|'red', lightT, road, state: 'menu'|'play'|'dying'|'over', level }`

## Road definition (`js/roads/<id>.js`)

```js
(function () {
  'use strict';
  const TH = window.TH;
  TH.roads.push({
    id: 'kuril', order: 3,                  // order = position in stage progression (1-based, unique)
    name: 'কুড়িল বিশ্বরোড',                  // Bangla display name (short)
    nameEn: 'Kuril Bishwa Road',
    tagline: 'short Bangla flavour line',    // shown under the name in the stage banner
    weights: { wrongway: 2, footpath: 1, phone: 1, overload: 1, overcharge: 1, tesla: 2 }, // spawn weights; keys only from this set
    street: { asphalt: '#4a4a50', footpath: '#c2b59b', curb: ['#facc15', '#111'] },       // optional palette overrides for street.js
    init(rng) { return { /* static layout, built only from rng() so it's deterministic */ }; },
    update(s, dt, env) { /* optional: animate s (clouds, trains, planes) */ },
    drawBack(ctx, s, env) { /* required */ },
    drawMid(ctx, s, env) { /* optional */ },
    drawFront(ctx, s, env) { /* optional */ },
  });
})();
```

Rules:
- No DOM access, no network, no images. Canvas 2D only (gradients, paths, text are fine). No `getImageData`.
- Draw budget: aim for < 1500 canvas calls per frame for the whole road (all hooks together). Precompute layout in `init`; an offscreen canvas cache is allowed but must be rendered at ≥ 2× resolution to stay crisp.
- Every `save()` needs a matching `restore()`; reset `globalAlpha`, `shadowBlur`, `setLineDash` if you change them.
- Never pass NaN/Infinity, negative radii or gradient stops outside [0, 1] to the canvas (browsers throw).
- Signs and text in Bangla (English allowed as secondary). Use `TH.FONT`.

## Rickshaw object `k` (read-only for art)

`x` (centre), `dir` (1 = moving right, −1 = left; the art is drawn facing +x and mirrored with `scale(dir, 1)`), `violation` (`null|'wrongway'|'redlight'|'footpath'|'phone'|'overload'|'overcharge'|'tesla'`), `slapped`, `slapT` (seconds since slap), `wheelA` (wheel angle, grows with distance travelled), `t` (age in seconds), `pax` (array of `{skin, shirt, seed}`: 0, 1, 2 or 5 passengers), `hood`, `body`, `vest`, `lungi`, `skin` (colours), `seed` (random int for per-rickshaw variety).

`TH.sprites.drawRickshaw(ctx, k, gy, env)` draws with the ground line at y = `gy`. Fixed geometry the game depends on, in local facing-right coordinates:
- Driver's head centre at (33, −91), radius ≈ 9. Stars, bubbles and the slap effect are placed there.
- The whole sprite stays inside x −80…+70 and y −136…+4 (the Tesla headlight beam may reach x +95 at low alpha).
- **Tesla** (`violation === 'tesla'`) is a battery rickshaw: no pedals, no crank, no chain. The driver's feet rest still on a footboard. Show a battery box, a hub motor and a headlight.
- Pedal rickshaws: the legs pedal with `wheelA`.
- Slapped: the head tilts back, there's a red mark on the cheek, and the body wobbles while `slapT < 0.7`.

## Player `p`

`TH.sprites.drawPlayer(ctx, p, env)`, where `p = { x, y (ground point), facing (1/−1), moving, walkT, slapAnim (0 idle, else 0…0.3 rising), cooldown, target }`. Height is about 110 px above the ground (the marker is drawn at y − 116). The slapping arm swings from raised-back to forward over the first 0.1 s of `slapAnim`.

## Bubble

`TH.sprites.drawBubble(ctx, x, y, str, border)` draws a speech bubble whose tail tip is near (x, y + 8). It is clamped inside 0…W.
