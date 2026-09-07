# Known issues & virtual-time limitations

Findings from the milestone-1 virtual-time spike, plus caveats encountered while
building the MVP.

## Virtual time (CDP `Emulation.setVirtualTimePolicy`)

storyreel freezes wall-clock time and advances it in exact `1000/fps` budgets
per frame. This makes rendering deterministic and smooth at any fps.

**Confirmed working:**
- CSS transitions and `@keyframes` animations (verified: the fixture spinner
  advances frame-by-frame — consecutive frames differ deterministically).
- `requestAnimationFrame` loops.
- `setTimeout` / `setInterval` driven animations.

**Re-render restart, and how it's handled:** when an arg changes every frame
(e.g. a numeric `tween`), Storybook's renderer replaces the DOM node, and a fresh
node restarts its CSS animation from 0 — so an internal animation (a spinner)
would look frozen during a tween. The engine avoids this by pinning every CSS
animation's `currentTime` to the absolute scene clock each frame (via
`SceneSource.syncAnimations` → `document.getAnimations()`), so animations stay
continuous regardless of re-renders. This sets `currentTime` explicitly rather
than relying on the virtual clock to drive WAAPI, so it is robust.

**Ordering rules that must hold (else you get half-applied frames):**
1. Apply state (`updateStoryArgs` + panel message) **before** advancing time.
2. Advance virtual time, wait for `Emulation.virtualTimeBudgetExpired`.
3. Only then capture the screenshot (raw CDP `Page.captureScreenshot`).

**Freeze only after the page is ready:**
- Time is frozen *after* the harness loads, the story mounts, and
  `document.fonts.ready` resolves. Freezing before navigation stalls loading;
  freezing before fonts load produces first frames in a fallback font.

## Limitations

- **`<video>` / media elements**: not driven by virtual time. Media playback
  will not advance frame-accurately. Out of scope for the MVP.
- **Web Animations API (WAAPI, `element.animate()`)**: driving via virtual time
  is unreliable across Chromium versions. Prefer CSS animations/transitions in
  components you intend to film. If a component relies heavily on WAAPI, frames
  may not progress.
- **Cross-origin story measurement**: the harness renders the story in a fixed
  card rather than auto-sizing to the story's content, because the story iframe
  is a different origin (harness is `file://`, story is `http://`). Auto-fit via
  a `ResizeObserver` bridge is a post-MVP improvement.
- **GIF fps**: forced to ≤ 24fps (higher fps gifs are enormous). Requested fps is
  still used for the source frames; the gif is downsampled in the ffmpeg filter.
- **Even dimensions**: `yuv420p` (mp4/webm) requires even width/height. The
  schema rejects odd sizes up front.

## Storybook compatibility

argTypes/args are captured primarily from the channel `storyPrepared` event,
which is stable across Storybook 7/8/9, with a `storyStore.fromId` fallback
(SB7). Version differences are isolated in `adapter-storybook/src/versions.ts`
using feature-detection (which global exists), never version parsing.

**Compatibility pass results (2026-07-08, live public Storybooks over HTTP):**

- **Carbon Design System (React)** — `react.carbondesignsystem.com`, 473
  stories. `list`, mount, argTypes extraction (11 controls), `updateStoryArgs`
  (kind/size/disabled visibly change), auto-storyboard: **all working**.
- **Chakra UI** — `storybook.chakra-ui.com`, 1193 stories. Mount and render
  work. Their stories are compositions without argTypes, so auto-storyboard
  correctly falls back to a static hold and the controls panel hides itself.
  This is expected for any Storybook that doesn't author argTypes.
- **Mantine** — no longer hosts a public Storybook (storybook.mantine.dev does
  not resolve); not testable without building it locally.

**Centering caveat:** the adapter injects flex-centering CSS into the story
iframe (body and `#storybook-root`), which centers stories that aren't authored
with `layout: centered` (verified on Carbon). Stories whose decorators wrap
content in their own full-height containers (e.g. Chakra) still start at the
top of the card — fully solving that requires the auto-fit card work below.
