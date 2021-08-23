/**
 * Current timestamp, in milliseconds.
 * @type {number}
 */
export let Now = 0;

/**
 * Milliseconds since previous timestamp.
 * @type {number}
 */
export let Delta;

/**
 * Update the time.
 * @param {number} timestamp Current timestamp, in milliseconds.
 */
export function Update(timestamp) {
  Delta = timestamp - Now;
  Now = timestamp;
}
