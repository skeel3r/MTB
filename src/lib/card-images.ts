/**
 * Maps card data to rendered card image paths in /public/cards/.
 * Falls back gracefully if images don't exist (components should handle missing images).
 */

function slugify(name: string): string {
  return name.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '_');
}

export function trailCardImage(stageNum: number, name: string): string {
  const num = String(stageNum).padStart(2, '0');
  return `/cards/trail/${num}_${slugify(name)}.png`;
}

export function techniqueCardImage(name: string): string {
  return `/cards/technique/${slugify(name)}.png`;
}

export function obstacleCardImage(obsId: string, name: string): string {
  return `/cards/obstacle/${obsId}_${slugify(name)}.png`;
}

export function penaltyCardImage(name: string): string {
  return `/cards/penalty/${slugify(name)}.png`;
}

export function upgradeCardImage(upgradeId: string, name: string): string {
  return `/cards/upgrade/${upgradeId}_${slugify(name).replace(/-/g, '_')}.png`;
}

export function cardBackImage(): string {
  return `/cards/back/card_back.png`;
}
