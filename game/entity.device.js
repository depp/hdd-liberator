import * as grid from './grid.js';

/**
 * @typedef {{
 *   X: number,
 *   Y: number,
 *   W: number,
 *   H: number,
 * }}
 */
export var Device;

/**
 * Spawn a device at the given location.
 * @param {number} x
 * @param {number} y
 */
export function Spawn(x, y) {
  grid.SetRect({ X: x, Y: y, W: 2, H: 2 }, grid.TileDevice);
}
