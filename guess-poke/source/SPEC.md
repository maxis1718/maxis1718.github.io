# 我是誰？猜猜寶可夢 — SPEC (contracts)

Toddler (age ~3) "Who's that Pokémon" drag game. Mobile portrait first. Pixel art, silky, sticky micro-interactions.
Personal, non-commercial. No trademarks/logos drawn; Pokémon images are loaded at runtime (not drawn by us).

## Tech
- Plain ES modules in `src/`, bundled by esbuild into one HTML (`tools/build.mjs` -> `dist/index.html`).
- One `<canvas>`; low-res pixel buffer W x H, upscaled by an INTEGER factor S (nearest). W is chosen per screen
  so W in [216, 300] (typ. ~260-290 on phones), H = round(W * viewportH / viewportW). All drawing in buffer px.
- `ctx.imageSmoothingEnabled = false` always. Fixed 60 fps logic step.
- Coordinates: origin top-left, y down. Sprites drawn with integer coords (Math.round) to avoid shimmer.

## Modules & owners
| file | owner | API |
|---|---|---|
| `src/audio.js` | audio agent | see Audio |
| `src/font.js` (generated bitmap data) + `tools/cjk.py` | art agent | see Text |
| `src/text.js` | art agent | see Text |
| `src/art.js` | art agent | see Art |
| `src/main.js`, `src/game.js`, `src/layout.js`, `src/poke.js`, `src/fx.js`, `src/input.js`, `src/voice.js` | lead | — |

Agents: only edit your own files (+ files under `tools/` you create, + a private tmp dir under `/tmp/<agent>/`). Original
content only: original melodies/jingles (no reproduction of any Nintendo/Game Freak tune), no logos/wordmarks.

## Text (`src/text.js`)
Bitmap pixel font baked from Cubic 11 (俐方體11號, OFL, https://github.com/ACh-K/Cubic-11), 12px cell, 1 font px = 1 buffer px.
`tools/cjk.py` scans every `src/*.js` (except font.js) for non-ASCII chars + printable ASCII 0x20-0x7E, bakes glyphs to `src/font.js`
(compact encoding, e.g. base64 bitmaps + advance widths). Also writes `OFL.txt` to repo root.
```
export function measure(str, scale=1) -> width in buffer px
export function drawText(ctx, str, x, y, opts={}) // opts: {scale=1, color='#fff', align:'left'|'center'|'right',
   outline: color|null (1px 8-neighbour outline, scaled), shadow: color|null (offset 1*scale down), alpha=1}
   // y = top of the 12px line box (times scale). Glyph images cached per (color,scale) on offscreen canvases.
export const LINE = 12
```
Must look crisp at scale 1, 2, 3 on an integer-upscaled canvas. Fallback for a missing glyph: draw nothing (width 6).

## Art (`src/art.js`) — procedural pixel art drawn with canvas fillRect (no external images)
Palette: Game Boy Color / FRLG menu vibe. Navy `#1b2a5c`, deep `#101a3c`, sky `#5ec4f0`, sky-light `#9fe0ff`,
white `#ffffff`, cream `#fff6d8`, red `#e8483b`, yellow `#ffd84a`, ink `#141428`.
```
export function drawBackground(ctx, W, H, t)      // full screen; animated subtle pattern (slow diagonal-scrolling
                                                  // checker/dots), dark navy theme like reference image. t = frames.
export function drawFrame(ctx, x, y, w, h, t, glow=0) // the "who's that" panel: navy outer border, white inner line,
                                                  // light-blue panel with soft radial/ dither light, 4 corner
                                                  // red/white capsule balls (generic, small ~12px) — gentle idle bob
                                                  // using t. glow 0..1 = extra golden rim light (when correct card near).
export function drawCard(ctx, x, y, w, h, state)  // bottom choice card background: rounded pixel box, cream face,
                                                  // navy border, 2px drop shadow; state: {lift 0..1 (raised, bigger
                                                  // shadow), hl 0..1 (highlight rim), press 0..1}
export function drawSlotHint(ctx, cx, cy, r, t)   // dashed pulsing ring/brackets showing the drop target (subtle)
export const SPR  // named small sprites as {w,h,draw(ctx,x,y,frame)} or pre-rendered canvases:
  star (11x11, 4 twinkle frames), sparkle (7x7, 4 frames), heart (9x8), hand (pointing finger cursor 16x18, for
  tutorial), speaker_on / speaker_off (12x12), ball (generic red/white capsule ball 12x12), confetti pieces.
export function drawButton(ctx, x, y, w, h, label, state) // pixel button (uses text.js) state {press, hover}
export function drawStarMeter(ctx, x, y, n, max, t) // row of `max` small star slots, `n` filled (golden, twinkle)
```
Everything must be deterministic given args (animation only via t). Keep each draw call cheap (< 0.3 ms); cache
static pieces on offscreen canvases keyed by size.

## Audio (`src/audio.js`) — WebAudio synth only, no samples
Style: Game Boy (Pokémon Yellow) 2 pulse + wave + noise channels, and GBA (FireRed/LeafGreen) softer pulse with
light echo. ALL melodies original. Kid-friendly, bright, never harsh/scary. Master: gain -> DynamicsCompressor -> destination.
```
export function createAudio() -> {
  unlock(),                 // call from user gesture (touchend/click/keydown); resumes ctx, plays silent buffer (iOS)
  sfx(name, opts={}),       // fire-and-forget
  bgm(name|null),           // loop music; crossfade 300ms; null = stop
  setMuted(bool), muted,    // persist handled by caller
  duck(on:boolean),         // lower bgm to ~25% while voice speaks
  magnet(level 0..1|null),  // continuous: rising soft 'hum/charge' while correct card nears target; null = off
  get ctx()
}
sfx names:
  'tap'      menu select blip (classic 2-note square bip)
  'pick'     card picked up (short upward pluck)
  'drop'     card released/back to place (soft low thud/pluck)
  'nope'     wrong answer: gentle, silly 'boing-boing' wobble — NOT a buzzer, never negative/scary
  'snap'     magnetic lock-in: satisfying 'thunk + shimmer'
  'reveal'   colour reveal: rising sparkle arpeggio (~0.8s)
  'cheer'    success fanfare jingle (~2.0s, original, item-get/level-up feel)
  'big'      every 5th correct: bigger celebration jingle (~3.5s)
  'pop'      firework burst (noise + pitch drop), randomised slightly per call
  'twinkle'  small star chime (random pentatonic note)
  'whoosh'   cards sliding in
  'question' short mysterious-but-cute 'who's that?' sting (~1.2s) at round start
bgm names: 'title' (calm, cute, ~100bpm loop), 'play' (happy bouncy loop ~120bpm, unobtrusive, ~20-30s loop)
```
Volume balance: sfx clear over bgm; bgm quiet (~0.35 of sfx). Schedule notes with lookahead scheduler (setInterval 25ms,
100ms lookahead), not setTimeout per note. Must not throw if AudioContext unavailable (no-op object).
Self-test: render via OfflineAudioContext in Playwright Chromium, check peaks < 1.0, durations, no NaN.

## Game flow (lead)
Title (big pixel '我是誰？' + bouncing silhouette + 開始 button) -> rounds forever.
Round: silhouette in frame + 3 cards at bottom (Pokémon in colour). Voice (speechSynthesis zh-TW): '我是誰？'.
Drag (or tap) card -> correct: magnetic pull when near, snap, colour reveal, fireworks/stars, voice '是皮卡丘！', next.
Wrong: card gently pushed back, silhouette wiggles 'no', no penalty. Idle hint after ~6s (correct card bounces).
