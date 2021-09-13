import { COMPO } from './common.js';
import * as entityGeneric from './entity.generic.js';

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
  let X = Math.floor(x - radius);
  let Y = Math.floor(y - radius);
  return { X, Y, W: Math.ceil(x + radius - X), H: Math.ceil(y + radius - Y) };
}

/**
 * Find rectangles in an array of rectangles.
 * @param {!Array<!T>} rects
 * @param {number} x
 * @param {number} y
 * @return {T|null}
 * @template T
 */
export function FindRect(rects, x, y) {
  for (const rect of /** @type {!Array<!Rect>} */ (rects)) {
    if (
      x >= rect.X &&
      x < rect.X + rect.W &&
      y >= rect.Y &&
      y < rect.Y + rect.H
    ) {
      return rect;
    }
  }
  return null;
}

/**
 * Tile value for boundary tiles (tiles outside the level).
 * @const
 */
export const TileBoundary = -1;

/**
 * Tile value for wall tiles.
 * @const
 */
export const TileWall = 1;

/**
 * Tile value for device tiles.
 * @const
 */
export const TileDevice = 2;

/**
 * Tile value for box tiles.
 * @const
 */
export const TileBox = 3;

/**
 * Tile value for tiles which are used for moving objects.
 * @const
 */
export const TileTemporary = 4;

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
 * Total area of space which has a tile value of 0 in the static layer.
 * Initialized by SetStatic().
 * @type {number}
 */
export let StaticFreeArea;

/**
 * Used for scanning for free spaces.
 * @type {Uint8Array}
 */
let ScanArray;

/**
 * Set the size of the grid, and clear it so all cells contain 0.
 * @param {number} width
 * @param {number} height
 * @param {number=} value
 */
export function Reset(width, height, value = 0) {
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
  ScanArray = new Uint8Array(width * height);
  DynamicCells.fill(value);
}

/**
 * Freeze the dynamic cells as static. Overrides the last call to SetStatic.
 */
export function SetStatic() {
  var i;
  StaticCells.set(/** @type {!Uint8Array} */ (DynamicCells));
  DynamicCells.fill(0);
  StaticFreeArea = 0;
  for (i = 0; i < StaticCells.length; i++) {
    StaticFreeArea += !StaticCells[i];
  }
  if (!COMPO) {
    if (StaticFreeArea == 0) {
      throw new Error('no free space');
    }
  }
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
 * Throw an exception if the rectangle is not a valid rectangle wiht integer
 * coordinates.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
function CheckRect(x, y, w, h) {
  if (
    typeof x != 'number' ||
    (x | 0) != x ||
    typeof y != 'number' ||
    (y | 0) != y
  ) {
    throw new Error(`invalid position: (${x}, ${y})`);
  }
  if (
    typeof w != 'number' ||
    (w | 0) != w ||
    typeof h != 'number' ||
    (h | 0) != h
  ) {
    throw new Error(`invalid size: (${w}, ${h})`);
  }
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
    CheckRect(X, Y, W, H);
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
 * Return true if all cells for the given rectangle are set to device tiles in
 * the static layer.
 * @param {!Rect} rect
 * @return {boolean}
 */
export function IsRectInsideDevice({ X, Y, W, H }) {
  if (!COMPO) {
    CheckRect(X, Y, W, H);
  }
  if (X < 0 || Y < 0 || W > Width - X || H > Height - Y) {
    return false;
  }
  for (let yy = Y; yy < Y + H; yy++) {
    for (let xx = X; xx < X + W; xx++) {
      if (StaticCells[yy * Width + xx] != TileDevice) {
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
    CheckRect(X, Y, W, H);
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

/**
 * Find free spaces in the level of the given minimum size. Returns an array
 * which contains a 0 for each free cell, and a nonzero value for each occupied
 * cell. The same result array may be reused.
 *
 * @param {number} width
 * @param {number} height
 * @return {!Uint8Array}
 */
export function ScanFreeSpace(width, height) {
  var i, x0, y0, x1, y1, x, y;

  // Mark each tile as individually free or occupied.
  for (i = 0; i < Width * Height; i++) {
    ScanArray[i] = StaticCells[i] | DynamicCells[i];
  }

  // Mark all tiles as occupied according if an is in that cell.
  for (var { X, Y, Radius } of entityGeneric.Actors) {
    x0 = Math.floor(X - Radius);
    y0 = Math.floor(Y - Radius);
    x1 = Math.ceil(X + Radius);
    y1 = Math.ceil(Y + Radius);
    if (x0 < 0) {
      x0 = 0;
    }
    if (y0 < 0) {
      y0 = 0;
    }
    if (x1 > Width) {
      x1 = Width;
    }
    if (y1 > Width) {
      y1 = Width;
    }
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        ScanArray[y * Width + x] = 1;
      }
    }
  }

  // Dilate horizontally.
  if (width > 1) {
    for (i = 0; i < Width * Height - 1; i++) {
      ScanArray[i] |= ScanArray[i + 1];
    }
    for (i = 1; i < width; i++) {
      for (i = 0; i < Height; i++) {
        ScanArray[i * Width + Width - 1] = 1;
      }
    }
  }

  // Dilate vertically.
  if (height > 1) {
    for (i = 0; i < Width * Height - 1; i++) {
      ScanArray[i] |= ScanArray[i + Width];
    }
    for (i = 1; i < height; i++) {
      ScanArray.fill(1, Width * Height - Width, Width * Height);
    }
  }

  return /** @type {!Uint8Array} */ (ScanArray);
}
