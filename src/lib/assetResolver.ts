/**
 * ══════════════════════════════════════════════════════════════════
 * 人物图加载策略（2026-08-19 claude · harv Batch0-5）
 *
 * harv 的原话：「**126 张 1024×1536 若全解码约 756MiB，禁止全量预载**。
 * 只加载首屏/当前席位，离屏懒加载；同屏解码人物图建议 ≤8 张。」
 *
 * 现有立绘 896×1200，换成 1024×1536 透明底之后每张解码后约 6MB。
 * **新增任何人物图，这三条一条都不能少：**
 *
 *   1. `loading="lazy"`    离屏不下载
 *   2. `decoding="async"`  **不要同步解码**。1024×1536 同步解码会卡主线程——
 *                          这是素材换大之后才暴露、现在完全看不出来的问题
 *   3. 显式 width/height    图到之前先占好位，避免加载完成时整屏跳动
 *
 * **禁止**：批量 `new Image()` 预热、`<link rel=preload>` 全量铺开、
 * 或任何"先把 126 张都拉下来"的想法。需要提前准备的只有当前席位那几张。
 *
 * 现有 4 处渲染点（都已按上面三条改过）：
 *   WarRoomRail / WarRoomModal / RelationshipsPanel / StoryDialogueModal
 * ══════════════════════════════════════════════════════════════════
 */

// Responsive art asset resolver.
//
// Every character portrait and scene background ships in 3 forms:
//   basePath.jpg           -- original master (always present, universal fallback)
//   basePath.webp          -- same resolution, WebP re-encode (~70-85% smaller)
//   basePath.mobile.webp   -- downscaled + WebP (~85-92% smaller than the .jpg master)
//
// This picks the right one for the current device instead of always shipping the
// full-resolution desktop master to a 375px-wide phone.

function isSmallViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || window.devicePixelRatio <= 1 && window.innerWidth < 900;
}

/** Returns the best-guess WebP variant path for `basePath` (no extension). Pair with
 * `onImageError` on an <img> tag to fall back to the .jpg master if WebP fails to load
 * (unsupported browser, or the variant file is missing). */
export function resolveArtSrc(basePath: string): string {
  return isSmallViewport() ? `${basePath}.mobile.webp` : `${basePath}.webp`;
}

export function artJpgFallback(basePath: string): string {
  return `${basePath}.jpg`;
}

/** Attach as onError on an <img> whose src came from resolveArtSrc() -- swaps to the
 * universal .jpg master exactly once, never loops if that also fails. */
export function onArtImgError(basePath: string): (e: React.SyntheticEvent<HTMLImageElement>) => void {
  return (e) => {
    const img = e.currentTarget;
    const fallback = artJpgFallback(basePath);
    if (img.src.endsWith(fallback) || img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    img.src = fallback;
  };
}

/** Strips a known extension (.jpg/.webp/.png) off a path, for callers that only have the
 * legacy hardcoded '/art/characters/xxx.jpg' string and want to route it through the
 * resolver without touching every call site's literal. */
export function basePathFromLegacyUrl(url?: string | null): string {
  if (!url) return '';
  return url.replace(/\.(jpg|jpeg|png|webp)$/i, '');
}
