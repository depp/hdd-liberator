import { COMPO } from './common.js';

/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   Get: function(number, number): number,
 *   Set: function(number, number, number),
 * }}
 */
export var Grid;

/**
 * Create a new grid.
 * @param {number} width Grid width, in cells.
 * @param {number} height Grid height, in cells.
 * @returns {Grid}
 */
export function NewGrid(width, height) {
  if (!COMPO) {
    if (
      typeof width != 'number' ||
      width < 1 ||
      (width | 0) != width ||
      typeof height != 'number' ||
      height < 1 ||
      (height | 0) != height
    ) {
      throw new Error(`invalid size: (${width}, ${height})`);
    }
  }
  const cells = new Uint8Array(width * height);
  return {
    width,
    height,
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
      if (x < 0 || width <= x || y < 0 || height <= y) {
        return -1;
      }
      return cells[y * width + x];
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
      if (x < 0 || width <= x || y < 0 || height <= y) {
        return;
      }
      cells[y * width + x] = value;
    },
  };
}
