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
    decking: { kind: 'deck',  color: '#8a6446', color2: '#6f4f37', gap: '#2a211b', boardW: 0.14, boardL: 2.2, gapW: 0.005, roughness: 0.8 },  // composite / teak-tone
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
  // recessed vertical LED channels at both ends of the feature wall (feature.sideSlots = true), part of 氛圍燈
  sideSlot: {
    cct: 2700, w: 0.025, recess: 0.015,
    stripOff: '#d9d4cc',       // diffuser colour when off
    reach: 0.28,               // m — e-folding distance of the grazing light across the face (fades toward the middle)
    strength: 0.85,            // peak brightening at the very edge (multiplicative, 0..~1.5) — keep subtle
    relief: 6.0,
    whiten: 0.4,               // mix the 2700K colour toward white (camera white-balance feel; 0 = raw CCT)               // how strongly the grazing light picks out the trowel relief
  },

  // ── Skylights (PLAN.features type:'skylight') — LED sky panels ────────────
  skylight: {
    top: '#3f97ec', bottom: '#7cc0f6', clouds: 0.07,   // panel sky gradient (saturated clear blue) + very faint high clouds
    panelGain: 1.25,           // emissive multiplier on the panel (not tone-mapped → stays saturated)
    reveal: '#ffffff', taper: 0.035,  // crisp white deep reveal, inset per side at the top (slight inward taper)
    cct: 6500, intensity: 9,   // RectAreaLight (cool daylight) per panel
    mobileLights: true,        // false → no RectAreaLights on phones (panel glow only)
  },

  // ── Lighting: recessed downlights only (75 mm trimless, deep-recessed) ───
  lighting: {
    // colour temperature per room id (fallback by floor type, then default)
    cct: { kitchen: 3900, living: 3500, foyer: 3500, corridor: 3500, lobby: 3500, default: 3000 },
    spacing: 1.45, wallMin: 0.5, featureMin: 0.7, minGap: 0.85,
    baffleR: 0.0375, apertureR: 0.013, baffle: '#141414',
    beam: 0.56, penumbra: 0.7,                 // SpotLight half-angle (rad) / penumbra — medium beam, soft edge
    spots: 8, spotsMobile: 6, spotIntensity: 5, spotDistance: 7, fade: 0.35,
    pool: 1.5, scallop: 1.3,                 // fake light pools (floor) / wall scallops for fixtures without a SpotLight
    scallopReach: 1.0,                         // only walls within this distance of a fixture get a scallop
  },

  // ── Glass partitions (PLAN.windows kind:'partition') + interior glass sliders ─
  partition: {
    frame: '#1b1b1c', frameW: 0.02, frameD: 0.04, roughness: 0.6, metalness: 0.25,   // slim matte-black aluminium
    glassColor: '#f2f6f5', glassOpacity: 0.07, envIntensity: 0.7,                   // clear, not milky
    balconySliders: false,     // true → balcony sliders also get the slim black frames
  },


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

  // ── Realism layer (js/realism.js, js/fx.js, js/photo.js) ─────────────────
  realism: {
    toneMapping: 'neutral',      // 'neutral' (Khronos PBR Neutral) | 'agx' | 'aces'  (URL ?tm= overrides for A/B tests)
    pcss: { sunAngleDeg: 1.6, maxBlockerDist: 4.0, minTexels: 1.25 },   // desktop contact-hardening sun shadows
    portals: 5, portalsMobile: 2,  // window "portal" area lights assigned to the openings of the current room
    whiteBalance: 0.3,           // lerp downlight CCT colours toward white (camera WB ≈ 3800 K)
    aoStripsWithSSAO: 0.45,      // fake AO strip strength while N8AO runs (desktop)
    textures: { tileRoughness: 0.7, oakRoughness: 1.0 },   // multipliers on the photographic roughness maps
    photoIdle: 1.5,              // s of stillness before photo mode starts (desktop, automatic)
    photoIdleMobile: 0.6,        // phones: opt-in via the 相片 button, then this delay
    photo: {},                   // overrides for js/photo.js options (bounces, maxSamples, …)
    photoMobile: {},
  },

  // ── UI ────────────────────────────────────────────────────────────────────
  ui: { accent: '#e9c48f', panel: 'rgba(28,28,30,0.42)', text: '#f6f3ee' },
};

// Kelvin → linear-ish sRGB hex (Tanner Helland fit), used for every light colour.
export function kelvin(K) {
  const t = K / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
STYLE.kelvin = kelvin;

export const THEMES = {
  day: {
    name: 'day',
    exposure: 0.94,
    sky:    { top: '#4f86c6', horizon: '#cfe0ec', bottom: '#e9eef0' },
    fog:    { color: '#d3e0ea', near: 40, far: 650 },
    sun:    { color: '#ffd29a', intensity: 6.5, dir: [-0.38, 0.50, -0.78] },     // dir = toward the sun (north-west, ~30° up) — warm key
    hemi:   { sky: '#a9c4ea', ground: '#b49a7b', intensity: 0.8 },              // cool sky fill vs warm sun
    envIntensity: 0.4,
    downlights: { on: false, aperture: 0.16 },   // day: fittings off (dark apertures); skylights stay on
    cityWindows: 0.0,
    ground: 1.0,
    groundColor: null,      // null = STYLE.ground.color
    overviewBg: null,       // null = show ground/city behind the dollhouse; or [top, mid, bottom] screen gradient
    lampGlow: 0.5,          // multiplier on furniture emissive (pendants / lamps)
    // 氛圍燈 ambient lighting (feature-wall washer + TV console under-glow); `on` = default when switching to this theme
    ambient: { on: false, slot: 1.3, wallGlow: 0.6, furniture: 0.8 },   // slot = channel diffuser brightness, wallGlow × sideSlot.strength
    // realism layer: replaces exposure, scales hemi/sun, env (probe) intensity, HDR sky gain, window portal lights
    realism: { exposure: 1.1, hemi: 0.5, hemiGround: '#cbc4b8', sun: 1.0, sunColor: '#ffdcb2', env: 0.55, skyGain: 2.2, portal: { intensity: 2.4, color: '#e6eef8', covered: 0.6, blinds: 0.35 } },
  },
  evening: {
    name: 'evening',
    exposure: 1.12,
    sky:    { top: '#0b1630', horizon: '#3a4f7a', bottom: '#1c2236' },
    fog:    { color: '#2a3656', near: 40, far: 650 },
    sun:    { color: '#8fa6d9', intensity: 0.25, dir: [0.55, 0.35, -0.75] },
    hemi:   { sky: '#ffd8b0', ground: '#8a6c52', intensity: 0.45 },             // warm 'bounce' fill from the lamps
    envIntensity: 0.16,
    downlights: { on: true, aperture: 3.0 },     // evening: SpotLights near the camera + fake pools/scallops elsewhere
    cityWindows: 1.0,
    ground: 1.0,
    groundColor: '#1a2132',
    overviewBg: ['#0b1630', '#2b3b63', '#5a5675'],   // dusk gradient (matches evening sky)
    lampGlow: 1.0,
    ambient: { on: true, slot: 2.0, wallGlow: 1.0, furniture: 1.0 },
    realism: { exposure: 1.1, hemi: 0.7, hemiSky: '#f2dcc4', hemiGround: '#9c8b7a', env: 0.5, skyGain: 1.0, apertures: 14, portal: { intensity: 0.06, color: '#4a6290', covered: 0.7, blinds: 0.5 } },
  },
};
