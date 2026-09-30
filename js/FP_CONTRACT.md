# First-person art contract (Thappor!)

The first-person view ("facing traffic") shows the street through the traffic sergeant's eyes. He stands on the road facing the oncoming rickshaws, with the road running to the horizon.

- **Game logic** is unchanged and lives in `js/game.js`, in world coordinates (see `ART_CONTRACT.md`).
- **The camera** lives in `js/fpview.js` (renderer) and `js/fpcore.js` (projection and helpers).
- **Art modules** draw through the camera using the helpers in `TH.fp`.

Load order: `core → street → sprites → roads/* → fpcore → fpstreet → fpsprites → fptraffic → fpplayer → fproads/* → fpview → game`.

There are two camera modes over the same world and rules. **First-person** (`fp`) is the sergeant's eyes (eye height 95). **Third-person** (`tp`) is a chase camera about 250 units behind him and 100 units to his right, at height 138. Art must work from both, so always project through `TH.fp.cam` and never assume the eye height.

Every file is an IIFE that adds to `window.TH`.

## 1. Units and axes

All first-person art uses **FP world units**: 1 unit ≈ 1.7 cm (a rickshaw hood is ~150 tall, a person ~100).

| axis | meaning |
|---|---|
| `z` | along the road. The camera looks toward **−z**, so larger z is closer to the camera and behind it. `z = x_logic × TH.fp.DZ` (DZ = 2). |
| `u` | across the road, **+u = screen right**. `u = (510 − y_logic) × 1.75`. |
| `h` | height above the road surface. Sidewalks are at `TH.fp.CURB_H` = 8. |

The street cross-section is in `TH.fp.U`:

```
 u:  -800 ........ -645 | -645 ...... -285 | -285..-215 | -215 ........ +215 | +215 ........ +460
     left sidewalk      | opposite         | median     | rickshaw lanes     | right sidewalk
     (wallL = -800 is   | carriageway,     | (raised,   | u = +140 / 0 / −140| footpath riders at
      the building line)| lanes −375/−555, | fence,     | (logic lanes       | u = +289; wallR = +460
                        | traffic moves    |  plants)   |  430 / 510 / 590)  | is the building line
                        | AWAY (−z)        |            | oncoming = +z      |
```

Key z positions (FP units):

| what | z |
|---|---|
| stop line | `TH.STOP_X × DZ = 1280` |
| zebra crossing | 1304–1420 |
| camera | between 1300 and 2040 (the sergeant walks forward and back) |
| far clip | `cam.z − TH.fp.FAR`, where FAR = 7600 |

**Scenery must cover z from −6200 to +2300.**

The camera is `TH.fp.cam = { z, u, h }`: eye height about 95, plus bob and +8 on the sidewalk. `u` follows the sergeant's lane. It is read-only for art.

## 2. Projection and helpers (`TH.fp`)

- `project(z, u, h)` returns `{ x, y, s, d }`: the screen point in logical px (screen 1000×600, vanishing point `(CX = 500, HY = 245)`, focal length `F = 520`), `s` = px per world unit, and `d` = depth.
  - It returns **null** when `d < NEAR` (18). Always handle null.
- `depth(z)` and `unproject(sx, sy, h)`.
- `farX(u, d)` gives sky parallax for far landmarks.
- **Clipped paths.** These start a new path and return true if anything is visible:
  - `path(ctx, [z,u,h, …])` is a closed polygon;
  - `quad(ctx, z0, z1, u0, u1, h)` is a flat rectangle;
  - `wallQuad(ctx, z0, z1, u, h0, h1)` is a vertical plane along the road;
  - `crossQuad(ctx, z, u0, u1, h0, h1)` is a vertical plane across the road, facing the camera;
  - `polyline(ctx, pts)` is an open polyline;
  - `wire(ctx, z0,u0,h0, z1,u1,h1, sag, n)` is a hanging cable.
- **Batching.** `subPath` and `subQuad` add to the current path without calling beginPath. Use them to batch many shapes into one `fill()`.
- **Billboards.** Project the ground point, then `ctx.translate(p.x, p.y); ctx.scale(p.s, p.s)` and draw in local world units, with y up = negative.
- **Colour.** `shade(hex, f, a)` darkens toward black when f < 0 and lightens toward white when f > 0. `mix(hexA, hexB, t)`.
- **Offscreen canvas.** `canvas(w, h)` returns `{ canvas, ctx }`, or null in headless tests. Always handle null.
- **Fog.** `fogAt(d)` and `fade(d)`: fog amount and billboard opacity at depth d.
- **Lights.** `glow(x, y, r, colorHex, d, a = 1, always = false, sy = 1)` queues an additive light (details in §4). `sy < 1` squashes it vertically into a pool of light on the road.
- **Occluders.** `solid(x0, y0, x1, y1, d)` registers a screen rectangle that hides farther glows and lit windows.

