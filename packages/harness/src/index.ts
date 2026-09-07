import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute filesystem path to the single-file harness HTML. */
export function harnessPath(): string {
  // dist/index.js -> ../harness.html
  return join(here, '..', 'harness.html');
}

/** file:// URL of the harness page, ready to pass to the engine. */
export function harnessUrl(): string {
  return pathToFileURL(harnessPath()).href;
}
