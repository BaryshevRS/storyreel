import type { Frame, Page } from 'playwright';
import type { ControlMeta, Scene } from '@storyreel/schema';
import {
  browserEmitUpdateArgs,
  browserGetStoryContext,
  browserInitHook,
  browserInstallAndWait,
  mapArgTypesToControls,
} from './versions.js';

/**
 * Storybook implementation of the engine's SceneSource contract. Stateful:
 * mount() captures the current story frame, which applyState/getControlsMeta
 * then operate on. A new mount() resets that state.
 */
export class StorybookSceneSource {
  private frame: Frame | null = null;
  private storyId = '';
  private lastArgs: Record<string, unknown> = {};
  private initialValues: Record<string, unknown> = {};
  private hookInstalled = false;

  constructor(private readonly baseUrl: string) {}

  private iframeUrl(storyId: string): string {
    return `${this.baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
  }

  async mount(page: Page, scene: Scene): Promise<void> {
    this.storyId = scene.storyId;
    this.lastArgs = {};
    const url = this.iframeUrl(scene.storyId);
    const iframeBase = `${this.baseUrl}/iframe.html`;

    // Install the channel hook before the story iframe boots (applies to frames
    // navigated after registration), so argTypes are never missed to a race.
    if (!this.hookInstalled) {
      await page.context().addInitScript(browserInitHook);
      this.hookInstalled = true;
    }

    const handle = await page.waitForSelector('#story-frame', { state: 'attached' });
    await page.evaluate((u) => {
      const el = document.getElementById('story-frame') as HTMLIFrameElement | null;
      if (!el) throw new Error('harness #story-frame not found');
      el.src = u;
    }, url);

    // Locate the story frame once it has navigated to our iframe URL.
    const deadline = Date.now() + 8000;
    let frame: Frame | null = null;
    while (Date.now() < deadline) {
      const f = await handle.contentFrame();
      if (f && f.url().startsWith(iframeBase)) {
        frame = f;
        break;
      }
      await page.waitForTimeout(50);
    }
    if (!frame) {
      throw new Error(
        `Could not load story iframe for "${scene.storyId}" from ${iframeBase}`,
      );
    }
    await frame.waitForLoadState('domcontentloaded').catch(() => {});
    this.frame = frame;

    // Wait for Storybook to report the story rendered.
    await frame.evaluate(browserInstallAndWait, scene.storyId);

    // Center the story in the card. Many library stories are not authored with
    // `layout: centered`, which leaves the component pinned to the top-left of
    // the harness card. As flex items, block roots shrink to fit their content.
    await frame
      .addStyleTag({
        content: `
          html, body { height: 100%; }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
          }
          /* Roots are often forced to width:100%; center their content too. */
          #storybook-root, #root {
            display: flex;
            align-items: center;
            justify-content: center;
          }
        `,
      })
      .catch(() => {});

    // Apply initial args (if any) so the first frame reflects them.
    if (scene.initialArgs && Object.keys(scene.initialArgs).length > 0) {
      await this.applyState(page, scene.initialArgs);
    }
  }

  async applyState(_page: Page, args: Record<string, unknown>): Promise<void> {
    if (!this.frame) throw new Error('applyState called before mount');

    // Emit only the changed args to avoid needless re-renders per frame.
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (!shallowEqual(this.lastArgs[k], v)) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) return;

    await this.frame.evaluate(browserEmitUpdateArgs, {
      storyId: this.storyId,
      updatedArgs: changed,
    });
    this.lastArgs = { ...this.lastArgs, ...changed };
  }

  async getControlsMeta(_scene: Scene): Promise<ControlMeta[]> {
    if (!this.frame) throw new Error('getControlsMeta called before mount');
    const ctx = await this.frame.evaluate(browserGetStoryContext, this.storyId);
    if (!ctx) return [];
    this.initialValues = ctx.args ?? {};
    return mapArgTypesToControls(ctx.argTypes);
  }

  async getInitialValues(_scene: Scene): Promise<Record<string, unknown>> {
    return this.initialValues;
  }

  async syncAnimations(_page: Page, virtualTimeMs: number): Promise<void> {
    if (!this.frame) return;
    await this.frame.evaluate((t) => {
      const doc = document as Document & {
        getAnimations?: () => Animation[];
      };
      const anims = doc.getAnimations ? doc.getAnimations() : [];
      for (const a of anims) {
        try {
          a.currentTime = t;
        } catch {
          /* some animations reject explicit currentTime; skip */
        }
      }
    }, virtualTimeMs);
  }
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
