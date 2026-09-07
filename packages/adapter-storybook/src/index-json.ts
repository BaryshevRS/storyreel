import { createServer, type Server } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sirv from 'sirv';

export interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type: 'story' | 'docs';
  importPath?: string;
}

export interface StorybookIndex {
  entries: StoryEntry[];
}

export interface ResolvedStorybook {
  /** Base URL with no trailing slash, e.g. http://127.0.0.1:6006 */
  baseUrl: string;
  dispose: () => Promise<void>;
}

const isHttp = (s: string) => /^https?:\/\//i.test(s);

/**
 * Resolve a `storybook` config value to a live base URL. For an http(s) URL it
 * is returned as-is; for a filesystem path (a static build) a local static
 * server is started with sirv.
 */
export async function resolveStorybook(storybook: string): Promise<ResolvedStorybook> {
  if (isHttp(storybook)) {
    return { baseUrl: storybook.replace(/\/+$/, ''), dispose: async () => {} };
  }

  const dir = resolve(storybook);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(
      `Storybook path "${storybook}" is not a directory. Point it at a live ` +
        `Storybook URL or a built "storybook-static/" folder.`,
    );
  }
  if (!existsSync(resolve(dir, 'index.json')) && !existsSync(resolve(dir, 'iframe.html'))) {
    throw new Error(
      `"${storybook}" does not look like a Storybook static build ` +
        `(no index.json / iframe.html). Run "storybook build" first.`,
    );
  }

  const handler = sirv(dir, { dev: true, single: false, etag: true });
  const server: Server = createServer((req, res) => handler(req, res));
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    dispose: () =>
      new Promise<void>((res) => {
        server.close(() => res());
      }),
  };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolvePort(addr.port);
      else reject(new Error('Failed to bind local static server'));
    });
  });
}

/** Fetch and normalize the Storybook story index (SB7+ index.json, legacy stories.json). */
export async function fetchIndex(baseUrl: string): Promise<StorybookIndex> {
  const candidates = [`${baseUrl}/index.json`, `${baseUrl}/stories.json`];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`${url} -> HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as Record<string, unknown>;
      return normalizeIndex(json);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Could not read Storybook index (tried index.json and stories.json at ${baseUrl}). ` +
      `Is the Storybook running / built? Cause: ${String(lastErr)}`,
  );
}

function normalizeIndex(json: Record<string, unknown>): StorybookIndex {
  const raw =
    (json.entries as Record<string, RawEntry> | undefined) ??
    (json.stories as Record<string, RawEntry> | undefined);
  if (!raw) {
    throw new Error('Storybook index has no "entries" or "stories" field.');
  }
  const entries: StoryEntry[] = Object.values(raw).map((e) => ({
    id: e.id,
    title: e.title,
    name: e.name,
    type: (e.type as 'story' | 'docs') ?? 'story',
    importPath: e.importPath,
  }));
  return { entries };
}

interface RawEntry {
  id: string;
  title: string;
  name: string;
  type?: string;
  importPath?: string;
}

/** Only real stories (excludes docs entries). */
export function listStories(index: StorybookIndex): StoryEntry[] {
  return index.entries.filter((e) => e.type === 'story');
}

/** Find a story by exact id or by a loose suffix/name match. */
export function findStory(index: StorybookIndex, query: string): StoryEntry | undefined {
  const stories = listStories(index);
  return (
    stories.find((s) => s.id === query) ??
    stories.find((s) => s.id.endsWith(`--${query}`)) ??
    stories.find((s) => s.id.includes(query))
  );
}
