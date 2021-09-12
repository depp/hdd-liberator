import { COMPO } from './common.js';
import * as grid from './grid.js';
import { Random } from './random.js';

/**
 * @typedef {{
 *   X0: number,
 *   Y0: number,
 *   X: number,
 *   Y: number,
 *   W: number,
 *   H: number,
 *   Idle: boolean,
 * }}
 */
export var Box;

/**
 * @type {!Array<!Box>}
 */
export let Boxes = [];

/**
 * @param {!Random} rand
 */
export function Spawn(rand) {
  for (let j = 3; --j; ) {
    for (let i = 5; i--; ) {
      /** @type {!Box} */
      let box = /** @type {!Box} */ ({ W: j, H: j, Idle: true });
      do {
        box.X0 = box.X = rand.NextInt(grid.Width - j);
        box.Y0 = box.Y = rand.NextInt(grid.Height - j);
      } while (!grid.IsRectClear(box));
      grid.SetRect(box, grid.TileBox);
      Boxes.push(box);
    }
  }
}

/**
 * Get the box at the given tile coordinates if it is idle. Return null if no
 * box exists at those coordinates or if the box is not idle (it is being used
 * by something).
 * @param {number} x
 * @param {number} y
 * @returns {Box|null}
 */
export function GetIdle(x, y) {
  if (!COMPO) {
    if (
      typeof x != 'number' ||
      (x | 0) != x ||
      typeof y != 'number' ||
      (y | 0) != y
    ) {
      throw new Error(`invalid location: (${x}, ${y})`);
    }
  }
  if (grid.Get(x, y) == grid.TileBox) {
    let box = grid.FindRect(Boxes, x, y);
    if (box?.Idle) {
      return box;
    }
  }
  return null;
}

/**
 * @param {!Box} box
 */
export function Destroy(box) {
  let index = Boxes.indexOf(box);
  if (index >= 0) {
    Boxes.splice(index, 1);
  }
  grid.SetRect(box, 0);
}
