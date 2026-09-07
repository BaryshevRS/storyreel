import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Command } from 'commander';
import {
  parseReelConfig,
  type ControlMeta,
  type OutputFormat,
  type Scene,
  type ReelConfig,
  type Size,
} from '@storyreel/schema';
import {
  resolveStorybook,
  fetchIndex,
  findStory,
  listStories,
  autoStoryboard,
} from '@storyreel/adapter-storybook';
import { createRequire } from 'node:module';
import { loadConfig } from './config-loader.js';
import { runRender, probeControls, prepareAutoScenes } from './runner.js';
import { exampleConfig, serializeConfig } from './config-template.js';
import { buildEmbedSnippet } from './embed-snippet.js';
import { runDoctor } from './doctor.js';

// Read from package.json so `--version` cannot drift from what was published;
// release-please bumps that file. Resolves to <pkg>/package.json both from
// tsc's dist/main.js and from the published single-file bundle.
const { version: VERSION } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const DEFAULT_CONFIG = 'reel.config.ts';
const DEFAULT_STORYBOOK = 'http://localhost:6006';

interface Overrides {
  format?: string;
  fps?: string;
  size?: string;
  loop?: string;
}

function parseLoop(s: string | undefined): 'normal' | 'pingpong' | undefined {
  if (!s) return undefined;
  if (s !== 'normal' && s !== 'pingpong') {
    throw new Error(`Invalid --loop "${s}". Use "normal" or "pingpong".`);
  }
  return s;
}

function inferFormat(path: string | undefined): OutputFormat | undefined {
  if (!path) return undefined;
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'mp4' || ext === 'gif' || ext === 'webm') return ext;
  return undefined;
}

function parseSize(s: string): Size {
  const m = /^(\d+)x(\d+)$/i.exec(s.trim());
  if (!m) throw new Error(`Invalid --size "${s}". Use WxH, e.g. 1920x1080.`);
  return [Number(m[1]), Number(m[2])];
}

