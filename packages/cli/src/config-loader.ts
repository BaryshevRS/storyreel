import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { parseReelConfig, type ReelConfig } from '@storyreel/schema';

/**
 * Load a reel config from a .ts/.js/.mjs/.json file using jiti (so a TypeScript
 * config works with no build step), then validate it with a readable error.
 */
export async function loadConfig(path: string): Promise<ReelConfig> {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`Config file not found: ${abs}`);
  }

  let raw: unknown;
  if (abs.endsWith('.json')) {
    const { readFile } = await import('node:fs/promises');
    raw = JSON.parse(await readFile(abs, 'utf8'));
  } else {
    const jiti = createJiti(pathToFileURL(abs).href);
    const mod = (await jiti.import(abs)) as { default?: unknown } | unknown;
    raw = (mod as { default?: unknown }).default ?? mod;
  }

  try {
    return parseReelConfig(raw);
  } catch (err) {
    throw new Error(formatZodError(err, abs));
  }
}

function formatZodError(err: unknown, file: string): string {
  const e = err as { issues?: Array<{ path: (string | number)[]; message: string }> };
  if (e && Array.isArray(e.issues)) {
    const lines = e.issues.map(
      (i) => `  • ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`,
    );
    return `Invalid config in ${file}:\n${lines.join('\n')}`;
  }
  return `Invalid config in ${file}: ${String(err)}`;
}
