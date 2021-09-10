/**
 * Number of update ticks per second.
 * @const {number}
 */
export const TickRate = 50;

/**
 * Time between update ticks, in milliseconds.
 * @const {number}
 */
const TickTimeMS = 1000 / TickRate;

/**
 * Maximum game time elapsed between successive frames rendered to screen, in
 * milliseconds. Used to throttle updates.
 * @const {number}
 */
const MaximumFrameTimeMS = 100;

/**
 * The timestamp of the last game update, in milliseconds. Uses the same
 * coordinate system as the requestAnimationFrame callback.
 * @type {?number}
 */
let LastTickTimestamp;

/**
 * The current rendering time, as a fraction between the current tick (Fraction
 * = 1) and the previous tick (Fraction = 0). This is updated by
 * UpdateForTimestamp().
 * @type {number}
 */
export let Fraction;

/**
 * Update the timing information. Returns the number of ticks to advance the
 * game. Updates the value of Fraction.
 * @param {number} timestamp Game timestamp, in milliseconds, from a
 * requestAnimationFrame callback.
 * @returns {number} The number of ticks to advance the game.
 */
export function UpdateForTimestamp(timestamp) {
  if (LastTickTimestamp == null) {
    LastTickTimestamp = timestamp;
    return 0;
  }
  let delta = timestamp - LastTickTimestamp;
  if (delta > MaximumFrameTimeMS) {
    delta = MaximumFrameTimeMS;
  }
  let tickcount = (delta / TickTimeMS) | 0;
  delta -= tickcount * TickTimeMS;
  LastTickTimestamp = timestamp - delta;
  Fraction = delta / TickTimeMS;
  return tickcount;
}

/**
 * Current update tick number. This advances at a fixed rate: TickRate per
 * second. This is updated by Advance().
 * @type {number}
 */
export let TickNumber = 0;

/**
 * Advance the frame number.
 */
export function Advance() {
  TickNumber++;
}
