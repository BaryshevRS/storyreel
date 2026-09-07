// Mirror the files a browser needs to load ONE story from a real, third-party
// Storybook into a local directory, so storyreel's filesystem+sirv static-build
// path can be tested against something other than our own fixture. This is how
// the Carbon results in KNOWN_ISSUES.md were produced.
//
// Usage:  node scripts/mirror-carbon.mjs <out-dir>
//
// Caveat worth knowing: index.json is copied whole (every story Carbon
// publishes), but only STORY_ID's chunks are actually fetched to disk. The
// index therefore promises far more than the mirror can serve — point
// storyreel at STORY_ID and nothing else, or you get an opaque load failure
// rather than a clean "no such story".
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BASE = 'https://react.carbondesignsystem.com';
const STORY_ID = 'components-button--default';
const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/mirror-carbon.mjs <out-dir>');
  process.exit(1);
}

async function saveResponse(res, outDir) {
  const url = new URL(res.url());
  if (url.origin !== BASE) return; // skip third-party (fonts CDN, analytics, etc.)
  let pathname = url.pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = join(outDir, pathname);
  try {
    const body = await res.body();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    console.log('saved', pathname, body.length);
  } catch (err) {
    console.log('skip', pathname, String(err).slice(0, 80));
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // index.json fetched directly (storyreel needs it verbatim).
  const idx = await fetch(`${BASE}/index.json`);
  await writeFile(join(OUT, 'index.json'), Buffer.from(await idx.arrayBuffer()));
  console.log('saved index.json');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('response', (res) => {
    void saveResponse(res, OUT);
  });

  const url = `${BASE}/iframe.html?id=${STORY_ID}&viewMode=story`;
  await page.goto(url, { waitUntil: 'load' });
  // Let code-split chunks for this story finish loading and render.
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => {
    const root = document.querySelector('#storybook-root, #root');
    return !!root && root.childElementCount > 0;
  });
  await page.waitForTimeout(500); // trailing async requests

  await browser.close();
  console.log('done mirroring', STORY_ID);
}

main();
