import { COMPO } from './common.js';

/**
 * @typedef {{
 *   X: number,
 *   Y: number,
 *   W: number,
 *   H: number,
 * }}
 */
export var Rect;

/**
 * Copy a rectangle.
 * @param {!Rect} rect
 * @return {!Rect}
 */
export function CopyRect({ X, Y, W, H }) {
  return { X, Y, W, H };
}

/**
 * Modify a rect to move it by the given amount.
 * @param {!Rect} rect
 * @param {number} dx
 * @param {number} dy
 */
export function MoveRect(rect, dx, dy) {
  rect.X += dx;
  rect.Y += dy;
}

/**
 * Return a rectangle moved by the given amount.
 * @param {!Rect} rect
 * @param {number} dx
 * @param {number} dy
 * @return {!Rect}
 */
export function AddRect({ X, Y, W, H }, dx, dy) {
  return { X: X + dx, Y: Y + dy, W, H };
}

/**
 * Modify a rect, extending it by the given vector.
 * @param {!Rect} rect
 * @param {number} dx
 * @param {number} dy
 */
export function ExtendRect(rect, dx, dy) {
  if (dx < 0) {
    rect.X += dx;
    rect.W -= dx;
  } else {
    rect.W += dx;
  }
  if (dy < 0) {
    rect.Y += dy;
    rect.H -= dy;
  } else {
    rect.H += dy;
  }
}

/**
 * Create a bounding box for a square centered at the given point.
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @return {!Rect}
 */
export function BoundsRect(x, y, radius) {
  let X = Math.floor(x);
  let Y = Math.floor(y);
  return { X, Y, W: Math.ceil(x + radius - X), H: Math.ceil(y + radius - y) };
}

/**
 * Tile value for boundary tiles (tiles outside the level).
 * @const
 */
export const TileBoundary = -1;

/**
 * Tile value for box tiles.
 * @const
 */
export const TileBox = 1;

/**
 * Tile value for device tiles.
 * @const
 */
export const TileDevice = 2;

/**
 * Tile value for tiles which are used for moving objects.
 * @const
 */
export const TileTemporary = 3;

/** @type {number} */
export let Width;

/** @type {number} */
export let Height;

/**
 * Cell data for moving objects. These cells, when non-zero, override the static
 * cells.
 * @type {Uint8Array}
 */
export let DynamicCells;

/**
 * Cell data for non-moving objects.
 * @type {Uint8Array}
 */
export let StaticCells;

/**
 * Set the size of the grid, and clear it so all cells contain 0.
 * @param {number} width
 * @param {number} height
 */
export function Reset(width, height) {
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
  Width = width;
  Height = height;
  DynamicCells = new Uint8Array(width * height);
  StaticCells = new Uint8Array(width * height);
}

/**
 * Freeze the dynamic cells as static. Overrides the last call to SetStatic.
 */
export function SetStatic() {
  StaticCells.set(/** @type {!Uint8Array} */ (DynamicCells));
}

/**
 * Get the value of the grid cell at (x, y). Cells outside the grid boundary
 * take the value -1.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function Get(x, y) {
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
    return TileBoundary;
  }
  x = y * Width + x;
  return DynamicCells[x] || StaticCells[x];
}

/**
 * Set the value of the grid cell at (x, y). Only affects the dynamic layer.
 * @param {number} x
 * @param {number} y
 * @param {number} value
 */
export function Set(x, y, value) {
  if (!COMPO) {
    if (
      typeof x != 'number' ||
      (x | 0) != x ||
      typeof y != 'number' ||
      (y | 0) != y
    ) {
      throw new Error(`invalid position: (${x}, ${y})`);
    }
    if (
      typeof value != 'number' ||
      (value | 0) != value ||
      value < 0 ||
      255 < value
    ) {
      throw new Error(`invalid value: ${value}`);
    }
  }
  if (x < 0 || Width <= x || y < 0 || Height <= y) {
    return;
  }
  DynamicCells[y * Width + x] = value;
}

/**
 * Return true if the given rectangle is clear (all cells are zero). Returns
 * false if any part of the rectangle extends outside the grid. A specific tile
 * type can be ignored. An offset can be added to the rectangle.
 *
 * @param {!Rect} rect
 * @param {number=} ignore
 * @param {number=} dx
 * @param {number=} dy
 * @return {boolean}
 */
export function IsRectClear({ X, Y, W, H }, ignore = 0, dx = 0, dy = 0) {
  if (!COMPO) {
    if (
      typeof X != 'number' ||
      (X | 0) != X ||
      typeof Y != 'number' ||
      (Y | 0) != Y
    ) {
      throw new Error(`invalid position: (${X}, ${Y})`);
    }
    if (
      typeof W != 'number' ||
      (W | 0) != W ||
      typeof H != 'number' ||
      (H | 0) != H
    ) {
      throw new Error(`invalid size: (${W}, ${H})`);
    }
  }
  X += dx;
  Y += dy;
  if (X < 0 || Y < 0 || W > Width - X || H > Height - Y) {
    return false;
  }
  for (let yy = Y; yy < Y + H; yy++) {
    for (let xx = X; xx < X + W; xx++) {
      let value = DynamicCells[yy * Width + xx] || StaticCells[yy * Width + xx];
      if (value && value != ignore) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Set all cells in a rectangle to the given value.
 *
 * @param {!Rect} rect
 * @param {number} value
 * @param {number=} dx
 * @param {number=} dy
 */
export function SetRect({ X, Y, W, H }, value, dx = 0, dy = 0) {
  X += dx;
  Y += dy;
  if (!COMPO) {
    if (
      typeof X != 'number' ||
      (X | 0) != X ||
      typeof Y != 'number' ||
      (Y | 0) != Y
    ) {
      throw new Error(`invalid position: (${X}, ${Y})`);
    }
    if (
      typeof W != 'number' ||
      (W | 0) != W ||
      typeof H != 'number' ||
      (H | 0) != H
    ) {
      throw new Error(`invalid size: (${W}, ${H})`);
    }
    if (X < 0 || Y < 0 || W > Width - X || H > Height - Y) {
      throw new Error(`rectangle outside grid: (${X}, ${Y}, ${W}, ${H})`);
    }
  }
  for (let yy = Y; yy < Y + H; yy++) {
    for (let xx = X; xx < X + W; xx++) {
      DynamicCells[yy * Width + xx] = value;
    }
  }
}