## 3. Frame order (`fpview.render`)

Everything runs inside `ctx.save()/restore()`. The canvas transform already maps logical px to the screen, plus shake, roll and zoom.

1. **Sky.** `road.drawSky(ctx, s, env)` works in screen space. It must paint y 0 … HY + 12 **opaque**: sky, sun or moon, clouds, the far skyline and the landmark at the vanishing point.
2. **Ground.** `TH.fpStreet.drawGround(ctx, env)` draws the flat ground, far to near: asphalt, markings, curbs, sidewalks, median and the opposite carriageway. The engine then overlays fog on the ground.
3. **Walls.** `road.walls(s, env)` returns facade segments; the engine strip-maps them (§5).
4. **Draw list.** Things standing in the street are drawn back to front by depth. Each source pushes items through `add(z, fn, u, r)`:
   - `fn(ctx, d, env)` is called later with `ctx.globalAlpha` preset to the fog fade;
   - `u` and `r` (a world radius) are optional and let the engine skip items that are off screen;
   - a fifth argument `{ noFade: true }` draws the item without the fog fade (for flat ground-level things such as water that handle haze themselves);
   - sources: `TH.fpStreet.add(env, add)`, `road.add(s, env, add)`, `TH.fpTraffic.add(ts, env, add)`, plus the engine's own rickshaws and dust;
   - anything that spans the road (wires, banners, gantries, a flyover deck, a foot overbridge) is also an `add` item at its z.
5. **Lighting.** If `road.light.tint` is set, a `multiply` fill of that colour covers the world. Then comes the additive (`lighter`) pass: wall `emis` textures and queued glows.
6. **World overlays.** Bubbles, dizzy stars and the target marker are drawn by the engine.
7. **Screen space.** Slap effects, `TH.fpSprites.drawHands` and the "behind you" warnings are drawn by the engine or the hands module.

### Rules for every draw function
- **globalAlpha:** never *assign* an absolute value. Read `const a0 = ctx.globalAlpha` and multiply (`ctx.globalAlpha = a0 * x`), then put `a0` back.
- **Canvas hygiene:** every `save()` needs a `restore()`. Reset `setLineDash`, `lineDashOffset`, `shadowBlur`, `globalCompositeOperation` and `filter` if you change them. The engine also wraps each item in save/restore.
- **Invalid values:** never pass NaN or Infinity, negative radii, or gradient stops outside [0, 1]. **Clamp scales**, because `s` can reach ~30 very near the camera.
- **Forbidden:** DOM access other than `TH.fp.canvas`, network, image files, `getImageData`, `ctx.filter` and `shadowBlur` > 0 in per-frame code.
- **Text:** Bangla on signs (English allowed as secondary), in `TH.FONT`.
- **Randomness:** keep it deterministic. Build static layouts only from the `rng` you are given, and never call `Math.random()` in per-frame code except for flicker.

## 4. Lighting per road (`road.light`)

```js
light: {
  tint: null | '#rrggbb',  // multiply colour for the whole world (null = plain daylight)
  tintA: 1,                // strength of the tint
  glow: 0,                 // 0..1 strength of the additive pass (0 by day, ~1 at night)
  fog: '#rrggbb',          // haze colour; match the sky at the horizon
  fogNear: 1600, fogFar: 6500, fogMax: 0.85,
  lamps: false,            // street lamps lit (fpstreet reads this)
  headlights: false,       // vehicles and rickshaws switch their lamps on
}
```

- **The tint multiplies everything, including your sky.** Author the sky and facade colours so they look right *after* the tint, and pick a moderate tint (e.g. night `#6d78b3`, dusk `#f0c7a8`).
- **Glows** are drawn after the tint, so they really shine.
  - Queue them from your draw functions with `TH.fp.glow(x, y, r, '#ffd68a', d, a)`, where `d` = your depth.
  - A glow is skipped when a nearer `solid` covers it. Rickshaws register themselves; buses should register via `TH.fp.solid`.
  - `always = true` glows (signal lamps, a Tesla headlight) also show by day, dimmer.

## 5. Facades (`road.walls(s, env)`)

Return an array, cached (build it once and return the same array):

