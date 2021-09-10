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
var Box;

/**
 * @type {!Array<!Box>}
 */
let Boxes = [];

/**
 * @param {!Random} rand
 */
export function Spawn(rand) {
  for (let i = 5; i--; ) {
    let x, y;
    do {
      x = rand.NextInt(grid.Width - 1);
      y = rand.NextInt(grid.Height - 1);
    } while (!grid.IsRectClear(x, y, 2, 2));
    grid.SetRect(x, y, 2, 2, 2);
    Boxes.push({ X: x, Y: y, W: 2, H: 2 });
  }
}