function applyOverrides(config: ReelConfig, o: Overrides): ReelConfig {
  const next: ReelConfig = { ...config, output: { ...config.output } };
  if (o.fps) next.fps = Number(o.fps);
  if (o.size) next.size = parseSize(o.size);
  if (o.format) {
    const fmt = o.format as OutputFormat;
    next.output.format = fmt;
    next.output.path = next.output.path.replace(/\.[^.]+$/, `.${fmt}`);
  }
  const loop = parseLoop(o.loop);
  if (loop) next.loop = loop;
  return parseReelConfig(next);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('storyreel')
    .description('Turn Storybook stories into smooth component demo videos')
    .version(VERSION);

  program
    .command('init')
    .description('create a reel.config.ts with an example')
    .action(async () => {
      const path = resolve(DEFAULT_CONFIG);
      if (existsSync(path)) {
        console.error(`✗ ${DEFAULT_CONFIG} already exists — not overwriting.`);
        process.exitCode = 1;
        return;
      }
      await writeFile(path, exampleConfig(), 'utf8');
      console.log(`✓ wrote ${DEFAULT_CONFIG}`);
    });

  program
    .command('list')
    .description('list all stories from the Storybook index')
    .option('-s, --storybook <urlOrPath>', 'Storybook URL or static build path')
    .option('-c, --config <path>', 'read storybook location from a config file')
    .action(async (opts: { storybook?: string; config?: string }) => {
      const storybook = await resolveStorybookLocation(opts);
      const resolved = await resolveStorybook(storybook);
      try {
        const index = await fetchIndex(resolved.baseUrl);
        const stories = listStories(index);
        if (stories.length === 0) {
          console.log('No stories found.');
          return;
        }
        for (const s of stories) {
          console.log(`${s.id}\t${s.title} / ${s.name}`);
        }
        console.error(`\n${stories.length} stories.`);
      } finally {
        await resolved.dispose();
      }
    });

  program
    .command('record <storyId>')
    .description('auto-storyboard and render a single story')
    .option('-o, --output <path>', 'output file path')
    .option('-s, --storybook <urlOrPath>', 'Storybook URL or static build path')
    .option('-f, --format <fmt>', 'mp4 | gif | webm')
    .option('--fps <n>', 'frames per second')
    .option('--size <WxH>', 'frame size, e.g. 1920x1080')
    .option('--loop <mode>', 'gif/webm loop mode: normal | pingpong')
    .option('--draft', 'fast low-res preview: 720p/24fps/jpeg, forced watermark')
    .option('--cache', 'skip rendering if the output is unchanged since the last --cache render')
    .option('-q, --quiet', 'suppress the embed-snippet output')
    .option('--no-config-write', 'do not write a reel.config.ts')
    .action(async (storyId: string, opts) => {
      const storybook = opts.storybook ?? DEFAULT_STORYBOOK;
      const format = ((opts.format as OutputFormat | undefined) ??
        inferFormat(opts.output) ??
        'mp4') as OutputFormat;

      const resolved = await resolveStorybook(storybook);
      let entryId: string;
      let entryName: string;
      let controls;
      try {
        const index = await fetchIndex(resolved.baseUrl);
        const entry = findStory(index, storyId);
        if (!entry) {
          throw new Error(
            `Story "${storyId}" not found. Run "storyreel list -s ${storybook}".`,
          );
        }
        entryId = entry.id;
        entryName = entry.name;
        console.error(`▶ probing controls for ${entryId} …`);
        ({ controls } = await probeControls(resolved.baseUrl, entryId));
      } finally {
        await resolved.dispose();
      }

      const scene = autoStoryboard(entryId, entryName, controls);
      warnIfStatic(entryId, controls, scene);
      const output = opts.output ?? `${entryId}.${format}`;
      const config = parseReelConfig({
        storybook,
        fps: opts.fps ? Number(opts.fps) : 30,
        size: opts.size ? parseSize(opts.size) : [1920, 1080],
        loop: parseLoop(opts.loop) ?? 'normal',
        output: { format, path: output },
        scenes: [scene],
      });

      if (opts.configWrite !== false) {
        const cfgPath = existsSync(resolve(DEFAULT_CONFIG))
          ? `${entryId}.reel.config.ts`
          : DEFAULT_CONFIG;
        await writeFile(resolve(cfgPath), serializeConfig(config), 'utf8');
        console.error(`✓ wrote ${cfgPath} (edit & re-render with "storyreel render ${cfgPath}")`);
      }

      console.error(`▶ rendering ${entryId} → ${output}`);
      const result = await runRender(config, { draft: opts.draft, cache: opts.cache });
      console.error(
        `✓ ${result.outputPath}  (${result.frameCount} frames, ${result.durationSeconds.toFixed(2)}s)${result.cached ? ' [cached]' : ''}`,
      );
      if (!opts.quiet) {
        console.error('');
        console.error(await buildEmbedSnippet(result, result.effectiveConfig));
      }
    });

  program
    .command('render [config]')
    .description('render from a config (default ./reel.config.ts)')
    .option('-f, --format <fmt>', 'override output format')
    .option('--fps <n>', 'override fps')
    .option('--size <WxH>', 'override size')
    .option('--loop <mode>', 'override gif/webm loop mode: normal | pingpong')
    .option('--draft', 'fast low-res preview: 720p/24fps/jpeg, forced watermark')
    .option('--cache', 'skip rendering if the output is unchanged since the last --cache render')
    .option('-q, --quiet', 'suppress the embed-snippet output')
    .option('--all', 'render every story with an auto-storyboard')
    .option('--filter <glob>', 'with --all, only stories whose id matches this glob (e.g. "button*")')
    .option('-s, --storybook <urlOrPath>', 'Storybook location (for --all)')
    .action(async (configPath: string | undefined, opts) => {
      if (opts.all) {
        await renderAll(opts, configPath);
        return;
      }
      const path = configPath ?? DEFAULT_CONFIG;
      const config = await prepareAutoScenes(applyOverrides(await loadConfig(path), opts));
      const result = await runRender(config, { draft: opts.draft, cache: opts.cache });
      console.error(
        `✓ ${result.outputPath}  (${result.frameCount} frames, ${result.durationSeconds.toFixed(2)}s)${result.cached ? ' [cached]' : ''}`,
      );
      if (!opts.quiet) {
        console.error('');
        console.error(await buildEmbedSnippet(result, result.effectiveConfig));
      }
    });

  program
    .command('doctor')
    .description('check environment: Storybook, ffmpeg, Chrome, and which stories auto-storyboard well')
    .option('-s, --storybook <urlOrPath>', 'Storybook URL or static build path')
    .option('-c, --config <path>', 'read storybook location from a config file')
    .action(async (opts: { storybook?: string; config?: string }) => {
      const storybook = await resolveStorybookLocation(opts);
      const ok = await runDoctor(storybook);
      if (!ok) process.exitCode = 1;
    });

  return program;
}