```js
{ u: 460,            // facade plane (right side: >= 460; left side: <= -800; setbacks allowed)
  z0: -6200, z1: -5700,  // extent along the road, z0 < z1
  h: 420,            // height above the sidewalk
  tex: canvas,       // painted facade, seen front-on from the road; transparent above the roofline
  sx0, sx1,          // optional source x range inside tex (default: the whole width)
  emis: canvas,      // optional: lit windows/signs on transparent black, same aspect as tex, drawn additively when light.glow > 0
  ret: '#hex',       // optional: colour of the side face where this building is set back from the one before it
  base: 8 }          // optional: bottom height (default CURB_H)
```

- **Texture orientation** is handled by the engine: paint every facade as you would see it standing in the road and turning to face it.
  - Right-side textures run left → right from far (small z) to near.
  - Left-side textures run left → right from near to far.
  - Text on signs reads correctly on both sides.
- **Texture density:** ~1.2–1.5 px per world unit.
  - Reuse textures: many segments can share one canvas, using different `sx0/sx1` or repeats.
  - Keep **all textures of one road under ~16 MB** (sum of w × h × 4), and build them lazily on the first `walls()` call.
  - Free them in `dispose(s)` by setting `canvas.width = 0`.
- **Lighting:** the engine fades walls into the fog with depth. Shop fronts at street level (shutters, awnings, signboards, stalls) can be painted into the texture. Things that stick out toward the road (hanging signs, awnings, stalls, poles, trees) should be `add()` items, so they get depth.

## 6. Per-road module (`js/fproads/<id>.js`)

```js
(function () {
  'use strict';
  const TH = window.TH;
  TH.fpRoads.push({
    id: 'badda',                         // must match the Classic road id in js/roads/
    light: { ... },                      // §4
    street: { asphalt: '#46464c', ... }, // palette for fpstreet (keys in §7)
    traffic: { bus: 3, cng: 4, car: 2, bike: 2, truck: 1 }, trafficDensity: 1,   // opposite-carriageway mix
    life: { walker: 4, woman: 3, kid: 1, hawker: 1, dog: 1 }, lifeDensity: 1,    // sidewalk people
    lifeSpots: [{ z: 1500, u: 400, kind: 'teastall' }],   // where fptraffic seats a crowd: 'teastall' | 'busstop' | 'crowd'
    init(rng) { return { /* layout from rng only */ }; },
    update(s, dt, env) {},               // optional animation
    drawSky(ctx, s, env) {},             // required (§3.1)
    walls(s, env) { return s.walls; },   // §5
    add(s, env, add) {},                 // props, overhead structures, landmarks with depth
    dispose(s) {},                       // free offscreen canvases
  });
})();
```

- **Budget:** under about 1500 canvas calls per frame for drawSky + add items together. The engine's wall strips add another ~200–400.
- **Culling:** cull by passing `u, r` to `add`, and only add things within `cam.z − FAR … cam.z`.
- **Distance detail:** use less detail for far items. Below about `s < 0.25`, a few shapes are enough.

## 7. Street kit (`js/fpstreet.js`): `TH.fpStreet`

- `drawGround(ctx, env)` covers everything on the ground from z = cam.z + 50 to cam.z − FAR. It draws, in both directions:
  - asphalt with wear and patches;
  - lane dashes and one-way arrows painted pointing **toward** the camera;
  - the stop line, and "থামুন" painted before it;
  - the zebra;
  - curbs, the sidewalk tiles, the median (raised, green or concrete), the opposite carriageway with its own dashes, and the left sidewalk.
- `add(env, add)` covers street furniture:
  - the traffic signal: a pole on the right sidewalk at the stop line, and an overhead mast arm over the lanes with red, yellow and green lamps and a 7-segment countdown facing the camera, driven by `env.light` / `env.lightT`;
  - street lamps along the right curb and the median (lit, with glow, when `light.lamps`);
  - the "একমুখী রাস্তা" one-way sign;
  - median fence segments, as separate add items about every 200 units.
- **Palette** (`road.street`, all optional): `asphalt, asphaltOpp, lane, stop, sidewalk, sidewalkL, curb: [a, b], median, medianTop, fence, lampStyle ('pole' | 'sodium' | 'none'), lampEvery`.
- **Budget:** under about 900 calls per frame.

## 8. Rickshaw and hands sprites (`js/fpsprites.js`): `TH.fpSprites`

`drawRickshawFront(ctx, k, near, far, env)` draws an oncoming rickshaw (`k.dir === 1`), seen from the front.

