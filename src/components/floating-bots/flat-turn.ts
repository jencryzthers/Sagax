// A flat drawing never turns in depth (it would show a paper-thin edge).
// It only faces the other way: a quick squash-mirror, never narrower than
// FLAT_MIN_WIDTH of itself. Owl25D, motion25dTransform and Shiba's
// turn-in-circles all use this so a 2D mascot never spins like a card.

/** A flat drawing tilts at most this much (degrees): more reads as a sheet of paper. */
export const FLAT_TILT_MAX = 15;

/**
 * A flat character never turns in depth (it would show a paper-thin edge).
 * It only faces the other way, when it walks the other way: a quick swap at
 * the bottom of a squash, never narrower than FLAT_MIN_WIDTH of itself.
 */
export const FLAT_MIN_WIDTH = 0.82;
export function flatTurn(face: number | undefined): { sx: number; sy: number; lift: number } {
  const f = Math.min(1, Math.max(-1, face ?? 1));
  const k = Math.abs(f);
  const side = f >= 0 ? 1 : -1;
  return { sx: side * (FLAT_MIN_WIDTH + (1 - FLAT_MIN_WIDTH) * k), sy: 1 - 0.12 * (1 - k), lift: (1 - k) * 0.06 };
}

export const flatTilt = (deg: number) => Math.min(FLAT_TILT_MAX, Math.max(-FLAT_TILT_MAX, deg));
