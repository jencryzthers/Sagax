// Crab, the pixel-rect mascot (CrabMascot.tsx): only axis-aligned rectangles,
// one coral fill and two black square eyes, two stub arms and four legs. The
// idle sprite is a 15-cell grid mapped into the 0..100 drawing box. Motion
// lives on groups (crab-moves.ts) and in CSS (crab-mascot.css); no paths,
// no curves, no GSAP.
import { mixColor } from "./shiba-art";

export const CRAB_CORAL = "#DD775B";
export const CRAB_INK = "#111111";
export const CRAB_PX = 6;
export const CRAB_GRID = 15;
export const CRAB_OX = (100 - CRAB_GRID * CRAB_PX) / 2;
export const CRAB_OY = 100 - CRAB_GRID * CRAB_PX;

export type CrabRect = { x: number; y: number; w: number; h: number };

function cell(x: number, y: number, w: number, h: number): CrabRect {
  return { x: CRAB_OX + x * CRAB_PX, y: CRAB_OY + y * CRAB_PX, w: w * CRAB_PX, h: h * CRAB_PX };
}

/** Idle sprite in grid cells (body, arms, four legs, two eyes). */
export const CRAB_PARTS = {
  body: cell(2, 6, 11, 7),
  armL: cell(0, 9, 2, 2),
  armR: cell(13, 9, 2, 2),
  legs: [cell(3, 13, 1, 2), cell(5, 13, 1, 2), cell(9, 13, 1, 2), cell(11, 13, 1, 2)] as const,
  eyeL: cell(4, 8, 1, 2),
  eyeR: cell(10, 8, 1, 2),
} as const;

export const CRAB_PIVOTS = {
  ground: [50, CRAB_OY + CRAB_GRID * CRAB_PX] as const,
  body: [CRAB_PARTS.body.x + CRAB_PARTS.body.w / 2, CRAB_PARTS.body.y + CRAB_PARTS.body.h / 2] as const,
  armL: [CRAB_PARTS.armL.x + CRAB_PARTS.armL.w, CRAB_PARTS.armL.y] as const,
  armR: [CRAB_PARTS.armR.x, CRAB_PARTS.armR.y] as const,
  legs: CRAB_PARTS.legs.map((leg) => [leg.x + leg.w / 2, leg.y] as const),
  eyes: [(CRAB_PARTS.eyeL.x + CRAB_PARTS.eyeR.x + CRAB_PARTS.eyeR.w) / 2, CRAB_PARTS.eyeL.y + CRAB_PARTS.eyeL.h / 2] as const,
  eyeL: [CRAB_PARTS.eyeL.x + CRAB_PARTS.eyeL.w / 2, CRAB_PARTS.eyeL.y + CRAB_PARTS.eyeL.h / 2] as const,
  eyeR: [CRAB_PARTS.eyeR.x + CRAB_PARTS.eyeR.w / 2, CRAB_PARTS.eyeR.y + CRAB_PARTS.eyeR.h / 2] as const,
} as const;

/** Bust crop under 48 px: the body and the eyes, the legs off-frame. */
export const CRAB_BUST = { x: 4, y: CRAB_PARTS.body.y - 6, w: 92, h: CRAB_PARTS.body.h + 16 } as const;
export const CRAB_BUST_MAX = 48;

export function crabViewBox(size: number): string {
  return size <= CRAB_BUST_MAX ? `${CRAB_BUST.x} ${CRAB_BUST.y} ${CRAB_BUST.w} ${CRAB_BUST.h}` : "0 0 100 100";
}

/** Plain takes 45 % of the bot colour into the coral so it still reads as the pixel crab. */
export function crabFill(hex: string, amount = 0.45): string {
  return mixColor(CRAB_CORAL, hex, amount);
}

export function crabOrigin(point: readonly [number, number]): string {
  return `${point[0]}px ${point[1]}px`;
}