- `near` and `far` are projections `{ x, y, s, d }` of the ground point under the **front-wheel plane** (driver, handlebar, front wheel, pedals) and under the **rear-axle plane** (carriage box, seat, passengers, hood, rear wheels).
- The two planes are 85 units apart, so off-centre rickshaws show real parallax. Parts that join the planes (frame tubes, the side of the carriage) can be drawn between the two transforms.
- Footpath riders get their planes at h = 8.

`drawRickshawBack(ctx, k, near, far, env)` draws a rickshaw riding away (`k.dir === -1`, wrong-way riders):

- `near` = the **rear-axle plane**: the painted rear panel (the iconic rickshaw art plate), rear wheels, the back of the hood, and passengers' backs.
- `far` = the **front plane**: the driver and front wheel.

**Fixed geometry the engine relies on**, in local world units on the given plane:
- **Front view:** the driver's head centre is at `near`-plane `(0, −91)`, radius ~10. This is where the slap lands.
- **Back view:** the driver's head must be visible *peeking out to the right of the hood* at `far`-plane `(+24, −96)`.
- **Bounds:** near plane x ±48, y −128…+4; far plane x ±46, y −152…+4.

Rickshaw fields (read-only):
- everything in `ART_CONTRACT.md`: `x, dir, lane, violation, slapped, slapT, wheelA, t, pax[{skin, shirt, seed}], hood, body, vest, lungi, skin, seed`;
- plus `age` (seconds since spawn).

The art must show every violation on sight:

| violation | how it looks |
|---|---|
| `phone` | phone held to the ear, steering one-handed |
| `overload` | 5 passengers: three abreast, a child on a lap, one on the footboard |
| `tesla` | **no pedals, no crank, no chain**. Feet rest on the footboard. Battery box under the seat, hub motor, headlight (`TH.fp.glow(..., always=true)`), LED strip on the hood edge |
| pedal rickshaws | knees rise and fall with `k.wheelA` |
| `footpath`, `redlight`, `overcharge`, `wrongway` | normal look; the bubbles are drawn by the engine |

**Slap reaction** (`k.slapped`; `k.slapT` seconds; dazed while `slapT < 0.7`, then flees):
- the head snaps toward screen-left, because the right hand swings in from the right;
- a big red handprint on the cheek, X or spiral eyes, an open mouth and sweat drops;
- the cap or gamcha may fly off, and passengers gasp;
- in the back view, the head jerks forward.

**LOD:** when `near.s < 0.33`, draw a simplified version, 50 calls or fewer.

**Night:** when `env.lit.headlights`, hang a small lantern under the carriage (with a glow) and turn the Tesla headlight on bright.

**Budget:** up to 500 calls at full detail.

`drawHands(ctx, H, env)` draws the sergeant's hands in **screen space** (logical 1000×600) at the bottom of the screen.

- **Appearance:**
  - white uniform shirt sleeves, skin `#a36a45`;
  - left hand low-left holding a whistle on a cord;
  - right (slapping) hand at rest low-right.
- **`H` fields:**

  ```
  H = { t, walk: 0..1, phase (walk-cycle radians), strafe: −1..1, bob (px), slap: null | { t, x, y, hit }, light }
  ```

- **Motion:**
  - the hands sway with `phase` × `walk` and lean with `strafe`;
  - **slap timeline** (seconds of `H.slap.t`, real time):
    - 0 – 0.06: whip from rest to the target `(x, y)`, the driver's head on screen, with a motion smear;
    - 0.06 – 0.12: contact, palm flat and squashed;
    - 0.12 – 0.22: follow through past the target toward the lower left;
    - 0.22 – 0.42: return to rest;
  - `hit === false` is a swing through the air around (470, 360).
- **Lighting:** the hands are drawn after the tint, so darken them yourself when `H.light.tint` is set (mix toward it by ~0.45).
- **Budget:** up to 250 calls.

## 8b. The sergeant in third person (`js/fpplayer.js`): `TH.fpPlayer`

`drawSergeant(ctx, pr, pose, env)` draws the player, seen by the chase camera from **behind and over his right shoulder** (about 20° to his right, slightly above his head), so it is a 3/4 back view.

- **Where:** `pr` is the projection `{ x, y, s, d }` of his feet (on the sidewalk it is at h = 8). Draw in local world units with `ctx.translate(pr.x, pr.y); ctx.scale(pr.s, pr.s)`. He is ~118 tall to the top of the cap, and `s` ranges from ~0.8 to ~3.
- **Look:** match the Classic sergeant in `js/sprites.js`:
  - white peaked cap with a black band;
  - white shirt, and a neon-yellow reflective vest with silver bands and "ট্রাফিক" on the back;
  - navy trousers, black shoes, a belt with a walkie-talkie, and a whistle cord;
  - a soft shadow on the ground.
