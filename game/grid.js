import { COMPO } from './common.js';

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
    return -1;
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
