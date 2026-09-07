# Examples

Hand-tuned `reel.config.ts` files, each pointed at the repo's own fixture
Storybook (`fixtures/sb-fixture`) so they render out of the box — no external
Storybook or network access needed. `slider.reel.config.ts` is the one
exception: it targets a public Storybook (Carbon Design System) purely as a
config-syntax reference; its story id/args are illustrative and unverified,
don't expect it to render as-is.

The `.mp4`/`.gif`/`.poster.*` files below are real output from this repo's CLI
(`storyreel render examples/<name>.reel.config.ts`) and are committed, so they
are there after a fresh clone — open them directly to see the result. They are
generated artifacts: if you change a config or the renderer, regenerate them
with the commands below rather than editing them.

| Config | Output | Demonstrates |
| --- | --- | --- |
| [toast-boomerang.reel.config.ts](toast-boomerang.reel.config.ts) | `toast-boomerang.gif` | `loop: 'pingpong'` on a **4-way enum** (`severity`: info→success→warning→error→…→info), not just a boolean — seamless in both directions, while the toast's own CSS entrance/progress-bar animations keep running correctly under the reversed frame sequence |
| [boomerang.reel.config.ts](boomerang.reel.config.ts) | `button-boomerang.gif` | `loop: 'pingpong'` on the simpler case — a boolean (`disabled`), no snap-back |
| [poster-and-timings.reel.config.ts](poster-and-timings.reel.config.ts) | `card-tuned.mp4` | Custom `timings` (faster pace), `maxControls`/`maxDuration`, explicit `poster: { at: ms }` |
| [slider.reel.config.ts](slider.reel.config.ts) | — (unverified external Storybook) | Manual `tween` range + a `setArg` step the auto-storyboard wouldn't pick |

Two components get the plain `record` auto-storyboard treatment, full-res vs.
`--draft` (720p/24fps/jpeg, ~4-6x faster, forced watermark) side by side:

- `button-auto.mp4` / `button-auto-draft.mp4` — `example-button--primary`
  (`variant`, `size`, `disabled`): the simple case.
- `toast-auto.mp4` / `toast-auto-draft.mp4` — `example-toast--notification`
  (`severity`, `dismissible`, `autoDismissMs`): a real notification component
  with its own CSS entrance animation *and* a live countdown progress bar
  running concurrently with the heuristic's enum/boolean/tween storyboard —
  the `message` text arg is correctly skipped (free-form text isn't
  allowlisted). `severity` is picked first because it's in the auto-storyboard's
  priority-name list (`variant`/`size`/`color`/`type`/`appearance`/`severity`).

```bash
# One-time: build the fixture Storybook if storybook-static/ is missing.
pnpm --filter @storyreel/sb-fixture build

storyreel render examples/toast-boomerang.reel.config.ts --draft   # fast preview
storyreel render examples/toast-boomerang.reel.config.ts           # final render

storyreel record example-toast--notification -s fixtures/sb-fixture/storybook-static \
  -o examples/toast-auto.mp4 --no-config-write
```