- **`pose` fields:** `{ t, walk: 0..1, phase, strafe: −1..1, slap: null | { t, x, y, hit }, block, fall: 0..1, light }`.
  - `walk` and `phase` drive the walk cycle (legs and arm swing); `strafe` makes him lean.
  - **`slap`** follows the same timeline as the hands in §8. The right arm winds up and whips toward the **screen** target `(x, y)`, the driver's head: in local units `((x − pr.x) / pr.s, (y − pr.y) / pr.s)`. Contact is at 0.06 s, with a motion smear. When `hit === false`, he swings at the air.
  - **`block`** (a rickshaw has stopped right in front of him): he raises his left palm, a firm "stop" gesture, whenever he isn't slapping.
  - **`fall`** (lives ran out): he gets dizzy and collapses, and the cap falls off.
- **Engine behaviour:** the engine fades him to 45% when he would hide the target driver's face. He is drawn inside the world, before the lighting tint, so no manual darkening is needed.
- **Budget:** up to 250 calls.

## 9. Traffic and street life (`js/fptraffic.js`): `TH.fpTraffic`

```js
create(road, rng) -> ts       // road = the fpRoads entry (or {}); read road.traffic, trafficDensity, life, lifeDensity, lifeSpots
update(ts, dt, env)           // own simulation, using env.cam
add(ts, env, add)             // push drawables
dispose(ts)                   // optional
```

**Background traffic** runs on the opposite carriageway (lanes u = −375 and −555), all moving **away** (toward −z) and seen from behind.

- Kinds, keyed by the weight keys:
  - `bus`: dented, colourful Dhaka local buses with people at the door, and red BRTC double-deckers;
  - `cng`: the green CNG auto-rickshaw with its cage;
  - `car`: white sedans and yellow taxis;
  - `bike`: motorbikes with pillion riders;
  - `truck`: painted truck art.
- **Simulation:** vehicles enter behind the camera (z > cam.z + 200) and leave past `cam.z − FAR`. They follow the vehicle ahead with a safe gap. Start already populated along the whole range.
- **Lights:** tail lights and brake lights. At night they glow via `TH.fp.glow`.
- **Occlusion:** big vehicles register `TH.fp.solid`.

**Street life** is on the sidewalks: right side u 300–445, left side u −660…−790.

- Kinds:
  - `walker`: men in shirts, lungi or panjabi;
  - `woman`: saree or salwar, some in hijab;
  - `kid`: school uniform with a bag;
  - `hawker`: a basket on the head, or a jhalmuri cart;
  - `dog`: stray dogs trotting or lying down.
- **Movement and groups:** walkers go both ways, so front and back views are needed, with a walk cycle and LOD. At `lifeSpots`, draw small seated or standing groups (tea-stall customers on a bench, people waiting at a bus stop).
- **Optional:** during the first second of `env.light === 'red'`, a few people may cross the zebra (z 1304–1420) from the right sidewalk to the median, then back.

**Budget:** up to 1200 calls per frame for traffic and life together.

## 10. `env` in first-person hooks

```
env = { t, light: 'green'|'yellow'|'red', lightT, road (Classic road def), state, level,
        cam: TH.fp.cam, fr (this fpRoads entry), lit (its light config with defaults), view: 'fp' }
```

## 11. Testing

- **Headless:** `node <scratchpad>/smoke.js E:/Fun` runs every first-person hook through a validating mock canvas. It checks for NaN, negative radii, gradient stops, save/restore balance and call budgets.
- **Browser:** the preview server runs on port 5173. Open `http://localhost:5173/?debug`. Then:
  - `thappor.setView('fp')` and `thappor.setRoad(i)` (0 Badda, 1 Link Road, 2 Kuril, 3 Airport);
  - `thappor.G.paused = true` freezes the simulation while it keeps rendering;
  - `thappor.clear()` and `thappor.put({ violation, lane, x, dir, pax, slapped, slapT })` stage rickshaws;
  - `thappor.G.player.x / .y` moves the camera (`x` in [620, 990]; y 349–596);
  - `thappor.setView('tp')` switches to third person (`'fp'` first person, `'classic'` side view);
  - `thappor.start()` starts a game;
  - `thappor.step(dt, n)` advances time.
