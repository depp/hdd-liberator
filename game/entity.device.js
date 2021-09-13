import { COMPO } from './common.js';
import * as grid from './grid.js';
import * as entityBox from './entity.box.js';
import * as entityGeneric from './entity.generic.js';
import * as time from './time.js';

/**
 * Amount of time it takes to process a file.
 */
const ProcessTime = time.TickRate * 0.6;

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
 * @type {!Array<!Device>}
 */
export let Devices;

/**
 * Remove all devices from the level.
 */
export function Clear() {
  Devices = [];
}

/**
 * Spawn a device at the given location. This should be called before
 * grid.SetStatic, so the device can be made static.
 * @param {number} x
 * @param {number} y
 */
export function Spawn(x, y) {
  /** @type {!Device} */
  const device = { X: x, Y: y, W: 2, H: 2 };
  grid.SetRect(device, grid.TileDevice);
  Devices.push(device);
}

/**
 * Get the device at the given tile coordinates, or return null if no device
 * exists at those coordinates.
 * @param {number} x
 * @param {number} y
 * @returns {!Device|null}
 */
export function Get(x, y) {
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
  return grid.FindRect(Devices, x, y);
}

/**
 * Check if a box has been triggered a device.
 * @param {!entityBox.Box} box
 * @return {boolean} True if the box has triggered a device.
 */
export function CheckBox(box) {
  /** @type {Device|null} */
  let device;
  /** @type {number} */
  let time = 0;
  if (!grid.IsRectInsideDevice(box)) {
    return false;
  }
  device = grid.FindRect(Devices, box.X, box.Y);
  if (!device) {
    return false;
  }
  entityGeneric.Functions.push(() => {
    if (time < ProcessTime) {
      time++;
      return true;
    }
    entityBox.Destroy(box);
    return false;
  });
  return true;
}
