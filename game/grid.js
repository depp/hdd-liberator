import { COMPO } from './common.js';

/**
 * @typedef {{
 *   Width: number,
 *   Height: number,
 *   Get: function(number, number): number,
 *   Set: function(number, number, number),
 * }}
 */
export var Grid;

/**
 * Create a new grid.
 * @param {number} Width Grid width, in cells.
 * @param {number} Height Grid height, in cells.
 * @returns {Grid}
 */
export function NewGrid(Width, Height) {
  if (!COMPO) {
    if (
      typeof Width != 'number' ||
      Width < 1 ||
      (Width | 0) != Width ||
      typeof Height != 'number' ||
      Height < 1 ||
      (Height | 0) != Height
    ) {
      throw new Error(`invalid size: (${Width}, ${Height})`);
    }
  }
  const cells = new Uint8Array(Width * Height);
  return {
    Width,
    Height,
    Get(/** number */ x, /** number */ y) {
      if (!COMPO) {
        if (
          typeof x != 'number' ||
          (x | 0) != x ||
          typeof y != 'number' ||
          (y | 0) != y
        ) {
          throw new Error(`invalid position: (${x}, ${y})`);
        }
      }
      if (x < 0 || Width <= x || y < 0 || Height <= y) {
        return -1;
      }
      return cells[y * Width + x];
    },
    Set(/** number */ x, /** number */ y, /** number */ value) {
      if (!COMPO) {
        if (
          typeof x != 'number' ||
          (x | 0) != x ||
          typeof y != 'number' ||
          (y | 0) != y
        ) {
          throw new Error(`invalid position: (${x}, ${y})`);
        }
      }
      if (x < 0 || Width <= x || y < 0 || Height <= y) {
        return;
      }
      cells[y * Width + x] = value;
    },
  };
}
