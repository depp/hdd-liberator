import { COMPO } from './common.js';
import * as grid from './grid.js';
import * as entityBox from './entity.box.js';
import * as entityGeneric from './entity.generic.js';
import * as time from './time.js';

/**
 * Rate at which a file is recycled.
 */
const RecycleRate = 2 / time.TickRate;

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
 * @param {number=} w
 * @param {number=} h
 */
export function Spawn(x, y, w = 2, h = 2) {
  /** @type {!Device} */
  const device = { X: x, Y: y, W: w, H: h };
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
  var device;
  /** @type {number} */
  var progress = 1;
  if (!grid.IsRectInsideDevice(box)) {
    return false;
  }
  device = grid.FindRect(Devices, box.X, box.Y);
  if (!device) {
    return false;
  }
  entityGeneric.Functions.push(() => {
    progress -= RecycleRate;
    if (progress < 0) {
      entityBox.Destroy(box);
      return false;
    }
    box.Scale = progress;
    return true;
  });
  return true;
}
