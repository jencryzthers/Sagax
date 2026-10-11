// Crab, the pixel-rect mascot (CrabMascot.tsx): only axis-aligned rectangles.
// Idle sprite is Clawd's 16-cell crab (https://github.com/giefeefee/clawd) mapped
// into the 0..100 box, with the later clap frames' square eyes, pincer claws
// and foot pads so the idle is not two tall black slots on four sticks. Motion
// lives on groups (crab-moves.ts) and in CSS (crab-mascot.css); no paths,
// no curves, no GSAP.
import { mixColor } from "./shiba-art";

export const CRAB_CORAL = "#DD775B";
export const CRAB_INK = "#111111";
export const CRAB_SHINE = "#F8F4EE";
export const CRAB_SPARK = "#FBF236";
export const CRAB_PX = 6;
export const CRAB_GRID = 16;
export const CRAB_OX = (100 - CRAB_GRID * CRAB_PX) / 2;
export const CRAB_OY = 100 - CRAB_GRID * CRAB_PX;

export type CrabRect = { x: number; y: number; w: number; h: number };

export function cell(x: number, y: number, w: number, h: number): CrabRect {
  return { x: CRAB_OX + x * CRAB_PX, y: CRAB_OY + y * CRAB_PX, w: w * CRAB_PX, h: h * CRAB_PX };
}

/** Idle sprite in grid cells (carapace, pincers, four legs with feet, 2x2 eyes). */
export const CRAB_PARTS = {
  body: cell(3, 7, 10, 6),
  armL: cell(1, 9, 2, 2),
  armR: cell(13, 9, 2, 2),
  pincerL: cell(1, 8, 2, 1),
  pincerR: cell(13, 8, 2, 1),
  legs: [cell(4, 13, 1, 2), cell(6, 13, 1, 2), cell(9, 13, 1, 2), cell(11, 13, 1, 2)] as const,
  feet: [cell(3, 15, 2, 1), cell(5, 15, 2, 1), cell(9, 15, 2, 1), cell(11, 15, 2, 1)] as const,
  eyeL: cell(5, 8, 2, 2),
  eyeR: cell(9, 8, 2, 2),
  shineL: cell(5, 8, 1, 1),
  shineR: cell(9, 8, 1, 1),
  sparkles: [cell(4, 4, 1, 1), cell(8, 3, 1, 1), cell(11, 4, 1, 1)] as const,
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

/** Bust crop under 48 px: the carapace, claws and eyes, the legs off-frame. */
export const CRAB_BUST = { x: 2, y: CRAB_PARTS.body.y - 10, w: 96, h: CRAB_PARTS.body.h + 22 } as const;
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

export interface CrabEyeDraw {
  pupils: readonly [CrabRect, CrabRect];
  shines: readonly [CrabRect, CrabRect] | null;
}

/** Clawd clap later frames: happy is a 2x1 lower squint. Sleep is a higher lid.
 *  Open faces (idle, excited, talking) are 2x2 with a shine. */
export function crabEyeDraw(face: string | null | undefined): CrabEyeDraw {
  switch (face) {
    case "happy":
    case "laughing":
    case "proud":
      return { pupils: [cell(5, 9, 2, 1), cell(9, 9, 2, 1)], shines: null };
    case "sleepy":
    case "bored":
      return { pupils: [cell(5, 8, 2, 1), cell(9, 8, 2, 1)], shines: null };
    default:
      return { pupils: [CRAB_PARTS.eyeL, CRAB_PARTS.eyeR], shines: [CRAB_PARTS.shineL, CRAB_PARTS.shineR] };
  }
}
