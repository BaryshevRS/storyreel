# storyreel

Turn Storybook stories into smooth, deterministic component demo videos — no
screen recording, no editing. storyreel renders each frame separately under a
frozen virtual clock in headless Chrome, so the output is perfectly smooth at any
fps and regenerates from code every time your component changes.

```
┌─────────────────────────────────────────┐
│  (theme gradient background)             │
│   ┌───────────────────┐  ┌───────────┐   │
│   │   story on a card │  │ variant ▸ │   │
│   │   (shadow+radius) │  │ size   ▸  │   │
│   └───────────────────┘  └───────────┘   │
│              [caption]                    │
└──────────────────────── made with storyreel ┘
```

## Install & build (monorepo)

```bash
pnpm install
pnpm exec playwright install chromium   # one-time browser download
pnpm build
```

The ffmpeg binary is bundled via `ffmpeg-static` — no system ffmpeg needed.

## CLI

```bash
storyreel init                              # write an example reel.config.ts
storyreel list -s <url|storybook-static>    # list stories from index.json
storyreel record <storyId> -s <url|path>    # auto-storyboard + render one story
storyreel render [config]                   # render from ./reel.config.ts
storyreel render --all -s <url|path>        # batch: every story, auto-storyboard
storyreel render --all --filter 'button*'   # batch, but only story ids matching a glob
storyreel doctor -s <url|path>              # check ffmpeg/Chrome/Storybook + which stories will auto-storyboard well
```

Overrides (on `record` and `render`): `--format mp4|gif|webm`, `--fps <n>`,
`--size WxH`, `--loop normal|pingpong` (gif/webm only), `--draft` (fast
720p/24fps/jpeg preview, forced watermark), `--cache` (skip re-rendering an
output whose scene/theme/size/fps/format and — for a local `storybook-static/`
build — component source are all unchanged since the last `--cache` render;
writes a `<output>.reelhash` sidecar to track this), `-q/--quiet` (suppress the
embed-snippet output).

`--cache` has a real blind spot: for a live dev-server Storybook
(`http://localhost:6006`) there's no reliable signal that the component
changed, so it only compares the render *settings*, not the component code —
prefer it with a `storybook-static/` build (`storybook build`), where it also
fingerprints the built assets and correctly invalidates when they change.

`storyreel record` needs no config: it reads the story's `argTypes`, generates a
storyboard (enums cycle, numbers tween, booleans toggle — plumbing props like
`children`/`className`/`onClick` and free-form text are skipped), renders it,
and writes a `reel.config.ts` you can tweak and re-render.

### Example

```bash
# From a static build (no dev server needed):
storyreel record example-button--primary -s ./storybook-static -o button.mp4

# Fast preview before committing to a full-res render:
storyreel record example-button--primary -s ./storybook-static --draft
```

After a render, storyreel prints a ready-to-paste embed snippet (MDX `<video>`
tag or README gif markup) alongside a `<name>.poster.png` — see
[examples/](examples/) for hand-tuned config patterns (custom timings, an
explicit poster frame, a boomerang gif loop).

## Config

```ts
import type { ReelConfig } from '@storyreel/schema';

const config: ReelConfig = {
  storybook: 'http://localhost:6006', // live URL or storybook-static/ path
  fps: 30,
  size: [1920, 1080],
  theme: 'gradient-dusk',
  showArgsPanel: true,
  watermark: true,
  loop: 'normal',            // 'pingpong' for a seamless gif/webm loop (mp4 ignores it)
  poster: true,               // or { at: ms } to pin an explicit frame; false to skip
  maxControls: 4,             // auto-storyboard: cap on how many argTypes to animate
  maxDuration: 15_000,        // auto-storyboard: shrink holds, then drop tail controls, to fit
  timings: {                  // auto-storyboard hold/tween durations; override any subset
    holdEnum: 600,
    holdBoolean: 800,
    tween: 1200,
  },
  output: { format: 'mp4', path: 'storyreel.mp4' },
  scenes: [
    // A hand-authored scene renders its steps exactly as written.
    {
      storyId: 'example-button--primary',
      steps: [
        { action: 'caption', text: 'variant', ms: 400 },
        { action: 'setArg', name: 'variant', value: 'danger' },
        { action: 'hold', ms: 800 },
        { action: 'tween', name: 'radius', from: 0, to: 24, ms: 1000, easing: 'easeInOut' },
      ],
    },
    // A scene with no steps is auto-storyboarded at render time. `args` steers
    // the heuristic without hand-writing the whole timeline.
    {
      storyId: 'example-card--basic',
      args: {
        include: ['radius', 'elevation'], // ordered whitelist; heuristic off
        // exclude: ['padding'],           // or ban specific controls from the auto pick
        // values: { label: ['Buy', 'Add to cart and checkout'] }, // custom cycled values
      },
    },
  ],
};

export default config;
```

`timings`/`maxControls`/`maxDuration` and a scene's `args` directive apply when
a scene is **auto-storyboarded** — `record`, `render --all`, or a config scene
with no `steps` (like the second one above, which storyreel resolves by probing
the story's controls at render time). A scene with hand-written `steps` always
renders exactly as written. In `args`, `include` is an ordered whitelist that
turns the heuristic off entirely; `exclude` bans names from the auto pick; and
`values` overrides the cycled values for a control (e.g. a specific enum
subset, or a short/long text pair).

## Packages

| Package | Responsibility |
| --- | --- |
| `@storyreel/schema` | zod schemas + shared types (the contract) |
| `@storyreel/engine` | timeline compiler, virtual-time frame loop, ffmpeg. Knows nothing about Storybook — it speaks the `SceneSource` interface. |
| `@storyreel/adapter-storybook` | index.json discovery, mount, `updateStoryArgs`, argTypes → controls, auto-storyboard |
| `@storyreel/harness` | single-file HTML: themed background, story card, controls panel, captions, watermark |
| `storyreel` | CLI, config loading, batch |

The engine never imports the adapter. New adapters implement `SceneSource`.

## License

[Apache-2.0](LICENSE). No feature gating, no watermark, no resolution cap — the
`watermark` config option exists because some people want their own branding on
a clip, and `--draft` turns it on to mark a preview as a preview.

## Tests

```bash
pnpm test        # unit (schema, timeline, storyboard) + e2e (renders the fixture)
```

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for virtual-time limitations.
