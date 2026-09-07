import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ReelConfig } from '@storyreel/schema';
import type { RenderResult } from '@storyreel/engine';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Build the terminal block shown after a render: file summary + ready-to-paste embed markup. */
export async function buildEmbedSnippet(
  result: RenderResult,
  config: ReelConfig,
): Promise<string> {
  const st = await stat(result.outputPath).catch(() => null);
  const sizeLabel = st ? formatBytes(st.size) : 'unknown size';
  const [, height] = config.size;
  const outName = basename(result.outputPath);
  const posterName = result.posterPath ? basename(result.posterPath) : undefined;

  const lines: string[] = [];
  lines.push(
    `✓ ${outName} (${result.durationSeconds.toFixed(1)}s, ${height}p${config.fps}, ${sizeLabel})`,
  );
  if (posterName) lines.push(`  poster: ${posterName}`);
  lines.push('');

  if (config.output.format === 'gif') {
    lines.push('  README (gif):');
    lines.push(`  ![${storyLabel(outName)}](./${outName})`);
  } else {
    lines.push('  MDX / docs:');
    const posterAttr = posterName ? ` poster="./${posterName}"` : '';
    lines.push(`  <video src="./${outName}"${posterAttr} autoplay loop muted playsinline />`);
  }

  return lines.join('\n');
}

function storyLabel(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}
