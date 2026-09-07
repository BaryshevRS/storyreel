# @storyreel/engine

Timeline compiler, virtual-time frame loop and ffmpeg encoding. Knows nothing about Storybook; it speaks the `SceneSource` interface.

Internal to [storyreel](https://github.com/BaryshevRS/storyreel) and not
published to npm — the split exists to keep the code comprehensible and to stop
the engine from growing Storybook-specific knowledge. The published `storyreel`
package inlines this one.
