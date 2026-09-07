import type { RenderProgress } from '@storyreel/engine';

function fmtEta(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

export function renderProgressLine(p: RenderProgress): string {
  const pct = p.totalFrames > 0 ? Math.floor((p.frame / p.totalFrames) * 100) : 0;
  const barWidth = 24;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  return `[${bar}] ${pct}%  frame ${p.frame}/${p.totalFrames}  ETA ${fmtEta(p.etaMs)}`;
}
