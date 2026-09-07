# storyreel

Turn Storybook stories into smooth, deterministic component demo videos — no
screen recording, no editing. Every frame is rendered separately in headless
Chrome under a frozen virtual clock, so output is perfectly smooth at any fps
and regenerates from code whenever the component changes.

![A toast component cycling through its severity states, rendered by storyreel](https://raw.githubusercontent.com/BaryshevRS/storyreel/main/examples/toast-boomerang.gif)

```bash
npx storyreel@latest doctor -s http://localhost:6006
npx playwright install chromium        # one-time: Playwright ships Chromium separately
npx storyreel record button--primary -s http://localhost:6006
```

Point it at a Storybook — a dev-server URL or a static build directory — and it
reads `argTypes`, picks the arguments worth showing, and animates them: enums
cycle, numbers tween, booleans toggle. No config needed to get something
watchable; a `reel.config.ts` overrides any of it, per scene, down to
hand-written steps.

Outputs mp4, gif or webm, plus a poster frame and a ready-to-paste embed
snippet. ffmpeg is bundled — no system install required.

**Full documentation, configuration reference and examples:**
<https://github.com/BaryshevRS/storyreel>

Apache-2.0. No feature gating, watermarking, or resolution caps.
