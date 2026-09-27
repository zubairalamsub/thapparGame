// Game logic: state, spawning, traffic rules, player, input, roads/stages, and the render loop.
(() => {
  'use strict';
  const TH = window.TH;
  const { W, H, STOP_X, FOOT_Y, LANES, FONT } = TH;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1, offX = 0, offY = 0, dpr = 1;

  const $ = (id) => document.getElementById(id);
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');
  // Haptics on phones only, and only after the player has touched the page (browsers block it before).
  const buzz = (pattern) => {
    try {
      const ua = navigator.userActivation;
      if (isTouch && navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(pattern);
    } catch (e) { /* unsupported */ }
  };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2); // phones: trade a little sharpness for frame rate
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    scale = Math.min(cw / W, ch / H);
    offX = (cw - W * scale) / 2;
    offY = (ch - H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Storage (best score) ----------
  const BEST_KEY = 'thappor-best';
  function loadBest() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ } }

  // ---------- Sound (Web Audio, synthesized) ----------
  const AMB_BED = 0.03; // volume of the background street/breeze loop
  const Sound = {
    ctx: null,
    muted: false,
    amb: null,
    init() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.startAmbience();
    },
    setMuted(m) {
      this.muted = m;
      if (this.amb) this.amb.g.gain.setTargetAtTime(m ? 0 : AMB_BED, this.ctx.currentTime, 0.3);
    },
    // Oscillator voice with optional filter: { type, f0, f1, dur, vol, when, filter: [type, freq, Q], attack }
    voice({ type = 'sine', f0, f1 = 0, dur, vol, when = 0, filter = null, attack = 0.005 }) {
      if (this.muted || !this.ctx) return;
      const c = this.ctx, t = c.currentTime + when;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (filter) {
        const f = c.createBiquadFilter();
        f.type = filter[0]; f.frequency.value = filter[1]; f.Q.value = filter[2] || 1;
        node = o.connect(f);
      }
      node.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    // Looping brown-noise "breeze + distant city" bed, with a slow gust LFO on the filter.
    startAmbience() {
      if (!this.ctx || this.amb) return;
      const c = this.ctx;
      const len = c.sampleRate * 3;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) { v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = v * 3.5; }
      const drift = d[len - 1] - d[0];
      for (let i = 0; i < len; i++) d[i] -= (drift * i) / len; // seamless loop
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 480;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(g).connect(c.destination);
      src.start();
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.11; lg.gain.value = 180;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
      this.amb = { g };
      g.gain.setTargetAtTime(this.muted ? 0 : AMB_BED, c.currentTime, 1.5);
    },
    tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
      if (this.muted || !this.ctx) return;
      const c = this.ctx, t = c.currentTime + when;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      if (this.muted || !this.ctx) return;
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(c.destination);
      src.start();
    },
    slap() { this.noise(0.16, 1.0, 1700); this.tone(200, 0.09, 'triangle', 0.35, 0, 60); },
    bell() { [0, 0.13].forEach((t) => { this.tone(2100, 0.25, 'sine', 0.1, t); this.tone(2650, 0.2, 'sine', 0.06, t); }); },
    wrong() { this.tone(150, 0.4, 'square', 0.12, 0.05, 80); },
    honk() { this.tone(330, 0.22, 'sawtooth', 0.07); this.tone(415, 0.22, 'sawtooth', 0.05); },
    escape() { this.tone(500, 0.35, 'sawtooth', 0.07, 0, 140); },
    whoosh() { this.noise(0.12, 0.25, 600); },
    motor() { this.tone(90, 0.7, 'sawtooth', 0.05, 0, 160); this.tone(180, 0.7, 'square', 0.015, 0, 320); },
    levelUp() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, i * 0.09)); },
    newRoad() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.12, i * 0.1)); },

    // --- funny cartoon effects ---
    boing() { this.voice({ f0: 170, f1: 620, dur: 0.32, vol: 0.14 }); this.voice({ type: 'triangle', f0: 340, f1: 1240, dur: 0.22, vol: 0.04, when: 0.03 }); },
    slideDown() { this.voice({ f0: 1500, f1: 260, dur: 0.55, vol: 0.07, attack: 0.03 }); },
    wahwah() {
      [392, 370, 349].forEach((f, i) => this.voice({ type: 'sawtooth', f0: f, f1: f * 0.98, dur: 0.26, vol: 0.07, when: i * 0.27, filter: ['lowpass', 900], attack: 0.03 }));
      this.voice({ type: 'sawtooth', f0: 330, f1: 290, dur: 0.7, vol: 0.07, when: 0.81, filter: ['lowpass', 700], attack: 0.04 });
    },
    pop() { this.voice({ type: 'square', f0: 700, f1: 1800, dur: 0.07, vol: 0.05 }); },
    bonk() { this.voice({ type: 'triangle', f0: 820, f1: 190, dur: 0.14, vol: 0.13 }); this.noise(0.05, 0.3, 2600); },
    squeak() { this.voice({ f0: 1150, f1: 1850, dur: 0.12, vol: 0.08 }); this.voice({ f0: 1850, f1: 1050, dur: 0.11, vol: 0.07, when: 0.12 }); },
    yelp(when = 0) { // cartoon "ow-w!"
      this.voice({ type: 'sawtooth', f0: 480, f1: 950, dur: 0.16, vol: 0.06, when, filter: ['bandpass', 1300, 2.2], attack: 0.02 });
      this.voice({ type: 'sawtooth', f0: 950, f1: 380, dur: 0.28, vol: 0.06, when: when + 0.14, filter: ['bandpass', 900, 2.2], attack: 0.02 });
    },
    funnySlap() { pick([() => this.boing(), () => this.bonk(), () => this.squeak()])(); this.yelp(0.09); },
    boop() { this.voice({ f0: 320, f1: 250, dur: 0.09, vol: 0.06 }); },
    taunt() { // "nyah-nyah na-nyah-nyah"
      const notes = [[784, 0.2], [659, 0.2], [880, 0.15], [784, 0.2], [659, 0.32]];
      let w = 0;
      for (const [f, d] of notes) { this.voice({ type: 'square', f0: f, dur: d * 0.9, vol: 0.04, when: w, filter: ['lowpass', 2400] }); w += d; }
    },
    kazoo() { // level-up fanfare
      [[523, 0.13], [659, 0.13], [784, 0.13], [1047, 0.35]].reduce((w, [f, d]) => {
        this.voice({ type: 'sawtooth', f0: f, f1: f * 1.01, dur: d, vol: 0.07, when: w, filter: ['bandpass', 1400, 3], attack: 0.02 });
        return w + d;
      }, 0);
    },
    zap() { this.voice({ type: 'sawtooth', f0: 140, f1: 55, dur: 0.28, vol: 0.05, filter: ['highpass', 600] }); this.noise(0.08, 0.12, 4000); },
    clownHorn() { [0, 0.2].forEach((w) => this.voice({ type: 'square', f0: 540, f1: 470, dur: 0.16, vol: 0.06, when: w, filter: ['lowpass', 1800], attack: 0.01 })); },

    // --- sunny-day ambience (called at random intervals, per road) ---
    chirp() {
      const base = 2600 + Math.random() * 1600, n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) this.voice({ f0: base + Math.random() * 300, f1: base * 1.4, dur: 0.07, vol: 0.03, when: i * 0.1 + Math.random() * 0.03, attack: 0.01 });
    },
    caw() { // Dhaka's crows
      [0, 0.34].forEach((w) => this.voice({ type: 'sawtooth', f0: 640, f1: 450, dur: 0.24, vol: 0.05, when: w, filter: ['bandpass', 1150, 1.6], attack: 0.02 }));
    },
    farHorn() {
      const f = 330 + Math.random() * 120;
      this.voice({ type: 'square', f0: f, dur: 0.3, vol: 0.02, filter: ['lowpass', 700], attack: 0.02 });
      this.voice({ type: 'square', f0: f * 1.26, dur: 0.3, vol: 0.014, filter: ['lowpass', 700], attack: 0.02 });
    },
    farBell() { [0, 0.12].forEach((t) => this.voice({ f0: 2300, dur: 0.2, vol: 0.02, when: t })); },
    water() { this.noise(0.5, 0.06, 320); },
    trainHorn() {
      [0, 0.75].forEach((w) => { this.voice({ type: 'square', f0: 311, dur: 0.6, vol: 0.02, when: w, filter: ['lowpass', 900], attack: 0.05 }); this.voice({ type: 'square', f0: 392, dur: 0.6, vol: 0.016, when: w, filter: ['lowpass', 900], attack: 0.05 }); });
    },
    jet() {
      if (this.muted || !this.ctx) return;
      const c = this.ctx, t = c.currentTime, dur = 4;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(700, t + dur * 0.5); f.frequency.linearRampToValueAtTime(220, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
    },
  };

  // Which ambient sounds play on each road, and their [min, max] gap in seconds.
  const AMBIENCE = {
    badda:    { chirp: [3, 7], caw: [5, 10], farHorn: [4, 9], farBell: [5, 11] },
    linkroad: { chirp: [1.2, 3.5], water: [2.5, 5], caw: [10, 18], farHorn: [9, 16] },
    kuril:    { chirp: [3, 6], farHorn: [3, 7], trainHorn: [14, 22], caw: [8, 14] },
    airport:  { chirp: [4, 8], jet: [9, 14], farHorn: [7, 13] },
  };
  const ambT = {};
  function updateAmbience(dt) {
    if (!Sound.ctx || Sound.muted || document.hidden) return;
    const road = currentRoad();
    const prof = AMBIENCE[road && road.id] || AMBIENCE.badda;
    for (const [fx, [lo, hi]] of Object.entries(prof)) {
      if (!(fx in ambT)) ambT[fx] = lo + Math.random() * (hi - lo);
      ambT[fx] -= dt;
      if (ambT[fx] <= 0) { Sound[fx](); ambT[fx] = lo + Math.random() * (hi - lo); }
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!Sound.ctx) return;
    if (document.hidden) Sound.ctx.suspend(); else Sound.ctx.resume();
  });

  // ---------- Data ----------
  const VIOL = {
    wrongway:   { icon: '⬅️', text: 'উল্টো পথে!' },
    redlight:   { icon: '🚦', text: 'লাল বাতি পার!' },
    footpath:   { icon: '🚶', text: 'ফুটপাথে রিকশা!' },
    phone:      { icon: '📱', text: 'চালাতে চালাতে ফোন!' },
    overload:   { icon: '👨‍👩‍👧‍👦', text: '৫ জন যাত্রী!' },
    overcharge: { icon: '💸', text: 'ভাড়া ৳৫০০!' },
    tesla:      { icon: '⚡', text: 'টেসলা! মোটর রিকশা' },
  };
  const GUILTY_TYPES = ['wrongway', 'footpath', 'phone', 'overload', 'overcharge', 'tesla'];
  const DEFAULT_WEIGHTS = { wrongway: 2, footpath: 1, phone: 1, overload: 1, overcharge: 1, tesla: 2 };
  const DECOYS = [
    { icon: '🔔', text: 'টুং টাং' },
    { icon: '🙂', text: 'যাবেন নাকি?' },
    { icon: '🎵', text: 'গুনগুন...' },
    { icon: '☕', text: 'চা খাবো' },
    { icon: '💰', text: 'ভাড়া ৳৫০' },
  ];
  const GUILTY_SAYS = ['মাফ করেন!', 'আর করুম না!', 'ভুল হইসে মামা!', 'উফ্‌!'];
  const INNOCENT_SAYS = ['আমি কী করসি?!', 'আমি তো ভালো!', 'কেন মারলেন?!'];

  const SKINS = ['#8d5a3b', '#a8694a', '#6e4630', '#b97c56'];
  const SHIRTS = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#9b5de5', '#ffd166', '#06d6a0', '#ef476f'];
  const HOODS = ['#d62828', '#1d3557', '#2b9348', '#f77f00', '#7209b7', '#c9184a'];
  const BODIES = ['#0077b6', '#e63946', '#2a9d8f', '#ffb703', '#8338ec', '#fb5607'];
  const VESTS = ['#f1f1f1', '#dfe7fd', '#ffe5b4', '#cfe8cf'];
  const LUNGIS = ['#2a5caa', '#3a7d44', '#7b2cbf', '#8d6e63', '#1d3557'];

  // ---------- Roads / stages ----------
  const ROADS = TH.roads.slice().sort((a, b) => a.order - b.order);
  const LEVELS_PER_ROAD = 2;
  const roadStates = new Map();
  const roadErrors = new Set();
  function seedFor(id) { let h = 2166136261; for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
  function roadState(road) {
    if (!roadStates.has(road.id)) {
      let s = {};
      try { s = road.init ? road.init(TH.mulberry32(seedFor(road.id))) || {} : {}; } catch (e) { reportRoadError(road, 'init', e); }
      roadStates.set(road.id, s);
    }
    return roadStates.get(road.id);
  }
  function reportRoadError(road, hook, e) {
    const key = road.id + ':' + hook;
    if (!roadErrors.has(key)) { roadErrors.add(key); console.error(`[road ${road.id}] ${hook} failed:`, e); }
  }
  // Calls an optional road hook, isolating errors so one bad scene can't freeze the game.
  function roadHook(hook, ...args) {
    const road = currentRoad();
    if (!road || typeof road[hook] !== 'function' || roadErrors.has(road.id + ':' + hook)) return;
    try { road[hook](...args); } catch (e) { reportRoadError(road, hook, e); }
  }
  const currentRoad = () => ROADS[G.roadIdx] || ROADS[0];
  const roadIdxForLevel = (lvl) => (G.startRoad + Math.floor((lvl - 1) / LEVELS_PER_ROAD)) % ROADS.length;

  // ---------- Player (traffic sergeant) ----------
  const P_MIN_Y = FOOT_Y + 4, P_MAX_Y = H - 4;
  const P_SPEED = 290;
  const REACH_X = 85, REACH_Y = 42;
  const newPlayer = () => ({ x: 500, y: 470, facing: 1, walkT: 0, moving: false, slapAnim: 0, cooldown: 0, target: null });

  // ---------- Game state ----------
  const G = {
    state: 'menu', // menu | play | dying | over
    score: 0, best: loadBest(), lives: 3, level: 1, combo: 0,
    rickshaws: [], texts: [], particles: [], fx: [],
    spawnT: 0.5, light: 'green', lightT: 5,
    shakeT: 0, hurtT: 0, dyingT: 0, time: 0,
    player: newPlayer(),
    startRoad: 0, roadIdx: 0,
    paused: false, // phone held in portrait
    fade: null,   // { t, to } road transition
    banner: null, // { road, t }
  };

  const groundY = (k) => (k.lane < 0 ? FOOT_Y : LANES[k.lane]);
  const driverX = (k) => k.x + 33 * k.dir;
  const inReach = (k) => !k.slapped
    && Math.abs(G.player.y - groundY(k)) < REACH_Y
    && Math.abs(driverX(k) - G.player.x) < REACH_X;

  function laneClear(lane, x) {
    return !G.rickshaws.some((o) => o.lane === lane && Math.abs(o.x - x) < 165);
  }

  function pickGuiltyType() {
    const w = Object.assign({}, DEFAULT_WEIGHTS, (currentRoad() || {}).weights || {});
    const total = GUILTY_TYPES.reduce((s, t) => s + Math.max(0, w[t] || 0), 0);
    let r = Math.random() * total;
    for (const t of GUILTY_TYPES) { r -= Math.max(0, w[t] || 0); if (r < 0) return t; }
    return 'wrongway';
  }

  function spawn() {
    const lvl = G.state === 'play' ? G.level : 1;
    const k = {
      x: 0, lane: 0, dir: 1, speed: 0,
      violation: null, guilty: false, obeys: true,
      passengers: Math.random() < 0.12 ? 0 : 1 + ((Math.random() * 2) | 0),
      wheelA: Math.random() * 6, t: Math.random() * 10,
      slapped: false, slapT: 0, bubble: null, say: null,
      hood: pick(HOODS), body: pick(BODIES), vest: pick(VESTS), lungi: pick(LUNGIS), skin: pick(SKINS),
      pax: [], seed: (Math.random() * 1e9) | 0,
    };
    const r = Math.random();
    let type = null;
    if (r < 0.14) type = 'redlight';
    else if (r < 0.14 + 0.46) type = pickGuiltyType();

    k.violation = type;
    if (type === 'redlight') k.obeys = false; // guilty only if it actually crosses on red
    else if (type) { k.guilty = true; k.bubble = VIOL[type]; }
    else if (lvl >= 2 && Math.random() < 0.25 + 0.06 * lvl) k.bubble = pick(DECOYS);

    if (type === 'wrongway') k.dir = -1;
    if (type === 'footpath') { k.lane = -1; k.dir = Math.random() < 0.5 ? 1 : -1; }
    if (type === 'overload') k.passengers = 5;
    if (type === 'overcharge' && k.passengers === 0) k.passengers = 1;

    k.speed = (55 + Math.random() * 35) * (1 + (Math.min(lvl, 10) - 1) * 0.12)
      * (type === 'redlight' ? 1.35 : 1) * (type === 'wrongway' ? 1.1 : 1) * (type === 'tesla' ? 1.4 : 1);
    k.x = k.dir === 1 ? -90 : W + 90;

    if (type === 'redlight') {
      // needs an open lane up to the stop line, and a speed that reaches it while the light is red
      const open = shuffle([0, 1, 2]).find((l) => laneClear(l, k.x)
        && !G.rickshaws.some((o) => o.lane === l && o.dir === 1 && o.x < STOP_X));
      const redIn = G.light === 'green' ? G.lightT + 1.3 : G.light === 'yellow' ? G.lightT : 0;
      const redLeft = G.light === 'red' ? G.lightT : 4.5;
      if (open === undefined || redLeft < 1.5) { k.violation = null; k.obeys = true; }
      else {
        const arrive = redIn + 0.4 + Math.random() * (redLeft - 1.2);
        k.speed = Math.min(260, Math.max(70, (STOP_X - 60 - k.x) / arrive));
        k.lane = open;
      }
    }

    if (k.violation === 'redlight') { /* lane already chosen */ }
    else if (k.lane !== -1) {
      const lane = shuffle([0, 1, 2]).find((l) => laneClear(l, k.x));
      if (lane === undefined) return;
      k.lane = lane;
    } else if (!laneClear(-1, k.x)) return;

    k.pax = Array.from({ length: k.passengers }, () => ({ skin: pick(SKINS), shirt: pick(SHIRTS), seed: (Math.random() * 1e9) | 0 }));
    G.rickshaws.push(k);
    if (G.state === 'play' && !k.guilty && Math.random() < 0.2) Sound.bell();
    if (G.state === 'play' && type === 'tesla') { Sound.motor(); Sound.zap(); }
  }

  function addText(x, y, text, color, size = 26, life = 1, vy = -40) {
    G.texts.push({ x, y, text, color, size, life, t: 0, vy });
  }

  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 260;
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, t: 0, life: 0.5 + Math.random() * 0.4, color: pick(colors), size: 10 + Math.random() * 10 });
    }
  }

  // Soft dust puffs kicked up behind a fleeing rickshaw.
  function dust(x, y, dir) {
    for (let i = 0; i < 6; i++) {
      G.particles.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 8, vx: -dir * (40 + Math.random() * 80), vy: -10 - Math.random() * 25, t: 0, life: 0.6 + Math.random() * 0.4, size: 6 + Math.random() * 6 });
    }
  }

  // ---------- Game flow ----------
  function updateHUD() {
    $('score').textContent = G.score;
    $('level').textContent = G.level;
    $('lives').textContent = '❤️'.repeat(Math.max(0, G.lives)) + '🖤'.repeat(Math.max(0, 3 - G.lives));
    const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
    const c = $('combo');
    c.textContent = `🔥 কম্বো x${mult}`;
    c.classList.toggle('hidden', mult < 2);
    const road = currentRoad();
    $('roadName').textContent = road ? road.name : '';
  }

  function startGame() {
    Sound.init();
    Object.assign(G, {
      state: 'play', score: 0, lives: 3, level: 1, combo: 0,
      rickshaws: [], texts: [], particles: [], fx: [],
      spawnT: 0.3, light: 'green', lightT: 5, shakeT: 0, hurtT: 0,
      player: newPlayer(), roadIdx: G.startRoad, fade: null,
      banner: { road: ROADS[G.startRoad], t: 0 },
    });
    keys.clear();
    $('start').classList.add('hidden');
    $('over').classList.add('hidden');
    $('hud').classList.remove('hidden');
    updateHUD();
    addText(W / 2, 250, 'নিয়ম ভাঙা রিকশাওয়ালাকে থাপ্পড় দিন!', '#ffd166', 30, 3, -8);
    addText(W / 2, 292, isTouch ? 'বামে জয়স্টিকে চলুন · ডানে ✋ বোতামে থাপ্পড় · রিকশায় ট্যাপ = পিছু নিন'
      : '← ↑ → ↓ / WASD চলুন · Space থাপ্পড় · অথবা ক্লিক/ট্যাপ', '#fff', 18, 3.5, -8);
    $('touchUI').classList.toggle('hidden', !isTouch);
    if (isTouch) goFullscreen();
    checkOrientation();
  }

  // Fullscreen + landscape lock where the browser allows it (Android Chrome; iOS ignores it).
  function goFullscreen() {
    const el = document.documentElement;
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } };
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
      else lock();
    } catch (e) { /* unsupported */ }
  }

  // On phones the game needs landscape: pause and ask to rotate while held upright.
  const portraitMQ = window.matchMedia('(orientation: portrait)');
  function checkOrientation() {
    const need = isTouch && portraitMQ.matches && G.state === 'play';
    G.paused = need;
    $('rotate').classList.toggle('hidden', !need);
  }
  window.addEventListener('resize', checkOrientation);
  if (portraitMQ.addEventListener) portraitMQ.addEventListener('change', checkOrientation);

  function rankFor(s) {
    if (s < 50) return '🚸 নতুন ট্রাফিক কনস্টেবল';
    if (s < 150) return '👮 ট্রাফিক সার্জেন্ট';
    if (s < 300) return '🎖️ ট্রাফিক ইন্সপেক্টর';
    return '👑 ঢাকার ট্রাফিক কিং!';
  }

  function gameOver() {
    G.state = 'over';
    Sound.wahwah();
    if (G.score > G.best) { G.best = G.score; saveBest(G.best); }
    $('finalScore').textContent = G.score;
    $('bestOver').textContent = G.best;
    $('rank').textContent = rankFor(G.score);
    const road = currentRoad();
    $('overRoad').textContent = road ? `📍 ${road.name} (${road.nameEn}) পর্যন্ত পৌঁছেছেন` : '';
    $('bestStart').textContent = G.best;
    $('hud').classList.add('hidden');
    $('touchUI').classList.add('hidden');
    $('over').classList.remove('hidden');
    checkOrientation();
  }

  function loseLife() {
    buzz(120);
    G.lives--;
    G.combo = 0;
    G.hurtT = 0.45;
    updateHUD();
    if (G.lives <= 0) { G.state = 'dying'; G.dyingT = 1.1; }
  }

  function checkLevel() {
    const lvl = 1 + Math.floor(G.score / 100);
    if (lvl <= G.level) return;
    G.level = lvl;
    const idx = roadIdxForLevel(lvl);
    if (idx !== G.roadIdx && ROADS.length > 1) {
      G.fade = { t: 0, to: idx };
      Sound.newRoad();
    } else {
      addText(W / 2, 260, `লেভেল ${lvl}! 🚀`, '#06d6a0', 48, 1.6, -20);
      Sound.kazoo();
    }
  }

  function slap(k) {
    k.slapped = true;
    k.slapT = 0;
    const gy = groundY(k);
    const hx = driverX(k), hy = gy - 90;
    const p = G.player;
    p.facing = Math.sign(hx - p.x) || p.facing;
    p.slapAnim = 0.001;
    p.cooldown = 0.32;
    if (p.target && p.target.k === k) p.target = null;
    G.fx.push({ x: hx, y: hy, t: 0, from: p.x < hx ? -1 : 1 });
    G.shakeT = 0.25;
    buzz(k.guilty ? 30 : [60, 40, 60]);
    Sound.slap();
    burst(hx, hy, 12, ['#ffd166', '#fff', '#ff6b6b']);
    addText(hx, hy - 40, 'থাপ্পড়!', '#fff', 40, 0.8, -60);

    if (k.guilty) {
      G.combo++;
      const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
      const pts = 10 * mult;
      G.score += pts;
      addText(hx + 50, hy - 5, `+${pts}`, '#06d6a0', 30, 0.9);
      if (mult > 1 && G.combo % 3 === 0 && G.combo <= 12) { addText(hx, hy - 85, `কম্বো x${mult}!`, '#ffb703', 30, 1); Sound.pop(); }
      k.say = pick(GUILTY_SAYS);
      Sound.funnySlap();
      checkLevel();
    } else {
      G.score = Math.max(0, G.score - 15);
      addText(hx, hy - 85, 'নির্দোষ! -১৫', '#ff4d6d', 32, 1.2);
      k.say = pick(INNOCENT_SAYS);
      Sound.yelp(0.05);
      Sound.wahwah();
      loseLife();
    }
    k.bubble = null;
    updateHUD();
  }

  // Slap whoever is within arm's reach, or swing at the air.
  function trySlap() {
    const p = G.player;
    if (p.cooldown > 0) return;
    let best = null, bd = Infinity;
    for (const k of G.rickshaws) {
      if (!inReach(k)) continue;
      const d = Math.abs(driverX(k) - p.x) + Math.abs(groundY(k) - p.y);
      if (d < bd) { bd = d; best = k; }
    }
    if (best) { slap(best); return; }
    p.slapAnim = 0.001;
    p.cooldown = 0.32;
    Sound.whoosh();
    Sound.boop();
    addText(p.x + p.facing * 45, p.y - 75, '💨', '#fff', 24, 0.5, -30);
  }

  // Click / tap: on a rickshaw -> chase it and slap; elsewhere -> run there.
  function onPointer(e) {
    e.preventDefault();
    if (G.state !== 'play') return;
    Sound.init();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left - offX) / scale;
    const py = (e.clientY - rect.top - offY) / scale;
    if (px < 0 || px > W || py < 0 || py > H) return;
    // tight, facing-aware boxes (carriage+hood and driver+front wheel); closest visual centre wins
    let hit = null, bd = Infinity;
    for (const k of G.rickshaws) {
      if (k.slapped) continue;
      const lx = (px - k.x) * k.dir, ly = py - groundY(k);
      const inCarriage = lx > -78 && lx < 6 && ly > -134 && ly < 4;
      const inDriver = lx >= 6 && lx < 66 && ly > -104 && ly < 4;
      if (!inCarriage && !inDriver) continue;
      const d = Math.hypot(px - k.x, py - (groundY(k) - 60));
      if (d < bd) { bd = d; hit = k; }
    }
    const p = G.player;
    if (hit) {
      p.target = { k: hit };
    } else {
      p.target = { x: Math.max(20, Math.min(W - 20, px)), y: Math.max(P_MIN_Y, Math.min(P_MAX_Y, py)) };
      addText(p.target.x, p.target.y - 6, '✕', '#ffd166', 18, 0.4, 0);
    }
  }
  canvas.addEventListener('pointerdown', onPointer);

  const keys = new Set();
  const MOVE_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' ', 'j'];
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if ((key === 'enter' || key === ' ') && (G.state === 'menu' || G.state === 'over')) { e.preventDefault(); startGame(); return; }
    if (G.state !== 'play') return;
    if (MOVE_KEYS.includes(key)) e.preventDefault();
    keys.add(key);
    if ((key === ' ' || key === 'j') && !e.repeat) { Sound.init(); trySlap(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // ---------- Touch controls: joystick (left) + slap button (right) ----------
  const touchVec = { x: 0, y: 0 };
  (function setupTouchControls() {
    const base = $('stick'), knob = $('knob');
    const R = 46;
    let id = null;
    const move = (e) => {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      touchVec.x = dx / R; touchVec.y = dy / R;
    };
    const end = (e) => {
      if (e && e.pointerId !== id) return;
      id = null; touchVec.x = 0; touchVec.y = 0; knob.style.transform = '';
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault(); Sound.init();
      id = e.pointerId;
      try { base.setPointerCapture(id); } catch (err) { /* ignore */ }
      move(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    base.addEventListener('lostpointercapture', end);
    $('slapBtn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (G.state !== 'play') return;
      Sound.init(); trySlap();
    });
  })();

  function updatePlayer(dt) {
    const p = G.player;
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.slapAnim > 0) { p.slapAnim += dt; if (p.slapAnim > 0.3) p.slapAnim = 0; }

    let vx = 0, vy = 0;
    if (keys.has('arrowleft') || keys.has('a')) vx--;
    if (keys.has('arrowright') || keys.has('d')) vx++;
    if (keys.has('arrowup') || keys.has('w')) vy--;
    if (keys.has('arrowdown') || keys.has('s')) vy++;

    const stick = Math.hypot(touchVec.x, touchVec.y);
    if (vx || vy) {
      p.target = null;
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * P_SPEED; vy = (vy / len) * P_SPEED * 0.8;
    } else if (stick > 0.18) { // analog joystick: speed follows how far it's pushed
      p.target = null;
      const m = Math.min(1, stick);
      vx = (touchVec.x / stick) * m * P_SPEED; vy = (touchVec.y / stick) * m * P_SPEED * 0.8;
    } else if (p.target) {
      let tx, ty;
      const k = p.target.k;
      if (k) {
        if (k.slapped || !G.rickshaws.includes(k)) { p.target = null; }
        else {
          if (inReach(k) && p.cooldown === 0) { slap(k); }
          const side = p.x < driverX(k) ? -1 : 1;
          tx = driverX(k) + side * 45; ty = groundY(k) + 6;
        }
      } else { tx = p.target.x; ty = p.target.y; }
      if (p.target) {
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        const step = Math.min(d, P_SPEED * dt);
        if (d < 2) { if (!k) p.target = null; }
        else { vx = (dx / d) * step / dt; vy = (dy / d) * step / dt; }
      }
    }

    p.moving = Math.hypot(vx, vy) > 5;
    if (p.moving) {
      p.x += vx * dt; p.y += vy * dt;
      if (Math.abs(vx) > 20 && p.slapAnim === 0) p.facing = Math.sign(vx);
      p.walkT += dt;
    }
    p.x = Math.max(20, Math.min(W - 20, p.x));
    p.y = Math.max(P_MIN_Y, Math.min(P_MAX_Y, p.y));
  }

  // ---------- Update ----------
  function updateRickshaw(k, dt) {
    k.t += dt;
    if (k.slapped) {
      const was = k.slapT;
      k.slapT += dt;
      if (was < 0.7 && k.slapT >= 0.7) {
        dust(k.x - k.dir * 50, groundY(k), k.dir);
        if (G.state === 'play') Sound.slideDown();
      }
      const v = k.slapT < 0.7 ? 0 : k.dir * 340; // dazed, then flee
      k.x += v * dt;
      k.wheelA += (v * dt) / 19;
      return;
    }
    let nx = k.x + k.speed * k.dir * dt;
    if (k.lane >= 0) {
      // keep distance from the rickshaw ahead in the same lane & direction
      for (const o of G.rickshaws) {
        if (o === k || o.lane !== k.lane || o.dir !== k.dir || o.slapped) continue;
        const gap = (o.x - k.x) * k.dir;
        if (gap > 0 && gap < 400) {
          const lim = o.x - k.dir * 135;
          nx = k.dir === 1 ? Math.min(nx, lim) : Math.max(nx, lim);
        }
      }
      // honest drivers stop at red / yellow if they haven't reached the line
      if (k.dir === 1 && k.obeys && G.light !== 'green' && k.x <= STOP_X - 61) nx = Math.min(nx, STOP_X - 62);
    }
    // the sergeant standing in front blocks the rickshaw
    if (G.state === 'play') {
      const p = G.player;
      const gap = (p.x - k.x) * k.dir;
      if (Math.abs(p.y - groundY(k)) < 26 && gap > 55 && gap < 220) {
        const lim = p.x - k.dir * 80;
        nx = k.dir === 1 ? Math.min(nx, lim) : Math.max(nx, lim);
        if ((nx - k.x) * k.dir < k.speed * dt * 0.5 && k.t - (k.bellT || -9) > 2.5) {
          k.bellT = k.t;
          if (Math.random() < 0.5) Sound.clownHorn(); else Sound.bell();
          addText(k.x + k.dir * 20, groundY(k) - 140, 'সরেন মামা! 🔔', '#fff', 16, 1, -10);
        }
      }
    }
    nx = k.dir === 1 ? Math.max(nx, k.x) : Math.min(nx, k.x);

    if (k.violation === 'redlight' && !k.guilty && k.dir === 1 && G.light === 'red'
      && k.x + 60 < STOP_X && nx + 60 >= STOP_X) {
      k.guilty = true;
      k.bubble = VIOL.redlight;
      if (G.state === 'play') Sound.honk();
    }
    k.wheelA += (nx - k.x) / 19;
    k.x = nx;
  }

  const env = () => ({ t: G.time, light: G.light, lightT: G.lightT, road: currentRoad(), state: G.state, level: G.level });

  function update(dt) {
    G.time += dt;

    G.lightT -= dt;
    if (G.lightT <= 0) {
      if (G.light === 'green') { G.light = 'yellow'; G.lightT = 1.3; }
      else if (G.light === 'yellow') { G.light = 'red'; G.lightT = 4.5; }
      else { G.light = 'green'; G.lightT = 5 + Math.random() * 2; }
    }

    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      spawn();
      const base = G.state === 'play' ? Math.max(0.5, 1.9 - (G.level - 1) * 0.16) : 1.6;
      G.spawnT = base * (0.7 + Math.random() * 0.6);
    }

    if (G.state === 'play' || G.state === 'dying') updatePlayer(dt);
    for (const k of G.rickshaws) updateRickshaw(k, dt);
    G.rickshaws = G.rickshaws.filter((k) => {
      if (k.x > -170 && k.x < W + 170) return true;
      if (G.state === 'play' && k.guilty && !k.slapped) {
        const ex = k.x < 0 ? 110 : W - 110;
        addText(ex, groundY(k) - 70, 'পালিয়ে গেল!', '#ff4d6d', 28, 1.2);
        Sound.taunt();
        loseLife();
      }
      return false;
    });

    for (const t of G.texts) { t.t += dt; t.y += t.vy * dt; }
    G.texts = G.texts.filter((t) => t.t < t.life);
    for (const p of G.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === 'dust' ? 20 : 600) * dt; }
    G.particles = G.particles.filter((p) => p.t < p.life);
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter((f) => f.t < 0.45);

    // road transition: fade out (0.45s), switch scene, fade in (0.45s)
    if (G.fade) {
      const before = G.fade.t;
      G.fade.t += dt;
      if (before < 0.45 && G.fade.t >= 0.45) {
        G.roadIdx = G.fade.to;
        G.banner = { road: currentRoad(), t: 0 };
        for (const key of Object.keys(ambT)) delete ambT[key];
        updateHUD();
      }
      if (G.fade.t >= 0.9) G.fade = null;
    }
    if (G.banner) { G.banner.t += dt; if (G.banner.t > 3) G.banner = null; }

    const road = currentRoad();
    if (road) roadHook('update', roadState(road), dt, env());
    updateAmbience(dt);

    G.shakeT = Math.max(0, G.shakeT - dt);
    G.hurtT = Math.max(0, G.hurtT - dt);
    if (G.state === 'dying') { G.dyingT -= dt; if (G.dyingT <= 0) gameOver(); }
  }

  // ---------- Overlays ----------
  function drawRickshawOverlays(k) {
    const gy = groundY(k);
    const headX = driverX(k), headY = gy - 91;
    if (k.bubble && !k.slapped && headX > 0 && headX < W) {
      const bob = Math.sin(k.t * 4) * 2;
      TH.sprites.drawBubble(ctx, headX, gy - 118 + bob, `${k.bubble.icon} ${k.bubble.text}`);
    }
    if (k.say && k.slapT < 1.6) TH.sprites.drawBubble(ctx, headX, gy - 122, k.say, '#ff4d6d');
    if (k.slapped && k.slapT < 1.5) {
      ctx.font = `14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const sa = k.slapT * 6 + (i * Math.PI * 2) / 3;
        ctx.fillText('⭐', headX + Math.cos(sa) * 16, headY - 14 + Math.sin(sa) * 5);
      }
    }
  }

  function drawPlayerMarker() {
    const p = G.player;
    if (p.target && p.target.k) {
      const k = p.target.k;
      ctx.beginPath(); ctx.arc(driverX(k), groundY(k) - 88, 17 + Math.sin(G.time * 10) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    const y = p.y - 116 + Math.sin(G.time * 5) * 3;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.moveTo(p.x - 7, y); ctx.lineTo(p.x + 7, y); ctx.lineTo(p.x, y + 9); ctx.closePath(); ctx.fill();
    ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText('আপনি', p.x, y - 9);
    ctx.fillStyle = '#ffd166'; ctx.fillText('আপনি', p.x, y - 9);
  }

  function drawEffects() {
    for (const p of G.particles) {
      const life = 1 - p.t / p.life;
      if (p.kind === 'dust') {
        ctx.globalAlpha = Math.max(0, life) * 0.45;
        TH.circle(ctx, p.x, p.y, p.size * (1 + p.t * 2), '#c8b89a');
        continue;
      }
      ctx.globalAlpha = Math.max(0, life);
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', p.x, p.y);
    }
    ctx.globalAlpha = 1;

    for (const f of G.fx) {
      // expanding impact ring
      if (f.t < 0.3) {
        ctx.globalAlpha = 1 - f.t / 0.3;
        ctx.beginPath(); ctx.arc(f.x, f.y, 10 + f.t * 220, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 * (1 - f.t / 0.3) + 1; ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const swing = Math.min(1, f.t / 0.1);
      const alpha = f.t < 0.25 ? 1 : 1 - (f.t - 0.25) / 0.2;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(f.x + f.from * (1 - swing) * 90, f.y - (1 - swing) * 30);
      ctx.rotate(f.from * (0.9 - swing * 1.1));
      ctx.font = '74px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.from > 0 ? '🤚' : '🖐️', 0, 0);
      ctx.restore();
      if (f.t > 0.08 && f.t < 0.3) {
        ctx.font = '44px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('💥', f.x, f.y);
      }
    }

    for (const t of G.texts) {
      const pop = 1 + 0.45 * Math.max(0, 1 - t.t / 0.15);
      ctx.globalAlpha = t.t > t.life - 0.3 ? Math.max(0, (t.life - t.t) / 0.3) : 1;
      ctx.font = `bold ${Math.round(t.size * pop)}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // "📍 Now entering <road>" banner.
  function drawBanner() {
    const b = G.banner;
    if (!b || !b.road) return;
    const inT = Math.min(1, b.t / 0.35), outT = b.t > 2.5 ? (3 - b.t) / 0.5 : 1;
    const a = Math.max(0, Math.min(inT, outT));
    const y = 150 - (1 - inT) * 30;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(15,15,25,0.72)';
    TH.rr(ctx, W / 2 - 250, y - 48, 500, 96, 18); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd166'; ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(G.level > 1 ? `লেভেল ${G.level} · নতুন রাস্তা` : 'শুরু হচ্ছে', W / 2, y - 26);
    ctx.fillStyle = '#fff'; ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`📍 ${b.road.name}`, W / 2, y + 4);
    ctx.fillStyle = '#cbd5e1'; ctx.font = `15px ${FONT}`;
    ctx.fillText(`${b.road.nameEn}${b.road.tagline ? ' · ' + b.road.tagline : ''}`, W / 2, y + 32);
    ctx.restore();
  }

  // ---------- Render ----------
  let vignette = null;
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b1b22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let sx = 0, sy = 0;
    if (G.shakeT > 0) {
      const m = 9 * (G.shakeT / 0.25);
      sx = (Math.random() - 0.5) * m; sy = (Math.random() - 0.5) * m;
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offX + sx * scale), dpr * (offY + sy * scale));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    const road = currentRoad();
    const e = env();
    const s = road ? roadState(road) : {};
    // each layer is isolated with save/restore so art code can't leak canvas state into the next
    ctx.save(); roadHook('drawBack', ctx, s, e); ctx.restore();
    ctx.save(); TH.street.draw(ctx, e); ctx.restore();
    ctx.save(); roadHook('drawMid', ctx, s, e); ctx.restore();
    ctx.save(); TH.street.drawTrafficLight(ctx, e); ctx.restore();

    const showPlayer = G.state === 'play' || G.state === 'dying';
    const order = G.rickshaws.map((k) => ({ y: groundY(k), draw: () => { ctx.save(); TH.sprites.drawRickshaw(ctx, k, groundY(k), e); ctx.restore(); drawRickshawOverlays(k); } }));
    if (showPlayer) order.push({ y: G.player.y, draw: () => { ctx.save(); TH.sprites.drawPlayer(ctx, G.player, e); ctx.restore(); } });
    order.sort((a, b) => a.y - b.y);
    for (const o of order) o.draw();

    ctx.save(); roadHook('drawFront', ctx, s, e); ctx.restore();
    // soft vignette pulls the eye to the street
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H * 0.6, 260, W / 2, H * 0.6, 720);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.32)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    if (showPlayer) drawPlayerMarker();
    drawEffects();
    drawBanner();

    if (G.hurtT > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${((G.hurtT / 0.45) * 0.55).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (G.fade) {
      const a = G.fade.t < 0.45 ? G.fade.t / 0.45 : 1 - (G.fade.t - 0.45) / 0.45;
      ctx.fillStyle = `rgba(10,10,16,${Math.max(0, Math.min(1, a)).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!G.paused) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- UI wiring ----------
  function buildRoadPicker() {
    const box = $('roadPick');
    box.innerHTML = '';
    ROADS.forEach((road, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'road-btn' + (i === G.startRoad ? ' on' : '');
      b.innerHTML = `<b></b><small></small>`;
      b.querySelector('b').textContent = `${i + 1}. ${road.name}`;
      b.querySelector('small').textContent = road.nameEn;
      b.addEventListener('click', () => {
        G.startRoad = i; G.roadIdx = i;
        box.querySelectorAll('.road-btn').forEach((el, j) => el.classList.toggle('on', j === i));
      });
      box.appendChild(b);
    });
  }

  $('bestStart').textContent = G.best;
  buildRoadPicker();
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('menuBtn').addEventListener('click', () => {
    G.state = 'menu';
    $('over').classList.add('hidden');
    $('start').classList.remove('hidden');
    checkOrientation();
  });
  if (document.fullscreenEnabled) {
    $('fsBtn').classList.remove('hidden');
    $('fsBtn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen();
    });
  }
  $('mute').addEventListener('click', () => {
    Sound.setMuted(!Sound.muted);
    $('mute').textContent = Sound.muted ? '🔇' : '🔊';
  });
  if (/[?&]debug\b/.test(location.search)) {
    window.thappor = {
      G, W, H, ROADS,
      step: (dt, n = 1) => { for (let i = 0; i < n; i++) update(dt); render(); },
      setRoad: (i) => { G.roadIdx = i; G.startRoad = i; updateHUD(); render(); },
      get scale() { return scale; }, get offX() { return offX; }, get offY() { return offY; },
    };
  }

  requestAnimationFrame(frame);
})();