/**
 * Auto-storyboards need args to animate. When a story exposes no argTypes (or
 * none that are animatable), the demo degrades to a static shot — allowed, but
 * say so instead of rendering silently.
 */
function warnIfStatic(
  storyId: string,
  controls: ControlMeta[],
  scene: Scene,
): void {
  const animated = scene.steps.some(
    (s) => s.action === 'setArg' || s.action === 'tween',
  );
  if (animated) return;
  const reason =
    controls.length === 0
      ? 'story exposes no argTypes (composition-style story?)'
      : 'none of its controls are animatable (enum/number/boolean)';
  console.error(
    `⚠ ${storyId}: ${reason} — rendering a static demo. ` +
      `Author the story with args/argTypes or write scene steps manually to animate it.`,
  );
}

async function resolveStorybookLocation(opts: {
  storybook?: string;
  config?: string;
}): Promise<string> {
  if (opts.storybook) return opts.storybook;
  const cfgPath = opts.config ?? DEFAULT_CONFIG;
  if (existsSync(resolve(cfgPath))) {
    const cfg = await loadConfig(cfgPath);
    return cfg.storybook;
  }
  return DEFAULT_STORYBOOK;
}

/** Convert a shell-style glob (only `*` and `?`) to an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`, 'i');
}

async function renderAll(
  opts: Overrides & { storybook?: string; draft?: boolean; cache?: boolean; filter?: string },
  configPath?: string,
): Promise<void> {
  const format = (opts.format ?? 'mp4') as OutputFormat;
  const fps = opts.fps ? Number(opts.fps) : 30;
  const size = opts.size ? parseSize(opts.size) : ([1920, 1080] as Size);
  const loop = parseLoop(opts.loop) ?? 'normal';
  const storybook = await resolveStorybookLocation({
    storybook: opts.storybook,
    config: configPath,
  });

  // Pick up global auto-storyboard settings from a config file if one exists.
  const cfgPath = configPath ?? DEFAULT_CONFIG;
  const fileConfig = existsSync(resolve(cfgPath)) ? await loadConfig(cfgPath).catch(() => null) : null;
  const autoOpts = {
    timings: fileConfig?.timings,
    maxControls: fileConfig?.maxControls,
    maxDuration: fileConfig?.maxDuration,
  };

  const resolved = await resolveStorybook(storybook);
  const outDir = resolve('storyreel-out');
  await mkdir(outDir, { recursive: true });
  let ok = 0;
  let failed = 0;
  let stories;
  try {
    const index = await fetchIndex(resolved.baseUrl);
    stories = listStories(index);
  } finally {
    await resolved.dispose();
  }

  if (opts.filter) {
    const re = globToRegExp(opts.filter);
    stories = stories.filter((s) => re.test(s.id));
    if (stories.length === 0) {
      console.error(`No stories match --filter "${opts.filter}".`);
      return;
    }
  }

  console.error(`▶ batch rendering ${stories.length} stories → ${outDir}`);
  for (const story of stories) {
    try {
      const r2 = await resolveStorybook(storybook);
      let controls;
      try {
        ({ controls } = await probeControls(r2.baseUrl, story.id));
      } finally {
        await r2.dispose();
      }
      const scene = autoStoryboard(story.id, story.name, controls, autoOpts);
      warnIfStatic(story.id, controls, scene);
      const config = parseReelConfig({
        storybook,
        fps,
        size,
        loop,
        output: { format, path: join(outDir, `${story.id}.${format}`) },
        scenes: [scene],
      });
      const r = await runRender(config, { quiet: true, draft: opts.draft, cache: opts.cache });
      ok++;
      console.error(`  ✓ ${story.id}${r.cached ? ' (cached)' : ''}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${story.id}: ${(err as Error).message}`);
    }
  }
  console.error(`Done. ${ok} ok, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}
