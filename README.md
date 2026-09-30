# থাপ্পড়! Thappor — Dhaka Rickshaw Justice

A browser game: you're a Dhaka traffic sergeant. Run up to the rickshaw drivers breaking the rules and slap them, but never slap an honest one.

**Play:** open `index.html` in a browser. There's no build step and no dependencies. You can also serve the folder, for example with `python -m http.server`.

## Views
- **👁️ First-person** (default): you see through the sergeant's eyes, standing on the road facing the oncoming rickshaws. Your hands are at the bottom of the screen, and the slap happens up close. Wrong-way riders come from behind you, so watch for the "পেছনে!" warning and chase them.
- **🎬 Classic:** the original side view.

Pick the view on the start screen. The game remembers your choice.

## Controls
- **Keyboard (first-person):** ↑/W forward, ↓/S back, ←/→ or A/D to step across the lanes, Space or J to slap.
- **Keyboard (Classic):** ← ↑ → ↓ / WASD to move, Space or J to slap.
- **Mouse or touch:** tap the road to run there. Tap a rickshaw to chase it and slap it.
- **Phones:** the joystick moves you and the ✋ button slaps.
- Stand in front of a rickshaw to block it.

## Rule-breakers
⬅️ wrong way · 🚦 running a red light · 🚶 riding on the footpath · 📱 on the phone · 👨‍👩‍👧‍👦 overloaded · 💸 overcharging · ⚡ "Tesla" (a battery motor rickshaw, no pedals)

## Roads
You move to the next road every 2 levels, or pick where to start: Badda → Gulshan-Badda Link Road → Kuril Bishwa Road → Airport Road.

## Code
- `js/core.js`: shared constants and drawing helpers
- `js/fpcore.js`: first-person camera, projection and drawing helpers
- `js/fpview.js`: first-person renderer (layers, lighting, hands, picking)
- `js/fpstreet.js`, `js/fpsprites.js`, `js/fptraffic.js`, `js/fproads/*.js`: first-person art (street, rickshaws and hands, background traffic and street life, per-road scenery)
- `js/FP_CONTRACT.md`: units, layers and hooks for the first-person art
- `js/street.js`: street, curb, markings, traffic light
- `js/sprites.js`: rickshaws, passengers, the sergeant, speech bubbles
- `js/roads/*.js`: one file per road with its own scenery
- `js/game.js`: game logic, input, sound (Web Audio, all synthesized), render loop
- `js/ART_CONTRACT.md`: the coordinate and layer contract the art files follow

Add `?debug` to the URL to expose `window.thappor` for testing.
