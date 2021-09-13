import { COMPO } from './common.js';
import * as grid from './grid.js';
import * as entityGeneric from './entity.generic.js';
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
export let Boxes;

/**
 * Total area of all boxes on screen.
 * @type {number}
 */
export let TotalBoxArea = 0;

/**
 * Remove all boxes from the level.
 */
export function Clear() {
  Boxes = [];
  TotalBoxArea = 0;
}

/**
 * Create a new box.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @return {!Box}
 */
export function New(x, y, size) {
  return { X: x, Y: y, X0: x, Y0: y, W: size, H: size, Idle: true };
}

/**
 * Create a new box in a random legal location.
 *
 * @param {number} size
 * @param {!Random} rand
 * @param {{X: number, Y: number}=} obj Object to spawn away from
 * @return {Box|null}
 */
export function NewRandom(size, rand, obj) {
  var n = grid.Width * grid.Height;
  var freespace = grid.ScanFreeSpace(size, size);
  var distances = new Float32Array(n);
  var value, x, y, i, pos, sorted, threshold;

  // Store the squared distance to the object in the distances array, or -1 if
  // the cell is occupied, or 0 if there is no object.
  i = 0;
  for (y = 0; y < grid.Height; y++) {
    for (x = 0; x < grid.Width; x++) {
      value = -1;
      if (!freespace[i]) {
        value = 0;
        if (obj) {
          value = (x + 0.5 - obj.X) ** 2 + (y + 0.5 - obj.Y) ** 2;
        }
      }
      distances[i++] = value;
    }
  }

  // Find the median distance, use it as the threshold.
  sorted = new Float32Array(distances);
  sorted.sort();
  for (i = 0; i < n && sorted[i] < 0; i++) {}
  if (i < n) {
    threshold = sorted[i + ((n - i) >> 1)];

    // Count how many tiles are above the threshold.
    pos = 0;
    for (i = 0; i < n; i++) {
      pos += distances[i] >= threshold;
    }

    // Randomly choose one tile above the threshold, and create the box there.
    pos = rand.NextInt(pos);
    i = 0;
    for (y = 0; y < grid.Height; y++) {
      for (x = 0; x < grid.Width; x++) {
        if (distances[i++] >= threshold) {
          if (!pos--) {
            return New(x, y, size);
          }
        }
      }
    }
  }
  return null;
}

/**
 * Spawn a box.
 * @param {?Box} box
 * @return {boolean} True if successful
 */
export function Spawn(box) {
  if (!box || !grid.IsRectClear(box)) {
    return false;
  }
  for (var { X, Y, Radius } of entityGeneric.Actors) {
    if (
      box.X - X < Radius &&
      box.Y - Y < Radius &&
      X - box.X - box.W < Radius &&
      Y - box.Y - box.H < Radius
    ) {
      return false;
    }
  }

  grid.SetRect(box, grid.TileBox);
  Boxes.push(box);
  TotalBoxArea += box.W * box.H;
  return true;
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
    grid.SetRect(box, 0);
    TotalBoxArea -= box.W * box.H;
  } else if (!COMPO) {
    throw new Error('box does not exist');
  }
}
