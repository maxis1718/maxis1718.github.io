// ─────────────────────────────────────────────────────────────────────────────
// theme.js — ALL style knobs for the walkthrough live here.
// STYLE  = palette / materials (time-of-day independent)
// THEMES = lighting & atmosphere per time of day ('day' | 'evening')
// Colours are CSS hex strings. Sizes are metres. Edit freely; reload to see.
// ─────────────────────────────────────────────────────────────────────────────

export const STYLE = {
  // ── Architecture ──────────────────────────────────────────────────────────
  wall:        { color: '#efe9de', roughness: 0.94, plasterNoise: 0.018 },   // matte, slightly creamy white
  facade:      { color: '#ddd6cb', roughness: 0.9 },                          // exterior / balcony wall paint
  wallCap:     { color: '#3b3a38', roughness: 0.9 },                          // wall tops seen in overview (poché)
  ceiling:     { color: '#fbfaf7', roughness: 0.96 },                          // whiter than walls
  bathWall:    { color: '#e9e6e0', grout: '#d6d1c8', tileW: 0.60, tileH: 0.30, roughness: 0.35 }, // large-format wall tile
  skirting:    { color: '#9d907f', h: 0.08, t: 0.012, roughness: 0.55 },     // taupe accent so wall bases read
  sill:        { color: '#e4e0d8', roughness: 0.45 },                         // window sill board (stone)
  slab:        { color: '#9c988f', roughness: 0.95 },                         // floor slab edge (overview)

  // ── Floors (key = PLAN room.floor) ────────────────────────────────────────
  floors: {
    wood:    { kind: 'oak',   color: '#bb8e5e', color2: '#9b7047', plankW: 0.19, plankL: 1.8, roughness: 0.5 },   // richer mid-tone oak
    tile:    { kind: 'tile',  color: '#d5cec2', color2: '#c8c0b3', grout: '#b2aa9c', tileW: 0.60, tileH: 0.60, vein: 0.11, roughness: 0.2 },
    bath:    { kind: 'tile',  color: '#c9c5bd', color2: '#bdb8af', grout: '#aaa59b', tileW: 0.30, tileH: 0.30, vein: 0.02, roughness: 0.45 },
    balcony: { kind: 'stone', color: '#bdb6aa', color2: '#a9a296', grout: '#958f84', tileW: 0.60, tileH: 0.60, roughness: 0.85 },
    service: { kind: 'stone', color: '#c2bcb1', color2: '#b0a99d', grout: '#9a948a', tileW: 0.30, tileH: 0.30, roughness: 0.8 },
    ledge:   { kind: 'concrete', color: '#a8a59f', color2: '#96938c', roughness: 0.95 },
    lobby:   { kind: 'tile',  color: '#cbc6bc', color2: '#bdb7ac', grout: '#a9a397', tileW: 0.60, tileH: 0.60, vein: 0.04, roughness: 0.3 },
  },

  // ── Openings ──────────────────────────────────────────────────────────────
  glass:       { color: '#c9dbe0', opacity: 0.16, roughness: 0.04, metalness: 0.0, envIntensity: 1.2 },
  frame:       { color: '#4a4b4d', roughness: 0.45, metalness: 0.6, w: 0.045 },  // dark-grey aluminium
  railing:     { glassColor: '#cfe0e3', glassOpacity: 0.2, metal: '#55575a', barW: 0.02, barGap: 0.11 },
  door:        { color: '#d9c3a0', grain: '#c3a77f', roughness: 0.55 },        // light oak veneer leaves
  mainDoor:    { color: '#7a5a3e', grain: '#664a31', roughness: 0.5 },          // walnut entrance door
  doorFrame:   { color: '#9d907f', roughness: 0.55 },                         // taupe frames/architraves
  handle:      { color: '#2f2f30', roughness: 0.35, metalness: 0.9 },
  slideOpaque: { color: '#ece8e1', roughness: 0.6 },                            // pocket door (non-glass)

  // ── Feature wall (PLAN.features finish:'wabisabi') ───────────────────────
  // timber-backed panel wrapped in wabi-sabi limewash wallpaper; one non-repeating procedural texture per surface
  featureWall: {
    color: '#f6f3ee',          // base tint × near-white mottle (avg ≈0.93) → perceived ≈ #cfcac3 light warm grey
    roughness: 0.95, bump: 1.4,  // bump = trowel relief strength (shows under the grazing washer)
    mottle: 0.045, strokes: 0.09, // cloudy variation / trowel-stroke contrast (0..~0.25)
    pxPerM: 560, pxPerMMobile: 300,
    edge: '#8a7660',           // exposed timber edge on the panel ends / top
    gap: '#24221f', gapW: 0.008, // shadow-gap reveal at ceiling + both ends
  },
  // concealed linear LED wall-washer slot in the ceiling (feature.washer = true), warm 2700K
  washer: { color: '#ffb469', slotOff: '#46423d', slotW: 0.03, offset: 0.05, glowH: 1.2 },

  // ── Glass partitions (PLAN.windows kind:'partition') + interior glass sliders ─
  partition: {
    frame: '#1b1b1c', frameW: 0.02, frameD: 0.04, roughness: 0.6, metalness: 0.25,   // slim matte-black aluminium
    glassColor: '#f2f6f5', glassOpacity: 0.07, envIntensity: 0.7,                   // clear, not milky
    balconySliders: false,     // true → balcony sliders also get the slim black frames
  },

  // ── Light fittings ────────────────────────────────────────────────────────
  downlight:   { spacing: 1.45, inset: 0.55, radius: 0.045, trim: '#d9d9d6' },

  // ── Fake ambient occlusion strips (wall/floor + wall/ceiling) ─────────────
  ao:          { floor: 0.30, ceiling: 0.20, width: 0.32 },

  // ── Exterior ──────────────────────────────────────────────────────────────
  ground:      { color: '#c3c9bd', far: '#c4ccc6', y: -42 },                    // unit is ~14 floors up
  city:        { count: 80, minR: 190, maxR: 560, color: '#e6e1d8', color2: '#b7bec6', seed: 7 },

  // ── Furniture palette (consumed by js/furniture.js via theme.furniture) ──
  furniture: {   // keys understood by js/furniture.js (palette(theme)); edit to restyle furniture
    oak: '#c8a57a', oakPale: '#d9c2a0', walnut: '#7b5b41', teak: '#9b6c45',
    white: '#eeebe5', cabinet: '#e8e3da', carcass: '#3a3632', black: '#262524',
    steel: '#c9cbcd', chrome: '#e9ebec', alu: '#55585b', frame: '#2a2826',
    fabric: '#cfc5b5', fabricDark: '#7f776d', bedding: '#f4f1eb', pillow: '#ebe5da', throw: '#a8977f',
    accent: '#b97c58', accent2: '#8f9b82',                 // terracotta + sage cushions
    ceramic: '#f7f6f3', worktop: '#eeece8', stone: '#dcd7cf', glass: '#dde9e8',
    leaf: '#557a42', leaf2: '#3f6233', pot: '#cbc3b6', soil: '#3a2e24',
    rug: '#e9e3d8', rugBorder: '#a89a83', appliance: '#f3f3f1', screen: '#0b0d0f',
    outdoorFabric: '#d8d0c2', lampGlow: '#ffe2b8', sheer: '#f6f3ee', drape: '#c9bca9',
    glow: 1.0,
  },
  accent: '#c79a6b',

  // ── UI ────────────────────────────────────────────────────────────────────
  ui: { accent: '#e9c48f', panel: 'rgba(28,28,30,0.42)', text: '#f6f3ee' },
};

