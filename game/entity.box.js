import { COMPO } from './common.js';
import * as grid from './grid.js';
import { Random } from './random.js';

/**
 * @typedef {{
 *   X: number,
 *   Y: number,
 *   W: number,
 *   H: number,
 * }}
 */
export var Box;

/**
 * @type {!Array<!Box>}
 */
let Boxes = [];

/**
 * @param {!Random} rand
 */
export function Spawn(rand) {
  for (let i = 5; i--; ) {
    /** @type {!Box} */
    let box = /** @type {!Box} */ ({ W: 2, H: 2 });
    do {
      box.X = rand.NextInt(grid.Width - 1);
      box.Y = rand.NextInt(grid.Height - 1);
    } while (!grid.IsRectClear(box));
    grid.SetRect(box, grid.TileBox);
    Boxes.push(box);
  }
}

/**
 * Get the box at the given tile coordinates, or return null if no box exists at
 * those coordinates.
 * @param {number} tx
 * @param {number} ty
 * @returns {Box|null}
 */
export function Get(tx, ty) {
  if (!COMPO) {
    if (
      typeof tx != 'number' ||
      (tx | 0) != tx ||
      typeof ty != 'number' ||
      (ty | 0) != ty
    ) {
      throw new Error(`invalid location: (${tx}, ${ty})`);
    }
  }
  if (grid.Get(tx, ty) == grid.TileBox) {
    for (const box of Boxes) {
      if (
        tx >= box.X &&
        tx < box.X + box.W &&
        ty >= box.Y &&
        ty < box.Y + box.H
      ) {
        return box;
      }
    }
  }
  return null;
}
