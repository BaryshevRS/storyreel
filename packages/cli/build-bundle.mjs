// Publishing bundle: storyreel ships as ONE npm package.
//
// The repo is split into @storyreel/{schema,engine,adapter-storybook,harness}
// because that split makes the code comprehensible and keeps the engine from
// growing Storybook-specific knowledge. That is an internal concern, so those
// packages are marked private and inlined here instead of being published.
//
// Two runtime lookups survive bundling and both resolve from THIS package:
//   - harness reads ../harness.html relative to its own module, so the file is
//     copied to the package root next to dist/
//   - engine does createRequire('ffmpeg-static'), so ffmpeg-static must be a
//     dependency of the CLI, not of the engine
import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Everything with a real runtime presence stays external and is declared in
// dependencies; only the @storyreel/* workspace packages get inlined.
const external = ['commander', 'jiti', 'playwright', 'zod', 'sirv', 'ffmpeg-static'];

await build({
  entryPoints: [join(here, 'src/bin.ts'), join(here, 'src/index.ts')],
  outdir: join(here, 'dist'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external,
  sourcemap: false,
  logLevel: 'info',
});

await copyFile(
  join(here, '../harness/harness.html'),
  join(here, 'harness.html'),
);
console.log('copied harness.html');