export const THEMES = {
  day: {
    name: 'day',
    exposure: 0.94,
    sky:    { top: '#4f86c6', horizon: '#cfe0ec', bottom: '#e9eef0' },
    fog:    { color: '#d3e0ea', near: 40, far: 650 },
    sun:    { color: '#ffd29a', intensity: 6.5, dir: [-0.38, 0.50, -0.78] },     // dir = toward the sun (north-west, ~30° up) — warm key
    hemi:   { sky: '#a9c4ea', ground: '#b49a7b', intensity: 0.8 },              // cool sky fill vs warm sun
    envIntensity: 0.4,
    downlight: { color: '#fff4e2', intensity: 0.9, glow: 0.0 },
    interior: { color: '#ffd9a8', intensity: 0, distance: 6.0 },                  // real point lights (evening only)
    cityWindows: 0.0,
    ground: 1.0,
    groundColor: null,      // null = STYLE.ground.color
    overviewBg: null,       // null = show ground/city behind the dollhouse; or [top, mid, bottom] screen gradient
    lampGlow: 0.5,          // multiplier on furniture emissive (pendants / lamps)
    // 氛圍燈 ambient lighting (feature-wall washer + TV console under-glow); `on` = default when switching to this theme
    ambient: { on: false, slot: 1.6, wallGlow: 0.32, light: 0.9, furniture: 0.8 },
  },
  evening: {
    name: 'evening',
    exposure: 1.12,
    sky:    { top: '#0b1630', horizon: '#3a4f7a', bottom: '#1c2236' },
    fog:    { color: '#2a3656', near: 40, far: 650 },
    sun:    { color: '#8fa6d9', intensity: 0.25, dir: [0.55, 0.35, -0.75] },
    hemi:   { sky: '#ffd8b0', ground: '#4a3c30', intensity: 0.45 },             // warm 'bounce' fill from the lamps
    envIntensity: 0.16,
    downlight: { color: '#ffd29a', intensity: 2.2, glow: 0.35 },
    interior: { color: '#ffc488', intensity: 7.0, distance: 6.0 },               // ≤ 6 shadowless point lights follow the player
    cityWindows: 1.0,
    ground: 1.0,
    groundColor: '#1a2132',
    overviewBg: ['#0b1630', '#2b3b63', '#5a5675'],   // dusk gradient (matches evening sky)
    lampGlow: 1.6,
    ambient: { on: true, slot: 2.2, wallGlow: 0.6, light: 3.2, furniture: 1.0 },
  },
};
