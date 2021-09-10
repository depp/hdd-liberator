import { COMPO } from './common.js';

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

/** @type {number} */
export let Width;

/** @type {number} */
export let Height;

/** @type {Uint8Array} */
export let Cells;

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
  Cells = new Uint8Array(width * height);
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
  return Cells[y * Width + x];
}

/**
 * Set the value of the grid cell at (x, y).
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
  Cells[y * Width + x] = value;
}

/**
 * Return true if the given rectangle is clear (all cells are zero). Returns
 * false if any part of the rectangle extends outside the grid.
 *
 * @param {number} x The minimum X coordinate
 * @param {number} y The minimum Y coordinate
 * @param {number} w Width of the rectangle, in cells
 * @param {number} h Height of the rectangle, in cells
 * @return {boolean}
 */
export function IsRectClear(x, y, w, h) {
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
      typeof w != 'number' ||
      (w | 0) != w ||
      typeof h != 'number' ||
      (h | 0) != h
    ) {
      throw new Error(`invalid size: (${w}, ${h})`);
    }
  }
  if (x < 0 || y < 0 || w > Width - x || h > Height - x) {
    return false;
  }
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (Cells[yy * Width + xx]) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Set all cells in a rectangle to the given value.
 *
 * @param {number} x The minimum X coordinate
 * @param {number} y The minimum Y coordinate
 * @param {number} w Width of the rectangle, in cells
 * @param {number} h Height of the rectangle, in cells
 * @param {number} value
 */
export function SetRect(x, y, w, h, value) {
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
      typeof w != 'number' ||
      (w | 0) != w ||
      typeof h != 'number' ||
      (h | 0) != h
    ) {
      throw new Error(`invalid size: (${w}, ${h})`);
    }
    if (x < 0 || y < 0 || w > Width - x || h > Height - y) {
      throw new Error(`rectangle outside grid: (${x}, ${y}, ${w}, ${h})`);
    }
  }
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      Cells[yy * Width + xx] = value;
    }
  }
}
